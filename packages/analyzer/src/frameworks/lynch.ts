/**
 * Peter Lynch Classification + Category-Specific Scoring.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LynchResult, LynchCategory, CriterionResult } from '@screener/shared';
import type { EnrichedSnapshot } from '../enrichment/flatten-v2.js';
import {
  seriesAverageN,
  coefficientOfVariation,
  consistencyCount,
  seriesSlope,
} from '../enrichment/trend-analyzer.js';

// Load cyclical sectors list
let cyclicalSectors: Set<string> | null = null;
function getCyclicalSectors(): Set<string> {
  if (cyclicalSectors) return cyclicalSectors;
  const path = resolve(process.cwd(), 'principles', 'frameworks', 'cyclical-sectors.json');
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  cyclicalSectors = new Set((raw.cyclicalSectors as string[]).map((s) => s.toLowerCase()));
  return cyclicalSectors;
}

function isCyclicalSector(sector: string): boolean {
  return getCyclicalSectors().has(sector.toLowerCase());
}

/** Step 1: Classify the company into one of 6 Lynch categories. */
function classifyCompany(data: EnrichedSnapshot): { category: LynchCategory; rationale: string } {
  const profits = data.netProfitHistory;
  const latestProfit = profits[0] ?? null;

  // 1. Turnaround: Net loss in latest year OR profit decline >30% from 3yr avg,
  //    AND was profitable 3+ of prior 7 years
  if (latestProfit !== null) {
    const priorProfits = profits.slice(1, 8);
    const priorProfitableCount = consistencyCount(priorProfits, 0, 'gt');
    const avg3yr = seriesAverageN(profits.slice(1, 4), 3);

    if (latestProfit <= 0 && priorProfitableCount >= 3) {
      return { category: 'turnaround', rationale: `Net loss in latest year (${latestProfit}) but profitable ${priorProfitableCount}/7 prior years` };
    }
    if (avg3yr !== null && avg3yr > 0 && latestProfit < avg3yr * 0.7 && priorProfitableCount >= 3) {
      return { category: 'turnaround', rationale: `Profit declined >30% from 3yr avg (${Math.round(avg3yr)} → ${Math.round(latestProfit)})` };
    }
  }

  // 2. Asset play: P/B < 0.5 OR (Investments + cash) > 50% of market cap
  const pb = data.pbRatio;
  const mcap = data.marketCap;
  const investments = data.investmentsHistory[0] ?? 0;
  if (pb !== null && pb < 0.5) {
    return { category: 'asset_play', rationale: `P/B = ${pb.toFixed(2)} < 0.5 — trading below asset value` };
  }
  if (mcap !== null && mcap > 0 && investments > mcap * 0.5) {
    return { category: 'asset_play', rationale: `Investments (${Math.round(investments)} Cr) > 50% of market cap (${Math.round(mcap)} Cr)` };
  }

  // 3. Cyclical: sector in list AND earnings CV > 0.5
  const earningsCv = data.earningsVarianceCv;
  if (isCyclicalSector(data.sector) && earningsCv !== null && earningsCv > 0.5) {
    return { category: 'cyclical', rationale: `Cyclical sector (${data.sector}) with high earnings variance (CV=${earningsCv.toFixed(2)})` };
  }

  // 4. Slow grower: Revenue CAGR 5Y < 5%, Market Cap > 20,000 Cr, Div Yield > 2%
  const revCagr = data.revenueCagr5Y;
  const divYield = data.dividendYield;
  if (revCagr !== null && revCagr < 0.05 && mcap !== null && mcap > 20000 &&
      divYield !== null && divYield > 2) {
    return { category: 'slow_grower', rationale: `Low growth (${(revCagr * 100).toFixed(1)}% rev CAGR), large cap (${Math.round(mcap)} Cr), good dividend (${divYield.toFixed(1)}%)` };
  }

  // 5. Fast grower: Revenue CAGR 5Y > 15% AND Profit CAGR 5Y > 15%
  const profCagr = data.profitCagr5Y;
  if (revCagr !== null && revCagr > 0.15 && profCagr !== null && profCagr > 0.15) {
    return { category: 'fast_grower', rationale: `High growth — Revenue CAGR ${(revCagr * 100).toFixed(1)}%, Profit CAGR ${(profCagr * 100).toFixed(1)}%` };
  }

  // 6. Stalwart: default
  return { category: 'stalwart', rationale: 'Does not fit other categories — moderate, steady business' };
}

/** Compute PEG ratio. */
function computePeg(data: EnrichedSnapshot): number | null {
  const pe = data.stockPe;
  const profitGrowth = data.profitCagr5Y;
  if (pe === null || pe <= 0 || profitGrowth === null || profitGrowth <= 0) return null;
  return pe / (profitGrowth * 100);
}

