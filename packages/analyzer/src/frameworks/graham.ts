/**
 * Graham Defensive Investor Screen — 10 criteria.
 */
import type { GrahamResult, CriterionResult } from '@screener/shared';
import type { EnrichedSnapshot } from '../enrichment/flatten-v2.js';
import { consistencyCount, seriesAverageN } from '../enrichment/trend-analyzer.js';

export function evaluateGraham(data: EnrichedSnapshot): GrahamResult {
  const criteria: CriterionResult[] = [];

  // 1. Adequate size: Market Cap > 5,000 Cr
  const mcap = data.marketCap;
  criteria.push({
    name: 'Adequate Size',
    passed: mcap !== null && mcap > 5000,
    value: mcap,
    threshold: 'Market Cap > 5000 Cr',
    weight: 8,
  });

  // 2. Current ratio >= 2.0 (proxy)
  const cr = data.currentRatioProxy;
  criteria.push({
    name: 'Current Ratio',
    passed: cr !== null && cr >= 2.0,
    value: cr !== null ? Math.round(cr * 100) / 100 : null,
    threshold: '>= 2.0',
    weight: 10,
    detail: 'Proxy from balance sheet (Total Assets - FA - CWIP - Inv) / Other Liabilities',
  });

  // 3. Net current assets > long-term borrowings
  const ncav = data.ncav;
  const borrowings = data.borrowingsHistory[0] ?? null;
  criteria.push({
    name: 'Net Current Assets > Long-term Debt',
    passed: ncav !== null && borrowings !== null && ncav > borrowings,
    value: ncav !== null ? Math.round(ncav) : null,
    threshold: 'NCAV > Borrowings',
    weight: 10,
    detail: borrowings !== null ? `Borrowings: ${Math.round(borrowings)} Cr` : undefined,
  });

  // 4. Positive earnings all available years (up to 10)
  const profits = data.netProfitHistory.slice(0, 10);
  const profitableYears = consistencyCount(profits, 0, 'gt');
  const allProfitable = profitableYears === profits.filter((v) => v !== null).length && profitableYears > 0;
  criteria.push({
    name: 'Positive Earnings',
    passed: allProfitable,
    value: profitableYears,
    threshold: 'all years positive',
    weight: 12,
    detail: `${profitableYears}/${profits.filter((v) => v !== null).length} years profitable`,
  });

  // 5. Dividend continuity: dividend paid all available years
  const divHistory = data.dividendPayoutHistory.slice(0, 10);
  const divPaidYears = consistencyCount(divHistory, 0, 'gt');
  const validDivYears = divHistory.filter((v) => v !== null).length;
  const allDivPaid = divPaidYears === validDivYears && validDivYears > 0;
  criteria.push({
    name: 'Dividend Continuity',
    passed: allDivPaid,
    value: divPaidYears,
    threshold: 'all years paid',
    weight: 8,
    detail: `${divPaidYears}/${validDivYears} years with dividends`,
  });

  // 6. EPS growth >= 33% over 10yr (3yr avg endpoints)
  const eps = data.epsHistory;
  let epsGrowthPassed = false;
  let epsGrowthValue: number | null = null;
  if (eps.length >= 10) {
    const recentAvg = seriesAverageN(eps, 3);
    const oldAvg = seriesAverageN(eps.slice(Math.max(0, eps.length - 3)), 3);
    if (recentAvg !== null && oldAvg !== null && oldAvg > 0) {
      epsGrowthValue = ((recentAvg - oldAvg) / oldAvg) * 100;
      epsGrowthPassed = epsGrowthValue >= 33;
    }
  }
  criteria.push({
    name: 'EPS Growth',
    passed: epsGrowthPassed,
    value: epsGrowthValue !== null ? Math.round(epsGrowthValue) : null,
    threshold: '>= 33% over 10yr',
    weight: 12,
  });

  // 7. P/E < 15
  const pe = data.stockPe;
  criteria.push({
    name: 'P/E Ratio',
    passed: pe !== null && pe > 0 && pe < 15,
    value: pe !== null ? Math.round(pe * 10) / 10 : null,
    threshold: '< 15',
    weight: 12,
  });

  // 8. P/B < 1.5
  const pb = data.pbRatio;
  criteria.push({
    name: 'P/B Ratio',
    passed: pb !== null && pb < 1.5,
    value: pb !== null ? Math.round(pb * 100) / 100 : null,
    threshold: '< 1.5',
    weight: 10,
  });

  // 9. P/E x P/B < 22.5
  const pePb = (pe !== null && pb !== null && pe > 0) ? pe * pb : null;
  criteria.push({
    name: 'P/E x P/B Product',
    passed: pePb !== null && pePb < 22.5,
    value: pePb !== null ? Math.round(pePb * 10) / 10 : null,
    threshold: '< 22.5',
    weight: 10,
  });

  // 10. Price < Graham Number
  const gn = data.grahamNumber;
  const price = data.currentPrice;
  const priceVsGn = gn !== null && price !== null && price < gn;
  criteria.push({
    name: 'Price < Graham Number',
    passed: priceVsGn,
    value: gn !== null ? Math.round(gn * 10) / 10 : null,
    threshold: 'price < Graham Number',
    weight: 8,
    detail: price !== null && gn !== null ? `Price: ${price.toFixed(1)}, Graham Number: ${gn.toFixed(1)}` : undefined,
  });

  // Margin of safety
  let marginOfSafety: number | null = null;
  if (gn !== null && price !== null && price > 0) {
    marginOfSafety = ((gn - price) / price) * 100;
  }

  // Score: weighted pass/fail
  const passCount = criteria.filter((c) => c.passed).length;
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
  const weightedSum = criteria.reduce((s, c) => s + (c.passed ? c.weight : 0), 0);
  const score = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 0;

  return {
    score,
    passCount,
    totalCriteria: criteria.length,
    criteria,
    grahamNumber: gn !== null ? Math.round(gn * 10) / 10 : null,
    ncav: ncav !== null ? Math.round(ncav) : null,
    marginOfSafety: marginOfSafety !== null ? Math.round(marginOfSafety * 10) / 10 : null,
  };
}
