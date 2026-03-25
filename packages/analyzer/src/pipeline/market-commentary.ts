import { db, schema, logger } from '@screener/shared';
import { eq, desc, sql } from 'drizzle-orm';
import { createLlmClient } from '../llm/create-llm-client.js';

const SYSTEM_PROMPT =
  'You are a market analyst writing brief overviews for Indian stock investors. ' +
  'Tone: informative, measured, no hype.';

/**
 * Generate an LLM-powered market commentary summarising the pipeline run's results.
 * Saves the result to scrape_runs.market_commentary for the given scrapeRunId.
 * Non-fatal: logs errors and returns null on failure.
 */
export async function generateMarketCommentary(scrapeRunId: number): Promise<string | null> {
  try {
    const client = createLlmClient();

    if (!client.isAvailable()) {
      logger.warn('generateMarketCommentary: LLM not available — skipping');
      return null;
    }

    // ── 1. Classification distribution ──────────────────────────────────────
    const classificationDist = await db
      .select({
        classification: schema.analysisResults.classification,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(schema.analysisResults)
      .where(eq(schema.analysisResults.scrapeRunId, scrapeRunId))
      .groupBy(schema.analysisResults.classification)
      .orderBy(desc(sql`count(*)`));

    // ── 2. Sector averages (top 10 by avg finalScore) ────────────────────────
    const sectorAverages = await db
      .select({
        sector: schema.companies.sector,
        avgScore: sql<number>`cast(avg(${schema.analysisResults.finalScore}) as numeric(5,1))`,
        companyCount: sql<number>`cast(count(*) as integer)`,
      })
      .from(schema.analysisResults)
      .innerJoin(schema.companies, eq(schema.analysisResults.companyId, schema.companies.id))
      .where(eq(schema.analysisResults.scrapeRunId, scrapeRunId))
      .groupBy(schema.companies.sector)
      .orderBy(desc(sql`avg(${schema.analysisResults.finalScore})`))
      .limit(10);

    // ── 3. Notable movers (abs(scoreChange) >= 10, top 20) ───────────────────
    const notableMovers = await db
      .select({
        companyName: schema.companies.name,
        sector: schema.companies.sector,
        finalScore: schema.analysisResults.finalScore,
        scoreChange: schema.analysisResults.scoreChange,
        classification: schema.analysisResults.classification,
      })
      .from(schema.analysisResults)
      .innerJoin(schema.companies, eq(schema.analysisResults.companyId, schema.companies.id))
      .where(
        sql`${schema.analysisResults.scrapeRunId} = ${scrapeRunId}
          AND ${schema.analysisResults.scoreChange} IS NOT NULL
          AND abs(${schema.analysisResults.scoreChange}) >= 10`,
      )
      .orderBy(desc(sql`abs(${schema.analysisResults.scoreChange})`))
      .limit(20);

    // ── 4. Latest macro regime ───────────────────────────────────────────────
    const macroRows = await db
      .select()
      .from(schema.macroSnapshots)
      .orderBy(desc(schema.macroSnapshots.snapshotDate))
      .limit(1);

    const macro = macroRows[0] ?? null;

    // ── Build user prompt ────────────────────────────────────────────────────
    const totalCompanies = classificationDist.reduce((sum, r) => sum + r.count, 0);

    const classDistText = classificationDist
      .map((r) => `  ${r.classification ?? 'unknown'}: ${r.count}`)
      .join('\n');

    const sectorText = sectorAverages
      .map((r) => `  ${r.sector ?? 'Unknown'} — avg score ${r.avgScore} (${r.companyCount} companies)`)
      .join('\n');

    const moversText = notableMovers.length > 0
      ? notableMovers
          .map((r) => {
            const dir = Number(r.scoreChange ?? 0) > 0 ? '+' : '';
            return `  ${r.companyName} (${r.sector ?? 'Unknown'}) — score ${r.finalScore}, change ${dir}${r.scoreChange}, now: ${r.classification}`;
          })
          .join('\n')
      : '  (no significant movers this week)';

    const macroText = macro
      ? [
          `  Date: ${macro.snapshotDate}`,
          `  Regime: ${macro.regime ?? 'unknown'}`,
          macro.repoRate != null ? `  Repo rate: ${macro.repoRate}%` : null,
          macro.cpi != null ? `  CPI: ${macro.cpi}%` : null,
          macro.niftyPe != null ? `  Nifty P/E: ${macro.niftyPe}` : null,
          macro.indiaVix != null ? `  India VIX: ${macro.indiaVix}` : null,
          macro.usdInr != null ? `  USD/INR: ${macro.usdInr}` : null,
          macro.bondYield10y != null ? `  10Y Bond Yield: ${macro.bondYield10y}%` : null,
          macro.notes ? `  Notes: ${macro.notes}` : null,
        ]
          .filter(Boolean)
          .join('\n')
      : '  (no macro data available)';

    const userPrompt = `You have just completed a quantitative + qualitative analysis of ${totalCompanies} listed Indian companies. Write a 3–5 paragraph market overview for value investors based on the following aggregate data.

## Classification Distribution
${classDistText}

## Top Sectors by Average Score
${sectorText}

## Notable Score Movers (|change| ≥ 10 points)
${moversText}

## Current Macro Environment
${macroText}

Write the overview in plain prose, 3–5 paragraphs. Do not use bullet points or headings. Focus on what the data signals for value investors: where is opportunity concentrating, which sectors look stretched or attractive, and what macro conditions to keep in mind. Be measured and avoid hype.`;

    // ── Call LLM ─────────────────────────────────────────────────────────────
    logger.info('generateMarketCommentary: calling LLM...');
    const commentary = await client.generate(SYSTEM_PROMPT, userPrompt, {
      maxTokens: 1024,
      temperature: 0.5,
    });

    // ── Save to DB ────────────────────────────────────────────────────────────
    await db
      .update(schema.scrapeRuns)
      .set({ marketCommentary: commentary })
      .where(eq(schema.scrapeRuns.id, scrapeRunId));

    logger.info(`generateMarketCommentary: saved ${commentary.length} chars for run #${scrapeRunId}`);
    return commentary;
  } catch (err) {
    logger.error(`generateMarketCommentary: failed — skipping (non-fatal): ${(err as Error).message}`);
    return null;
  }
}
