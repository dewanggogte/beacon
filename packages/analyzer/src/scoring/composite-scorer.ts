import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DimensionScore, Classification, FrameworkResults } from '@screener/shared';

/**
 * Compute a weighted composite score from dimension scores (original v1).
 */
export function computeComposite(dimensions: DimensionScore[]): number {
  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const dim of dimensions) {
    totalWeightedScore += dim.score * dim.weight;
    totalWeight += dim.weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round(totalWeightedScore / totalWeight);
}

// Cache the weights JSON
let weightsCache: Record<string, Record<string, number>> | null = null;
function loadWeights(): Record<string, Record<string, number>> {
  if (weightsCache) return weightsCache;
  const path = resolve(process.cwd(), 'principles', 'frameworks', 'composite-weights.json');
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  weightsCache = raw.weights as Record<string, Record<string, number>>;
  return weightsCache;
}

/**
 * Compute composite score v2: classification-aware weighting
 * that blends framework scores with existing dimension scores.
 */
export function computeCompositeV2(
  dimensionScore: number,
  frameworks: FrameworkResults,
): number {
  const category = frameworks.lynch.category;
  const weights = loadWeights();
  const w = weights[category];
  if (!w) return dimensionScore; // Fallback to v1

  const score =
    (frameworks.buffett.score * (w.buffett ?? 0)) +
    (frameworks.graham.score * (w.graham ?? 0)) +
    (frameworks.lynch.categoryScore * (w.lynch ?? 0)) +
    (frameworks.pabrai.riskScore * (w.pabrai ?? 0)) +
    (dimensionScore * (w.dimensions ?? 0));

  return Math.round(score);
}

/**
 * Classify a company based on composite score and disqualification status.
 */
export function classify(
  compositeScore: number,
  disqualified: boolean,
  thresholds: {
    strongLong: number;
    potentialLong: number;
    neutral: number;
    potentialShort: number;
  },
): Classification {
  if (disqualified) return 'strong_avoid';
  if (compositeScore >= thresholds.strongLong) return 'strong_long';
  if (compositeScore >= thresholds.potentialLong) return 'potential_long';
  if (compositeScore >= thresholds.neutral) return 'neutral';
  if (compositeScore >= thresholds.potentialShort) return 'potential_short';
  return 'strong_avoid';
}

/**
 * Compute conviction level based on framework scores.
 */
export function computeConviction(
  finalScore: number,
  disqualified: boolean,
  frameworks: FrameworkResults,
): { level: 'high' | 'medium' | 'low' | 'none'; reasons: string[] } {
  if (disqualified || finalScore < 60) {
    return { level: 'none', reasons: disqualified ? ['Disqualified'] : ['Score below 60'] };
  }

  const reasons: string[] = [];
  const frameworksAbove75 = [
    frameworks.buffett.score >= 75 ? 'Buffett' : null,
    frameworks.graham.score >= 75 ? 'Graham' : null,
    frameworks.lynch.categoryScore >= 75 ? 'Lynch' : null,
  ].filter(Boolean) as string[];

  const frameworksAbove70 = [
    frameworks.buffett.score >= 70 ? 'Buffett' : null,
    frameworks.graham.score >= 70 ? 'Graham' : null,
    frameworks.lynch.categoryScore >= 70 ? 'Lynch' : null,
  ].filter(Boolean) as string[];

  // High: score>=80, 2+ frameworks>=75, Pabrai>=60, not turnaround
  if (
    finalScore >= 80 &&
    frameworksAbove75.length >= 2 &&
    frameworks.pabrai.riskScore >= 60 &&
    frameworks.lynch.category !== 'turnaround'
  ) {
    reasons.push(`Score ${finalScore} >= 80`);
    reasons.push(`${frameworksAbove75.join(', ')} frameworks >= 75`);
    reasons.push(`Pabrai risk score ${frameworks.pabrai.riskScore} (${frameworks.pabrai.overallRisk})`);
    return { level: 'high', reasons };
  }

  // Medium: score>=70, 1+ framework>=70, no DQ
  if (finalScore >= 70 && frameworksAbove70.length >= 1) {
    reasons.push(`Score ${finalScore} >= 70`);
    reasons.push(`${frameworksAbove70.join(', ')} frameworks >= 70`);
    return { level: 'medium', reasons };
  }

  // Low: score>=60
  reasons.push(`Score ${finalScore} >= 60 but no strong framework alignment`);
  return { level: 'low', reasons };
}
