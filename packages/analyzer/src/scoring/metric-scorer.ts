import type { MetricConfig, MetricScore } from '@screener/shared';

/**
 * Score a single metric value against its configuration.
 * Returns a 0-100 score with an assessment label.
 */
export function scoreMetric(
  metricName: string,
  value: number | null | undefined,
  config: MetricConfig,
  sector?: string,
): MetricScore {
  if (value === null || value === undefined || isNaN(value)) {
    return { metric: metricName, rawValue: null, score: 0, assessment: 'N/A' };
  }

  // Apply sector-specific overrides
  const effective = sector && config.sectorAdjustments?.[sector]
    ? { ...config, ...config.sectorAdjustments[sector] }
    : config;

  let score: number;

  switch (effective.type) {
    case 'continuous_lower_better':
      score = scoreLowerBetter(value, effective);
      break;
    case 'continuous_higher_better':
      score = scoreHigherBetter(value, effective);
      break;
    case 'boolean':
      score = value ? 0 : 100;
      break;
    case 'trend':
      // Trend: positive value = improving = good
      score = value > 0 ? Math.min(100, 50 + value * 10) : Math.max(0, 50 + value * 10);
      break;
    default:
      score = 0;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    metric: metricName,
    rawValue: value,
    score,
    assessment: assessScore(score),
  };
}

/**
 * Score metrics where lower values are better (P/E, P/B, debt-to-equity).
 */
function scoreLowerBetter(value: number, config: MetricConfig): number {
  const { idealRange, acceptableRange, redFlagAbove } = config;

  if (redFlagAbove !== undefined && value > redFlagAbove) return 5;

  if (idealRange) {
    if (value <= idealRange[1]) return 95;
    if (acceptableRange && value <= acceptableRange[1]) {
      // Linear interpolation between ideal and acceptable
      const range = acceptableRange[1] - idealRange[1];
      const position = value - idealRange[1];
      return 95 - (position / range) * 35; // 95 -> 60
    }
  }

  if (acceptableRange) {
    if (value <= acceptableRange[1]) return 65;
    // Beyond acceptable
    const overAmount = value - acceptableRange[1];
    const maxOver = (redFlagAbove ?? acceptableRange[1] * 3) - acceptableRange[1];
    return Math.max(10, 60 - (overAmount / maxOver) * 50);
  }

  return 50;
}

/**
 * Score metrics where higher values are better (ROE, ROCE, promoter holding).
 */
function scoreHigherBetter(value: number, config: MetricConfig): number {
  const { minimum, excellent, redFlagBelow } = config;

  if (redFlagBelow !== undefined && value < redFlagBelow) return 5;

  if (excellent !== undefined && value >= excellent) return 95;

  if (minimum !== undefined) {
    if (value >= minimum) {
      if (excellent !== undefined) {
        // Linear interpolation between minimum and excellent
        const range = excellent - minimum;
        const position = value - minimum;
        return 60 + (position / range) * 35; // 60 -> 95
      }
      return 70;
    }
    // Below minimum but not red flag
    const belowAmount = minimum - value;
    const minToFloor = minimum - (redFlagBelow ?? 0);
    return Math.max(10, 55 - (belowAmount / minToFloor) * 45);
  }

  return 50;
}

function assessScore(score: number): MetricScore['assessment'] {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 45) return 'acceptable';
  if (score >= 15) return 'poor';
  return 'red_flag';
}
