/**
 * Sleep for a fixed number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sleep for a random duration between min and max (uniform distribution).
 */
export function sleepRandom(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return sleep(ms);
}

/**
 * Sleep for a random duration with approximate normal distribution.
 * Uses Box-Muller transform centered between min and max.
 */
export function sleepNormal(minMs: number, maxMs: number): Promise<void> {
  const mean = (minMs + maxMs) / 2;
  const stddev = (maxMs - minMs) / 6; // 99.7% within range

  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

  const ms = Math.max(minMs, Math.min(maxMs, mean + z * stddev));
  return sleep(ms);
}