/** Score a single metric on a 0-100 scale using linear interpolation. */
function scoreLinear(value: number, excellent: number, good: number, poor: number, direction: 'lower' | 'higher'): number {
  if (direction === 'lower') {
    if (value <= excellent) return 95;
    if (value <= good) return 95 - ((value - excellent) / (good - excellent)) * 30;
    if (value <= poor) return 65 - ((value - good) / (poor - good)) * 45;
    return Math.max(5, 20 - ((value - poor) / poor) * 15);
  }
  // higher is better
  if (value >= excellent) return 95;
  if (value >= good) return 65 + ((value - good) / (excellent - good)) * 30;
  if (value >= poor) return 20 + ((value - poor) / (good - poor)) * 45;
  return Math.max(5, 20 * (value / poor));
}

/** Step 2: Category-specific scoring. */
function scoreCategory(category: LynchCategory, data: EnrichedSnapshot): { score: number; metrics: CriterionResult[] } {
  const metrics: CriterionResult[] = [];

  switch (category) {
    case 'fast_grower': {
      // PEG (40%)
      const peg = computePeg(data);
      const pegScore = peg !== null ? scoreLinear(peg, 0.5, 1.0, 2.0, 'lower') : 50;
      metrics.push({ name: 'PEG Ratio', passed: peg !== null && peg < 1.0, value: peg !== null ? Math.round(peg * 100) / 100 : null, threshold: '< 1.0', weight: 40 });

      // Earnings sustainability (30%): profit growing consistently
      const profGrowth = consistencyCount(data.netProfitHistory.slice(0, 5), 0, 'gt');
      const sustainScore = scoreLinear(profGrowth, 5, 4, 2, 'higher');
      metrics.push({ name: 'Earnings Sustainability', passed: profGrowth >= 4, value: profGrowth, threshold: '>= 4/5 years profitable', weight: 30 });

      // Institutional entry (15%)
      const fiiChange = data.fiiHistory.length >= 4 ?
        ((data.fiiHistory[0] ?? 0) - (data.fiiHistory[3] ?? 0)) : null;
      const instScore = fiiChange !== null ? (fiiChange > 0 ? Math.min(95, 60 + fiiChange * 10) : Math.max(20, 50 + fiiChange * 5)) : 50;
      metrics.push({ name: 'Institutional Entry', passed: fiiChange !== null && fiiChange > 0, value: fiiChange !== null ? Math.round(fiiChange * 100) / 100 : null, threshold: 'FII increasing', weight: 15 });

      // Margin trajectory (15%)
      const opmSlope = seriesSlope(data.opmHistory.slice(0, 5));
      const marginScore = opmSlope !== null ? (opmSlope > 0 ? Math.min(95, 60 + opmSlope * 15) : Math.max(10, 50 + opmSlope * 10)) : 50;
      metrics.push({ name: 'Margin Trajectory', passed: opmSlope !== null && opmSlope > 0, value: opmSlope !== null ? Math.round(opmSlope * 100) / 100 : null, threshold: 'OPM improving', weight: 15 });

      const totalScore = (pegScore * 40 + sustainScore * 30 + instScore * 15 + marginScore * 15) / 100;
      return { score: Math.round(totalScore), metrics };
    }

    case 'stalwart': {
      // PEG (25%)
      const peg = computePeg(data);
      const pegScore = peg !== null ? scoreLinear(peg, 0.8, 1.5, 2.5, 'lower') : 50;
      metrics.push({ name: 'PEG Ratio', passed: peg !== null && peg < 1.5, value: peg !== null ? Math.round(peg * 100) / 100 : null, threshold: '< 1.5', weight: 25 });

      // Margin stability (25%)
      const opmCv = coefficientOfVariation(data.opmHistory.slice(0, 5));
      const marginStabScore = opmCv !== null ? scoreLinear(opmCv, 0.05, 0.15, 0.4, 'lower') : 50;
      metrics.push({ name: 'Margin Stability', passed: opmCv !== null && opmCv < 0.15, value: opmCv !== null ? Math.round(opmCv * 100) / 100 : null, threshold: 'OPM CV < 0.15', weight: 25 });

      // Dividend growth (25%)
      const divs = data.dividendPayoutHistory.slice(0, 5);
      const divGrowing = divs.length >= 2 && (divs[0] ?? 0) > 0 && (divs[0] ?? 0) >= (divs[divs.length - 1] ?? 0);
      const divScore = divGrowing ? 80 : (divs[0] !== null && divs[0]! > 0 ? 50 : 20);
      metrics.push({ name: 'Dividend Growth', passed: divGrowing, value: divs[0] ?? null, threshold: 'Dividends growing', weight: 25 });

      // Reasonable P/E (25%)
      const pe = data.stockPe;
      const peScore = pe !== null ? scoreLinear(pe, 12, 20, 35, 'lower') : 50;
      metrics.push({ name: 'Reasonable P/E', passed: pe !== null && pe < 20, value: pe !== null ? Math.round(pe * 10) / 10 : null, threshold: '< 20', weight: 25 });

      const totalScore = (pegScore * 25 + marginStabScore * 25 + divScore * 25 + peScore * 25) / 100;
      return { score: Math.round(totalScore), metrics };
    }

    case 'cyclical': {
      // Earnings cycle position (40%): where are we in the cycle?
      // Low P/E at peak earnings = SELL signal; High P/E at trough = BUY signal
      const pe = data.stockPe;
      const earningsCv = data.earningsVarianceCv;
      const profitSlope = seriesSlope(data.netProfitHistory.slice(0, 5));
      // Rising profits + low P/E = potentially near peak (dangerous)
      // Falling profits + high P/E = potentially near trough (opportunity)
      let cycleScore = 50;
      if (pe !== null && profitSlope !== null) {
        if (profitSlope > 0 && pe > 15) cycleScore = 60; // Rising + reasonable valuation
        else if (profitSlope > 0 && pe < 10) cycleScore = 30; // Rising + very low P/E = near peak?
        else if (profitSlope < 0 && pe > 20) cycleScore = 40; // Falling + high P/E = still expensive
        else if (profitSlope < 0 && pe < 15) cycleScore = 70; // Falling + lower P/E = approaching trough
      }
      metrics.push({ name: 'Earnings Cycle Position', passed: cycleScore >= 60, value: profitSlope !== null ? Math.round(profitSlope) : null, threshold: 'Not at peak', weight: 40 });

      // D/E (25%)
      const de = data.debtToEquity;
      const deScore = de !== null ? scoreLinear(de, 0.3, 0.8, 2.0, 'lower') : 50;
      metrics.push({ name: 'D/E Ratio', passed: de !== null && de < 0.8, value: de !== null ? Math.round(de * 100) / 100 : null, threshold: '< 0.8', weight: 25 });

      // Momentum (20%): is the stock below 52w high?
      const price = data.currentPrice;
      const high52 = data.high52w;
      let momentumScore = 50;
      if (price !== null && high52 !== null && high52 > 0) {
        const pctFromHigh = ((high52 - price) / high52) * 100;
        momentumScore = pctFromHigh > 30 ? 70 : pctFromHigh > 15 ? 55 : 40;
      }
      metrics.push({ name: 'Momentum', passed: momentumScore >= 55, value: price, threshold: 'Below 52w high', weight: 20 });

      // Sector timing (15%): CV-based — higher CV = more cyclical = more timing-dependent
      const timingScore = earningsCv !== null ? scoreLinear(earningsCv, 0.3, 0.5, 1.0, 'lower') : 50;
      metrics.push({ name: 'Sector Timing', passed: earningsCv !== null && earningsCv < 0.5, value: earningsCv !== null ? Math.round(earningsCv * 100) / 100 : null, threshold: 'CV < 0.5', weight: 15 });

      const totalScore = (cycleScore * 40 + deScore * 25 + momentumScore * 20 + timingScore * 15) / 100;
      return { score: Math.round(totalScore), metrics };
    }

    case 'turnaround': {
      // Cash/debt coverage (35%)
      const ocf = data.ocfHistory[0] ?? null;
      const totalDebt = data.borrowingsHistory[0] ?? null;
      let cashDebtScore = 30;
      if (ocf !== null && totalDebt !== null && ocf > 0) {
        const yearsToRepay = totalDebt / ocf;
        cashDebtScore = scoreLinear(yearsToRepay, 2, 5, 15, 'lower');
      } else if (ocf !== null && ocf > 0 && (totalDebt === null || totalDebt === 0)) {
        cashDebtScore = 90; // No debt + positive OCF
      }
      metrics.push({ name: 'Cash/Debt Coverage', passed: cashDebtScore >= 60, value: ocf, threshold: 'Debt/OCF < 5yr', weight: 35 });

      // OCF trend (25%)
      const ocfPositive = consistencyCount(data.ocfHistory.slice(0, 3), 0, 'gt');
      const ocfTrendScore = scoreLinear(ocfPositive, 3, 2, 0, 'higher');
      metrics.push({ name: 'OCF Trend', passed: ocfPositive >= 2, value: ocfPositive, threshold: '>= 2/3 years positive', weight: 25 });

      // Margin recovery (20%)
      const opmSlope = seriesSlope(data.opmHistory.slice(0, 3));
      const marginRecScore = opmSlope !== null && opmSlope > 0 ? Math.min(90, 50 + opmSlope * 10) : 30;
      metrics.push({ name: 'Margin Recovery', passed: opmSlope !== null && opmSlope > 0, value: opmSlope !== null ? Math.round(opmSlope * 100) / 100 : null, threshold: 'OPM improving', weight: 20 });

      // Management signals (20%): promoter holding + institutional interest
      const promHolding = data.promoterHolding ?? 0;
      const promChange = data.promoterHolding4qChange ?? 0;
      let mgmtScore = 50;
      if (promHolding > 50 && promChange >= 0) mgmtScore = 80;
      else if (promHolding > 40) mgmtScore = 60;
      else if (promHolding < 25) mgmtScore = 30;
      metrics.push({ name: 'Management Signals', passed: mgmtScore >= 60, value: promHolding, threshold: 'Promoter > 40%, not declining', weight: 20 });

      const totalScore = (cashDebtScore * 35 + ocfTrendScore * 25 + marginRecScore * 20 + mgmtScore * 20) / 100;
      return { score: Math.round(totalScore), metrics };
    }

    case 'slow_grower': {
      // Dividend yield vs bond yield (40%): India 10Y ~7%, so div yield > 3% is decent
      const divYield = data.dividendYield;
      const divScore = divYield !== null ? scoreLinear(divYield, 5, 3, 1, 'higher') : 30;
      metrics.push({ name: 'Dividend Yield', passed: divYield !== null && divYield > 3, value: divYield !== null ? Math.round(divYield * 10) / 10 : null, threshold: '> 3%', weight: 40 });

      // Payout sustainability (30%): payout ratio < 80% and earnings stable
      const payout = data.dividendPayoutHistory[0] ?? null;
      const payoutScore = payout !== null ? (payout > 0 && payout < 80 ? 80 : payout >= 80 ? 40 : 20) : 30;
      metrics.push({ name: 'Payout Sustainability', passed: payout !== null && payout > 0 && payout < 80, value: payout, threshold: 'Payout > 0% and < 80%', weight: 30 });

      // Not shrinking (30%): revenue not declining
      const revSlope = seriesSlope(data.revenueHistory.slice(0, 5));
      const notShrinkingScore = revSlope !== null && revSlope > 0 ? 80 : revSlope !== null && revSlope > -0.05 ? 50 : 20;
      metrics.push({ name: 'Not Shrinking', passed: revSlope !== null && revSlope > 0, value: revSlope !== null ? Math.round(revSlope) : null, threshold: 'Revenue not declining', weight: 30 });

      const totalScore = (divScore * 40 + payoutScore * 30 + notShrinkingScore * 30) / 100;
      return { score: Math.round(totalScore), metrics };
    }

    case 'asset_play': {
      // Asset coverage vs market cap (50%)
      const totalAssets = data.totalAssetsHistory[0] ?? null;
      const mcap = data.marketCap;
      let assetCovScore = 30;
      if (totalAssets !== null && mcap !== null && mcap > 0) {
        const ratio = totalAssets / mcap;
        assetCovScore = scoreLinear(ratio, 3, 1.5, 0.5, 'higher');
      }
      const pb = data.pbRatio;
      metrics.push({ name: 'Asset Coverage', passed: pb !== null && pb < 1.0, value: pb !== null ? Math.round(pb * 100) / 100 : null, threshold: 'P/B < 1.0', weight: 50 });

      // Catalyst proximity (30%): hard to quantify — use promoter activity + institutional interest as proxy
      const fiiChange = data.fiiHistory.length >= 4 ?
        ((data.fiiHistory[0] ?? 0) - (data.fiiHistory[3] ?? 0)) : null;
      const catalystScore = fiiChange !== null && fiiChange > 1 ? 75 : fiiChange !== null && fiiChange > 0 ? 55 : 35;
      metrics.push({ name: 'Catalyst Proximity', passed: catalystScore >= 55, value: fiiChange !== null ? Math.round(fiiChange * 100) / 100 : null, threshold: 'FII increasing', weight: 30 });

      // Governance (20%)
      const promHolding = data.promoterHolding ?? 0;
      const pledge = data.promoterPledge ?? 0;
      const govScore = promHolding > 50 && pledge < 10 ? 85 : promHolding > 30 && pledge < 30 ? 60 : 30;
      metrics.push({ name: 'Governance', passed: govScore >= 60, value: promHolding, threshold: 'Promoter > 30%, low pledge', weight: 20 });

      const totalScore = (assetCovScore * 50 + catalystScore * 30 + govScore * 20) / 100;
      return { score: Math.round(totalScore), metrics };
    }
  }
}

export function evaluateLynch(data: EnrichedSnapshot): LynchResult {
  const { category, rationale } = classifyCompany(data);
  const { score, metrics } = scoreCategory(category, data);

  return {
    category,
    categoryScore: score,
    categoryMetrics: metrics,
    classificationRationale: rationale,
  };
}
