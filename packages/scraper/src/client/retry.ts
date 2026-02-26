import { sleep, logger } from '@screener/shared';
import { BlockedError, CaptchaError } from './http-client.js';
import { SCRAPER_CONFIG } from '../config.js';

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? SCRAPER_CONFIG.maxRetriesPerPage;
  const baseDelay = options.baseDelay ?? SCRAPER_CONFIG.retryBaseDelay;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (error instanceof CaptchaError) {
        logger.error('CAPTCHA detected — backing off for 1 hour');
        await sleep(SCRAPER_CONFIG.captchaBackoff);
        continue;
      }

      if (error instanceof BlockedError) {
        if (error.statusCode === 429) {
          const delay = baseDelay * Math.pow(2, attempt);
          logger.warn(`Rate limited (429) — waiting ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${maxRetries + 1})`);
          await sleep(delay);
          continue;
        }
        if (error.statusCode === 403) {
          logger.error('IP blocked (403) — backing off for 1 hour');
          await sleep(SCRAPER_CONFIG.blockBackoff);
          continue;
        }
      }

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        logger.warn(`Request failed: ${lastError.message} — retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${maxRetries + 1})`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}
