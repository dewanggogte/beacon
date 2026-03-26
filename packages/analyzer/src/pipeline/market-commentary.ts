import { db, schema, logger } from '@screener/shared';
import { eq, desc, sql } from 'drizzle-orm';
import { createLlmClient } from '../llm/create-llm-client.js';

const SYSTEM_PROMPT = `You are a senior equity research analyst writing a weekly market summary for Indian value investors. Your audience is smart but time-constrained — they skim before they read. Write in a structured, scannable format. Be direct and opinionated where the data supports it. Never hedge every sentence.`;

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

    const userPrompt = `You just completed a quantitative + qualitative analysis of ${totalCompanies} listed Indian companies. Write a structured market commentary using EXACTLY this format:

## The Big Picture
One paragraph (3-4 sentences). What does the overall classification distribution tell us? What fraction of the market looks investable vs overvalued/distressed? Is this better or worse than a healthy market would look?

## Sector Spotlight
2-3 short paragraphs. Which sectors score highest and why that matters. Which sectors are weakest. Any sector where the score diverges from market consensus (e.g., a beaten-down sector scoring well, or a popular sector scoring poorly). Name specific sectors and their scores.

## Notable Moves
One paragraph highlighting the most interesting upgrades AND downgrades from the movers list. What patterns emerge — are the moves concentrated in a sector? Are they driven by fundamental improvement or deterioration? Name 3-5 specific companies.

## Macro Context
One paragraph (skip entirely if no macro data). How current rates, inflation, and market valuation (Nifty P/E) affect the opportunity set. What regime are we in and what it means for stock selection.

## Bottom Line
2-3 sentences. The single most important takeaway for a value investor reading this today. Be direct.

---

DATA:

Classification distribution:
${classDistText}

Top sectors by average score:
${sectorText}

Notable score movers (|change| >= 10 points):
${moversText}

Macro environment:
${macroText}

---

RULES:
- Use the ## headings exactly as shown above
- Keep each section tight — no filler, no throat-clearing
- Use specific numbers from the data (percentages, scores, company names)
- Bold key phrases with **bold** markdown for scannability
- If a section has no relevant data, write one sentence acknowledging that and move on
- Total length: 400-600 words`;

    // ── Call LLM ─────────────────────────────────────────────────────────────
    logger.info('generateMarketCommentary: calling LLM...');
    const commentary = await client.generate(SYSTEM_PROMPT, userPrompt, {
      maxTokens: 2048,
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
