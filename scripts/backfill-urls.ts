#!/usr/bin/env tsx
/**
 * Backfill screener_url and entity_type for existing companies.
 * Fetches from the Screener.in search API without scraping any pages.
 *
 * Usage:
 *   npx tsx scripts/backfill-urls.ts
 */
import { db, schema, logger, sleepRandom } from '@screener/shared';
import { eq, isNull } from 'drizzle-orm';

const SEARCH_API = 'https://www.screener.in/api/company/search/';
const INDEX_PATTERN = /\b(nifty|sensex|bse\s?\d|cnx\d|s&p\s?bse)\b/i;
const ETF_PATTERN = /\betf\b/i;

function classifyEntity(name: string): string {
  if (INDEX_PATTERN.test(name)) return 'index';
  if (ETF_PATTERN.test(name)) return 'etf';
  return 'company';
}

async function main() {
  // Get companies without screener_url
  const companies = await db
    .select({ id: schema.companies.id, screenerCode: schema.companies.screenerCode, name: schema.companies.name })
    .from(schema.companies)
    .where(isNull(schema.companies.screenerUrl));

  logger.info(`${companies.length} companies need URL backfill`);

  let updated = 0;
  let notFound = 0;

  for (const company of companies) {
    try {
      const res = await fetch(`${SEARCH_API}?q=${encodeURIComponent(company.screenerCode)}`);
      if (!res.ok) {
        await sleepRandom(5000, 10000);
        continue;
      }

      const results = await res.json() as Array<{ name: string; url: string }>;

      // Find exact match by screener code in URL
      const match = results.find((r) => {
        const codeMatch = r.url.match(/\/company\/([^/]+)\//);
        return codeMatch?.[1] === company.screenerCode;
      });

      if (match) {
        const entityType = classifyEntity(match.name);
        await db
          .update(schema.companies)
          .set({
            screenerUrl: match.url,
            entityType,
            updatedAt: new Date(),
          })
          .where(eq(schema.companies.id, company.id));
        updated++;
      } else {
        // No match — might be delisted or renamed. Set entity_type based on name.
        await db
          .update(schema.companies)
          .set({
            entityType: classifyEntity(company.name),
            updatedAt: new Date(),
          })
          .where(eq(schema.companies.id, company.id));
        notFound++;
      }

      if ((updated + notFound) % 100 === 0) {
        logger.info(`Progress: ${updated} updated, ${notFound} not found, ${companies.length - updated - notFound} remaining`);
      }

      await sleepRandom(150, 400);
    } catch (error) {
      logger.warn(`Failed to look up ${company.screenerCode}: ${(error as Error).message}`);
      await sleepRandom(2000, 5000);
    }
  }

  logger.info(`Backfill complete: ${updated} updated, ${notFound} not found`);
}

main().catch((err) => {
  logger.error(err.message);
  process.exit(1);
});
