#!/usr/bin/env tsx
/**
 * Seed a small set of well-known companies for testing.
 * Inserts directly into the companies table, skipping the slow search API discovery.
 *
 * Usage: npx tsx scripts/seed-companies.ts
 */
import { db, schema, logger } from '@screener/shared';
import { eq } from 'drizzle-orm';

const SEED_COMPANIES = [
  { screenerCode: 'RELIANCE', name: 'Reliance Industries' },
  { screenerCode: 'TCS', name: 'Tata Consultancy Services' },
  { screenerCode: 'HDFCBANK', name: 'HDFC Bank' },
  { screenerCode: 'INFY', name: 'Infosys' },
  { screenerCode: 'ICICIBANK', name: 'ICICI Bank' },
  { screenerCode: 'ITC', name: 'ITC' },
  { screenerCode: 'SBIN', name: 'State Bank of India' },
  { screenerCode: 'BHARTIARTL', name: 'Bharti Airtel' },
  { screenerCode: 'BAJFINANCE', name: 'Bajaj Finance' },
  { screenerCode: 'LT', name: 'Larsen & Toubro' },
];

async function main() {
  logger.info(`Seeding ${SEED_COMPANIES.length} companies...`);

  let inserted = 0;
  let skipped = 0;

  for (const company of SEED_COMPANIES) {
    const existing = await db
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .where(eq(schema.companies.screenerCode, company.screenerCode))
      .limit(1);

    if (existing[0]) {
      skipped++;
      continue;
    }

    await db.insert(schema.companies).values({
      screenerCode: company.screenerCode,
      name: company.name,
    });
    inserted++;
  }

  logger.info(`Done: ${inserted} inserted, ${skipped} already existed`);
  process.exit(0);
}

main().catch((err) => {
  logger.error(`Seed failed: ${(err as Error).message}`);
  process.exit(1);
});
