import { db, schema } from '@screener/shared';
import { desc, eq, sql, and, isNull, or } from 'drizzle-orm';

export async function getLatestRunId(): Promise<number | null> {
  const runs = await db
    .select({ id: schema.scrapeRuns.id })
    .from(schema.scrapeRuns)
    .orderBy(desc(schema.scrapeRuns.startedAt))
    .limit(1);
  return runs[0]?.id ?? null;
}

export async function getSummaryStats(runId: number) {
  const results = await db
    .select()
    .from(schema.analysisResults)
    .where(eq(schema.analysisResults.scrapeRunId, runId));

  const counts = {
    total: results.length,
    strong_long: 0,
    potential_long: 0,
    neutral: 0,
    potential_short: 0,
    strong_avoid: 0,
    highConviction: 0,
  };

  for (const r of results) {
    const cls = r.classification as keyof typeof counts;
    if (cls in counts) (counts as Record<string, number>)[cls]++;
    if (r.convictionLevel === 'high') counts.highConviction++;
  }

  return counts;
}

const companyColumns = {
  companyId: schema.analysisResults.companyId,
  companyName: schema.companies.name,
  screenerCode: schema.companies.screenerCode,
  sector: schema.companies.sector,
  compositeScore: schema.analysisResults.compositeScore,
  finalScore: schema.analysisResults.finalScore,
  classification: schema.analysisResults.classification,
  rankOverall: schema.analysisResults.rankOverall,
  rankInSector: schema.analysisResults.rankInSector,
  valuationScore: schema.analysisResults.valuationScore,
  qualityScore: schema.analysisResults.qualityScore,
  governanceScore: schema.analysisResults.governanceScore,
  safetyScore: schema.analysisResults.safetyScore,
  momentumScore: schema.analysisResults.momentumScore,
  scoreChange: schema.analysisResults.scoreChange,
  classificationChange: schema.analysisResults.classificationChange,
  disqualified: schema.analysisResults.disqualified,
  // Framework columns
  buffettScore: schema.analysisResults.buffettScore,
  grahamScore: schema.analysisResults.grahamScore,
  pabraiRiskScore: schema.analysisResults.pabraiRiskScore,
  lynchCategoryScore: schema.analysisResults.lynchCategoryScore,
  lynchClassification: schema.analysisResults.lynchClassification,
  convictionLevel: schema.analysisResults.convictionLevel,
  classificationSource: schema.analysisResults.classificationSource,
  quantClassification: schema.analysisResults.quantClassification,
};

export async function getTopCompanies(
  runId: number,
  classification: string,
  limit: number = 20,
) {
  const results = await db
    .select(companyColumns)
    .from(schema.analysisResults)
    .innerJoin(schema.companies, eq(schema.analysisResults.companyId, schema.companies.id))
    .where(
      and(
        eq(schema.analysisResults.scrapeRunId, runId),
        eq(schema.analysisResults.classification, classification),
      ),
    )
    .orderBy(desc(schema.analysisResults.finalScore))
    .limit(limit);

  return results;
}

export async function getAllRankings(runId: number) {
  const results = await db
    .select(companyColumns)
    .from(schema.analysisResults)
    .innerJoin(schema.companies, eq(schema.analysisResults.companyId, schema.companies.id))
    .where(eq(schema.analysisResults.scrapeRunId, runId))
    .orderBy(desc(schema.analysisResults.finalScore));

  return results;
}

export async function getCompanyDetail(screenerCode: string) {
  const company = await db
    .select()
    .from(schema.companies)
    .where(eq(schema.companies.screenerCode, screenerCode))
    .limit(1);

  if (company.length === 0) return null;

  const companyId = company[0]!.id;

  // Get latest analysis
  const analysis = await db
    .select()
    .from(schema.analysisResults)
    .where(eq(schema.analysisResults.companyId, companyId))
    .orderBy(desc(schema.analysisResults.analyzedAt))
    .limit(1);

  // Get latest snapshot
  const snapshot = await db
    .select()
    .from(schema.companySnapshots)
    .where(eq(schema.companySnapshots.companyId, companyId))
    .orderBy(desc(schema.companySnapshots.scrapedAt))
    .limit(1);

  return {
    company: company[0]!,
    analysis: analysis[0] ?? null,
    snapshot: snapshot[0] ?? null,
  };
}

