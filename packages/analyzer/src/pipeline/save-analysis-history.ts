import { db, schema, logger } from '@screener/shared';
import { eq, and, sql } from 'drizzle-orm';

const CHUNK_SIZE = 500;

/**
 * Copy analysis results + snapshot key metrics into analysis_history for time-series tracking.
 * Called after each pipeline run (normal and llm-only modes).
 */
export async function saveAnalysisHistory(scrapeRunId: number): Promise<number> {
  // Single JOIN query — no N+1
  const rows = await db
    .select()
    .from(schema.analysisResults)
    .innerJoin(
      schema.companySnapshots,
      and(
        eq(schema.companySnapshots.companyId, schema.analysisResults.companyId),
        eq(schema.companySnapshots.scrapeRunId, schema.analysisResults.scrapeRunId),
      ),
    )
    .where(eq(schema.analysisResults.scrapeRunId, scrapeRunId));

  if (rows.length === 0) {
    logger.warn(`saveAnalysisHistory: no analysis results found for scrape run #${scrapeRunId}`);
    return 0;
  }

  const values = rows.map((row) => {
    const ar = row.analysis_results;
    const snap = row.company_snapshots;

    // Dimension scores JSONB: array of { dimension, score, ... } objects from metricDetails
    const dimensionScores = ar.metricDetails ?? null;

    // Framework scores JSONB: { buffett, graham, pabrai, lynch } summary
    const frameworkScores = ar.frameworkDetails
      ? {
          buffett: ar.buffettScore != null ? Number(ar.buffettScore) : null,
          graham: ar.grahamScore != null ? Number(ar.grahamScore) : null,
          pabrai: ar.pabraiRiskScore != null ? Number(ar.pabraiRiskScore) : null,
          lynch: ar.lynchCategoryScore != null ? Number(ar.lynchCategoryScore) : null,
        }
      : null;

    // Key metrics JSONB: snapshot financials for quick time-series queries
    const keyMetrics = {
      pe: snap.stockPe != null ? Number(snap.stockPe) : null,
      roce: snap.roce != null ? Number(snap.roce) : null,
      roe: snap.roe != null ? Number(snap.roe) : null,
      de: null, // TODO: extract from balance sheet when available
      market_cap: snap.marketCap != null ? Number(snap.marketCap) : null,
      piotroski: ar.piotroskiFScore ?? null,
      altman: ar.altmanZScore != null ? Number(ar.altmanZScore) : null,
      beneish: ar.beneishMScore != null ? Number(ar.beneishMScore) : null,
      dividend_yield: snap.dividendYield != null ? Number(snap.dividendYield) : null,
    };

    return {
      companyId: ar.companyId,
      scrapeRunId,
      finalScore: ar.finalScore,
      classification: ar.classification,
      convictionLevel: ar.convictionLevel,
      classificationSource: ar.classificationSource ?? 'quant',
      dimensionScores,
      frameworkScores,
      lynchCategory: ar.lynchClassification ?? null,
      disqualified: ar.disqualified ?? false,
      disqualificationReasons: ar.disqualificationReasons ?? null,
      keyMetrics,
    };
  });

  // Batch insert in chunks of 500
  let inserted = 0;
  for (let i = 0; i < values.length; i += CHUNK_SIZE) {
    const chunk = values.slice(i, i + CHUNK_SIZE);
    await db
      .insert(schema.analysisHistory)
      .values(chunk)
      .onConflictDoUpdate({
        target: [schema.analysisHistory.companyId, schema.analysisHistory.scrapeRunId],
        set: {
          finalScore: sql`excluded.final_score`,
          classification: sql`excluded.classification`,
          convictionLevel: sql`excluded.conviction_level`,
          classificationSource: sql`excluded.classification_source`,
          dimensionScores: sql`excluded.dimension_scores`,
          frameworkScores: sql`excluded.framework_scores`,
          lynchCategory: sql`excluded.lynch_category`,
          disqualified: sql`excluded.disqualified`,
          disqualificationReasons: sql`excluded.disqualification_reasons`,
          keyMetrics: sql`excluded.key_metrics`,
        },
      });
    inserted += chunk.length;
  }

  logger.info(`saveAnalysisHistory: saved ${inserted} rows for scrape run #${scrapeRunId}`);
  return inserted;
}
