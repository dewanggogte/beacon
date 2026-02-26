import { db, schema } from '@screener/shared';
import { eq } from 'drizzle-orm';

/**
 * Create a new scrape run and return its ID.
 */
export async function createScrapeRun(totalCompanies: number): Promise<number> {
  const [run] = await db
    .insert(schema.scrapeRuns)
    .values({
      startedAt: new Date(),
      totalCompanies,
      status: 'running',
    })
    .returning({ id: schema.scrapeRuns.id });

  return run!.id;
}

/**
 * Update run progress (increment successful or failed count).
 */
export async function incrementRunCount(
  runId: number,
  field: 'successful' | 'failed',
): Promise<void> {
  const current = await db
    .select({ successful: schema.scrapeRuns.successful, failed: schema.scrapeRuns.failed })
    .from(schema.scrapeRuns)
    .where(eq(schema.scrapeRuns.id, runId))
    .limit(1);

  if (!current[0]) return;

  const value = (current[0][field] ?? 0) + 1;
  await db
    .update(schema.scrapeRuns)
    .set({ [field]: value })
    .where(eq(schema.scrapeRuns.id, runId));
}

/**
 * Mark a scrape run as completed or failed.
 */
export async function completeScrapeRun(
  runId: number,
  status: 'completed' | 'failed',
): Promise<void> {
  await db
    .update(schema.scrapeRuns)
    .set({
      completedAt: new Date(),
      status,
    })
    .where(eq(schema.scrapeRuns.id, runId));
}

/**
 * Get the latest incomplete scrape run (for resume).
 */
export async function getLatestIncompleteRun(): Promise<{ id: number; totalCompanies: number } | null> {
  const [run] = await db
    .select({
      id: schema.scrapeRuns.id,
      totalCompanies: schema.scrapeRuns.totalCompanies,
    })
    .from(schema.scrapeRuns)
    .where(eq(schema.scrapeRuns.status, 'running'))
    .orderBy(schema.scrapeRuns.id)
    .limit(1);

  return run ? { id: run.id, totalCompanies: run.totalCompanies ?? 0 } : null;
}
