export interface PickPerformance {
  companyId: number;
  screenerCode: string;
  companyName: string;
  classification: string;
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
  entryDate: string;
  exitDate: string;
}

export interface BacktestPerformance {
  picks: PickPerformance[];
  totalPicks: number;
  pricedPicks: number;
  avgReturn: number;
  medianReturn: number;
  hitRate: number;
  maxReturn: number;
  minReturn: number;
  sharpeRatio: number | null;
  // vs benchmark
  benchmarkReturn: number | null;
  excessReturn: number | null;
}

/**
 * Calculate return percentage.
 */
function returnPct(entry: number, exit: number): number {
  if (entry === 0) return 0;
  return ((exit - entry) / entry) * 100;
}

/**
 * Calculate median of a number array.
 */
function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : ((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/**
 * Calculate Sharpe ratio (annualized).
 */
function sharpe(returns: number[], holdingDays: number): number | null {
  if (returns.length < 2) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return null;

  // Annualize: assuming holdingDays period
  const periodsPerYear = 365 / holdingDays;
  const annualizedReturn = mean * periodsPerYear;
  const annualizedStd = std * Math.sqrt(periodsPerYear);
  const riskFreeRate = 7; // ~7% risk-free rate for India (RBI repo rate area)

  return (annualizedReturn - riskFreeRate) / annualizedStd;
}

/**
 * Calculate aggregate performance metrics from individual picks.
 */
export function calculatePerformance(
  picks: PickPerformance[],
  holdingDays: number,
  benchmarkReturn?: number,
): BacktestPerformance {
  const returns = picks.map((p) => p.returnPct);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const hitRate = returns.length > 0 ? returns.filter((r) => r > 0).length / returns.length : 0;

  return {
    picks,
    totalPicks: picks.length,
    pricedPicks: picks.length,
    avgReturn: Math.round(avgReturn * 100) / 100,
    medianReturn: Math.round(median(returns) * 100) / 100,
    hitRate: Math.round(hitRate * 1000) / 1000,
    maxReturn: returns.length > 0 ? Math.max(...returns) : 0,
    minReturn: returns.length > 0 ? Math.min(...returns) : 0,
    sharpeRatio: sharpe(returns, holdingDays),
    benchmarkReturn: benchmarkReturn ?? null,
    excessReturn: benchmarkReturn != null ? Math.round((avgReturn - benchmarkReturn) * 100) / 100 : null,
  };
}
