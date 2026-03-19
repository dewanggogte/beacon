import type { EnrichedSnapshot } from '../enrichment/flatten-v2.js';
import { consistencyCount } from '../enrichment/trend-analyzer.js';
import { checkHardGates, type GateResult } from './hard-gates.js';

/**
 * Check automatic disqualifiers against snapshot data.
 * Returns disqualification reasons (empty = not disqualified) and gate results.
 */
export function checkDisqualifiers(
  snapshot: Record<string, unknown>,
  disqualifiers: string[],
  enriched?: EnrichedSnapshot,
): { reasons: string[]; gateResults?: GateResult[] } {
  const reasons: string[] = [];

  for (const rule of disqualifiers) {
    if (evaluateDisqualifier(rule, snapshot)) {
      reasons.push(rule);
    }
  }

  // Additional disqualifiers from enriched data
  let gateResults: GateResult[] | undefined;
  if (enriched) {
    // Net losses in 3+ of last 5 years
    const profits5y = enriched.netProfitHistory.slice(0, 5);
    const validProfits = profits5y.filter((v) => v !== null);
    if (validProfits.length >= 5) {
      const lossCount = profits5y.filter((v) => v !== null && v < 0).length;
      if (lossCount >= 3) {
        reasons.push(`Net losses in ${lossCount} of last 5 years`);
      }
    }

    // Promoter holding decline >10pp in last year (4 quarters) without corporate action
    const promChange = enriched.promoterHolding4qChange;
    if (promChange !== null && promChange < -10) {
      reasons.push(`Promoter holding declined ${Math.abs(promChange).toFixed(1)}pp in last 4 quarters`);
    }

    // v3 hard gates
    const gates = checkHardGates(enriched);
    reasons.push(...gates.reasons);
    gateResults = gates.gateResults;
  }

  return { reasons, gateResults };
}

function evaluateDisqualifier(rule: string, data: Record<string, unknown>): boolean {
  const lower = rule.toLowerCase();

  // Promoter pledge > 50%
  if (lower.includes('promoter pledge') && lower.includes('50')) {
    const pledge = getNumericValue(data, 'promoterPledge');
    if (pledge !== null && pledge > 50) return true;
    return false;
  }

  // Negative net worth
  if (lower.includes('negative net worth') || lower.includes('equity below zero')) {
    const bookValue = getNumericValue(data, 'bookValue');
    if (bookValue !== null && bookValue < 0) return true;
    return false;
  }

  // ASM/GSM listing
  if (lower.includes('asm') || lower.includes('gsm')) {
    if (data['asmGsmListed'] === true) return true;
    return false;
  }

  // Qualified audit opinion
  if (lower.includes('audit opinion')) {
    if (data['qualifiedAuditOpinion'] === true) return true;
    return false;
  }

  // Negative operating cash flow for 3+ consecutive years
  if (lower.includes('cash flow') && lower.includes('negative') && lower.includes('3')) {
    return checkNegativeCashFlow(data);
  }

  // Debt-to-equity > 3 (excluding banking/NBFC)
  if (lower.includes('debt') && lower.includes('equity') && lower.includes('3')) {
    // Skip for banking/NBFC sectors (handled externally via sector data)
    const sector = String(data['sector'] ?? '').toLowerCase();
    if (sector.includes('bank') || sector.includes('nbfc') || sector.includes('finance')) {
      return false;
    }
    const debtToEquity = getNumericValue(data, 'debtToEquity');
    if (debtToEquity !== null && debtToEquity > 3.0) return true;
    return false;
  }

  // Fallback: try parsing simple rules like "field > value"
  const match = rule.match(/^(\w+)\s*(>|<|>=|<=|==)\s*(-?\d+\.?\d*)$/);
  if (match) {
    const [, field, operator, thresholdStr] = match;
    const value = getNumericValue(data, field!);
    if (value === null) return false;
    const threshold = parseFloat(thresholdStr!);

    switch (operator) {
      case '>': return value > threshold;
      case '<': return value < threshold;
      case '>=': return value >= threshold;
      case '<=': return value <= threshold;
      case '==': return value === threshold;
    }
  }

  return false;
}

function getNumericValue(data: Record<string, unknown>, field: string): number | null {
  const value = data[field];
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

function checkNegativeCashFlow(data: Record<string, unknown>): boolean {
  const cashFlow = data['cashFlow'] as Record<string, unknown>[] | undefined;
  if (!Array.isArray(cashFlow) || cashFlow.length < 3) return false;

  // Check last 3 years (index 0 = most recent after array reversal)
  const recentYears = cashFlow.slice(0, 3);
  return recentYears.every((year) => {
    const ocf = Number(
      year['Cash from Operating Activity']
      ?? year['Cash from Operating Activity +']
      ?? year['Cash from Operations']
      ?? 0,
    );
    return ocf < 0;
  });
}
