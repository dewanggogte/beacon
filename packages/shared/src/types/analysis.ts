export interface MetricScore {
  metric: string;
  rawValue: number | null;
  score: number;
  assessment: 'excellent' | 'good' | 'acceptable' | 'poor' | 'red_flag' | 'N/A';
}

export interface DimensionScore {
  dimension: 'valuation' | 'quality' | 'governance' | 'safety' | 'momentum';
  score: number;
  weight: number;
  metrics: MetricScore[];
  flags: string[];
}

export type Classification =
  | 'strong_long'
  | 'potential_long'
  | 'neutral'
  | 'potential_short'
  | 'strong_avoid';

export interface LLMAnalysis {
  trendNarrative: string;
  riskFactors: string[];
  catalysts: string[];
  qualitativeAdjustment: number;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export interface CompanyAnalysis {
  companyId: number;
  companyName: string;
  screenerCode: string;
  sector: string;
  dimensionScores: DimensionScore[];
  compositeScore: number;
  disqualified: boolean;
  disqualificationReasons: string[];
  llmAnalysis?: LLMAnalysis;
  finalScore: number;
  classification: Classification;
  rank: number;
  rankInSector: number;

  // Framework results (Phase 2)
  frameworkResults?: import('./frameworks.js').FrameworkResults;
  convictionLevel?: import('./frameworks.js').ConvictionLevel;
  convictionReasons?: string[];

  // Dual evaluation: quant originals + attribution (v2.2)
  quantClassification?: Classification;
  quantConvictionLevel?: import('./frameworks.js').ConvictionLevel;
  classificationSource?: 'quant' | 'ag4';

  // v3 financial health scores
  piotroskiFScore?: number;
  altmanZScore?: number | null;
  beneishMScore?: number | null;
  gateResults?: Array<{ gate: string; passed: boolean; value: number | null; threshold: string }>;

  // Per-agent LLM output (written to separate DB columns for dashboard)
  llmFundamentals?: Record<string, unknown>;
  llmGovernance?: Record<string, unknown>;
  llmRisk?: Record<string, unknown>;
  llmSynthesis?: Record<string, unknown>;

  // Parse failure tracking
  llmParseFailures?: Array<{ agent: string; error: string; timestamp: string }>;
}
