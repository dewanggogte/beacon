import { describe, it, expect } from 'vitest';
import { scoreMetric } from '../../scoring/metric-scorer.js';
import type { MetricConfig } from '@screener/shared';

// ---------------------------------------------------------------------------
// Helpers — reusable config builders
// ---------------------------------------------------------------------------

function lowerBetterConfig(overrides: Partial<MetricConfig> = {}): MetricConfig {
  return {
    type: 'continuous_lower_better',
    idealRange: [0, 15],
    acceptableRange: [0, 25],
    redFlagAbove: 50,
    ...overrides,
  };
}

function higherBetterConfig(overrides: Partial<MetricConfig> = {}): MetricConfig {
  return {
    type: 'continuous_higher_better',
    minimum: 10,
    excellent: 25,
    redFlagBelow: 0,
    ...overrides,
  };
}

function trendConfig(overrides: Partial<MetricConfig> = {}): MetricConfig {
  return { type: 'trend', ...overrides };
}

function booleanConfig(overrides: Partial<MetricConfig> = {}): MetricConfig {
  return { type: 'boolean', ...overrides };
}

// =========================================================================
// 1. Null / undefined / NaN inputs  (edge cases)
// =========================================================================

describe('scoreMetric — null / undefined / NaN', () => {
  it('returns score 0 and N/A for null value', () => {
    const result = scoreMetric('pe', null, lowerBetterConfig());
    expect(result).toEqual({ metric: 'pe', rawValue: null, score: 0, assessment: 'N/A' });
  });

  it('returns score 0 and N/A for undefined value', () => {
    const result = scoreMetric('pe', undefined, lowerBetterConfig());
    expect(result).toEqual({ metric: 'pe', rawValue: null, score: 0, assessment: 'N/A' });
  });

  it('returns score 0 and N/A for NaN value', () => {
    const result = scoreMetric('pe', NaN, lowerBetterConfig());
    expect(result).toEqual({ metric: 'pe', rawValue: null, score: 0, assessment: 'N/A' });
  });
});

// =========================================================================
// 2. continuous_lower_better scoring
// =========================================================================

describe('scoreMetric — continuous_lower_better', () => {
  const config = lowerBetterConfig(); // ideal [0,15], acceptable [0,25], redFlag 50

  it('scores 95 (excellent) for value within ideal range', () => {
    const result = scoreMetric('pe', 10, config);
    expect(result.score).toBe(95);
    expect(result.assessment).toBe('excellent');
  });

  it('scores 95 for value at ideal upper boundary', () => {
    expect(scoreMetric('pe', 15, config).score).toBe(95);
  });

  it('scores 0 for value at zero', () => {
    // 0 is within ideal range [0,15] → 95
    expect(scoreMetric('pe', 0, config).score).toBe(95);
  });

  it('interpolates between ideal and acceptable', () => {
    // value = 20, halfway between idealRange[1]=15 and acceptableRange[1]=25
    // score = 95 - (5/10) * 35 = 95 - 17.5 = 77.5 → 78
    const result = scoreMetric('pe', 20, config);
    expect(result.score).toBe(78);
    expect(result.assessment).toBe('good');
  });

  it('scores at acceptable boundary', () => {
    // value = 25, exactly at acceptableRange[1]
    // score = 95 - (10/10) * 35 = 60
    expect(scoreMetric('pe', 25, config).score).toBe(60);
  });

  it('scores below acceptable but above red flag', () => {
    // value = 35, beyond acceptable[1]=25, redFlagAbove=50
    // overAmount = 10, maxOver = 50 - 25 = 25
    // score = max(10, 60 - (10/25)*50) = max(10, 60-20) = 40
    const result = scoreMetric('pe', 35, config);
    expect(result.score).toBe(40);
    expect(result.assessment).toBe('poor');
  });

  it('scores 5 (red flag) when above redFlagAbove', () => {
    const result = scoreMetric('pe', 55, config);
    expect(result.score).toBe(5);
    expect(result.assessment).toBe('red_flag');
  });

  it('handles negative values (within ideal range)', () => {
    // Negative P/E — value <= idealRange[1]=15 → 95
    expect(scoreMetric('pe', -5, config).score).toBe(95);
  });

  it('returns 50 when no idealRange or acceptableRange configured', () => {
    const bare: MetricConfig = { type: 'continuous_lower_better' };
    expect(scoreMetric('pe', 20, bare).score).toBe(50);
  });

  it('handles config with acceptableRange but no idealRange', () => {
    const cfg = lowerBetterConfig({ idealRange: undefined });
    // value=20 <= acceptableRange[1]=25 → 65
    expect(scoreMetric('pe', 20, cfg).score).toBe(65);
  });

  it('handles config with acceptableRange only, value beyond acceptable, no redFlagAbove', () => {
    const cfg: MetricConfig = {
      type: 'continuous_lower_better',
      acceptableRange: [0, 25],
    };
    // overAmount = 5, maxOver = 25*3 - 25 = 50
    // score = max(10, 60 - (5/50)*50) = max(10, 55) = 55
    expect(scoreMetric('pe', 30, cfg).score).toBe(55);
  });
});

