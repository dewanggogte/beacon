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

  return { reasons, gateResults };
}

function isBankingOrNBFC(sector: string): boolean {
  const lower = sector.toLowerCase();
  return lower.includes('bank') || lower.includes('nbfc') || lower.includes('financial');
}
