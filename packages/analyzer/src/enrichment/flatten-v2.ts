/**
 * Enhanced data extraction from company snapshots.
 * Extracts full time series from all JSONB columns (up to 13 years).
 */
import type { schema } from '@screener/shared';
import {
  cagr,
  seriesAverage,
  seriesAverageN,
  consistencyCount,
  yoyGrowthCount,
  coefficientOfVariation,
  absoluteChange,
} from './trend-analyzer.js';
import { computePiotroskiFScore, computeAltmanZScore, computeBeneishMScore } from './financial-scores.js';

type Snapshot = typeof schema.companySnapshots.$inferSelect;

/** Safely get a numeric value from a JSONB record. */
function num(record: Record<string, unknown> | undefined, key: string): number | null {
  if (!record) return null;
  const v = record[key];
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/** Extract a numeric series from an array of JSONB records. */
function extractSeries(
  records: Record<string, unknown>[],
  key: string,
  altKey?: string,
): (number | null)[] {
  return records.map((r) => {
    const v = num(r, key);
    if (v !== null) return v;
    if (altKey) return num(r, altKey);
    return null;
  });
}

export interface EnrichedSnapshot {
  // --- Direct from snapshot ---
  marketCap: number | null;
  currentPrice: number | null;
  stockPe: number | null;
  bookValue: number | null;
  dividendYield: number | null;
  roce: number | null;
  roe: number | null;
  faceValue: number | null;
  high52w: number | null;
  low52w: number | null;

  // --- P&L time series ---
  revenueHistory: (number | null)[];
  netProfitHistory: (number | null)[];
  epsHistory: (number | null)[];
  opmHistory: (number | null)[];
  operatingProfitHistory: (number | null)[];
  interestHistory: (number | null)[];
  depreciationHistory: (number | null)[];
  dividendPayoutHistory: (number | null)[];

  // --- P&L derived ---
  revenueCagr5Y: number | null;
  revenueCagr10Y: number | null;
  profitCagr5Y: number | null;
  profitCagr10Y: number | null;
  opm: number | null;
  opmAvg5Y: number | null;
  netMarginHistory: (number | null)[];
  netMarginAvg5Y: number | null;
  interestCoverage: number | null;
  interestToRevenue: number | null;
  marginTrend: number | null;

  // --- ROE derived (from P&L + BS) ---
  roeHistory: (number | null)[];
  roeAvg5Y: number | null;
  roeAvg10Y: number | null;
  roeConsistencyCount10Y: number;
  roeTrend: number | null;

  // --- Balance sheet time series ---
  borrowingsHistory: (number | null)[];
  equityHistory: (number | null)[];
  reservesHistory: (number | null)[];
  netWorthHistory: (number | null)[];
  fixedAssetsHistory: (number | null)[];
  investmentsHistory: (number | null)[];
  totalAssetsHistory: (number | null)[];
  otherLiabilitiesHistory: (number | null)[];

  // --- BS derived ---
  deHistory: (number | null)[];
  debtToEquity: number | null;
  debtTrend: number | null;
  ncav: number | null;
  currentRatioProxy: number | null;
  retainedEarningsGrowth: number | null;

  // --- Cash flow time series ---
  ocfHistory: (number | null)[];
  investingCfHistory: (number | null)[];
  financingCfHistory: (number | null)[];

  // --- CF derived ---
  fcfPositiveYears: number;
  capexProxyHistory: (number | null)[];
  ownerEarningsHistory: (number | null)[];
  capexToProfitAvg: number | null;

  // --- Ratios time series ---
  roceHistory: (number | null)[];
  debtorDaysHistory: (number | null)[];
  inventoryDaysHistory: (number | null)[];
  workingCapitalDaysHistory: (number | null)[];

  // --- Shareholding time series (quarterly) ---
  promoterHoldingHistory: (number | null)[];
  fiiHistory: (number | null)[];
  diiHistory: (number | null)[];
  publicHoldingHistory: (number | null)[];
  shareholderCountHistory: (number | null)[];

  // --- Shareholding derived ---
  promoterHolding: number | null;
  promoterPledge: number | null;
  fiiHolding: number | null;
  diiHolding: number | null;
  publicHolding: number | null;
  institutionalHolding: number | null;
  freeFloat: number | null;
  promoterHoldingTrend: number | null;
  promoterHolding4qChange: number | null;
  shareholderCountTrend: number | null;

  // --- Derived metrics ---
  pbRatio: number | null;
  grahamNumber: number | null;
  earningsVarianceCv: number | null;
  revenueGrowthConsistency: number;

  // --- Pros/Cons ---
  pros: string[];
  cons: string[];

  // --- Peer comparison ---
  peerComparison: Record<string, unknown>[] | null;

  // --- Raw data (for disqualifier / framework use) ---
  cashFlow: Record<string, unknown>[] | null;
  balanceSheet: Record<string, unknown>[] | null;
  annualPl: Record<string, unknown>[] | null;
  sector: string;

  // --- v3 financial health scores ---
  piotroskiFScore: number;
  altmanZScore: number | null;
  beneishMScore: number | null;
  roceTrailing3Y: number | null;
  revenueDeclineYears: number;
}

/**
 * Extract enriched data from a company snapshot.
 * Produces 60+ metrics including full time series for framework evaluators.
 */
export function flattenV2(
  snapshot: Snapshot,
  sector: string,
): EnrichedSnapshot {
  const enriched: EnrichedSnapshot = {
    // Direct fields
    marketCap: snapshot.marketCap ? Number(snapshot.marketCap) : null,
    currentPrice: snapshot.currentPrice ? Number(snapshot.currentPrice) : null,
    stockPe: snapshot.stockPe ? Number(snapshot.stockPe) : null,
    bookValue: snapshot.bookValue ? Number(snapshot.bookValue) : null,
    dividendYield: snapshot.dividendYield ? Number(snapshot.dividendYield) : null,
    roce: snapshot.roce ? Number(snapshot.roce) : null,
    roe: snapshot.roe ? Number(snapshot.roe) : null,
    faceValue: snapshot.faceValue ? Number(snapshot.faceValue) : null,
    high52w: snapshot.high52w ? Number(snapshot.high52w) : null,
    low52w: snapshot.low52w ? Number(snapshot.low52w) : null,

    // Will be populated below
    revenueHistory: [],
    netProfitHistory: [],
    epsHistory: [],
    opmHistory: [],
    operatingProfitHistory: [],
    interestHistory: [],
    depreciationHistory: [],
    dividendPayoutHistory: [],
    revenueCagr5Y: null,
    revenueCagr10Y: null,
    profitCagr5Y: null,
    profitCagr10Y: null,
    opm: null,
    opmAvg5Y: null,
    netMarginHistory: [],
    netMarginAvg5Y: null,
    interestCoverage: null,
    interestToRevenue: null,
    marginTrend: null,
    roeHistory: [],
    roeAvg5Y: null,
    roeAvg10Y: null,
    roeConsistencyCount10Y: 0,
    roeTrend: null,
    borrowingsHistory: [],
    equityHistory: [],
    reservesHistory: [],
    netWorthHistory: [],
    fixedAssetsHistory: [],
    investmentsHistory: [],
    totalAssetsHistory: [],
    otherLiabilitiesHistory: [],
    deHistory: [],
    debtToEquity: null,
    debtTrend: null,
    ncav: null,
    currentRatioProxy: null,
    retainedEarningsGrowth: null,
    ocfHistory: [],
    investingCfHistory: [],
    financingCfHistory: [],
    fcfPositiveYears: 0,
    capexProxyHistory: [],
    ownerEarningsHistory: [],
    capexToProfitAvg: null,
    roceHistory: [],
    debtorDaysHistory: [],
    inventoryDaysHistory: [],
    workingCapitalDaysHistory: [],
    promoterHoldingHistory: [],
    fiiHistory: [],
    diiHistory: [],
    publicHoldingHistory: [],
    shareholderCountHistory: [],
    promoterHolding: null,
    promoterPledge: null,
    fiiHolding: null,
    diiHolding: null,
    publicHolding: null,
    institutionalHolding: null,
    freeFloat: null,
    promoterHoldingTrend: null,
    promoterHolding4qChange: null,
    shareholderCountTrend: null,
    pbRatio: null,
    grahamNumber: null,
    earningsVarianceCv: null,
    revenueGrowthConsistency: 0,
    pros: [],
    cons: [],
    peerComparison: null,
    cashFlow: null,
    balanceSheet: null,
    annualPl: null,
    sector,
    piotroskiFScore: 0,
    altmanZScore: null,
    beneishMScore: null,
    roceTrailing3Y: null,
    revenueDeclineYears: 0,
  };

  // --- Annual P&L ---
  const annualPl = snapshot.annualPl as Record<string, unknown>[] | null;
  enriched.annualPl = annualPl ?? null;
  if (Array.isArray(annualPl) && annualPl.length > 0) {
    // Skip TTM entry if present (period === "TTM")
    const plData = annualPl[0]?.period === 'TTM' ? annualPl.slice(1) : annualPl;

    if (plData.length > 0) {
    enriched.revenueHistory = extractSeries(plData, 'Sales');
    enriched.netProfitHistory = extractSeries(plData, 'Net Profit');
    enriched.epsHistory = extractSeries(plData, 'EPS in Rs');
    enriched.opmHistory = extractSeries(plData, 'OPM %');
    enriched.operatingProfitHistory = extractSeries(plData, 'Operating Profit');
    enriched.interestHistory = extractSeries(plData, 'Interest');
    enriched.depreciationHistory = extractSeries(plData, 'Depreciation');
    enriched.dividendPayoutHistory = extractSeries(plData, 'Dividend Payout %');

    const latest = plData[0]!;

    // OPM
    enriched.opm = num(latest, 'OPM %');
    enriched.opmAvg5Y = seriesAverageN(enriched.opmHistory, 5);

    // Net margin history
    enriched.netMarginHistory = plData.map((r) => {
      const np = num(r, 'Net Profit');
      const sales = num(r, 'Sales');
      if (np !== null && sales !== null && sales > 0) return (np / sales) * 100;
      return null;
    });
    enriched.netMarginAvg5Y = seriesAverageN(enriched.netMarginHistory, 5);

    // Interest coverage
    const opProfit = num(latest, 'Operating Profit');
    const interest = num(latest, 'Interest');
    if (opProfit !== null && interest !== null && interest > 0) {
      enriched.interestCoverage = opProfit / interest;
    }

    // Interest to revenue
    const revenue = num(latest, 'Sales');
    if (interest !== null && revenue !== null && revenue > 0) {
      enriched.interestToRevenue = (interest / revenue) * 100;
    }

    // Margin trend
    if (plData.length > 1) {
      const latestOpm = num(latest, 'OPM %');
      const prevOpm = num(plData[1]!, 'OPM %');
      if (latestOpm !== null && prevOpm !== null) {
        enriched.marginTrend = latestOpm - prevOpm;
      }
    }

    // Revenue CAGR
    if (plData.length > 5) {
      enriched.revenueCagr5Y = cagr(num(latest, 'Sales'), num(plData[5]!, 'Sales'), 5);
    }
    if (plData.length > 10) {
      enriched.revenueCagr10Y = cagr(num(latest, 'Sales'), num(plData[10]!, 'Sales'), 10);
    }

    // Profit CAGR
    if (plData.length > 5) {
      enriched.profitCagr5Y = cagr(num(latest, 'Net Profit'), num(plData[5]!, 'Net Profit'), 5);
    }
    if (plData.length > 10) {
      enriched.profitCagr10Y = cagr(num(latest, 'Net Profit'), num(plData[10]!, 'Net Profit'), 10);
    }

    // Revenue growth consistency (how many years revenue grew YoY)
    enriched.revenueGrowthConsistency = yoyGrowthCount(enriched.revenueHistory);

    // Earnings variance CV
    enriched.earningsVarianceCv = coefficientOfVariation(enriched.netProfitHistory);
    } // end plData.length > 0
  }

  // --- Balance Sheet ---
  const balanceSheet = snapshot.balanceSheet as Record<string, unknown>[] | null;
  enriched.balanceSheet = balanceSheet ?? null;
  if (Array.isArray(balanceSheet) && balanceSheet.length > 0) {
    enriched.borrowingsHistory = extractSeries(balanceSheet, 'Borrowings');
    enriched.equityHistory = extractSeries(balanceSheet, 'Equity Capital');
    enriched.reservesHistory = extractSeries(balanceSheet, 'Reserves');
    enriched.fixedAssetsHistory = extractSeries(balanceSheet, 'Fixed Assets');
    enriched.investmentsHistory = extractSeries(balanceSheet, 'Investments');
    enriched.totalAssetsHistory = extractSeries(balanceSheet, 'Total Assets');
    enriched.otherLiabilitiesHistory = extractSeries(balanceSheet, 'Other Liabilities');

    // Net worth = Equity Capital + Reserves
    enriched.netWorthHistory = balanceSheet.map((r) => {
      const eq = num(r, 'Equity Capital');
      const res = num(r, 'Reserves');
      if (eq !== null && res !== null) return eq + res;
      return null;
    });

    // D/E history
    enriched.deHistory = balanceSheet.map((r) => {
      const borr = num(r, 'Borrowings');
      const eq = num(r, 'Equity Capital');
      const res = num(r, 'Reserves');
      if (borr !== null && eq !== null && res !== null) {
        const totalEq = eq + res;
        return totalEq > 0 ? borr / totalEq : null;
      }
      return null;
    });
    enriched.debtToEquity = enriched.deHistory[0] ?? null;

    // Debt trend
    if (enriched.borrowingsHistory.length > 1) {
      const curr = enriched.borrowingsHistory[0] ?? null;
      const prev = enriched.borrowingsHistory[1] ?? null;
      if (curr !== null && prev !== null && prev > 0) {
        enriched.debtTrend = ((curr - prev) / prev) * 100;
      }
    }

    // ROE history (from P&L Net Profit / BS Net Worth)
    if (Array.isArray(annualPl)) {
      const plData = annualPl[0]?.period === 'TTM' ? annualPl.slice(1) : annualPl;
      const len = Math.min(plData.length, balanceSheet.length);
      enriched.roeHistory = [];
      for (let i = 0; i < len; i++) {
        const np = num(plData[i]!, 'Net Profit');
        const nw = enriched.netWorthHistory[i] ?? null;
        if (np !== null && nw !== null && nw > 0) {
          enriched.roeHistory.push((np / nw) * 100);
        } else {
          enriched.roeHistory.push(null);
        }
      }
      enriched.roeAvg5Y = seriesAverageN(enriched.roeHistory, 5);
      enriched.roeAvg10Y = seriesAverageN(enriched.roeHistory, 10);
      enriched.roeConsistencyCount10Y = consistencyCount(
        enriched.roeHistory.slice(0, 10), 15,
      );

      // ROE trend
      if (enriched.roeHistory.length >= 2) {
        const curr = enriched.roeHistory[0] ?? null;
        const prev = enriched.roeHistory[1] ?? null;
        if (curr !== null && prev !== null) {
          enriched.roeTrend = curr - prev;
        }
      }
    }

    // NCAV proxy: (Total Assets - Fixed Assets - CWIP - Investments) - (Borrowings + Other Liabilities)
    const latestBs = balanceSheet[0]!;
    const totalAssets = num(latestBs, 'Total Assets');
    const fixedAssets = num(latestBs, 'Fixed Assets');
    const cwip = num(latestBs, 'CWIP');
    const investments = num(latestBs, 'Investments');
    const borrowings = num(latestBs, 'Borrowings');
    const otherLiab = num(latestBs, 'Other Liabilities');
    if (totalAssets !== null && fixedAssets !== null && borrowings !== null && otherLiab !== null) {
      const currentAssetsProxy = totalAssets - fixedAssets - (cwip ?? 0) - (investments ?? 0);
      const currentLiabProxy = otherLiab;
      const totalLiab = borrowings + otherLiab;
      enriched.ncav = currentAssetsProxy - totalLiab;
      if (currentLiabProxy > 0) {
        enriched.currentRatioProxy = currentAssetsProxy / currentLiabProxy;
      }
    }

    // Retained earnings growth (reserves growth YoY)
    if (enriched.reservesHistory.length >= 2) {
      const currRes = enriched.reservesHistory[0] ?? null;
      const prevRes = enriched.reservesHistory[1] ?? null;
      if (currRes !== null && prevRes !== null && prevRes > 0) {
        enriched.retainedEarningsGrowth = ((currRes - prevRes) / prevRes) * 100;
      }
    }
  }

  // --- Cash Flow ---
  const cashFlowData = snapshot.cashFlow as Record<string, unknown>[] | null;
  enriched.cashFlow = cashFlowData ?? null;
  if (Array.isArray(cashFlowData) && cashFlowData.length > 0) {
    enriched.ocfHistory = extractSeries(cashFlowData, 'Cash from Operating Activity', 'Cash from Operating Activity +');
    enriched.investingCfHistory = extractSeries(cashFlowData, 'Cash from Investing Activity');
    enriched.financingCfHistory = extractSeries(cashFlowData, 'Cash from Financing Activity');

    // FCF positive years (out of last 5)
    const yearsToCheck = Math.min(enriched.ocfHistory.length, 5);
    enriched.fcfPositiveYears = consistencyCount(
      enriched.ocfHistory.slice(0, yearsToCheck), 0, 'gt',
    );

    // CapEx proxy: |Investing CF| or Fixed Asset delta + Depreciation from BS
    enriched.capexProxyHistory = [];
    if (Array.isArray(balanceSheet) && Array.isArray(annualPl)) {
      const plData = annualPl[0]?.period === 'TTM' ? annualPl.slice(1) : annualPl;
      for (let i = 0; i < cashFlowData.length; i++) {
        // Try fixed asset delta method: FA[i-1] - FA[i] + Depreciation (older - newer = spending)
        // Since index 0 is most recent, FA[i] is newer, FA[i+1] is older
        if (i < enriched.fixedAssetsHistory.length - 1 && i < plData.length) {
          const faOlder = enriched.fixedAssetsHistory[i + 1] ?? null;
          const faNewer = enriched.fixedAssetsHistory[i] ?? null;
          const depr = num(plData[i]!, 'Depreciation');
          if (faNewer !== null && faOlder !== null && depr !== null) {
            enriched.capexProxyHistory.push(faNewer - faOlder + depr);
            continue;
          }
        }
        // Fallback: absolute value of investing CF
        const invCf = enriched.investingCfHistory[i] ?? null;
        enriched.capexProxyHistory.push(invCf !== null ? Math.abs(invCf) : null);
      }
    } else {
      enriched.capexProxyHistory = enriched.investingCfHistory.map(
        (v) => v !== null ? Math.abs(v) : null,
      );
    }

    // Owner earnings: Net Profit + Depreciation - CapEx proxy
    if (Array.isArray(annualPl)) {
      const plData = annualPl[0]?.period === 'TTM' ? annualPl.slice(1) : annualPl;
      const len = Math.min(plData.length, enriched.capexProxyHistory.length);
      enriched.ownerEarningsHistory = [];
      for (let i = 0; i < len; i++) {
        const np = num(plData[i]!, 'Net Profit');
        const depr = num(plData[i]!, 'Depreciation');
        const capex = enriched.capexProxyHistory[i] ?? null;
        if (np !== null && depr !== null && capex !== null) {
          enriched.ownerEarningsHistory.push(np + depr - capex);
        } else {
          enriched.ownerEarningsHistory.push(null);
        }
      }
    }

    // CapEx to profit average (5yr)
    if (Array.isArray(annualPl)) {
      const plData = annualPl[0]?.period === 'TTM' ? annualPl.slice(1) : annualPl;
      const ratios: number[] = [];
      const len = Math.min(5, enriched.capexProxyHistory.length, plData.length);
      for (let i = 0; i < len; i++) {
        const capex = enriched.capexProxyHistory[i] ?? null;
        const np = num(plData[i]!, 'Net Profit');
        if (capex !== null && np !== null && np > 0) {
          ratios.push(capex / np);
        }
      }
      if (ratios.length > 0) {
        enriched.capexToProfitAvg = ratios.reduce((s, v) => s + v, 0) / ratios.length;
      }
    }
  }

  // --- Ratios (from Screener ratios table) ---
  const ratios = snapshot.ratios as Record<string, unknown>[] | null;
  if (Array.isArray(ratios) && ratios.length > 0) {
    enriched.roceHistory = extractSeries(ratios, 'ROCE %');
    enriched.debtorDaysHistory = extractSeries(ratios, 'Debtor Days');
    enriched.inventoryDaysHistory = extractSeries(ratios, 'Inventory Days');
    enriched.workingCapitalDaysHistory = extractSeries(ratios, 'Working Capital Days');
  }

  // --- Shareholding ---
  const shareholding = snapshot.shareholding as Record<string, unknown>[] | null;
  if (Array.isArray(shareholding) && shareholding.length > 0) {
    enriched.promoterHoldingHistory = extractSeries(shareholding, 'Promoters');
    enriched.fiiHistory = extractSeries(shareholding, 'FIIs');
    enriched.diiHistory = extractSeries(shareholding, 'DIIs');
    enriched.publicHoldingHistory = extractSeries(shareholding, 'Public');
    enriched.shareholderCountHistory = extractSeries(shareholding, 'No. of Shareholders');

    const latest = shareholding[0]!;
    enriched.promoterHolding = num(latest, 'Promoters');
    enriched.promoterPledge = num(latest, 'Pledge') ?? num(latest, 'Pledged');
    enriched.fiiHolding = num(latest, 'FIIs');
    enriched.diiHolding = num(latest, 'DIIs');
    enriched.publicHolding = num(latest, 'Public');

    const fii = enriched.fiiHolding ?? 0;
    const dii = enriched.diiHolding ?? 0;
    if (fii + dii > 0) {
      enriched.institutionalHolding = fii + dii;
    }

    if (enriched.promoterHolding !== null && enriched.promoterHolding > 0) {
      enriched.freeFloat = 100 - enriched.promoterHolding;
    }

    // Promoter holding trend (latest vs previous quarter)
    if (shareholding.length > 1) {
      const latestProm = num(latest, 'Promoters');
      const prevProm = num(shareholding[1]!, 'Promoters');
      if (latestProm !== null && prevProm !== null) {
        enriched.promoterHoldingTrend = latestProm - prevProm;
      }
    }

    // Promoter 4-quarter change
    enriched.promoterHolding4qChange = absoluteChange(enriched.promoterHoldingHistory, 4);

    // Shareholder count trend
    if (enriched.shareholderCountHistory.length >= 2) {
      const curr = enriched.shareholderCountHistory[0] ?? null;
      const prev = enriched.shareholderCountHistory[1] ?? null;
      if (curr !== null && prev !== null && prev > 0) {
        enriched.shareholderCountTrend = ((curr - prev) / prev) * 100;
      }
    }
  }

  // --- P/B ratio ---
  const price = enriched.currentPrice;
  const bv = enriched.bookValue;
  if (price !== null && bv !== null && price > 0 && bv > 0) {
    enriched.pbRatio = price / bv;
  }

  // --- Graham Number: sqrt(22.5 * EPS * BookValue) ---
  const eps = enriched.epsHistory[0] ?? null;
  if (eps !== null && bv !== null && eps > 0 && bv > 0) {
    enriched.grahamNumber = Math.sqrt(22.5 * eps * bv);
  }

  // --- Pros/Cons ---
  enriched.pros = Array.isArray(snapshot.pros) ? (snapshot.pros as string[]) : [];
  enriched.cons = Array.isArray(snapshot.cons) ? (snapshot.cons as string[]) : [];

  // --- Peer comparison ---
  enriched.peerComparison = Array.isArray(snapshot.peerComparison)
    ? (snapshot.peerComparison as Record<string, unknown>[])
    : null;

  // v3 financial health scores
  enriched.piotroskiFScore = computePiotroskiFScore(enriched);
  enriched.altmanZScore = computeAltmanZScore(enriched);
  enriched.beneishMScore = computeBeneishMScore(enriched);
  enriched.roceTrailing3Y = seriesAverageN(enriched.roceHistory, 3);

  // Count revenue decline years in last 5
  const rev5 = enriched.revenueHistory.slice(0, 5);
  let declineCount = 0;
  for (let i = 0; i < rev5.length - 1; i++) {
    const curr = rev5[i];
    const prev = rev5[i + 1];
    if (curr != null && prev != null && prev > 0 && curr < prev) declineCount++;
  }
  enriched.revenueDeclineYears = declineCount;

  return enriched;
}

/**
 * Convert an EnrichedSnapshot to the flat Record<string, unknown> format
 * that the existing dimension scorer expects.
 * This acts as a compatibility bridge.
 */
export function enrichedToFlat(enriched: EnrichedSnapshot): Record<string, unknown> {
  return {
    // Direct metrics (used by dimension scorer)
    marketCap: enriched.marketCap,
    currentPrice: enriched.currentPrice,
    stockPe: enriched.stockPe,
    bookValue: enriched.bookValue,
    dividendYield: enriched.dividendYield,
    roce: enriched.roce,
    roe: enriched.roe,
    faceValue: enriched.faceValue,
    high52w: enriched.high52w,
    low52w: enriched.low52w,

    // BS derived
    debtToEquity: enriched.debtToEquity,
    debtTrend: enriched.debtTrend,

    // P&L derived
    interestCoverage: enriched.interestCoverage,
    opm: enriched.opm,
    marginTrend: enriched.marginTrend,
    profitCagr5Y: enriched.profitCagr5Y,
    revenueCagr5Y: enriched.revenueCagr5Y,
    roeTrend: enriched.roeTrend,

    // Cash flow
    fcfPositiveYears: enriched.fcfPositiveYears,
    cashFlow: enriched.cashFlow,

    // Shareholding
    promoterHolding: enriched.promoterHolding,
    promoterPledge: enriched.promoterPledge,
    fiiHolding: enriched.fiiHolding,
    diiHolding: enriched.diiHolding,
    publicHolding: enriched.publicHolding,
    institutionalHolding: enriched.institutionalHolding,
    freeFloat: enriched.freeFloat,
    promoterHoldingTrend: enriched.promoterHoldingTrend,

    // Valuation
    pb_ratio: enriched.pbRatio,

    // Sector (for disqualifier use)
    sector: enriched.sector,
  };
}
