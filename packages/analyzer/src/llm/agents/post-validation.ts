/**
 * Post-LLM validation: cross-checks LLM output against quantitative data.
 * Catches cases where the LLM claims "improving" trend when revenue declined,
 * or assigns high conviction to a disqualified company.
 */
import type { FundamentalsAgentOutput, SynthesisAgentOutput } from './agent-types.js';
import type { EnrichedSnapshot } from '../../enrichment/flatten-v2.js';
import type { CompanyAnalysis } from '@screener/shared';

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  overrides: Record<string, unknown>;
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

  // Rule 3: adjustment > 3 but company is disqualified → cap at 0
  if (parsed.adjustment > 3 && analysis.disqualified) {
    overrides.adjustment = 0;
    warnings.push(`Adjustment capped at 0: company is disqualified (was ${parsed.adjustment})`);
  }

  return {
    valid: warnings.length === 0,
    warnings,
    overrides,
  };
}

/**
 * Validate AG4 (Synthesis) output against analysis data.
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

  // Rule 3: large positive adjustment but low composite score → cap
  if (parsed.final_adjustment > 10 && analysis.compositeScore < 40) {
    overrides.final_adjustment = 5;
    warnings.push(`Adjustment capped at 5: composite score is ${analysis.compositeScore} (< 40) but adjustment was ${parsed.final_adjustment}`);
  }

  return {
    valid: warnings.length === 0,
    warnings,
    overrides,
  };
}