export async function getHighConvictionCompanies(runId: number) {
  const results = await db
    .select({
      ...companyColumns,
      convictionReasons: schema.analysisResults.convictionReasons,
      frameworkDetails: schema.analysisResults.frameworkDetails,
      llmSynthesis: schema.analysisResults.llmSynthesis,
    })
    .from(schema.analysisResults)
    .innerJoin(schema.companies, eq(schema.analysisResults.companyId, schema.companies.id))
    .where(
      and(
        eq(schema.analysisResults.scrapeRunId, runId),
        or(
          eq(schema.analysisResults.convictionLevel, 'high'),
          eq(schema.analysisResults.convictionLevel, 'medium'),
        ),
      ),
    )
    .orderBy(desc(schema.analysisResults.finalScore));

  return results;
}

export async function getFrameworkComparison(runId: number, limit: number = 200) {
  const results = await db
    .select({
      companyName: schema.companies.name,
      screenerCode: schema.companies.screenerCode,
      sector: schema.companies.sector,
      finalScore: schema.analysisResults.finalScore,
      classification: schema.analysisResults.classification,
      buffettScore: schema.analysisResults.buffettScore,
      grahamScore: schema.analysisResults.grahamScore,
      pabraiRiskScore: schema.analysisResults.pabraiRiskScore,
      lynchCategoryScore: schema.analysisResults.lynchCategoryScore,
      lynchClassification: schema.analysisResults.lynchClassification,
      convictionLevel: schema.analysisResults.convictionLevel,
      frameworkDetails: schema.analysisResults.frameworkDetails,
    })
    .from(schema.analysisResults)
    .innerJoin(schema.companies, eq(schema.analysisResults.companyId, schema.companies.id))
    .where(eq(schema.analysisResults.scrapeRunId, runId))
    .orderBy(desc(schema.analysisResults.finalScore))
    .limit(limit);

  return results;
}

export async function getSectorDistribution(runId: number) {
  const results = await db
    .select({
      sector: schema.companies.sector,
      count: sql<number>`count(*)::int`,
      avgScore: sql<number>`avg(${schema.analysisResults.finalScore}::numeric)::numeric(5,1)`,
    })
    .from(schema.analysisResults)
    .innerJoin(schema.companies, eq(schema.analysisResults.companyId, schema.companies.id))
    .where(eq(schema.analysisResults.scrapeRunId, runId))
    .groupBy(schema.companies.sector)
    .orderBy(desc(sql`count(*)`));

  return results;
}

export async function getBacktestRuns() {
  const results = await db
    .select()
    .from(schema.backtestRuns)
    .orderBy(desc(schema.backtestRuns.createdAt))
    .limit(50);

  return results;
}

export async function getMacroSnapshots() {
  const results = await db
    .select()
    .from(schema.macroSnapshots)
    .orderBy(desc(schema.macroSnapshots.snapshotDate))
    .limit(24);

  return results;
}

export async function getPipelineStatus() {
  const latestRun = await db
    .select()
    .from(schema.scrapeRuns)
    .orderBy(desc(schema.scrapeRuns.startedAt))
    .limit(1);

  const totalCompanies = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.companies);

  const latestAnalysis = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.analysisResults)
    .where(
      latestRun[0]
        ? eq(schema.analysisResults.scrapeRunId, latestRun[0].id)
        : sql`false`,
    );

  return {
    latestRun: latestRun[0] ?? null,
    totalCompanies: totalCompanies[0]?.count ?? 0,
    analyzedCompanies: latestAnalysis[0]?.count ?? 0,
  };
}