// =========================================================================
// 3. continuous_higher_better scoring
// =========================================================================

describe('scoreMetric — continuous_higher_better', () => {
  const config = higherBetterConfig(); // minimum=10, excellent=25, redFlagBelow=0

  it('scores 95 (excellent) when at or above excellent', () => {
    expect(scoreMetric('roe', 25, config).score).toBe(95);
    expect(scoreMetric('roe', 30, config).score).toBe(95);
  });

  it('scores 60 at minimum threshold', () => {
    const result = scoreMetric('roe', 10, config);
    expect(result.score).toBe(60);
    expect(result.assessment).toBe('acceptable');
  });

  it('interpolates between minimum and excellent', () => {
    // value=17.5, halfway between min=10 and excellent=25
    // score = 60 + (7.5/15)*35 = 60 + 17.5 = 77.5 → 78
    expect(scoreMetric('roe', 17.5, config).score).toBe(78);
  });

  it('scores below minimum but above red flag', () => {
    // value=5, belowAmount=5, minToFloor=10-0=10
    // score = max(10, 55 - (5/10)*45) = max(10, 32.5) = 33
    expect(scoreMetric('roe', 5, config).score).toBe(33);
    expect(scoreMetric('roe', 5, config).assessment).toBe('poor');
  });

  it('scores 5 (red flag) when below redFlagBelow', () => {
    const result = scoreMetric('roe', -1, config);
    expect(result.score).toBe(5);
    expect(result.assessment).toBe('red_flag');
  });

  it('returns 70 when at minimum with no excellent defined', () => {
    const cfg = higherBetterConfig({ excellent: undefined });
    expect(scoreMetric('roe', 15, cfg).score).toBe(70);
  });

  it('returns 50 when no minimum/excellent configured', () => {
    const bare: MetricConfig = { type: 'continuous_higher_better' };
    expect(scoreMetric('roe', 15, bare).score).toBe(50);
  });

  it('handles below minimum with no redFlagBelow (defaults to 0)', () => {
    const cfg = higherBetterConfig({ redFlagBelow: undefined });
    // value=5, belowAmount=5, minToFloor=10-0=10
    // score = max(10, 55 - (5/10)*45) = 33
    expect(scoreMetric('roe', 5, cfg).score).toBe(33);
  });
});

// =========================================================================
// 4. trend scoring
// =========================================================================

describe('scoreMetric — trend', () => {
  it('scores above 50 for positive trend', () => {
    // value=3, score = min(100, 50 + 3*10) = 80
    const result = scoreMetric('revGrowth', 3, trendConfig());
    expect(result.score).toBe(80);
    expect(result.assessment).toBe('good');
  });

  it('scores 50 for zero trend', () => {
    // value=0, score = max(0, 50 + 0) = 50
    expect(scoreMetric('revGrowth', 0, trendConfig()).score).toBe(50);
  });

  it('scores below 50 for negative trend', () => {
    // value=-3, score = max(0, 50 + (-3)*10) = max(0, 20) = 20
    const result = scoreMetric('revGrowth', -3, trendConfig());
    expect(result.score).toBe(20);
    expect(result.assessment).toBe('poor');
  });

  it('caps at 100 for strong positive trend', () => {
    // value=10, score = min(100, 50 + 100) = 100
    expect(scoreMetric('revGrowth', 10, trendConfig()).score).toBe(100);
  });

  it('floors at 0 for strong negative trend', () => {
    // value=-6, score = max(0, 50 + (-60)) = max(0, -10) = 0
    expect(scoreMetric('revGrowth', -6, trendConfig()).score).toBe(0);
  });
});

// =========================================================================
// 5. boolean scoring
// =========================================================================

