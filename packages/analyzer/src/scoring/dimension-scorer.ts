import type { DimensionConfig, DimensionScore, MetricScore } from '@screener/shared';
import { scoreMetric } from './metric-scorer.js';

/**
 * Extract a metric value from the snapshot data.
 * Maps metric names in the rubric to actual data fields.
 */
function extractMetricValue(
  metricName: string,
  snapshot: Record<string, unknown>,
): number | null {
  // Map rubric metric names (camelCase) to snapshot field names
  const fieldMap: Record<string, string> = {
    peRatio: 'stockPe',
    pbRatio: 'pb_ratio',
    pegRatio: 'pegRatio',
    evToEbitda: 'evToEbitda',
    roe5YAvg: 'roe',
    roce5YAvg: 'roce',
    debtToEquity: 'debtToEquity',
    currentRatio: 'currentRatio',
    interestCoverage: 'interestCoverage',
    fcfPositiveYears: 'fcfPositiveYears',
    profitCagr5Y: 'profitCagr5Y',
    revenueCagr5Y: 'revenueCagr5Y',
    promoterHoldingPct: 'promoterHolding',
    promoterPledgePct: 'promoterPledge',
    institutionalHoldingPct: 'institutionalHolding',
    marketCapCrores: 'marketCap',
    freeFloatPct: 'freeFloat',
    roeTrend: 'roeTrend',
    debtTrend: 'debtTrend',
    marginTrend: 'marginTrend',
    promoterHoldingTrend: 'promoterHoldingTrend',
  };

  const field = fieldMap[metricName];
  if (field && snapshot[field] !== undefined) {
    const val = Number(snapshot[field]);
    return isNaN(val) ? null : val;
  }

  // Try direct access
  if (snapshot[metricName] !== undefined) {
    const val = Number(snapshot[metricName]);
    return isNaN(val) ? null : val;
  }

  return null;
}

/**
 * Score all metrics within a single scoring dimension.
 */
export function scoreDimension(
  dimensionName: DimensionScore['dimension'],
  config: DimensionConfig,
  snapshot: Record<string, unknown>,
  sector?: string,
): DimensionScore {
  const metricScores: MetricScore[] = [];
  const flags: string[] = [];

  for (const [metricName, metricConfig] of Object.entries(config.metrics)) {
    const value = extractMetricValue(metricName, snapshot);
    const score = scoreMetric(metricName, value, metricConfig, sector ?? undefined);
    metricScores.push(score);

    if (score.assessment === 'red_flag') {
      flags.push(`${metricName}: ${score.rawValue} (red flag)`);
    }
  }

  // Dimension score = average of all metric scores (equal weight within dimension)
  const scoredMetrics = metricScores.filter((m) => m.assessment !== 'N/A');
  const dimensionScore = scoredMetrics.length > 0
    ? scoredMetrics.reduce((sum, m) => sum + m.score, 0) / scoredMetrics.length
    : 0;

  return {
    dimension: dimensionName,
    score: Math.round(dimensionScore),
    weight: config.weight,
    metrics: metricScores,
    flags,
  };
}
