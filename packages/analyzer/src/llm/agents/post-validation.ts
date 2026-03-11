/**
 * Post-LLM validation: cross-checks LLM output against quantitative data.
 * Catches cases where the LLM claims "improving" trend when revenue declined,
 * or assigns high conviction to a disqualified company.
 */
import type { FundamentalsAgentOutput, SynthesisAgentOutput } from './agent-types.js';
import type { EnrichedSnapshot } from '../../enrichment/flatten-v2.js';
import type { CompanyAnalysis } from '@screener/shared';
import { logger } from '@screener/shared';

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  overrides: Record<string, unknown>;
}

export interface DivergenceRecord {
  screenerCode: string;
  companyName: string;
  quantClassification: string;
  ag4Classification: string;
  quantScore: number;
  ag4Score: number;
  scoreDelta: number;
  classificationLevelsApart: number;
  ag4Reasoning: string;
}

// Classification ordering for divergence measurement
const CLASSIFICATION_ORDER = ['strong_avoid', 'potential_short', 'neutral', 'potential_long', 'strong_long'];

function classificationDistance(a: string, b: string): number {
  const ai = CLASSIFICATION_ORDER.indexOf(a);
  const bi = CLASSIFICATION_ORDER.indexOf(b);
  if (ai === -1 || bi === -1) return 0;
  return Math.abs(ai - bi);
}

// Module-level divergence log, reset per pipeline run
let divergenceLog: DivergenceRecord[] = [];

export function resetDivergenceLog(): void {
  divergenceLog = [];
}

export function getDivergenceLog(): DivergenceRecord[] {
  return [...divergenceLog];
}

/**
 * Validate AG1 (Fundamentals) output against enriched snapshot data.
 */
export function validateFundamentals(
  parsed: FundamentalsAgentOutput,
  enriched: EnrichedSnapshot,
  analysis: CompanyAnalysis,
): ValidationResult {
  const warnings: string[] = [];
  const overrides: Record<string, unknown> = {};

  // Rule 1: "improving" trend but revenue declined 2+ of last 3 years
  if (parsed.trend_assessment === 'improving') {
    const rev = enriched.revenueHistory.slice(0, 3).filter((v): v is number => v !== null);
    if (rev.length >= 3) {
      let declines = 0;
      for (let i = 0; i < rev.length - 1; i++) {
        if (rev[i]! < rev[i + 1]!) declines++;  // History is newest-first, so rev[i] < rev[i+1] means decline
      }
      if (declines >= 2) {
        overrides.trend_assessment = 'deteriorating';
        warnings.push(`Trend overridden to "deteriorating": revenue declined ${declines}/2 recent periods`);
      }
    }
  }

  // Rule 2: "high" earnings quality but OCF < 50% of net profit in latest year
  if (parsed.earnings_quality === 'high') {
    const latestOcf = enriched.ocfHistory[0] ?? null;
    const latestProfit = enriched.netProfitHistory[0] ?? null;
    if (latestOcf !== null && latestProfit !== null && latestProfit > 0) {
      const ocfRatio = latestOcf / latestProfit;
      if (ocfRatio < 0.5) {
        overrides.earnings_quality = 'medium';
        warnings.push(`Earnings quality overridden to "medium": OCF/Net Profit = ${(ocfRatio * 100).toFixed(0)}% (< 50%)`);
      }
    }
  }

  // Rule 3: score > compositeScore+10 but company is disqualified → cap at compositeScore
  if (parsed.score > analysis.compositeScore + 10 && analysis.disqualified) {
    overrides.score = Math.min(parsed.score, analysis.compositeScore);
    warnings.push(`Score capped at ${analysis.compositeScore}: company is disqualified (was ${parsed.score})`);
  }

  return {
    valid: warnings.length === 0,
    warnings,
    overrides,
  };
}

/**
 * Validate AG4 (Synthesis) output against analysis data.
 * Also logs divergences for the watcher report.
 */
export function validateSynthesis(
  parsed: SynthesisAgentOutput,
  analysis: CompanyAnalysis,
): ValidationResult {
  const warnings: string[] = [];
  const overrides: Record<string, unknown> = {};

  // Rule 1: "high" conviction but company is disqualified → override to "none"
  if (parsed.conviction === 'high' && analysis.disqualified) {
    overrides.conviction = 'none';
    warnings.push('Conviction overridden to "none": company is disqualified');
  }

  // Rule 2: "high" conviction but conflicting signals → override to "medium"
  if (parsed.conviction === 'high' && parsed.signal_alignment === 'conflicting' && !analysis.disqualified) {
    overrides.conviction = 'medium';
    warnings.push('Conviction overridden to "medium": signal alignment is "conflicting"');
  }

  // Rule 3: disqualified company cannot be classified as strong_long or potential_long
  if (analysis.disqualified && (parsed.recommended_classification === 'strong_long' || parsed.recommended_classification === 'potential_long')) {
    overrides.recommended_classification = 'strong_avoid';
    warnings.push(`Classification overridden to "strong_avoid": company is disqualified (AG4 said "${parsed.recommended_classification}")`);
  }

  // Rule 4: Max divergence detection — log when AG4 disagrees with quant by 2+ classification levels
  const levelsApart = classificationDistance(analysis.classification, parsed.recommended_classification);
  const scoreDelta = parsed.score - analysis.compositeScore;

  if (levelsApart >= 2 || Math.abs(scoreDelta) >= 25) {
    const record: DivergenceRecord = {
      screenerCode: analysis.screenerCode,
      companyName: analysis.companyName,
      quantClassification: analysis.classification,
      ag4Classification: parsed.recommended_classification,
      quantScore: analysis.compositeScore,
      ag4Score: parsed.score,
      scoreDelta,
      classificationLevelsApart: levelsApart,
      ag4Reasoning: parsed.classification_reasoning,
    };
    divergenceLog.push(record);
    logger.warn(
      `DIVERGENCE: ${analysis.screenerCode} — Quant=${analysis.classification}(${analysis.compositeScore}) vs AG4=${parsed.recommended_classification}(${parsed.score}) [${levelsApart} levels, ${scoreDelta > 0 ? '+' : ''}${scoreDelta} pts] — ${parsed.classification_reasoning}`,
    );
  }

  return {
    valid: warnings.length === 0,
    warnings,
    overrides,
  };
}
