import { logger } from '@screener/shared';
import type { CompanyAnalysis } from '@screener/shared';
import { AnthropicClient } from './anthropic-client.js';
import type { AgentRunResult, AgentTier } from './agents/agent-types.js';
import {
  buildFundamentalsDataPack,
  buildGovernanceDataPack,
  buildRiskDataPack,
  buildSynthesisDataPack,
} from './agents/data-pack-builder.js';
import { FUNDAMENTALS_SYSTEM_PROMPT, parseFundamentalsOutput } from './agents/fundamentals-agent.js';
import { GOVERNANCE_SYSTEM_PROMPT, parseGovernanceOutput } from './agents/governance-agent.js';
import { RISK_SYSTEM_PROMPT, parseRiskOutput } from './agents/risk-agent.js';
import { buildSynthesisSystemPrompt, parseSynthesisOutput } from './agents/synthesis-agent.js';
import type { EnrichedSnapshot } from '../enrichment/flatten-v2.js';

export interface QualitativeOptions {
  tier1Count?: number;
  tier2Count?: number;
  model?: string;
  synthModel?: string;
}

/**
 * Determine which tier a company belongs to based on rank.
 */
function determineTier(
  rank: number,
  totalCompanies: number,
  disqualified: boolean,
  tier1Count: number,
  tier2Count: number,
): AgentTier {
  // Tier 1: top N + bottom M + disqualified in top 200
  if (rank <= tier1Count || rank > totalCompanies - Math.floor(tier1Count / 2)) {
    return 'tier1';
  }
  // Tier 2: top N + bottom M
  if (rank <= tier2Count || rank > totalCompanies - Math.floor(tier2Count / 3)) {
    return 'tier2';
  }
  return 'none';
}

/**
 * Run multi-agent qualitative analysis.
 * Tiered approach:
 *   All companies → Layer 1 only (deterministic)
 *   Tier 2 → AG1 (fundamentals) only
 *   Tier 1 → Full AG1-4
 */
