import { db, schema } from '@screener/shared';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

export interface PricePoint {
  companyId: number;
  date: string;
  closePrice: number;
}

/**
 * Load close prices for a set of companies within a date range.
 */
export async function loadPrices(
  companyIds: number[],
  fromDate: string,
  toDate: string,
): Promise<Map<number, PricePoint[]>> {
  if (companyIds.length === 0) return new Map();

  const rows = await db
    .select({
      companyId: schema.priceHistory.companyId,
      date: schema.priceHistory.priceDate,
      closePrice: schema.priceHistory.closePrice,
    })
    .from(schema.priceHistory)
    .where(
      and(
        sql`${schema.priceHistory.companyId} = ANY(${companyIds})`,
        gte(schema.priceHistory.priceDate, fromDate),
        lte(schema.priceHistory.priceDate, toDate),
      ),
    )
    .orderBy(schema.priceHistory.companyId, schema.priceHistory.priceDate);

  const result = new Map<number, PricePoint[]>();
  for (const row of rows) {
    const list = result.get(row.companyId) ?? [];
    list.push({
      companyId: row.companyId,
      date: row.date,
      closePrice: Number(row.closePrice),
    });
    result.set(row.companyId, list);
  }

  return result;
}

/**
 * Get the closest available price on or after a given date.
 */
export function getClosestPrice(prices: PricePoint[], targetDate: string): PricePoint | null {
  if (!prices || prices.length === 0) return null;

  // Find first price on or after target date
  for (const p of prices) {
    if (p.date >= targetDate) return p;
  }
  // If no price on/after, return the last available
  return prices[prices.length - 1] ?? null;
}

/**
 * Get price counts per company (for coverage check).
 */
export async function getPriceCoverage(): Promise<Map<number, number>> {
  const rows = await db
    .select({
      companyId: schema.priceHistory.companyId,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.priceHistory)
    .groupBy(schema.priceHistory.companyId);

  const result = new Map<number, number>();
  for (const row of rows) {
    result.set(row.companyId, row.count);
  }
  return result;
}
