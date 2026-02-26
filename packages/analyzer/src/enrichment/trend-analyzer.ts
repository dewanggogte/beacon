/**
 * Time-series analysis utilities for financial data.
 */

/** Compute CAGR: (end/start)^(1/years) - 1. Returns null if inputs are invalid. */
export function cagr(end: number | null, start: number | null, years: number): number | null {
  if (end === null || start === null || start <= 0 || end <= 0 || years <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

/** Average of a numeric array, ignoring nulls. Returns null if no valid values. */
export function seriesAverage(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null && !isNaN(v));
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

/** Average of the last N values in a series. */
export function seriesAverageN(values: (number | null)[], n: number): number | null {
  return seriesAverage(values.slice(0, n));
}

/** Count how many values in a series meet a threshold. */
export function consistencyCount(
  values: (number | null)[],
  threshold: number,
  direction: 'gte' | 'gt' | 'lte' | 'lt' = 'gte',
): number {
  return values.filter((v) => {
    if (v === null) return false;
    switch (direction) {
      case 'gte': return v >= threshold;
      case 'gt': return v > threshold;
      case 'lte': return v <= threshold;
      case 'lt': return v < threshold;
    }
  }).length;
}

/** Count how many consecutive years the value grew YoY (series[0] is most recent). */
export function yoyGrowthCount(values: (number | null)[]): number {
  let count = 0;
  for (let i = 1; i < values.length; i++) {
    const curr = values[i - 1] ?? null;
    const prev = values[i] ?? null;
    if (curr !== null && prev !== null && prev > 0 && curr > prev) {
      count++;
    }
  }
  return count;
}

/** Coefficient of variation: stddev / |mean|. Higher = more volatile. Returns null if mean is 0. */
export function coefficientOfVariation(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null && !isNaN(v));
  if (valid.length < 2) return null;
  const mean = valid.reduce((s, v) => s + v, 0) / valid.length;
  if (mean === 0) return null;
  const variance = valid.reduce((s, v) => s + (v - mean) ** 2, 0) / valid.length;
  return Math.sqrt(variance) / Math.abs(mean);
}

/** Simple linear slope of a series (index 0 = most recent). Positive = improving. */
export function seriesSlope(values: (number | null)[]): number | null {
  const valid: [number, number][] = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== null) {
      // Reverse index so older = lower x (slope positive = improving)
      valid.push([values.length - 1 - i, values[i]!]);
    }
  }
  if (valid.length < 2) return null;

  const n = valid.length;
  const sumX = valid.reduce((s, [x]) => s + x, 0);
  const sumY = valid.reduce((s, [, y]) => s + y, 0);
  const sumXY = valid.reduce((s, [x, y]) => s + x * y, 0);
  const sumX2 = valid.reduce((s, [x]) => s + x * x, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/** Check if a series has a declining trend over the last N periods. */
export function isDeclining(values: (number | null)[], periods: number = 3): boolean {
  const slice = values.slice(0, periods);
  const valid = slice.filter((v): v is number => v !== null);
  if (valid.length < 2) return false;
  // Check if each subsequent value is less than the previous
  let declining = true;
  for (let i = 1; i < valid.length; i++) {
    if (valid[i - 1]! >= valid[i]!) {
      // Most recent should be less than previous (index 0 = most recent)
    } else {
      declining = false;
    }
  }
  return declining;
}

/** CAGR computed from a series (index 0 = most recent, last index = oldest). */
export function cagrFromSeries(values: (number | null)[], years?: number): number | null {
  const valid = values.filter((v): v is number => v !== null && v > 0);
  if (valid.length < 2) return null;
  const end = valid[0]!;
  const start = valid[valid.length - 1]!;
  const n = years ?? valid.length - 1;
  return cagr(end, start, n);
}

/** Compute the absolute change between start (index 0) and N periods ago. */
export function absoluteChange(values: (number | null)[], periods: number): number | null {
  if (values.length <= periods) return null;
  const current = values[0] ?? null;
  const previous = values[periods] ?? null;
  if (current === null || previous === null) return null;
  return current - previous;
}
