import { describe, it, expect } from 'vitest';
import { logger, sleep } from '@screener/shared';

describe('@screener/shared smoke test', () => {
  it('exports logger with expected methods', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('exports sleep as a function', () => {
    expect(typeof sleep).toBe('function');
  });

  it('sleep resolves after delay', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});
