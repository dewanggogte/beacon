import { db, schema } from '@screener/shared';
import type { CompanySnapshot } from '../company-detail/index.js';

/**
 * Save a company snapshot to the database.
 */
export async function saveSnapshot(
  companyId: number,
  scrapeRunId: number,
  snapshot: CompanySnapshot,
): Promise<void> {
  await db.insert(schema.companySnapshots).values({
    companyId,
    scrapeRunId,
    marketCap: snapshot.ratios.marketCap?.toString() ?? null,
    currentPrice: snapshot.ratios.currentPrice?.toString() ?? null,
    high52w: snapshot.ratios.high52w?.toString() ?? null,
    low52w: snapshot.ratios.low52w?.toString() ?? null,
    stockPe: snapshot.ratios.stockPe?.toString() ?? null,
    bookValue: snapshot.ratios.bookValue?.toString() ?? null,
    dividendYield: snapshot.ratios.dividendYield?.toString() ?? null,
    roce: snapshot.ratios.roce?.toString() ?? null,
    roe: snapshot.ratios.roe?.toString() ?? null,
    faceValue: snapshot.ratios.faceValue?.toString() ?? null,
    pros: snapshot.pros,
    cons: snapshot.cons,
    quarterlyResults: snapshot.quarterlyResults,
    annualPl: snapshot.annualPl,
    balanceSheet: snapshot.balanceSheet,
    cashFlow: snapshot.cashFlow,
    ratios: snapshot.historicalRatios,
    shareholding: snapshot.shareholding,
    peerComparison: snapshot.peerComparison,
  });
}