describe('scoreMetric — boolean', () => {
  it('scores 0 for truthy value (boolean type treats truthy as bad)', () => {
    // boolean: value ? 0 : 100  → truthy = 0
    const result = scoreMetric('hasQualifiedOpinion', 1, booleanConfig());
    expect(result.score).toBe(0);
    expect(result.assessment).toBe('red_flag');
  });

  it('scores 100 for zero (falsy)', () => {
    const result = scoreMetric('hasQualifiedOpinion', 0, booleanConfig());
    expect(result.score).toBe(100);
    expect(result.assessment).toBe('excellent');
  });

  it('returns N/A for null value (bypasses boolean logic)', () => {
    const result = scoreMetric('hasQualifiedOpinion', null, booleanConfig());
    expect(result.score).toBe(0);
    expect(result.assessment).toBe('N/A');
  });
});

// =========================================================================
// 6. Sector adjustments
// =========================================================================

describe('scoreMetric — sector adjustments', () => {
  it('uses sector-specific overrides when sector matches', () => {
    const config = lowerBetterConfig({
      sectorAdjustments: {
        Banking: { idealRange: [0, 20], acceptableRange: [0, 35] },
      },
    });
    // With Banking sector: idealRange becomes [0,20], value=18 is within ideal → 95
    expect(scoreMetric('pe', 18, config, 'Banking').score).toBe(95);
    // Without sector: idealRange is [0,15], value=18 is beyond ideal → interpolated
    expect(scoreMetric('pe', 18, config).score).toBeLessThan(95);
  });

  it('uses default config when sector does not match', () => {
    const config = lowerBetterConfig({
      sectorAdjustments: {
        Banking: { idealRange: [0, 20] },
      },
    });
    // IT sector has no override → uses default idealRange [0,15]
    // value=18 > 15 → interpolated below 95
    expect(scoreMetric('pe', 18, config, 'IT').score).toBeLessThan(95);
  });

  it('uses default config when no sectorAdjustments defined', () => {
    const config = lowerBetterConfig();
    expect(scoreMetric('pe', 10, config, 'Banking').score).toBe(95);
  });
});

// =========================================================================
// 7. Assessment labels
// =========================================================================

describe('scoreMetric — assessment labels', () => {
  it('maps score >= 85 to excellent', () => {
    expect(scoreMetric('pe', 10, lowerBetterConfig()).assessment).toBe('excellent');
  });

  it('maps score 70-84 to good', () => {
    // pe=20 → score 78
    expect(scoreMetric('pe', 20, lowerBetterConfig()).assessment).toBe('good');
  });

  it('maps score 45-69 to acceptable', () => {
    // pe=25 → score 60
    expect(scoreMetric('pe', 25, lowerBetterConfig()).assessment).toBe('acceptable');
  });

  it('maps score 15-44 to poor', () => {
    // pe=35 → score 40
    expect(scoreMetric('pe', 35, lowerBetterConfig()).assessment).toBe('poor');
  });

  it('maps score < 15 to red_flag', () => {
    // pe=55 → score 5
    expect(scoreMetric('pe', 55, lowerBetterConfig()).assessment).toBe('red_flag');
  });
});

// =========================================================================
// 8. Edge cases — Infinity
// =========================================================================

describe('scoreMetric — Infinity edge cases', () => {
  it('handles Infinity for lower_better (hits red flag)', () => {
    const result = scoreMetric('pe', Infinity, lowerBetterConfig());
    expect(result.score).toBe(5);
  });

  it('handles -Infinity for higher_better (hits red flag)', () => {
    const result = scoreMetric('roe', -Infinity, higherBetterConfig());
    expect(result.score).toBe(5);
  });
});

// =========================================================================
// 9. Score clamping
// =========================================================================

describe('scoreMetric — score clamping', () => {
  it('never returns score below 0', () => {
    // Extreme negative trend
    const result = scoreMetric('trend', -100, trendConfig());
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('never returns score above 100', () => {
    const result = scoreMetric('trend', 100, trendConfig());
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('rounds to integer', () => {
    // pe=20 gives 77.5 → 78
    const result = scoreMetric('pe', 20, lowerBetterConfig());
    expect(Number.isInteger(result.score)).toBe(true);
  });
});

// =========================================================================
// 10. Unknown type fallback
// =========================================================================

describe('scoreMetric — unknown type', () => {
  it('returns score 0 for unknown metric type', () => {
    const config = { type: 'unknown_type' } as unknown as MetricConfig;
    const result = scoreMetric('foo', 42, config);
    expect(result.score).toBe(0);
    expect(result.assessment).toBe('red_flag');
  });
});
