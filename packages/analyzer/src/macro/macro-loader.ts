import { db, schema, logger } from '@screener/shared';
import { desc } from 'drizzle-orm';
import { classifyRegime, type MacroSnapshot, type RegimeResult } from './regime-classifier.js';

/**
 * Load the latest macro snapshot and classify the regime.
 */
export async function loadCurrentRegime(): Promise<RegimeResult | null> {
  const rows = await db
    .select()
    .from(schema.macroSnapshots)
    .orderBy(desc(schema.macroSnapshots.snapshotDate))
    .limit(1);

  if (rows.length === 0) {
    logger.info('No macro snapshots found — skipping regime adjustments');
    return null;
  }

  const row = rows[0]!;
  const snapshot: MacroSnapshot = {
    repoRate: row.repoRate ? Number(row.repoRate) : null,
    cpi: row.cpi ? Number(row.cpi) : null,
    gdpGrowth: row.gdpGrowth ? Number(row.gdpGrowth) : null,
    niftyPe: row.niftyPe ? Number(row.niftyPe) : null,
    indiaVix: row.indiaVix ? Number(row.indiaVix) : null,
    usdInr: row.usdInr ? Number(row.usdInr) : null,
    bondYield10y: row.bondYield10y ? Number(row.bondYield10y) : null,
  };

  const result = classifyRegime(snapshot);
  logger.info(`Macro regime: ${result.regime} (${result.confidence} confidence)`);
  for (const s of result.signals) {
    logger.info(`  ${s}`);
  }

  return result;
}

/**
 * Insert a macro snapshot (for manual entry or automated fetching).
 */
export async function insertMacroSnapshot(data: {
  snapshotDate: string;
  repoRate?: number;
  cpi?: number;
  gdpGrowth?: number;
  niftyPe?: number;
  indiaVix?: number;
  usdInr?: number;
  bondYield10y?: number;
  notes?: string;
}): Promise<void> {
  const regime = classifyRegime({
    repoRate: data.repoRate ?? null,
    cpi: data.cpi ?? null,
    gdpGrowth: data.gdpGrowth ?? null,
    niftyPe: data.niftyPe ?? null,
    indiaVix: data.indiaVix ?? null,
    usdInr: data.usdInr ?? null,
    bondYield10y: data.bondYield10y ?? null,
  });

  await db.insert(schema.macroSnapshots).values({
    snapshotDate: data.snapshotDate,
    repoRate: data.repoRate?.toString() ?? null,
    cpi: data.cpi?.toString() ?? null,
    gdpGrowth: data.gdpGrowth?.toString() ?? null,
    niftyPe: data.niftyPe?.toString() ?? null,
    indiaVix: data.indiaVix?.toString() ?? null,
    usdInr: data.usdInr?.toString() ?? null,
    bondYield10y: data.bondYield10y?.toString() ?? null,
    regime: regime.regime,
    notes: data.notes ?? null,
  });

  logger.info(`Inserted macro snapshot for ${data.snapshotDate}: regime=${regime.regime}`);
}
