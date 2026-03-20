import type { EnrichedSnapshot } from '../enrichment/flatten-v2.js';

export interface GateResult {
  gate: string;
  passed: boolean;
  value: number | null;
  threshold: string;
}

/**
 * Run the 5 new hard gates. Returns failing gate reasons (empty = all passed).
 * These supplement the existing 8 disqualifiers in disqualifier.ts.
 */
export function checkHardGates(enriched: EnrichedSnapshot): { reasons: string[]; gateResults: GateResult[] } {
  const reasons: string[] = [];
  const gateResults: GateResult[] = [];
  const isFinancialSector = isBankingOrNBFC(enriched.sector);

  // Gate 9: Piotroski F-Score <= 2
  const fScore = enriched.piotroskiFScore;
  const fScorePassed = fScore > 2;
  gateResults.push({ gate: 'piotroski_f_score', passed: fScorePassed, value: fScore, threshold: '> 2' });
  if (!fScorePassed) {
    reasons.push(`Piotroski F-Score ${fScore}/9 (severe fundamental weakness)`);
  }

  // Gate 10: Altman Z-Score < 1.8 (skip for banking/NBFC)
  const zScore = enriched.altmanZScore;
  if (!isFinancialSector && zScore != null) {
    const zPassed = zScore >= 1.8;
    gateResults.push({ gate: 'altman_z_score', passed: zPassed, value: zScore, threshold: '>= 1.8' });
    if (!zPassed) {
      reasons.push(`Altman Z-Score ${zScore.toFixed(2)} (distress zone, bankruptcy risk)`);
    }
  } else {
    gateResults.push({ gate: 'altman_z_score', passed: true, value: zScore, threshold: 'skipped (financial sector)' });
  }

  // Gate 11: ROCE trailing 3Y < 6% (skip for banking/NBFC)
  const roce3y = enriched.roceTrailing3Y;
  if (!isFinancialSector && roce3y != null) {
    const rocePassed = roce3y >= 6;
    gateResults.push({ gate: 'roce_3y_floor', passed: rocePassed, value: roce3y, threshold: '>= 6%' });
    if (!rocePassed) {
      reasons.push(`ROCE trailing 3Y avg ${roce3y.toFixed(1)}% (below fixed deposit returns)`);
    }
  } else {
    gateResults.push({ gate: 'roce_3y_floor', passed: true, value: roce3y, threshold: 'skipped (financial sector or no data)' });
  }

  // Gate 12: Revenue declining 4+ of last 5 years
  const declineYears = enriched.revenueDeclineYears;
  const revPassed = declineYears < 4;
  gateResults.push({ gate: 'revenue_decline', passed: revPassed, value: declineYears, threshold: '< 4 years declining' });
  if (!revPassed) {
    reasons.push(`Revenue declined ${declineYears} of last 5 years (structural shrinkage)`);
  }

  // Gate 13: Beneish M-Score > -1.78 (earnings manipulation flag)
  const mScore = enriched.beneishMScore;
  if (mScore != null) {
    const mPassed = mScore <= -1.78;
    gateResults.push({ gate: 'beneish_m_score', passed: mPassed, value: mScore, threshold: '<= -1.78' });
    if (!mPassed) {
      reasons.push(`Beneish M-Score ${mScore.toFixed(2)} (potential earnings manipulation)`);
    }
  } else {
    gateResults.push({ gate: 'beneish_m_score', passed: true, value: null, threshold: 'skipped (insufficient data)' });
  }

  // --- v3.1 gates ---

  // Gate 14: OCF/Net Profit ratio — checks BOTH 3Y average AND latest year
  // 3Y avg < 0.2 = chronic cash flow liar (disqualify)
  // Latest year < 0.1 AND 3Y avg < 0.4 = acute cash flow problem (disqualify)
  const ocfRatio3Y = enriched.ocfToNetProfitAvg3Y;
  const ocf0 = enriched.ocfHistory[0];
  const np0 = enriched.netProfitHistory[0];
  const ocfRatioLatest = (ocf0 != null && np0 != null && np0 > 0) ? ocf0 / np0 : null;

  if (ocfRatio3Y != null) {
    const chronicFail = ocfRatio3Y < 0.2;
    const acuteFail = ocfRatioLatest != null && ocfRatioLatest < 0.1;
    const ocfPassed = !chronicFail && !acuteFail;
    const displayVal = ocfRatioLatest != null ? Math.round(ocfRatioLatest * 100) / 100 : Math.round(ocfRatio3Y * 100) / 100;
    gateResults.push({ gate: 'ocf_profit_ratio', passed: ocfPassed, value: displayVal, threshold: '3Y avg >= 0.2 AND latest >= 0.1' });
    if (acuteFail) {
      reasons.push(`OCF/Profit ratio ${(ocfRatioLatest! * 100).toFixed(0)}% latest year (cash flow collapse regardless of prior years)`);
    } else if (chronicFail) {
      reasons.push(`OCF/Profit ratio ${(ocfRatio3Y * 100).toFixed(0)}% avg over 3Y (reported profits not backed by cash)`);
    }
  } else {
    gateResults.push({ gate: 'ocf_profit_ratio', passed: true, value: null, threshold: 'skipped (insufficient data)' });
  }

  // Gate 15: Promoter pledge > 50% (from cons text — catches cases the existing flat field misses)
  const pledgePct = enriched.promoterPledgePct;
  if (pledgePct != null && pledgePct > 50) {
    gateResults.push({ gate: 'promoter_pledge_text', passed: false, value: pledgePct, threshold: '<= 50%' });
    reasons.push(`Promoter pledge ${pledgePct.toFixed(1)}% (from Screener.in, exceeds 50% threshold)`);
  } else {
    gateResults.push({ gate: 'promoter_pledge_text', passed: true, value: pledgePct, threshold: '<= 50%' });
  }

  // Gate 16: Data completeness < 5 out of 10 — too little data for reliable scoring
  const completeness = enriched.dataCompletenessScore;
  const dataPassed = completeness >= 5;
  gateResults.push({ gate: 'data_completeness', passed: dataPassed, value: completeness, threshold: '>= 5/10' });
  if (!dataPassed) {
    reasons.push(`Data completeness ${completeness}/10 (insufficient financial history for reliable scoring)`);
  }

  // --- v3.2 gates ---

  // Gate 17: Other income > 60% of profit — core business not generating earnings
  const otherIncome = enriched.otherIncomeToProfit;
  if (otherIncome != null && otherIncome > 0.6) {
    gateResults.push({ gate: 'other_income_excess', passed: false, value: Math.round(otherIncome * 100), threshold: '<= 60%' });
    reasons.push(`Other income ${Math.round(otherIncome * 100)}% of profit (core business not generating earnings)`);
  } else {
    gateResults.push({ gate: 'other_income_excess', passed: true, value: otherIncome != null ? Math.round(otherIncome * 100) : null, threshold: '<= 60%' });
  }

  return { reasons, gateResults };
}

function isBankingOrNBFC(sector: string): boolean {
  const lower = sector.toLowerCase();
  return lower.includes('bank') || lower.includes('nbfc') || lower.includes('financial');
}
