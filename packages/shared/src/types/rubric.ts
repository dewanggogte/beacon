export interface ScoringRubric {
  version: string;
  lastUpdated: string;
  scoringDimensions: {
    valuation: DimensionConfig;
    quality: DimensionConfig;
    governance: DimensionConfig;
    safety: DimensionConfig;
    momentum: DimensionConfig;
  };
  automaticDisqualifiers: string[];
  classificationThresholds: {
    strongLong: number;
    potentialLong: number;
    neutral: number;
    potentialShort: number;
  };
}

export interface DimensionConfig {
  weight: number;
  metrics: Record<string, MetricConfig>;
}

export interface MetricConfig {
  type: 'continuous_lower_better' | 'continuous_higher_better' | 'boolean' | 'trend';
  idealRange?: [number, number];
  acceptableRange?: [number, number];
  redFlagAbove?: number;
  redFlagBelow?: number;
  minimum?: number;
  excellent?: number;
  sectorAdjustments?: Record<string, Partial<MetricConfig>>;
}
