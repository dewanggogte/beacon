#!/usr/bin/env tsx
/**
 * Sync dashboard-relevant tables from local DB to Neon (cloud Postgres).
 *
 * The dashboard is read-only, so this does a full truncate + reload
 * inside a transaction — Neon readers see old data until the commit.
 *
 * Tables synced (in FK-safe order):
 *   1. companies          (no FK deps)
 *   2. scrape_runs        (no FK deps)
 *   3. macro_snapshots    (no FK deps)
 *   4. company_snapshots  (FK → companies, scrape_runs)
 *   5. analysis_results   (FK → companies, scrape_runs)
 *   6. analysis_history   (FK → companies, scrape_runs)
 *
 * Usage:
 *   NEON_DATABASE_URL="postgres://..." npx tsx scripts/sync-to-neon.ts
 *
 * In production (K8s), NEON_DATABASE_URL is provided via the beacon-secrets Secret.
 */
import postgres from 'postgres';
import { logger } from '@screener/shared';

const LOCAL_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/screener';
const NEON_URL = process.env.NEON_DATABASE_URL;

if (!NEON_URL) {
  logger.error('NEON_DATABASE_URL is not set. Cannot sync.');
  process.exit(1);
}

// Tables in dependency order (parents first for truncate cascade safety)
const TABLES_TO_SYNC = [
  'companies',
  'scrape_runs',
  'macro_snapshots',
  'company_snapshots',
  'analysis_results',
  'analysis_history',
] as const;

// Batch size for inserts — avoids OOM on large tables and keeps
// Neon's query size under its 64MB limit.
const BATCH_SIZE = 500;

async function sync() {
  const startTime = Date.now();
  logger.info('=== Neon Sync: Starting ===');

  const local = postgres(LOCAL_URL, { max: 1 });
  const neon = postgres(NEON_URL!, { max: 1, ssl: 'require', onnotice: () => {} });

  try {
    // Verify connectivity
    await local`SELECT 1`;
    logger.info('Local DB connected');
    await neon`SELECT 1`;
    logger.info('Neon DB connected');

    // Run the entire sync in a single Neon transaction so the dashboard
    // never sees a half-loaded state.
    await neon.begin(async (tx) => {
      // Truncate in reverse order (children first) to respect FK constraints
      for (const table of [...TABLES_TO_SYNC].reverse()) {
        await tx.unsafe(`TRUNCATE TABLE "${table}" CASCADE`);
        logger.info(`Truncated ${table}`);
      }

      // Copy each table
      for (const table of TABLES_TO_SYNC) {
        const rows = await local.unsafe(`SELECT * FROM "${table}"`);
        const count = rows.length;

        if (count === 0) {
          logger.info(`${table}: 0 rows (skipped)`);
          continue;
        }

        // Insert in batches
        const columns = Object.keys(rows[0]);
        let inserted = 0;

        for (let i = 0; i < count; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          const values = batch.map(
            (row) =>
              `(${columns.map((col) => {
                const val = row[col];
                if (val === null || val === undefined) return 'NULL';
                if (val instanceof Date) return `'${val.toISOString()}'::timestamptz`;
                if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
                if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
                // Escape single quotes in strings
                return `'${String(val).replace(/'/g, "''")}'`;
              }).join(', ')})`,
          );

          await tx.unsafe(
            `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES ${values.join(', ')}`,
          );
          inserted += batch.length;
        }

        logger.info(`${table}: ${inserted} rows synced`);
      }

      // Reset sequences so future inserts (if any) don't collide
      for (const table of TABLES_TO_SYNC) {
        await tx.unsafe(
          `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1))`,
        );
      }
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`=== Neon Sync: Complete (${elapsed}s) ===`);
  } finally {
    await local.end();
    await neon.end();
  }
}

sync()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error(`Neon sync failed: ${(err as Error).message}`);
    console.error(err);
    process.exit(1);
  });
