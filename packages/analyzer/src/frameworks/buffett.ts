/**
 * Buffett Framework Evaluator — 10 criteria for durable competitive advantages.
 */
import type { BuffettResult, CriterionResult } from '@screener/shared';
import type { EnrichedSnapshot } from '../enrichment/flatten-v2.js';
import {
  consistencyCount,
  seriesAverageN,
  seriesSlope,
  yoyGrowthCount,
} from '../enrichment/trend-analyzer.js';

export function evaluateBuffett(data: EnrichedSnapshot): BuffettResult {
  const criteria: CriterionResult[] = [];
  const moatIndicators: string[] = [];

  // Weights from buffett-checklist.json (summing to 100)
  const weights = [12, 12, 10, 8, 12, 8, 10, 10, 8, 10];

  // 1. ROE Consistency: >= 15% for 8+ of last 10 years
  const roeYears = data.roeHistory.slice(0, 10);
  const roeConsistency = consistencyCount(roeYears, 15);
  const roeConsPassed = roeConsistency >= 8;
  criteria.push({
    name: 'ROE Consistency',
    passed: roeConsPassed,
    value: roeConsistency,
    threshold: '8 of 10 years >= 15%',
    weight: weights[0]!,
    detail: `${roeConsistency}/${Math.min(roeYears.length, 10)} years with ROE >= 15%`,
  });
  if (roeConsPassed) moatIndicators.push('Consistent ROE above 15% — durable earnings power');

  // 2. ROE Level: 10yr avg >= 20%
  const roeAvg10 = data.roeAvg10Y;
  const roeLevelPassed = roeAvg10 !== null && roeAvg10 >= 20;
  criteria.push({
    name: 'ROE Level',
    passed: roeLevelPassed,
    value: roeAvg10 !== null ? Math.round(roeAvg10 * 10) / 10 : null,
    threshold: '10yr avg >= 20%',
    weight: weights[1]!,
  });
  if (roeLevelPassed) moatIndicators.push('High ROE signals competitive moat');

  // 3. OPM Stability: avg >= 15% and not declining
  const opmAvg = seriesAverageN(data.opmHistory, 5);
  const opmDeclining = data.opmHistory.length >= 3 && seriesSlope(data.opmHistory.slice(0, 5)) !== null && (seriesSlope(data.opmHistory.slice(0, 5)) ?? 0) < -1;
  const opmPassed = opmAvg !== null && opmAvg >= 15 && !opmDeclining;
  criteria.push({
    name: 'Operating Margin Stability',
    passed: opmPassed,
    value: opmAvg !== null ? Math.round(opmAvg * 10) / 10 : null,
    threshold: 'avg >= 15%, not declining',
    weight: weights[2]!,
    detail: opmDeclining ? 'Declining trend detected' : undefined,
  });
  if (opmPassed) moatIndicators.push('Stable operating margins — pricing power');

  // 4. Net Margin Level: 5yr avg >= 15%
  const netMarginAvg = data.netMarginAvg5Y;
  const netMarginPassed = netMarginAvg !== null && netMarginAvg >= 15;
  criteria.push({
    name: 'Net Margin Level',
    passed: netMarginPassed,
    value: netMarginAvg !== null ? Math.round(netMarginAvg * 10) / 10 : null,
    threshold: '5yr avg >= 15%',
    weight: weights[3]!,
  });

  // 5. Low Debt: D/E < 0.80
  const de = data.debtToEquity;
  // Skip for banking/finance
  const isBanking = data.sector.toLowerCase().includes('bank') ||
    data.sector.toLowerCase().includes('nbfc') ||
    data.sector.toLowerCase().includes('finance');
  const lowDebtPassed = isBanking ? true : (de !== null && de < 0.8);
  criteria.push({
    name: 'Low Debt',
    passed: lowDebtPassed,
    value: de !== null ? Math.round(de * 100) / 100 : null,
    threshold: 'D/E < 0.80',
    weight: weights[4]!,
    detail: isBanking ? 'Banking/Finance sector — D/E threshold not applicable' : undefined,
  });
  if (lowDebtPassed && !isBanking) moatIndicators.push('Low leverage — financial fortress');

  // 6. CapEx Efficiency: capex/profit < 50%
  const capexRatio = data.capexToProfitAvg;
  const capexPassed = capexRatio !== null && capexRatio < 0.5;
  criteria.push({
    name: 'CapEx Efficiency',
    passed: capexPassed,
    value: capexRatio !== null ? Math.round(capexRatio * 100) : null,
    threshold: 'capex/profit < 50%',
    weight: weights[5]!,
  });
  if (capexPassed) moatIndicators.push('Low capital requirements — asset-light moat');

  // 7. Owner Earnings: positive and growing (3yr trend)
  const oe = data.ownerEarningsHistory.slice(0, 3);
  const oe0 = oe[0] ?? null;
  const oe1 = oe[1] ?? null;
  const oe2 = oe[2] ?? null;
  const oePositive = oe.length >= 1 && oe0 !== null && oe0 > 0;
  const oeGrowing = oe.length >= 3 &&
    oe0 !== null && oe1 !== null && oe2 !== null &&
    oe0 > oe1 && oe1 > oe2;
  const oePassed = oePositive && (oe.length < 3 || oeGrowing);
  criteria.push({
    name: 'Owner Earnings',
    passed: oePassed,
    value: oe0,
    threshold: 'positive + growing 3yr',
    weight: weights[6]!,
  });

  // 8. Revenue Growth Consistency: grew YoY in 8+ of 10 years
  const revYears = data.revenueHistory.slice(0, 11); // need 11 values for 10 YoY comparisons
  const revGrowthCount = yoyGrowthCount(revYears);
  const revConsPassed = revGrowthCount >= 8;
  criteria.push({
    name: 'Revenue Growth Consistency',
    passed: revConsPassed,
    value: revGrowthCount,
    threshold: '8 of 10 years grew',
    weight: weights[7]!,
    detail: `${revGrowthCount}/${Math.min(revYears.length - 1, 10)} years with YoY growth`,
  });
  if (revConsPassed) moatIndicators.push('Consistent revenue growth — demand durability');

  // 9. Interest to Revenue: < 15%
  const intToRev = data.interestToRevenue;
  const intPassed = intToRev !== null && intToRev < 15;
  criteria.push({
    name: 'Interest to Revenue',
    passed: intPassed,
    value: intToRev !== null ? Math.round(intToRev * 10) / 10 : null,
    threshold: '< 15%',
    weight: weights[8]!,
  });

  // 10. Promoter Alignment: holding > 40%, stable or increasing
  const promHolding = data.promoterHolding;
  const promTrend = data.promoterHolding4qChange;
  const promPassed = promHolding !== null && promHolding > 40 &&
    (promTrend === null || promTrend >= -2); // Allow minor dips
  criteria.push({
    name: 'Promoter Alignment',
    passed: promPassed,
    value: promHolding,
    threshold: '> 40%, stable/increasing',
    weight: weights[9]!,
    detail: promTrend !== null ? `4Q change: ${promTrend > 0 ? '+' : ''}${promTrend.toFixed(2)}pp` : undefined,
  });

  // Score: weighted average where passed = 100, failed = 0
  const passCount = criteria.filter((c) => c.passed).length;
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
  const weightedSum = criteria.reduce((s, c) => s + (c.passed ? c.weight : 0), 0);
  const score = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 0;

  return {
    score,
    passCount,
    totalCriteria: criteria.length,
    criteria,
    moatIndicators,
  };
}
