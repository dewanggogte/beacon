/**
 * Pabrai Risk Screen — 6 risk factors.
 * Score is 0-100 where 100 = safest.
 */
import type { PabraiResult, PabraiRiskLevel, CriterionResult } from '@screener/shared';
import type { EnrichedSnapshot } from '../enrichment/flatten-v2.js';
import { consistencyCount, coefficientOfVariation } from '../enrichment/trend-analyzer.js';

/** Score a value on 0-100 scale (higher = safer). */
function riskScore(value: number, excellent: number, good: number, acceptable: number, risky: number, dangerous: number, lowerBetter: boolean): number {
  if (lowerBetter) {
    if (value <= excellent) return 95;
    if (value <= good) return 85;
    if (value <= acceptable) return 65;
    if (value <= risky) return 40;
    if (value <= dangerous) return 20;
    return 5;
  }
  // Higher is better
  if (value >= excellent) return 95;
  if (value >= good) return 85;
  if (value >= acceptable) return 65;
  if (value >= risky) return 40;
  if (value >= dangerous) return 20;
  return 5;
}

export function evaluatePabrai(data: EnrichedSnapshot): PabraiResult {
  const factors: CriterionResult[] = [];

  // Skip D/E and interest coverage for banking/finance
  const isBanking = data.sector.toLowerCase().includes('bank') ||
    data.sector.toLowerCase().includes('nbfc') ||
    data.sector.toLowerCase().includes('finance');

  // 1. D/E ratio (25%): 0 ideal, <0.5 safe, >1 risky
  const de = data.debtToEquity;
  let deScore = 50;
  if (isBanking) {
    deScore = 70; // Neutral for banking — D/E is structural
  } else if (de !== null) {
    deScore = riskScore(de, 0, 0.3, 0.5, 1.0, 2.0, true);
  }
  factors.push({
    name: 'D/E Ratio',
    passed: de !== null && (isBanking || de < 0.5),
    value: de !== null ? Math.round(de * 100) / 100 : null,
    threshold: '< 0.5',
    weight: 25,
    detail: isBanking ? 'Banking sector — D/E is structural' : undefined,
  });

  // 2. Interest coverage (20%): >5x safe
  const ic = data.interestCoverage;
  let icScore = 50;
  if (isBanking) {
    icScore = 70;
  } else if (ic !== null) {
    icScore = riskScore(ic, 10, 5, 3, 1.5, 1.0, false);
  }
  factors.push({
    name: 'Interest Coverage',
    passed: ic !== null && (isBanking || ic > 3),
    value: ic !== null ? Math.round(ic * 10) / 10 : null,
    threshold: '> 3x',
    weight: 20,
  });

  // 3. Debt repayment timeline (15%): Total debt / OCF < 3yr
  const borrowings = data.borrowingsHistory[0] ?? null;
  const ocf = data.ocfHistory[0] ?? null;
  let debtRepayScore = 50;
  let debtRepayYears: number | null = null;
  if (borrowings !== null && ocf !== null && ocf > 0) {
    debtRepayYears = borrowings / ocf;
    debtRepayScore = riskScore(debtRepayYears, 1, 2, 3, 5, 10, true);
  } else if (borrowings === null || borrowings === 0) {
    debtRepayScore = 95; // No debt
  } else if (ocf !== null && ocf <= 0) {
    debtRepayScore = 10; // Debt + negative OCF = very risky
  }
  factors.push({
    name: 'Debt Repayment Timeline',
    passed: debtRepayYears !== null ? debtRepayYears < 3 : borrowings === null || borrowings === 0,
    value: debtRepayYears !== null ? Math.round(debtRepayYears * 10) / 10 : null,
    threshold: 'Debt/OCF < 3yr',
    weight: 15,
  });

  // 4. Promoter pledge (15%): 0% ideal
  const pledge = data.promoterPledge ?? 0;
  const pledgeScore = riskScore(pledge, 0, 0, 10, 30, 50, true);
  factors.push({
    name: 'Promoter Pledge',
    passed: pledge <= 10,
    value: pledge,
    threshold: '<= 10%',
    weight: 15,
  });

  // 5. OCF predictability (15%): positive 5/5 years + low variance
  const ocfPositiveCount = consistencyCount(data.ocfHistory.slice(0, 5), 0, 'gt');
  const ocfCv = coefficientOfVariation(data.ocfHistory.slice(0, 5));
  let ocfPredScore = riskScore(ocfPositiveCount, 5, 4, 3, 2, 1, false);
  // Bonus/penalty for variance
  if (ocfCv !== null && ocfCv < 0.3) ocfPredScore = Math.min(95, ocfPredScore + 10);
  if (ocfCv !== null && ocfCv > 0.8) ocfPredScore = Math.max(5, ocfPredScore - 15);
  factors.push({
    name: 'OCF Predictability',
    passed: ocfPositiveCount >= 4,
    value: ocfPositiveCount,
    threshold: '>= 4/5 years positive',
    weight: 15,
    detail: ocfCv !== null ? `OCF CV: ${ocfCv.toFixed(2)}` : undefined,
  });

  // 6. Revenue stability (10%): low CV = simpler business
  const revCv = coefficientOfVariation(data.revenueHistory.slice(0, 5));
  let revStabScore = 50;
  if (revCv !== null) {
    revStabScore = riskScore(revCv, 0.1, 0.2, 0.35, 0.5, 0.8, true);
  }
  factors.push({
    name: 'Revenue Stability',
    passed: revCv !== null && revCv < 0.35,
    value: revCv !== null ? Math.round(revCv * 100) / 100 : null,
    threshold: 'CV < 0.35',
    weight: 10,
  });

  // Weighted composite: higher = safer
  const weights = [25, 20, 15, 15, 15, 10];
  const scores = [deScore, icScore, debtRepayScore, pledgeScore, ocfPredScore, revStabScore];
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const weightedSum = scores.reduce((s, score, i) => s + score * weights[i]!, 0);
  const finalScore = Math.round(weightedSum / totalWeight);

  // Risk level
  let overallRisk: PabraiRiskLevel;
  if (finalScore >= 75) overallRisk = 'low';
  else if (finalScore >= 55) overallRisk = 'moderate';
  else if (finalScore >= 35) overallRisk = 'elevated';
  else overallRisk = 'high';

  return {
    riskScore: finalScore,
    factors,
    overallRisk,
  };
}
