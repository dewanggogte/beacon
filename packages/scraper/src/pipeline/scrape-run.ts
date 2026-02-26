import { logger } from '@screener/shared';
import { fetchPage } from '../client/http-client.js';
import { withRetry } from '../client/retry.js';
import { RateLimiter } from '../client/rate-limiter.js';
import { parseCompanyPage } from '../company-detail/index.js';
import { upsertCompany } from '../storage/save-company.js';
import { saveSnapshot } from '../storage/save-snapshot.js';
import {
  createScrapeRun,
  incrementRunCount,
  completeScrapeRun,
  getLatestIncompleteRun,
} from '../storage/save-run.js';
import { getUnscrapedCompanyCodes, getCompanyCount, shuffle } from './progress-tracker.js';
import { SCRAPER_CONFIG } from '../config.js';

export interface ScrapeOptions {
  limit?: number;
  resume?: boolean;
}

export async function runScrape(options: ScrapeOptions): Promise<number> {
  const { limit, resume = false } = options;
  const rateLimiter = new RateLimiter();

  // Determine run ID
  let runId: number;
  if (resume) {
    const existing = await getLatestIncompleteRun();
    if (existing) {
      runId = existing.id;
      logger.info(`Resuming scrape run #${runId}`);
    } else {
      logger.info('No incomplete run found, starting fresh');
      const count = await getCompanyCount();
      runId = await createScrapeRun(count);
    }
  } else {
    const count = await getCompanyCount();
    runId = await createScrapeRun(count);
    logger.info(`Starting new scrape run #${runId} (${count} companies)`);
  }

  // Get companies to scrape
  let codes = await getUnscrapedCompanyCodes(runId);
  logger.info(`${codes.length} companies remaining to scrape`);

  // Randomize order (anti-detection)
  codes = shuffle([...codes]);

  // Apply limit
  if (limit && limit > 0) {
    codes = codes.slice(0, limit);
    logger.info(`Limited to ${codes.length} companies`);
  }

  let successful = 0;
  let failed = 0;
  let consecutiveFailures = 0;

  for (const code of codes) {
    try {
      await rateLimiter.waitForNextRequest();

      const url = `${SCRAPER_CONFIG.baseUrl}${SCRAPER_CONFIG.companyPath}${code}/consolidated/`;

      // Fetch with retry
      const html = await withRetry(() => fetchPage(url));

      // Parse
      const snapshot = parseCompanyPage(html);

      // Save company master record (upsert)
      const companyId = await upsertCompany(code, snapshot.header);

      // Save snapshot
      await saveSnapshot(companyId, runId, snapshot);

      successful++;
      consecutiveFailures = 0;
      await incrementRunCount(runId, 'successful');

      logger.info(
        `[${successful + failed}/${codes.length}] ${code}: ` +
        `PE=${snapshot.ratios.stockPe ?? 'N/A'} ` +
        `MCap=${snapshot.ratios.marketCap ?? 'N/A'} ` +
        `ROE=${snapshot.ratios.roe ?? 'N/A'}`,
      );
    } catch (error) {
      failed++;
      consecutiveFailures++;
      await incrementRunCount(runId, 'failed');

      logger.error(`[${successful + failed}/${codes.length}] ${code}: FAILED — ${(error as Error).message}`);

      // If too many consecutive failures, something is seriously wrong (likely blocked)
      if (consecutiveFailures >= SCRAPER_CONFIG.maxConsecutiveFailures) {
        logger.error(`${consecutiveFailures} consecutive failures — stopping scrape. IP may be blocked.`);
        await completeScrapeRun(runId, 'failed');
        throw new Error(`Scrape aborted: ${consecutiveFailures} consecutive failures`);
      }
    }
  }

  // Complete the run
  const status = failed > successful ? 'failed' : 'completed';
  await completeScrapeRun(runId, status);

  logger.info(`Scrape run #${runId} ${status}: ${successful} successful, ${failed} failed`);
  return runId;
}
