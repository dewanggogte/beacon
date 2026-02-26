/**
 * Macro regime classifier.
 *
 * 4 quadrants based on growth × inflation:
 *   1. Goldilocks:  Growth ↑, Inflation ↓ (bullish — favor growth stocks)
 *   2. Reflation:   Growth ↑, Inflation ↑ (favor cyclicals, commodities)
 *   3. Stagflation: Growth ↓, Inflation ↑ (defensive — favor quality, low debt)
 *   4. Deflation:   Growth ↓, Inflation ↓ (favor bonds, asset plays)
 */

export type MacroRegime = 'goldilocks' | 'reflation' | 'stagflation' | 'deflation';

export interface MacroSnapshot {
  repoRate: number | null;
  cpi: number | null;
  gdpGrowth: number | null;
  niftyPe: number | null;
  indiaVix: number | null;
  usdInr: number | null;
  bondYield10y: number | null;
}

export interface RegimeResult {
  regime: MacroRegime;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
}

// Indian economic thresholds
const GDP_GROWTH_THRESHOLD = 6.5;  // Average Indian GDP growth
const CPI_THRESHOLD = 5.0;         // RBI comfort zone upper band
const VIX_HIGH = 20;
const NIFTY_PE_HIGH = 24;
const NIFTY_PE_LOW = 18;

/**
 * Classify the current macro regime from snapshot data.
 */
export function classifyRegime(snapshot: MacroSnapshot): RegimeResult {
  const signals: string[] = [];
  let growthScore = 0;
  let inflationScore = 0;
  let dataPoints = 0;

  // GDP Growth
  if (snapshot.gdpGrowth != null) {
    dataPoints++;
    if (snapshot.gdpGrowth >= GDP_GROWTH_THRESHOLD) {
      growthScore++;
      signals.push(`GDP growth ${snapshot.gdpGrowth}% (above ${GDP_GROWTH_THRESHOLD}% threshold)`);
    } else {
      growthScore--;
      signals.push(`GDP growth ${snapshot.gdpGrowth}% (below ${GDP_GROWTH_THRESHOLD}% threshold)`);
    }
  }

  // CPI
  if (snapshot.cpi != null) {
    dataPoints++;
    if (snapshot.cpi > CPI_THRESHOLD) {
      inflationScore++;
      signals.push(`CPI ${snapshot.cpi}% (above ${CPI_THRESHOLD}% RBI band)`);
    } else {
      inflationScore--;
      signals.push(`CPI ${snapshot.cpi}% (within RBI comfort zone)`);
    }
  }

  // Repo rate as proxy for monetary tightness
  if (snapshot.repoRate != null) {
    dataPoints++;
    if (snapshot.repoRate > 6.5) {
      inflationScore++;
      signals.push(`Repo rate ${snapshot.repoRate}% (tight)`);
    } else if (snapshot.repoRate < 5.5) {
      growthScore++;
      signals.push(`Repo rate ${snapshot.repoRate}% (accommodative)`);
    }
  }

  // Nifty P/E as market sentiment
  if (snapshot.niftyPe != null) {
    dataPoints++;
    if (snapshot.niftyPe > NIFTY_PE_HIGH) {
      signals.push(`Nifty P/E ${snapshot.niftyPe} (expensive)`);
    } else if (snapshot.niftyPe < NIFTY_PE_LOW) {
      signals.push(`Nifty P/E ${snapshot.niftyPe} (cheap)`);
    }
  }

  // VIX as fear gauge
  if (snapshot.indiaVix != null) {
    dataPoints++;
    if (snapshot.indiaVix > VIX_HIGH) {
      signals.push(`India VIX ${snapshot.indiaVix} (high fear)`);
    } else {
      signals.push(`India VIX ${snapshot.indiaVix} (calm)`);
    }
  }

  // Classify
  let regime: MacroRegime;
  if (growthScore > 0 && inflationScore <= 0) {
    regime = 'goldilocks';
  } else if (growthScore > 0 && inflationScore > 0) {
    regime = 'reflation';
  } else if (growthScore <= 0 && inflationScore > 0) {
    regime = 'stagflation';
  } else {
    regime = 'deflation';
  }

  const confidence: 'high' | 'medium' | 'low' =
    dataPoints >= 4 ? 'high' : dataPoints >= 2 ? 'medium' : 'low';

  return { regime, confidence, signals };
}

/**
 * Threshold adjustments per regime for scoring.
 * Returns multipliers for different stock types.
 */
export interface RegimeAdjustments {
  /** Multiplier for growth stocks (fast_grower, stalwart) */
  growthMultiplier: number;
  /** Multiplier for value stocks (slow_grower, asset_play) */
  valueMultiplier: number;
  /** Multiplier for cyclical stocks */
  cyclicalMultiplier: number;
  /** Multiplier for turnaround stocks */
  turnaroundMultiplier: number;
  /** Additional safety weight */
  safetyBonus: number;
  /** Description of adjustments */
  description: string;
}

export function getRegimeAdjustments(regime: MacroRegime): RegimeAdjustments {
  switch (regime) {
    case 'goldilocks':
      return {
        growthMultiplier: 1.10,
        valueMultiplier: 1.00,
        cyclicalMultiplier: 1.05,
        turnaroundMultiplier: 1.05,
        safetyBonus: 0,
        description: 'Growth-friendly: favor fast growers, reduce safety premium',
      };
    case 'reflation':
      return {
        growthMultiplier: 1.05,
        valueMultiplier: 0.95,
        cyclicalMultiplier: 1.15,
        turnaroundMultiplier: 1.00,
        safetyBonus: 0,
        description: 'Cyclical-friendly: favor commodity/cyclical sectors',
      };
    case 'stagflation':
      return {
        growthMultiplier: 0.90,
        valueMultiplier: 1.05,
        cyclicalMultiplier: 0.85,
        turnaroundMultiplier: 0.90,
        safetyBonus: 5,
        description: 'Defensive: favor quality, low debt, stable earnings. Penalize cyclicals.',
      };
    case 'deflation':
      return {
        growthMultiplier: 0.95,
        valueMultiplier: 1.10,
        cyclicalMultiplier: 0.90,
        turnaroundMultiplier: 1.05,
        safetyBonus: 3,
        description: 'Value-friendly: favor undervalued, asset-heavy companies',
      };
  }
}

/**
 * Apply macro regime adjustments to a company's composite score.
 */
export function applyRegimeAdjustment(
  compositeScore: number,
  lynchCategory: string,
  regime: MacroRegime,
): number {
  const adj = getRegimeAdjustments(regime);

  let multiplier = 1.0;
  switch (lynchCategory) {
    case 'fast_grower':
    case 'stalwart':
      multiplier = adj.growthMultiplier;
      break;
    case 'slow_grower':
    case 'asset_play':
      multiplier = adj.valueMultiplier;
      break;
    case 'cyclical':
      multiplier = adj.cyclicalMultiplier;
      break;
    case 'turnaround':
      multiplier = adj.turnaroundMultiplier;
      break;
  }

  return compositeScore * multiplier + adj.safetyBonus;
}
