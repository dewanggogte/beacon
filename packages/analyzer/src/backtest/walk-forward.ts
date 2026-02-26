import { db, schema, logger } from '@screener/shared';
import { desc, gte, lte } from 'drizzle-orm';
import { runBacktest, type BacktestConfig } from './backtest-runner.js';
import type { BacktestPerformance } from './performance-calculator.js';

export interface WalkForwardConfig {
  fromDate: string;          // YYYY-MM-DD start
  toDate: string;            // YYYY-MM-DD end
  holdingPeriodDays?: number; // default 180
  topN?: number;             // default 20
  classifications?: string[];
  minConviction?: string;
}

export interface WalkForwardResult {
  periods: Array<{
    scrapeRunId: number;
    analysisDate: string;
    evaluationDate: string;
    performance: BacktestPerformance;
  }>;
  aggregate: {
    totalPeriods: number;
    avgReturn: number;
    avgHitRate: number;
    avgSharpe: number | null;
    bestPeriod: { date: string; return: number } | null;
    worstPeriod: { date: string; return: number } | null;
  };
}

/**
 * Walk-forward analysis: for each scrape run within [fromDate, toDate],
 * run a backtest with the given holding period.
 */
export async function walkForward(config: WalkForwardConfig): Promise<WalkForwardResult> {
  const {
    fromDate,
    toDate,
    holdingPeriodDays = 180,
    topN = 20,
    classifications = ['strong_long', 'potential_long'],
    minConviction = 'none',
  } = config;

  logger.info(`Walk-forward: ${fromDate} → ${toDate} (${holdingPeriodDays}d hold, top ${topN})`);

  // Get all scrape runs within the date range
  const runs = await db
    .select({
      id: schema.scrapeRuns.id,
      startedAt: schema.scrapeRuns.startedAt,
    })
    .from(schema.scrapeRuns)
    .where(
      gte(schema.scrapeRuns.startedAt, new Date(fromDate)),
    )
    .orderBy(schema.scrapeRuns.startedAt);

  // Filter to runs where evaluation date falls before toDate
  const eligibleRuns = runs.filter((r) => {
    const runDate = new Date(r.startedAt);
    const evalDate = new Date(runDate.getTime() + holdingPeriodDays * 86400000);
    return evalDate <= new Date(toDate);
  });

  logger.info(`  Found ${eligibleRuns.length} eligible scrape runs`);

  const periods: WalkForwardResult['periods'] = [];

  for (const run of eligibleRuns) {
    const runDate = new Date(run.startedAt);
    const evalDate = new Date(runDate.getTime() + holdingPeriodDays * 86400000);
    const analysisDate = runDate.toISOString().slice(0, 10);
    const evaluationDate = evalDate.toISOString().slice(0, 10);

    try {
      const performance = await runBacktest({
        scrapeRunId: run.id,
        evaluationDate,
        holdingPeriodDays,
        topN,
        classifications,
        minConviction,
      });

      periods.push({
        scrapeRunId: run.id,
        analysisDate,
        evaluationDate,
        performance,
      });
    } catch (error) {
      logger.warn(`  Backtest failed for run #${run.id}: ${(error as Error).message}`);
    }
  }

  // Aggregate
  const returns = periods.map((p) => p.performance.avgReturn);
  const hitRates = periods.map((p) => p.performance.hitRate);
  const sharpes = periods
    .map((p) => p.performance.sharpeRatio)
    .filter((s): s is number => s !== null);

  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const avgHitRate = hitRates.length > 0 ? hitRates.reduce((a, b) => a + b, 0) / hitRates.length : 0;
  const avgSharpe = sharpes.length > 0 ? sharpes.reduce((a, b) => a + b, 0) / sharpes.length : null;

  let bestPeriod: { date: string; return: number } | null = null;
  let worstPeriod: { date: string; return: number } | null = null;

  for (const p of periods) {
    if (!bestPeriod || p.performance.avgReturn > bestPeriod.return) {
      bestPeriod = { date: p.analysisDate, return: p.performance.avgReturn };
    }
    if (!worstPeriod || p.performance.avgReturn < worstPeriod.return) {
      worstPeriod = { date: p.analysisDate, return: p.performance.avgReturn };
    }
  }

  const result: WalkForwardResult = {
    periods,
    aggregate: {
      totalPeriods: periods.length,
      avgReturn: Math.round(avgReturn * 100) / 100,
      avgHitRate: Math.round(avgHitRate * 1000) / 1000,
      avgSharpe: avgSharpe !== null ? Math.round(avgSharpe * 100) / 100 : null,
      bestPeriod,
      worstPeriod,
    },
  };

  logger.info(`Walk-forward complete: ${periods.length} periods`);
  logger.info(`  Avg return: ${result.aggregate.avgReturn.toFixed(1)}%, Hit rate: ${(result.aggregate.avgHitRate * 100).toFixed(0)}%, Sharpe: ${result.aggregate.avgSharpe?.toFixed(2) ?? 'N/A'}`);

  return result;
}
