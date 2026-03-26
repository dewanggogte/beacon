import { logger } from '@screener/shared';
import type { CompanyAnalysis, Classification } from '@screener/shared';
import { createLlmClient } from './create-llm-client.js';
import type { FundamentalsAgentOutput } from './agents/agent-types.js';
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
import { validateFundamentals, validateSynthesis, resetDivergenceLog } from './agents/post-validation.js';
import { loadCurrentRegime } from '../macro/macro-loader.js';
import type { EnrichedSnapshot } from '../enrichment/flatten-v2.js';

export interface QualitativeOptions {
  tier1Count?: number;
  tier2Count?: number;
  tier2PromoteCount?: number;
  model?: string;
  synthModel?: string;
  /** When true, all companies get full AG1-AG4 (no tiering). Used for targeted analysis. */
  forceAll?: boolean;
}

/**
 * Run multi-agent qualitative analysis with funnel-based tiering.
 *
 * New tiering model (v2.2):
 *   Tier 1: Top N companies by quant rank → Full AG1-AG4
 *   Tier 2: Next M companies → AG1 only → Top K by AG1 score get promoted to AG2-AG4
 *   Rest: Layer 1 only (no LLM)
 *
 * Key changes from v2.1:
 *   - Bottom companies removed from LLM evaluation
 *   - AG1 and AG4 produce independent scores (0-100) instead of adjustments
 *   - AG4 produces recommended_classification with full override authority
 *   - Quant classification/conviction preserved as quantClassification/quantConvictionLevel
 */
