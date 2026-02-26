import { db, schema, logger } from '@screener/shared';
import { eq, desc } from 'drizzle-orm';
import { loadPrices, getClosestPrice } from './price-loader.js';
import { calculatePerformance, type PickPerformance, type BacktestPerformance } from './performance-calculator.js';

export interface BacktestConfig {
  scrapeRunId: number;
  evaluationDate: string;      // YYYY-MM-DD: when to check returns
  holdingPeriodDays?: number;   // default 180 (6 months)
  topN?: number;                // how many top picks to evaluate (default 20)
  classifications?: string[];   // which classifications to backtest (default: strong_long, potential_long)
  minConviction?: string;       // minimum conviction level (default: none)
}

/**
 * Run a backtest: load analysis results from a past scrape run,
 * get entry prices (at analysis date) and exit prices (at evaluation date),
 * compute returns.
 */
export async function runBacktest(config: BacktestConfig): Promise<BacktestPerformance> {
  const {
    scrapeRunId,
    evaluationDate,
    holdingPeriodDays = 180,
    topN = 20,
    classifications = ['strong_long', 'potential_long'],
    minConviction = 'none',
  } = config;

  logger.info(`Backtest: run #${scrapeRunId} → eval ${evaluationDate} (${holdingPeriodDays}d, top ${topN})`);

  // Load analysis results for this run
  const analyses = await db
    .select({
      companyId: schema.analysisResults.companyId,
      companyName: schema.companies.name,
      screenerCode: schema.companies.screenerCode,
      finalScore: schema.analysisResults.finalScore,
      classification: schema.analysisResults.classification,
      convictionLevel: schema.analysisResults.convictionLevel,
      rankOverall: schema.analysisResults.rankOverall,
    })
    .from(schema.analysisResults)
    .innerJoin(schema.companies, eq(schema.analysisResults.companyId, schema.companies.id))
    .where(eq(schema.analysisResults.scrapeRunId, scrapeRunId))
    .orderBy(desc(schema.analysisResults.finalScore));

  if (analyses.length === 0) {
    logger.error(`No analysis results for run #${scrapeRunId}`);
    return calculatePerformance([], holdingPeriodDays);
  }

  // Filter to target classifications and conviction
  const convictionOrder = ['none', 'low', 'medium', 'high'];
  const minConvIdx = convictionOrder.indexOf(minConviction);

  const filtered = analyses.filter((a) => {
    if (!classifications.includes(a.classification ?? '')) return false;
    const convIdx = convictionOrder.indexOf(a.convictionLevel ?? 'none');
    return convIdx >= minConvIdx;
  });

  const picks = filtered.slice(0, topN);
  logger.info(`  Selected ${picks.length} picks from ${filtered.length} eligible`);

  if (picks.length === 0) {
    return calculatePerformance([], holdingPeriodDays);
  }

  // Get the scrape run date as the analysis/entry date
  const run = await db
    .select({ startedAt: schema.scrapeRuns.startedAt })
    .from(schema.scrapeRuns)
    .where(eq(schema.scrapeRuns.id, scrapeRunId))
    .limit(1);

  const analysisDate = run[0]?.startedAt
    ? new Date(run[0].startedAt).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  // Load prices for all picks
  const companyIds = picks.map((p) => p.companyId);
  const priceMap = await loadPrices(companyIds, analysisDate, evaluationDate);

  // Calculate returns
  const pickResults: PickPerformance[] = [];

  for (const pick of picks) {
    const prices = priceMap.get(pick.companyId);
    if (!prices || prices.length < 2) {
      logger.warn(`  No price data for ${pick.screenerCode}`);
      continue;
    }

    const entryPricePoint = getClosestPrice(prices, analysisDate);
    const exitPricePoint = getClosestPrice(prices, evaluationDate);

    if (!entryPricePoint || !exitPricePoint) continue;
    if (entryPricePoint.date === exitPricePoint.date) continue; // same price point

    const ret = ((exitPricePoint.closePrice - entryPricePoint.closePrice) / entryPricePoint.closePrice) * 100;

    pickResults.push({
      companyId: pick.companyId,
      screenerCode: pick.screenerCode,
      companyName: pick.companyName,
      classification: pick.classification ?? 'unknown',
      entryPrice: entryPricePoint.closePrice,
      exitPrice: exitPricePoint.closePrice,
      returnPct: Math.round(ret * 100) / 100,
      entryDate: entryPricePoint.date,
      exitDate: exitPricePoint.date,
    });
  }

  logger.info(`  Priced ${pickResults.length}/${picks.length} picks`);

  const performance = calculatePerformance(pickResults, holdingPeriodDays);

  // Save to DB
  await db.insert(schema.backtestRuns).values({
    analysisDate,
    scrapeRunId,
    evaluationDate,
    holdingPeriodDays,
    config: {
      topN,
      classifications,
      minConviction,
    },
    picks: pickResults.map((p) => ({
      screenerCode: p.screenerCode,
      returnPct: p.returnPct,
      entryPrice: p.entryPrice,
      exitPrice: p.exitPrice,
    })),
    performance: {
      avgReturn: performance.avgReturn,
      medianReturn: performance.medianReturn,
      hitRate: performance.hitRate,
      sharpeRatio: performance.sharpeRatio,
      maxReturn: performance.maxReturn,
      minReturn: performance.minReturn,
      pricedPicks: performance.pricedPicks,
      totalPicks: performance.totalPicks,
    },
    status: 'completed',
  });

  // Log summary
  logger.info(`  Results: avg ${performance.avgReturn.toFixed(1)}%, hit rate ${(performance.hitRate * 100).toFixed(0)}%, Sharpe ${performance.sharpeRatio?.toFixed(2) ?? 'N/A'}`);
  logger.info(`  Best: ${performance.maxReturn.toFixed(1)}%, Worst: ${performance.minReturn.toFixed(1)}%`);

  return performance;
}
