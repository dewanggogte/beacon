// --- Lynch Classification ---
export type LynchCategory =
  | 'slow_grower'
  | 'stalwart'
  | 'fast_grower'
  | 'cyclical'
  | 'turnaround'
  | 'asset_play';

// --- Framework Criterion Result ---
export interface CriterionResult {
  name: string;
  passed: boolean;
  value: number | null;
  threshold: string;
  weight: number;
  detail?: string;
}

// --- Buffett ---
export interface BuffettResult {
  score: number;
  passCount: number;
  totalCriteria: number;
  criteria: CriterionResult[];
  moatIndicators: string[];
}

// --- Graham ---
export interface GrahamResult {
  score: number;
  passCount: number;
  totalCriteria: number;
  criteria: CriterionResult[];
  grahamNumber: number | null;
  ncav: number | null;
  marginOfSafety: number | null;
}

// --- Lynch ---
export interface LynchResult {
  category: LynchCategory;
  categoryScore: number;
  categoryMetrics: CriterionResult[];
  classificationRationale: string;
}

// --- Pabrai ---
export type PabraiRiskLevel = 'low' | 'moderate' | 'elevated' | 'high';

export interface PabraiResult {
  riskScore: number; // 0-100, 100 = safest
  factors: CriterionResult[];
  overallRisk: PabraiRiskLevel;
}

// --- Composite ---
export interface FrameworkResults {
  buffett: BuffettResult;
  graham: GrahamResult;
  lynch: LynchResult;
  pabrai: PabraiResult;
}

// --- Conviction ---
export type ConvictionLevel = 'high' | 'medium' | 'low' | 'none';

export interface ConvictionResult {
  level: ConvictionLevel;
  reasons: string[];
}