export async function runQualitativeAnalysis(
  analyses: CompanyAnalysis[],
  enrichedMap: Map<number, EnrichedSnapshot>,
  options: QualitativeOptions = {},
): Promise<void> {
  const {
    tier1Count = 100,
    tier2Count = 500,
    tier2PromoteCount = 100,
    model,
    synthModel,
    forceAll = false,
  } = options;
  const client = createLlmClient();

  if (!client.isAvailable()) {
    logger.warn('LLM not available — skipping qualitative analysis (check LLM_PROVIDER / ANTHROPIC_API_KEY)');
    return;
  }

  const total = analyses.length;
  const agentModel = model ?? undefined;
  const synthesisModel = synthModel ?? client.synthesisModel;

  // Reset divergence log for this pipeline run
  resetDivergenceLog();

  // All companies get quant originals preserved
  for (const a of analyses) {
    a.quantClassification = a.classification;
    a.quantConvictionLevel = a.convictionLevel;
    a.classificationSource = 'quant';
  }

  // Assign tiers
  const tier1: CompanyAnalysis[] = [];
  const tier2: CompanyAnalysis[] = [];

  if (forceAll) {
    // Targeted mode: all companies go straight to Tier 1 (full AG1-AG4)
    tier1.push(...analyses);
    logger.info(`Multi-agent LLM (targeted): ${tier1.length} companies → full AG1-AG4`);
  } else {
    // Normal funnel tiering
    let priorAg4Count = 0;
    for (const a of analyses) {
      // Companies that previously received AG4 evaluation auto-qualify for Tier 1
      // (preserves LLM continuity across re-runs)
      if (a.classificationSource === 'ag4') {
        tier1.push(a);
        priorAg4Count++;
      } else if (a.rank <= tier1Count) {
        tier1.push(a);
      } else if (a.rank <= tier1Count + tier2Count) {
        tier2.push(a);
      }
    }
    if (priorAg4Count > 0) {
      logger.info(`  ${priorAg4Count} companies auto-promoted to Tier 1 (prior AG4 evaluation)`);
    }
    logger.info(`Multi-agent LLM v2.2: ${tier1.length} Tier 1 (direct AG1-4), ${tier2.length} Tier 2 (AG1 funnel → promote top ${tier2PromoteCount}), ${total - tier1.length - tier2.length} Layer 1 only`);
  }

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

  // ─── Phase 1: Tier 2 AG1 Screening ───────────────────────────
  // Run AG1 on all Tier 2 companies. AG1 produces an independent score.
  // We'll use that score + other signals to select top K for promotion.
  logger.info(`--- Phase 1: Tier 2 AG1 Screening (${tier2.length} companies) ---`);

  // Store AG1 results for promoted companies to reuse
  const tier2Ag1Results = new Map<number, { parsed: FundamentalsAgentOutput; rawResponse: string }>();

  for (let i = 0; i < tier2.length; i++) {
    const analysis = tier2[i]!;
    try {
      const enriched = enrichedMap.get(analysis.companyId);
      const fr = analysis.frameworkResults;
      if (!enriched || !fr) continue;

      const companyStart = Date.now();
      logger.info(`  [${i + 1}/${tier2.length}] T2-screen ${analysis.screenerCode} (rank #${analysis.rank})...`);

      const userMsg = buildFundamentalsDataPack(analysis, enriched, fr);
      const response = await client.generate(FUNDAMENTALS_SYSTEM_PROMPT, userMsg, {
        model: agentModel,
        maxTokens: 4096,
        cacheSystemPrompt: true,
      });

      const parsed = parseFundamentalsOutput(response);
      if (parsed) {
        // Post-validation
        const validation = validateFundamentals(parsed, enriched, analysis);
        if (validation.warnings.length > 0) {
          logger.warn(`AG1 validation for ${analysis.screenerCode}: ${validation.warnings.join('; ')}`);
        }
        const validated = { ...parsed, ...validation.overrides } as FundamentalsAgentOutput;

        // Store AG1 score as finalScore for Tier 2 companies
        analysis.finalScore = validated.score;

        // Build LLM analysis from AG1
        analysis.llmAnalysis = {
          trendNarrative: `[${validated.trend_assessment}] ${(validated.key_findings as string[]).slice(0, 2).join('. ')}`,
          riskFactors: validated.red_flags as string[],
          catalysts: validated.positive_signals as string[],
          qualitativeAdjustment: validated.score - analysis.compositeScore,
          confidence: validated.confidence as 'high' | 'medium' | 'low',
          reasoning: validated.reasoning as string,
        };

        // Populate per-agent column (AG1 only for Tier 2)
        analysis.llmFundamentals = validated as unknown as Record<string, unknown>;

        // Cache for potential promotion
        tier2Ag1Results.set(analysis.companyId, { parsed: validated, rawResponse: response });
        completed++;
      } else {
        parseFailures++;
        if (!analysis.llmParseFailures) analysis.llmParseFailures = [];
        analysis.llmParseFailures.push({ agent: 'AG1', error: 'parse_failure', timestamp: new Date().toISOString() });
        logger.warn(`AG1 parse failure for ${analysis.screenerCode}`);
      }

      const companyElapsed = ((Date.now() - companyStart) / 1000).toFixed(1);
      const totalLlm = tier1.length + tier2.length;
      const done = completed + failed + parseFailures;
      const totalElapsed = ((Date.now() - llmStartTime) / 1000 / 60).toFixed(1);
      const avgPerCompany = (Date.now() - llmStartTime) / done / 1000;
      const remaining = ((totalLlm - done) * avgPerCompany / 60).toFixed(0);
      logger.info(`  [${i + 1}/${tier2.length}] T2-screen ${analysis.screenerCode} done (${companyElapsed}s, AG1 score=${analysis.finalScore}) | ${totalElapsed}min elapsed, ~${remaining}min remaining`);
    } catch (error) {
      failed++;
      logger.warn(`AG1 failed for ${analysis.screenerCode}: ${(error as Error).message}`);
    }
  }

  // ─── Phase 2: Tier 2 Promotion ───────────────────────────────
  // Rank Tier 2 companies by a nuanced promotion score that blends AG1's assessment
  // with quant signals. AG1 score is weighted more heavily since LLM evaluation
  // captures qualitative factors the quant model misses.
  const promotionCandidates = tier2
    .filter((a) => tier2Ag1Results.has(a.companyId))
    .map((a) => {
      const ag1 = tier2Ag1Results.get(a.companyId)!;
      const confidenceBonus = ag1.parsed.confidence === 'high' ? 3 : ag1.parsed.confidence === 'medium' ? 0 : -3;
      const trendBonus = ag1.parsed.trend_assessment === 'improving' ? 2 : ag1.parsed.trend_assessment === 'deteriorating' ? -2 : 0;
      // AG1 score weighted 60%, quant score 40%, plus qualitative bonuses
      const promotionScore = (ag1.parsed.score * 0.6) + (a.compositeScore * 0.4) + confidenceBonus + trendBonus;
      return { analysis: a, promotionScore, ag1: ag1 };
    })
    .sort((a, b) => b.promotionScore - a.promotionScore);

  const promoted = promotionCandidates.slice(0, tier2PromoteCount);
  logger.info(`--- Phase 2: Promoting ${promoted.length} Tier 2 companies to full AG2-AG4 ---`);
  if (promoted.length > 0) {
    const topScore = promoted[0]!.promotionScore.toFixed(1);
    const bottomScore = promoted[promoted.length - 1]!.promotionScore.toFixed(1);
    logger.info(`  Promotion score range: ${bottomScore} — ${topScore}`);
  }

  // ─── Phase 3: Full AG1-AG4 for Tier 1 ───────────────────────
  logger.info(`--- Phase 3: Tier 1 full AG1-AG4 (${tier1.length} companies) ---`);

  for (let i = 0; i < tier1.length; i++) {
    const analysis = tier1[i]!;
    await runFullAgentPipeline(analysis, enrichedMap, client, agentModel, synthesisModel, regimeResult, `T1 [${i + 1}/${tier1.length}]`);
  }

  // ─── Phase 4: Full AG2-AG4 for Promoted Tier 2 ──────────────
  logger.info(`--- Phase 4: Promoted Tier 2 → AG2-AG4 (${promoted.length} companies) ---`);

  for (let i = 0; i < promoted.length; i++) {
    const { analysis, ag1 } = promoted[i]!;
    await runPromotedAgentPipeline(analysis, enrichedMap, client, agentModel, synthesisModel, regimeResult, ag1, `T2-promoted [${i + 1}/${promoted.length}]`);
  }

  logger.info(`LLM analysis complete: ${completed} succeeded, ${failed} exceptions, ${parseFailures} parse failures`);

  // ──────────────────────────────────────────────────────────────
  // Helper: Run full AG1-AG4 pipeline for a company
  async function runFullAgentPipeline(
    analysis: CompanyAnalysis,
    enrichedMap: Map<number, EnrichedSnapshot>,
    client: ReturnType<typeof createLlmClient>,
    agentModel: string | undefined,
    synthesisModel: string,
    regimeResult: { regime: string; confidence: string; signals: string[] } | null,
    label: string,
  ): Promise<void> {
    try {
      const enriched = enrichedMap.get(analysis.companyId);
      const fr = analysis.frameworkResults;
      if (!enriched || !fr) return;

      const companyStart = Date.now();
      logger.info(`  ${label} ${analysis.screenerCode} (rank #${analysis.rank}, quant=${analysis.classification})...`);

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

      // AG4: Synthesis
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

      // Apply AG4's independent evaluation
      if (synthParsed) {
        // Post-validate synthesis (also logs divergences)
        const synthValidation = validateSynthesis(synthParsed, analysis);
        if (synthValidation.warnings.length > 0) {
          logger.warn(`AG4 validation for ${analysis.screenerCode}: ${synthValidation.warnings.join('; ')}`);
        }
        Object.assign(synthParsed, synthValidation.overrides);

        // AG4 score becomes finalScore
        analysis.finalScore = synthParsed.score;

        // AG4 classification overrides quant
        analysis.classification = synthParsed.recommended_classification as Classification;
        analysis.classificationSource = 'ag4';

        // AG4 conviction overrides quant (both up AND down)
        analysis.convictionLevel = synthParsed.conviction;
        if (synthParsed.conviction !== analysis.quantConvictionLevel) {
          analysis.convictionReasons = [
            `AG4 synthesis: ${synthParsed.conviction_reasoning}`,
          ];
        }

        analysis.llmAnalysis = {
          trendNarrative: synthParsed.investment_thesis,
          riskFactors: riskParsed?.primary_risks.map((r) => `[${r.severity}] ${r.risk}`) ?? [],
          catalysts: fundParsed?.positive_signals ?? [],
          qualitativeAdjustment: synthParsed.score - analysis.compositeScore,
          confidence: synthParsed.conviction === 'high' ? 'high' : synthParsed.conviction === 'medium' ? 'medium' : 'low',
          reasoning: synthParsed.conviction_reasoning,
        };

        // Populate per-agent columns for dashboard
        if (fundParsed) analysis.llmFundamentals = fundParsed as unknown as Record<string, unknown>;
        if (govParsed) analysis.llmGovernance = govParsed as unknown as Record<string, unknown>;
        if (riskParsed) analysis.llmRisk = riskParsed as unknown as Record<string, unknown>;
        analysis.llmSynthesis = synthParsed as unknown as Record<string, unknown>;

        completed++;
      } else {
        parseFailures++;
        if (!analysis.llmParseFailures) analysis.llmParseFailures = [];
        analysis.llmParseFailures.push({ agent: 'AG4', error: 'parse_failure', timestamp: new Date().toISOString() });
        logger.warn(`AG4 parse failure for ${analysis.screenerCode}`);
      }

      // Track individual agent parse failures (AG1-AG3)
      if (!fundParsed) {
        if (!analysis.llmParseFailures) analysis.llmParseFailures = [];
        analysis.llmParseFailures.push({ agent: 'AG1', error: 'parse_failure', timestamp: new Date().toISOString() });
      }
      if (!govParsed) {
        if (!analysis.llmParseFailures) analysis.llmParseFailures = [];
        analysis.llmParseFailures.push({ agent: 'AG2', error: 'parse_failure', timestamp: new Date().toISOString() });
      }
      if (!riskParsed) {
        if (!analysis.llmParseFailures) analysis.llmParseFailures = [];
        analysis.llmParseFailures.push({ agent: 'AG3', error: 'parse_failure', timestamp: new Date().toISOString() });
      }

      const companyElapsed = ((Date.now() - companyStart) / 1000).toFixed(1);
      const totalLlm = tier1.length + tier2.length + promoted.length;
      const done = completed + failed + parseFailures;
      const totalElapsed = ((Date.now() - llmStartTime) / 1000 / 60).toFixed(1);
      const avgPerCompany = done > 0 ? (Date.now() - llmStartTime) / done / 1000 : 0;
      const remaining = ((totalLlm - done) * avgPerCompany / 60).toFixed(0);
      const conviction = synthParsed?.conviction ?? 'N/A';
      logger.info(`  ${label} ${analysis.screenerCode} done (${companyElapsed}s: AG1=${ag1Sec}s AG2=${ag2Sec}s AG3=${ag3Sec}s AG4=${ag4Sec}s) score=${analysis.finalScore} cls=${analysis.classification} conv=${conviction} | ${totalElapsed}min elapsed, ~${remaining}min remaining`);
    } catch (error) {
      failed++;
      logger.warn(`Multi-agent failed for ${analysis.screenerCode}: ${(error as Error).message}`);
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Helper: Run AG2-AG4 for promoted Tier 2 (AG1 already done)
  async function runPromotedAgentPipeline(
    analysis: CompanyAnalysis,
    enrichedMap: Map<number, EnrichedSnapshot>,
    client: ReturnType<typeof createLlmClient>,
    agentModel: string | undefined,
    synthesisModel: string,
    regimeResult: { regime: string; confidence: string; signals: string[] } | null,
    ag1Cache: { parsed: FundamentalsAgentOutput; rawResponse: string },
    label: string,
  ): Promise<void> {
    try {
      const enriched = enrichedMap.get(analysis.companyId);
      const fr = analysis.frameworkResults;
      if (!enriched || !fr) return;

      const companyStart = Date.now();
      logger.info(`  ${label} ${analysis.screenerCode} (rank #${analysis.rank}, quant=${analysis.classification}, AG1 score=${ag1Cache.parsed.score})...`);

      // AG1 already done — reuse cached result
      const fundParsed = ag1Cache.parsed;
      const fundResponse = ag1Cache.rawResponse;

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

      // AG4: Synthesis
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

      // Apply AG4's independent evaluation
      if (synthParsed) {
        const synthValidation = validateSynthesis(synthParsed, analysis);
        if (synthValidation.warnings.length > 0) {
          logger.warn(`AG4 validation for ${analysis.screenerCode}: ${synthValidation.warnings.join('; ')}`);
        }
        Object.assign(synthParsed, synthValidation.overrides);

        analysis.finalScore = synthParsed.score;
        analysis.classification = synthParsed.recommended_classification as Classification;
        analysis.classificationSource = 'ag4';
        analysis.convictionLevel = synthParsed.conviction;
        if (synthParsed.conviction !== analysis.quantConvictionLevel) {
          analysis.convictionReasons = [
            `AG4 synthesis: ${synthParsed.conviction_reasoning}`,
          ];
        }

        analysis.llmAnalysis = {
          trendNarrative: synthParsed.investment_thesis,
          riskFactors: riskParsed?.primary_risks.map((r) => `[${r.severity}] ${r.risk}`) ?? [],
          catalysts: fundParsed?.positive_signals ?? [],
          qualitativeAdjustment: synthParsed.score - analysis.compositeScore,
          confidence: synthParsed.conviction === 'high' ? 'high' : synthParsed.conviction === 'medium' ? 'medium' : 'low',
          reasoning: synthParsed.conviction_reasoning,
        };

        // Populate per-agent columns for dashboard
        analysis.llmFundamentals = fundParsed as unknown as Record<string, unknown>;
        if (govParsed) analysis.llmGovernance = govParsed as unknown as Record<string, unknown>;
        if (riskParsed) analysis.llmRisk = riskParsed as unknown as Record<string, unknown>;
        analysis.llmSynthesis = synthParsed as unknown as Record<string, unknown>;

        completed++;
      } else {
        parseFailures++;
        if (!analysis.llmParseFailures) analysis.llmParseFailures = [];
        analysis.llmParseFailures.push({ agent: 'AG4', error: 'parse_failure', timestamp: new Date().toISOString() });
        logger.warn(`AG4 parse failure for ${analysis.screenerCode}`);
      }

      // Track individual agent parse failures (AG2-AG3)
      if (!govParsed) {
        if (!analysis.llmParseFailures) analysis.llmParseFailures = [];
        analysis.llmParseFailures.push({ agent: 'AG2', error: 'parse_failure', timestamp: new Date().toISOString() });
      }
      if (!riskParsed) {
        if (!analysis.llmParseFailures) analysis.llmParseFailures = [];
        analysis.llmParseFailures.push({ agent: 'AG3', error: 'parse_failure', timestamp: new Date().toISOString() });
      }

      const companyElapsed = ((Date.now() - companyStart) / 1000).toFixed(1);
      const totalLlm = tier1.length + tier2.length + promoted.length;
      const done = completed + failed + parseFailures;
      const totalElapsed = ((Date.now() - llmStartTime) / 1000 / 60).toFixed(1);
      const avgPerCompany = done > 0 ? (Date.now() - llmStartTime) / done / 1000 : 0;
      const remaining = ((totalLlm - done) * avgPerCompany / 60).toFixed(0);
      const conviction = synthParsed?.conviction ?? 'N/A';
      logger.info(`  ${label} ${analysis.screenerCode} done (${companyElapsed}s: AG2=${ag2Sec}s AG3=${ag3Sec}s AG4=${ag4Sec}s) score=${analysis.finalScore} cls=${analysis.classification} conv=${conviction} | ${totalElapsed}min elapsed, ~${remaining}min remaining`);
    } catch (error) {
      failed++;
      logger.warn(`Promoted agent pipeline failed for ${analysis.screenerCode}: ${(error as Error).message}`);
    }
  }
}
