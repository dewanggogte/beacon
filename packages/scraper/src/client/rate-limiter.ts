import { sleepNormal, sleepRandom, logger } from '@screener/shared';
import { SCRAPER_CONFIG } from '../config.js';

export class RateLimiter {
  private requestCount = 0;

  async waitForNextRequest(): Promise<void> {
    this.requestCount++;

    // Session break: every N requests, take a long pause
    if (this.requestCount > 1 && this.requestCount % SCRAPER_CONFIG.sessionMaxRequests === 0) {
      logger.info(`Session break after ${this.requestCount} requests`);
      await sleepRandom(SCRAPER_CONFIG.minSessionBreak, SCRAPER_CONFIG.maxSessionBreak);
    }
    // Batch break: every N requests, take a shorter pause
    else if (this.requestCount > 1 && this.requestCount % SCRAPER_CONFIG.batchSize === 0) {
      logger.info(`Batch break after ${this.requestCount} requests`);
      await sleepRandom(SCRAPER_CONFIG.minBatchBreak, SCRAPER_CONFIG.maxBatchBreak);
    }
    // Normal per-request delay with approximately normal distribution
    else if (this.requestCount > 1) {
      await sleepNormal(SCRAPER_CONFIG.minDelayBetweenPages, SCRAPER_CONFIG.maxDelayBetweenPages);
    }
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  reset(): void {
    this.requestCount = 0;
  }
}
