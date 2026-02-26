import { logger, sleepRandom } from '@screener/shared';
import { load } from 'cheerio';
import { fetchJSON, fetchPage } from '../client/http-client.js';
import { withRetry } from '../client/retry.js';
import { SCRAPER_CONFIG } from '../config.js';

interface SearchResult {
  id: number;
  name: string;
  url: string;
}

export interface CompanyListEntry {
  screenerCode: string;
  name: string;
  url: string;
}

/**
 * Generate 2-letter search queries to maximize company discovery.
 * Single letters return ~8 results each. 2-letter combos discover far more.
 */
function generateSearchQueries(): string[] {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const queries: string[] = [];

  // All 2-letter combinations (676 queries)
  for (const a of letters) {
    for (const b of letters) {
      queries.push(a + b);
    }
  }

  // Single digits and 2-digit combos for numeric codes
  for (const d of digits) {
    queries.push(d);
    for (const d2 of digits) {
      queries.push(d + d2);
    }
  }

  return queries;
}

/**
 * Fetch companies via search API using 2-letter combinations.
 * This discovers ~4,000-5,000 companies without hitting paginated listing pages.
 */
async function fetchViaSearchAPI(): Promise<Map<string, CompanyListEntry>> {
  const queries = generateSearchQueries();
  const seen = new Map<string, CompanyListEntry>();

  logger.info(`Fetching company list via search API (${queries.length} queries)...`);

  let queryCount = 0;
  for (const q of queries) {
    const url = `${SCRAPER_CONFIG.baseUrl}${SCRAPER_CONFIG.searchApiPath}?q=${q}`;

    try {
      const results = await withRetry(
        () => fetchJSON<SearchResult[]>(url),
        { maxRetries: 1, baseDelay: 5000 },
      );

      for (const result of results) {
        const match = result.url.match(/\/company\/([^/]+)\//);
        if (match?.[1] && !seen.has(match[1])) {
          seen.set(match[1], {
            screenerCode: match[1],
            name: result.name,
            url: result.url,
          });
        }
      }
    } catch {
      // Silently skip failed queries
    }

    queryCount++;
    if (queryCount % 100 === 0) {
      logger.info(`  Progress: ${queryCount}/${queries.length} queries, ${seen.size} companies found`);
    }

    // Polite delay between API calls (lighter than page scraping)
    await sleepRandom(200, 600);
  }

  logger.info(`Search API: found ${seen.size} unique companies from ${queries.length} queries`);
  return seen;
}

/**
 * Scrape the paginated listing to get remaining companies.
 * Uses the screen results page with conservative rate limiting.
 */
async function fetchViaListingPages(
  existing: Map<string, CompanyListEntry>,
  maxPages: number = 212,
): Promise<Map<string, CompanyListEntry>> {
  const seen = new Map(existing);
  const baseUrl = 'https://www.screener.in/screens/357649/all-listed-companies/';

  logger.info(`Fetching remaining companies from listing pages (up to ${maxPages} pages)...`);

  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1 ? baseUrl : `${baseUrl}?page=${page}`;

    try {
      const html = await withRetry(
        () => fetchPage(url),
        { maxRetries: 2, baseDelay: 10000 },
      );

      const $ = load(html);
      let newOnPage = 0;

      // Each company row has a link to its detail page
      $('a[href*="/company/"]').each((_, el) => {
        const href = $(el).attr('href');
        const name = $(el).text().trim();
        if (!href || !name || name.length < 2) return;

        const match = href.match(/\/company\/([^/]+)\//);
        if (match?.[1] && !seen.has(match[1])) {
          seen.set(match[1], {
            screenerCode: match[1],
            name,
            url: href,
          });
          newOnPage++;
        }
      });

      logger.debug(`Page ${page}/${maxPages}: ${newOnPage} new companies, ${seen.size} total`);

      // If no new companies found on a page, we might be at the end
      if (newOnPage === 0 && page > 5) {
        // Check if pagination indicates more pages
        const hasNextPage = $('a[href*="page="]').filter((_, el) => {
          const text = $(el).text().trim();
          return text === String(page + 1) || text === 'Next';
        }).length > 0;

        if (!hasNextPage) {
          logger.info(`No more pages after page ${page}`);
          break;
        }
      }
    } catch (error) {
      logger.warn(`Failed to fetch listing page ${page}: ${(error as Error).message}`);
    }

    if (page % 10 === 0) {
      logger.info(`  Listing progress: page ${page}/${maxPages}, ${seen.size} companies total`);
    }

    // Conservative rate limiting for listing pages
    await sleepRandom(2000, 5000);
  }

  logger.info(`Listing pages: ${seen.size} total companies`);
  return seen;
}

/**
 * Fetch ALL companies using a two-phase approach:
 * 1. Search API with 2-letter queries (fast, lightweight API calls)
 * 2. Listing page scrape to catch anything missed (slower, heavier)
 *
 * Pass `searchOnly: true` for a faster but potentially incomplete list.
 */
export async function fetchCompanyList(options?: {
  searchOnly?: boolean;
}): Promise<CompanyListEntry[]> {
  // Phase 1: Search API (fast, ~5 min for 786 queries)
  const searchResults = await fetchViaSearchAPI();

  if (options?.searchOnly) {
    return Array.from(searchResults.values());
  }

  // Phase 2: Listing pages to catch the rest
  const allResults = await fetchViaListingPages(searchResults);

  const companies = Array.from(allResults.values());
  logger.info(`Total: ${companies.length} unique companies discovered`);
  return companies;
}