export async function runQualitativeAnalysis(
  analyses: CompanyAnalysis[],
  enrichedMap: Map<number, EnrichedSnapshot>,
  options: QualitativeOptions = {},
): Promise<void> {
  const {
    tier1Count = 100,
    tier2Count = 500,
    model,
    synthModel,
  } = options;
  const client = new AnthropicClient();

  if (!client.isAvailable()) {
    logger.warn('ANTHROPIC_API_KEY not set — skipping qualitative analysis');
    return;
  }

  const total = analyses.length;
  const agentModel = model ?? 'claude-haiku-4-5';
  const synthesisModel = synthModel ?? 'claude-sonnet-4-5';

  // Assign tiers
  const tier1: CompanyAnalysis[] = [];
  const tier2: CompanyAnalysis[] = [];

  for (const a of analyses) {
    const tier = determineTier(a.rank, total, a.disqualified, tier1Count, tier2Count);
    if (tier === 'tier1') tier1.push(a);
    else if (tier === 'tier2') tier2.push(a);
  }

  logger.info(`Multi-agent LLM: ${tier1.length} Tier 1 (full 4-agent), ${tier2.length} Tier 2 (AG1 only), ${total - tier1.length - tier2.length} Layer 1 only`);

  let completed = 0;
  let failed = 0;

  // Process Tier 2 (AG1 only)
  for (const analysis of tier2) {
    try {
      const enriched = enrichedMap.get(analysis.companyId);
      const fr = analysis.frameworkResults;
      if (!enriched || !fr) continue;

      const userMsg = buildFundamentalsDataPack(analysis, enriched, fr);
      const response = await client.generate(FUNDAMENTALS_SYSTEM_PROMPT, userMsg, {
        model: agentModel,
        maxTokens: 1024,
        cacheSystemPrompt: true,
      });

      const parsed = parseFundamentalsOutput(response);
      if (parsed) {
        let adjustment = parsed.adjustment;
        if (parsed.confidence === 'low') adjustment = Math.round(adjustment * 0.5);
        if (analysis.disqualified) adjustment = Math.min(0, adjustment);

        analysis.llmAnalysis = {
          trendNarrative: `[${parsed.trend_assessment}] ${parsed.key_findings.slice(0, 2).join('. ')}`,
          riskFactors: parsed.red_flags,
          catalysts: parsed.positive_signals,
          qualitativeAdjustment: adjustment,
          confidence: parsed.confidence,
          reasoning: parsed.reasoning,
        };
        analysis.finalScore = analysis.compositeScore + adjustment;
      }

      completed++;
      if (completed % 50 === 0) {
        logger.info(`  LLM progress: ${completed}/${tier2.length + tier1.length}`);
      }
    } catch (error) {
      failed++;
      logger.warn(`AG1 failed for ${analysis.screenerCode}: ${(error as Error).message}`);
    }
  }

  // Process Tier 1 (full AG1-4)
  for (const analysis of tier1) {
    try {
      const enriched = enrichedMap.get(analysis.companyId);
      const fr = analysis.frameworkResults;
      if (!enriched || !fr) continue;

      // AG1: Fundamentals
      const fundUserMsg = buildFundamentalsDataPack(analysis, enriched, fr);
      const fundResponse = await client.generate(FUNDAMENTALS_SYSTEM_PROMPT, fundUserMsg, {
        model: agentModel,
        maxTokens: 1024,
        cacheSystemPrompt: true,
      });
      const fundParsed = parseFundamentalsOutput(fundResponse);

      // AG2: Governance
      const govUserMsg = buildGovernanceDataPack(analysis, enriched, fr);
      const govResponse = await client.generate(GOVERNANCE_SYSTEM_PROMPT, govUserMsg, {
        model: agentModel,
        maxTokens: 1024,
        cacheSystemPrompt: true,
      });
      const govParsed = parseGovernanceOutput(govResponse);

      // AG3: Risk
      const riskUserMsg = buildRiskDataPack(analysis, enriched, fr);
      const riskResponse = await client.generate(RISK_SYSTEM_PROMPT, riskUserMsg, {
        model: agentModel,
        maxTokens: 1024,
        cacheSystemPrompt: true,
      });
      const riskParsed = parseRiskOutput(riskResponse);

      // AG4: Synthesis (receives AG1-3 outputs)
      const synthSystemPrompt = buildSynthesisSystemPrompt(fr.lynch.category);
      const synthUserMsg = buildSynthesisDataPack(
        analysis, enriched, fr,
        fundResponse, govResponse, riskResponse,
      );
      const synthResponse = await client.generate(synthSystemPrompt, synthUserMsg, {
        model: synthesisModel,
        maxTokens: 1500,
        cacheSystemPrompt: true,
      });
      const synthParsed = parseSynthesisOutput(synthResponse);

      // Apply synthesis adjustment
      if (synthParsed) {
        let adjustment = synthParsed.final_adjustment;
        adjustment = Math.max(-15, Math.min(15, adjustment));
        if (synthParsed.conviction === 'low' || synthParsed.conviction === 'none') adjustment = Math.round(adjustment * 0.5);
        if (analysis.disqualified) adjustment = Math.min(0, adjustment);

        const keyFindings = [
          ...(fundParsed?.key_findings?.slice(0, 2) ?? []),
          ...(govParsed?.key_findings?.slice(0, 1) ?? []),
          ...(riskParsed?.key_findings?.slice(0, 1) ?? []),
        ];

        analysis.llmAnalysis = {
          trendNarrative: synthParsed.investment_thesis,
          riskFactors: riskParsed?.primary_risks.map((r) => `[${r.severity}] ${r.risk}`) ?? [],
          catalysts: fundParsed?.positive_signals ?? [],
          qualitativeAdjustment: adjustment,
          confidence: synthParsed.conviction === 'high' ? 'high' : synthParsed.conviction === 'medium' ? 'medium' : 'low',
          reasoning: synthParsed.conviction_reasoning,
        };
        analysis.finalScore = analysis.compositeScore + adjustment;

        // Override conviction from synthesis if it's stronger than quantitative
        if (synthParsed.conviction === 'high' && analysis.convictionLevel !== 'high') {
          analysis.convictionLevel = 'high';
          analysis.convictionReasons = [
            ...(analysis.convictionReasons ?? []),
            `LLM synthesis: ${synthParsed.conviction_reasoning}`,
          ];
        }
      }

      completed++;
      if (completed % 10 === 0) {
        logger.info(`  LLM progress: ${completed}/${tier2.length + tier1.length}`);
      }
    } catch (error) {
      failed++;
      logger.warn(`Multi-agent failed for ${analysis.screenerCode}: ${(error as Error).message}`);
    }
  }

  logger.info(`LLM analysis complete: ${completed} succeeded, ${failed} failed`);
}
