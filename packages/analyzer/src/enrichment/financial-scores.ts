import type { EnrichedSnapshot } from './flatten-v2.js';

/**
 * Piotroski F-Score: 9 binary criteria summed (0-9).
 * Higher = stronger fundamentals.
 */
export function computePiotroskiFScore(e: EnrichedSnapshot): number {
  let score = 0;

  const netProfit0 = e.netProfitHistory[0];
  const totalAssets0 = e.totalAssetsHistory[0];
  const roa0 = (netProfit0 != null && totalAssets0 != null && totalAssets0 > 0)
    ? netProfit0 / totalAssets0 : null;
  if (roa0 != null && roa0 > 0) score++;

  const ocf0 = e.ocfHistory[0];
  if (ocf0 != null && ocf0 > 0) score++;

  const netProfit1 = e.netProfitHistory[1];
  const totalAssets1 = e.totalAssetsHistory[1];
  const roa1 = (netProfit1 != null && totalAssets1 != null && totalAssets1 > 0)
    ? netProfit1 / totalAssets1 : null;
  if (roa0 != null && roa1 != null && roa0 > roa1) score++;

  if (ocf0 != null && netProfit0 != null && ocf0 > netProfit0) score++;

  const debt0 = e.borrowingsHistory[0];
  const debt1 = e.borrowingsHistory[1];
  const debtRatio0 = (debt0 != null && totalAssets0 != null && totalAssets0 > 0)
    ? debt0 / totalAssets0 : null;
  const debtRatio1 = (debt1 != null && totalAssets1 != null && totalAssets1 > 0)
    ? debt1 / totalAssets1 : null;
  if (debtRatio0 != null && debtRatio1 != null && debtRatio0 < debtRatio1) score++;
  else if (debt0 != null && debt0 === 0) score++;

  if (e.currentRatioProxy != null && e.currentRatioProxy >= 1.5) score++;

  const equity0 = e.equityHistory[0];
  const equity1 = e.equityHistory[1];
  if (equity0 != null && equity1 != null && equity0 <= equity1) score++;
  else if (equity0 != null && equity1 == null) score++;

  const opm0 = e.opmHistory[0];
  const opm1 = e.opmHistory[1];
  if (opm0 != null && opm1 != null && opm0 > opm1) score++;

  const rev0 = e.revenueHistory[0];
  const rev1 = e.revenueHistory[1];
  const turnover0 = (rev0 != null && totalAssets0 != null && totalAssets0 > 0)
    ? rev0 / totalAssets0 : null;
  const turnover1 = (rev1 != null && totalAssets1 != null && totalAssets1 > 0)
    ? rev1 / totalAssets1 : null;
  if (turnover0 != null && turnover1 != null && turnover0 > turnover1) score++;

  return score;
}

/**
 * Altman Z''-Score (non-manufacturing variant): bankruptcy prediction.
 * Z > 3.0 = safe, 1.8-3.0 = grey zone, < 1.8 = distress.
 */
export function computeAltmanZScore(e: EnrichedSnapshot): number | null {
  const totalAssets = e.totalAssetsHistory[0];
  const totalLiabilities = (totalAssets != null && e.netWorthHistory[0] != null)
    ? totalAssets - e.netWorthHistory[0] : null;

  if (totalAssets == null || totalAssets <= 0) return null;
  if (totalLiabilities == null || totalLiabilities <= 0) return null;

  const ncav = e.ncav;
  const x1 = ncav != null ? ncav / totalAssets : 0;

  const reserves = e.reservesHistory[0];
  const x2 = reserves != null ? reserves / totalAssets : 0;

  const ebit = e.operatingProfitHistory[0];
  const x3 = ebit != null ? ebit / totalAssets : 0;

  const marketCap = e.marketCap;
  const x4 = marketCap != null ? marketCap / totalLiabilities : 0;

  const z = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;
  return Math.round(z * 100) / 100;
}

/**
 * Beneish M-Score (5-variable): earnings manipulation detection.
 * M-Score > -1.78 = likely manipulator.
 */
export function computeBeneishMScore(e: EnrichedSnapshot): number | null {
  const rev0 = e.revenueHistory[0];
  const rev1 = e.revenueHistory[1];
  if (rev0 == null || rev1 == null || rev0 <= 0 || rev1 <= 0) return null;

  const totalAssets0 = e.totalAssetsHistory[0];
  const totalAssets1 = e.totalAssetsHistory[1];
  if (totalAssets0 == null || totalAssets1 == null || totalAssets0 <= 0 || totalAssets1 <= 0) return null;

  const dd0 = e.debtorDaysHistory[0];
  const dd1 = e.debtorDaysHistory[1];
  const dsri = (dd0 != null && dd1 != null && dd1 > 0) ? dd0 / dd1 : 1.0;

  const opm0 = e.opmHistory[0];
  const opm1 = e.opmHistory[1];
  const gmi = (opm0 != null && opm1 != null && opm0 > 0) ? opm1 / opm0 : 1.0;

  const fa0 = e.fixedAssetsHistory[0];
  const fa1 = e.fixedAssetsHistory[1];
  const aq0 = (fa0 != null) ? 1 - (fa0 / totalAssets0) : 0.5;
  const aq1 = (fa1 != null) ? 1 - (fa1 / totalAssets1) : 0.5;
  const aqi = aq1 > 0 ? aq0 / aq1 : 1.0;

  const sgi = rev0 / rev1;

  const dep0 = e.depreciationHistory[0];
  const dep1 = e.depreciationHistory[1];
  const depRate0 = (dep0 != null && fa0 != null && fa0 > 0) ? dep0 / fa0 : null;
  const depRate1 = (dep1 != null && fa1 != null && fa1 > 0) ? dep1 / fa1 : null;
  const depi = (depRate0 != null && depRate1 != null && depRate0 > 0) ? depRate1 / depRate0 : 1.0;

  const m = -6.065 + 0.823 * dsri + 0.906 * gmi + 0.593 * aqi + 0.717 * sgi + 0.107 * depi;
  return Math.round(m * 100) / 100;
}
