import { logger } from '@screener/shared';
import type { CompanyAnalysis } from '@screener/shared';
import { createLlmClient } from './create-llm-client.js';
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
import { validateFundamentals, validateSynthesis } from './agents/post-validation.js';
import { loadCurrentRegime } from '../macro/macro-loader.js';
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
  const client = createLlmClient();

  if (!client.isAvailable()) {
    logger.warn('LLM not available — skipping qualitative analysis (check LLM_PROVIDER / ANTHROPIC_API_KEY)');
    return;
  }

  const total = analyses.length;
  const agentModel = model ?? undefined; // Let the client use its default model
  const synthesisModel = synthModel ?? client.synthesisModel;

  // Assign tiers
  const tier1: CompanyAnalysis[] = [];
  const tier2: CompanyAnalysis[] = [];

  for (const a of analyses) {
    const tier = determineTier(a.rank, total, a.disqualified, tier1Count, tier2Count);
    if (tier === 'tier1') tier1.push(a);
    else if (tier === 'tier2') tier2.push(a);
  }

  logger.info(`Multi-agent LLM: ${tier1.length} Tier 1 (full 4-agent), ${tier2.length} Tier 2 (AG1 only), ${total - tier1.length - tier2.length} Layer 1 only`);

  // Load macro regime once for all companies
  let regimeResult: { regime: string; confidence: string; signals: string[] } | null = null;
  try {
    regimeResult = await loadCurrentRegime();
  } catch (error) {
    logger.warn(`Failed to load macro regime: ${(error as Error).message}`);
  }

  let completed = 0;
  let failed = 0;
  let parseFailures = 0;
  const llmStartTime = Date.now();
  const totalLlm = tier2.length + tier1.length;

  // Process Tier 2 (AG1 only)
  logger.info(`--- Tier 2: ${tier2.length} companies (AG1 only) ---`);
  for (let i = 0; i < tier2.length; i++) {
    const analysis = tier2[i]!;
    try {
      const enriched = enrichedMap.get(analysis.companyId);
      const fr = analysis.frameworkResults;
      if (!enriched || !fr) continue;

      const companyStart = Date.now();
      logger.info(`  [${i + 1}/${tier2.length}] T2 ${analysis.screenerCode} (rank #${analysis.rank})...`);

      const userMsg = buildFundamentalsDataPack(analysis, enriched, fr);
      const response = await client.generate(FUNDAMENTALS_SYSTEM_PROMPT, userMsg, {
        model: agentModel,
        maxTokens: 4096,
        cacheSystemPrompt: true,
      });

      const parsed = parseFundamentalsOutput(response);
      if (parsed) {
        // Post-validation: cross-check LLM claims vs quantitative data
        const validation = validateFundamentals(parsed, enriched, analysis);
        if (validation.warnings.length > 0) {
          logger.warn(`Post-validation warnings for ${analysis.screenerCode}: ${validation.warnings.join('; ')}`);
        }
        // Apply any overrides from validation
        const validated = { ...parsed, ...validation.overrides };

        let adjustment = validated.adjustment as number;
        if (validated.confidence === 'low') adjustment = Math.round(adjustment * 0.5);
        if (analysis.disqualified) adjustment = Math.min(0, adjustment);

        analysis.llmAnalysis = {
          trendNarrative: `[${validated.trend_assessment}] ${(validated.key_findings as string[]).slice(0, 2).join('. ')}`,
          riskFactors: validated.red_flags as string[],
          catalysts: validated.positive_signals as string[],
          qualitativeAdjustment: adjustment,
          confidence: validated.confidence as 'high' | 'medium' | 'low',
          reasoning: validated.reasoning as string,
        };
        analysis.finalScore = analysis.compositeScore + adjustment;
        completed++;
      } else {
        parseFailures++;
        logger.warn(`AG1 parse failure for ${analysis.screenerCode}`);
      }

      const companyElapsed = ((Date.now() - companyStart) / 1000).toFixed(1);
      const totalElapsed = ((Date.now() - llmStartTime) / 1000 / 60).toFixed(1);
      const done = completed + failed + parseFailures;
      const avgPerCompany = (Date.now() - llmStartTime) / done / 1000;
      const remaining = ((totalLlm - done) * avgPerCompany / 60).toFixed(0);
      logger.info(`  [${i + 1}/${tier2.length}] T2 ${analysis.screenerCode} done (${companyElapsed}s, adj=${analysis.llmAnalysis?.qualitativeAdjustment ?? 'N/A'}) | ${totalElapsed}min elapsed, ~${remaining}min remaining`);
    } catch (error) {
      failed++;
      logger.warn(`AG1 failed for ${analysis.screenerCode}: ${(error as Error).message}`);
    }
  }

  // Process Tier 1 (full AG1-4)
  logger.info(`--- Tier 1: ${tier1.length} companies (full 4-agent) ---`);
  for (let i = 0; i < tier1.length; i++) {
    const analysis = tier1[i]!;
    try {
      const enriched = enrichedMap.get(analysis.companyId);
      const fr = analysis.frameworkResults;
      if (!enriched || !fr) continue;

      const companyStart = Date.now();
      logger.info(`  [${i + 1}/${tier1.length}] T1 ${analysis.screenerCode} (rank #${analysis.rank}, ${analysis.classification})...`);

      // AG1: Fundamentals
      const ag1Start = Date.now();
      const fundUserMsg = buildFundamentalsDataPack(analysis, enriched, fr);
      const fundResponse = await client.generate(FUNDAMENTALS_SYSTEM_PROMPT, fundUserMsg, {
        model: agentModel,
        maxTokens: 4096,
        cacheSystemPrompt: true,
      });
      const fundParsed = parseFundamentalsOutput(fundResponse);
      const ag1Sec = ((Date.now() - ag1Start) / 1000).toFixed(1);

      // AG2: Governance
      const ag2Start = Date.now();
      const govUserMsg = buildGovernanceDataPack(analysis, enriched, fr);
      const govResponse = await client.generate(GOVERNANCE_SYSTEM_PROMPT, govUserMsg, {
        model: agentModel,
        maxTokens: 4096,
        cacheSystemPrompt: true,
      });
      const govParsed = parseGovernanceOutput(govResponse);
      const ag2Sec = ((Date.now() - ag2Start) / 1000).toFixed(1);

      // AG3: Risk
      const ag3Start = Date.now();
      const riskUserMsg = buildRiskDataPack(analysis, enriched, fr);
      const riskResponse = await client.generate(RISK_SYSTEM_PROMPT, riskUserMsg, {
        model: agentModel,
        maxTokens: 4096,
        cacheSystemPrompt: true,
      });
      const riskParsed = parseRiskOutput(riskResponse);
      const ag3Sec = ((Date.now() - ag3Start) / 1000).toFixed(1);

      // Post-validate AG1 if parsed
      if (fundParsed) {
        const fundValidation = validateFundamentals(fundParsed, enriched, analysis);
        if (fundValidation.warnings.length > 0) {
          logger.warn(`AG1 validation for ${analysis.screenerCode}: ${fundValidation.warnings.join('; ')}`);
        }
        Object.assign(fundParsed, fundValidation.overrides);
      }

      // AG4: Synthesis (receives AG1-3 outputs + macro context)
      const ag4Start = Date.now();
      const synthSystemPrompt = buildSynthesisSystemPrompt(fr.lynch.category, regimeResult);
      const synthUserMsg = buildSynthesisDataPack(
        analysis, enriched, fr,
        fundResponse, govResponse, riskResponse,
        regimeResult,
      );
      const synthResponse = await client.generate(synthSystemPrompt, synthUserMsg, {
        model: synthesisModel,
        maxTokens: 4096,
        cacheSystemPrompt: true,
      });
      const synthParsed = parseSynthesisOutput(synthResponse);
      const ag4Sec = ((Date.now() - ag4Start) / 1000).toFixed(1);

      // Apply synthesis adjustment
      if (synthParsed) {
        // Post-validate synthesis
        const synthValidation = validateSynthesis(synthParsed, analysis);
        if (synthValidation.warnings.length > 0) {
          logger.warn(`AG4 validation for ${analysis.screenerCode}: ${synthValidation.warnings.join('; ')}`);
        }
        Object.assign(synthParsed, synthValidation.overrides);

        let adjustment = synthParsed.final_adjustment;
        adjustment = Math.max(-15, Math.min(15, adjustment));
        if (synthParsed.conviction === 'low' || synthParsed.conviction === 'none') adjustment = Math.round(adjustment * 0.5);
        if (analysis.disqualified) adjustment = Math.min(0, adjustment);

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
        completed++;
      } else {
        parseFailures++;
        logger.warn(`AG4 parse failure for ${analysis.screenerCode}`);
      }

      const companyElapsed = ((Date.now() - companyStart) / 1000).toFixed(1);
      const totalElapsed = ((Date.now() - llmStartTime) / 1000 / 60).toFixed(1);
      const done = completed + failed + parseFailures;
      const avgPerCompany = (Date.now() - llmStartTime) / done / 1000;
      const remaining = ((totalLlm - done) * avgPerCompany / 60).toFixed(0);
      const conviction = synthParsed?.conviction ?? 'N/A';
      const adj = analysis.llmAnalysis?.qualitativeAdjustment ?? 'N/A';
      logger.info(`  [${i + 1}/${tier1.length}] T1 ${analysis.screenerCode} done (${companyElapsed}s: AG1=${ag1Sec}s AG2=${ag2Sec}s AG3=${ag3Sec}s AG4=${ag4Sec}s) adj=${adj} conv=${conviction} | ${totalElapsed}min elapsed, ~${remaining}min remaining`);
    } catch (error) {
      failed++;
      logger.warn(`Multi-agent failed for ${analysis.screenerCode}: ${(error as Error).message}`);
    }
  }

  logger.info(`LLM analysis complete: ${completed} succeeded, ${failed} exceptions, ${parseFailures} parse failures`);
}
