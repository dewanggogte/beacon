import { db, schema, logger } from '@screener/shared';
import type { CompanyAnalysis, Classification, DimensionScore } from '@screener/shared';
import { desc, eq, and, inArray } from 'drizzle-orm';
import { loadRubric } from '../scoring/rubric-loader.js';
import { scoreAllCompanies } from '../scoring/engine.js';
import { runQualitativeAnalysis } from '../llm/qualitative-analyzer.js';
import { runDivergenceWatcher } from '../llm/divergence-watcher.js';
import { saveAnalysisResults } from '../storage/save-analysis.js';
import { computeWeeklyChanges } from './weekly-comparison.js';
import { generateWeeklyReport } from '../output/report-generator.js';

export interface AnalysisOptions {
  scrapeRunId?: number;
  skipLlm?: boolean;
  llmOnly?: boolean;
  skipReport?: boolean;
  llmModel?: string;
  /** Comma-separated company codes to analyze (e.g. "RELIANCE,TCS,INFY") */
  companies?: string[];
  /** Comma-separated sectors to filter (e.g. "IT,Banking") */
  sectors?: string[];
  /** Limit number of companies to analyze */
  limit?: number;
}

/**
 * Run the full analysis pipeline: Layer 1 (quantitative) + Layer 2 (LLM) + report.
 */
export async function runAnalysis(options: AnalysisOptions = {}): Promise<void> {
  const startTime = Date.now();

  // Resolve which scrape run to analyze
  let scrapeRunId = options.scrapeRunId;
  if (!scrapeRunId) {
    const latestRun = await db
      .select()
      .from(schema.scrapeRuns)
      .orderBy(desc(schema.scrapeRuns.startedAt))
      .limit(1);

    if (latestRun.length === 0) {
      logger.error('No scrape runs found. Run the scraper first.');
      return;
    }
    scrapeRunId = latestRun[0]!.id;
    logger.info(`Using latest scrape run #${scrapeRunId}`);
  }

  // Load scoring rubric
  const rubric = loadRubric();

  // Determine if we're in targeted mode (specific companies/sectors/limit)
  const isTargeted = !!(options.companies?.length || options.sectors?.length);
  const hasLimit = !!options.limit;

  if (options.llmOnly) {
    // ─── LLM-only mode: load existing Layer 1 results from DB, run LLM ───
    logger.info('=== LLM-only mode: Loading existing Layer 1 results ===');
    const { analyses, enrichedMap } = await loadExistingAnalyses(scrapeRunId, options);

    if (analyses.length === 0) {
      logger.error('No existing analysis results found. Run full analysis first.');
      return;
    }

    logger.info(`Loaded ${analyses.length} companies with existing Layer 1 scores`);

    // All targeted companies get forced into full LLM (no tiering)
    const forceAll = isTargeted;
    logger.info('=== Layer 2: Multi-Agent LLM Analysis ===');
    await runQualitativeAnalysis(analyses, enrichedMap, {
      model: options.llmModel,
      forceAll,
    });

    // Re-sort and re-rank
    analyses.sort((a, b) => b.finalScore - a.finalScore);
    analyses.forEach((a, i) => { a.rank = i + 1; });
    reAssignSectorRanks(analyses);

    const ag4Count = analyses.filter((a) => a.classificationSource === 'ag4').length;
    await runDivergenceWatcher(ag4Count);

    logger.info('=== Saving Results ===');
    await saveAnalysisResults(scrapeRunId, analyses);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`LLM-only pipeline complete in ${elapsed}s — ${analyses.length} companies`);
    return;
  }

  // ─── Normal mode: Layer 1 + optional Layer 2 ───
  logger.info('=== Layer 1: Quantitative Scoring + Frameworks ===');
  const { analyses: allAnalyses, enrichedMap } = await scoreAllCompanies(scrapeRunId, rubric);

  if (allAnalyses.length === 0) {
    logger.error('No companies found for this scrape run.');
    return;
  }

  // Apply filters: --companies, --sectors, --limit
  let analyses = allAnalyses;

  if (options.companies?.length) {
    const codes = new Set(options.companies.map((c) => c.toUpperCase()));
    analyses = analyses.filter((a) => codes.has(a.screenerCode.toUpperCase()));
    logger.info(`Filtered to ${analyses.length} companies by code: ${options.companies.join(', ')}`);
  }

  if (options.sectors?.length) {
    const sectors = options.sectors.map((s) => s.toLowerCase());
    analyses = analyses.filter((a) => sectors.some((s) => a.sector.toLowerCase().includes(s)));
    logger.info(`Filtered to ${analyses.length} companies by sector: ${options.sectors.join(', ')}`);
  }

  if (hasLimit && analyses.length > options.limit!) {
    analyses = analyses.slice(0, options.limit!);
    logger.info(`Limited to top ${options.limit} companies by quant rank`);
  }

  if (analyses.length === 0) {
    logger.error('No companies match the specified filters.');
    return;
  }

  // Layer 2: Multi-agent LLM qualitative analysis
  if (!options.skipLlm) {
    // When running targeted analysis, force all companies into full LLM eval
    const forceAll = isTargeted;
    logger.info('=== Layer 2: Multi-Agent LLM Analysis ===');
    await runQualitativeAnalysis(analyses, enrichedMap, {
      model: options.llmModel,
      forceAll,
    });

    // Re-sort by final score after LLM scoring
    analyses.sort((a, b) => b.finalScore - a.finalScore);
    analyses.forEach((a, i) => { a.rank = i + 1; });
    reAssignSectorRanks(analyses);

    // Run divergence watcher — analyzes quant-vs-AG4 disagreements and emails report
    const ag4Count = analyses.filter((a) => a.classificationSource === 'ag4').length;
    await runDivergenceWatcher(ag4Count);
  }

  // Save results to DB
  logger.info('=== Saving Results ===');
  await saveAnalysisResults(scrapeRunId, analyses);

  // Weekly comparison
  logger.info('=== Weekly Comparison ===');
  const weeklyChanges = await computeWeeklyChanges(scrapeRunId, analyses);

  // Generate report
  if (!options.skipReport) {
    logger.info('=== Generating Report ===');
    generateWeeklyReport(analyses, weeklyChanges);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(`Analysis pipeline complete in ${elapsed}s — ${analyses.length} companies analyzed`);
}

/** Re-assign per-sector ranks after scoring changes */
function reAssignSectorRanks(analyses: CompanyAnalysis[]): void {
  const sectorGroups = new Map<string, CompanyAnalysis[]>();
  for (const a of analyses) {
    const list = sectorGroups.get(a.sector) ?? [];
    list.push(a);
    sectorGroups.set(a.sector, list);
  }
  for (const [, group] of sectorGroups) {
    group.sort((a, b) => b.finalScore - a.finalScore);
    group.forEach((a, i) => { a.rankInSector = i + 1; });
  }
}

/**
 * Load existing analysis results from the DB and reconstruct CompanyAnalysis objects.
 * Used by --llm-only mode to re-run LLM on companies that already have Layer 1 scores.
 */
async function loadExistingAnalyses(
  scrapeRunId: number,
  options: AnalysisOptions,
): Promise<{ analyses: CompanyAnalysis[]; enrichedMap: Map<number, import('../enrichment/flatten-v2.js').EnrichedSnapshot> }> {
  const { flattenV2 } = await import('../enrichment/flatten-v2.js');
  const { evaluateAllFrameworks } = await import('../frameworks/index.js');

  // Build query conditions
  let rows;
  if (options.companies?.length) {
    // Load specific companies by code
    const codes = options.companies.map((c) => c.toUpperCase());
    rows = await db
      .select()
      .from(schema.analysisResults)
      .innerJoin(schema.companies, eq(schema.analysisResults.companyId, schema.companies.id))
      .innerJoin(schema.companySnapshots, and(
        eq(schema.companySnapshots.companyId, schema.companies.id),
        eq(schema.companySnapshots.scrapeRunId, scrapeRunId),
      ))
      .where(and(
        eq(schema.analysisResults.scrapeRunId, scrapeRunId),
        inArray(schema.companies.screenerCode, codes),
      ));
  } else if (options.sectors?.length) {
    // Load all companies, filter by sector in JS (sector matching is fuzzy)
    rows = await db
      .select()
      .from(schema.analysisResults)
      .innerJoin(schema.companies, eq(schema.analysisResults.companyId, schema.companies.id))
      .innerJoin(schema.companySnapshots, and(
        eq(schema.companySnapshots.companyId, schema.companies.id),
        eq(schema.companySnapshots.scrapeRunId, scrapeRunId),
      ))
      .where(eq(schema.analysisResults.scrapeRunId, scrapeRunId));

    const sectors = options.sectors.map((s) => s.toLowerCase());
    rows = rows.filter((r) => sectors.some((s) => (r.companies.sector ?? '').toLowerCase().includes(s)));
  } else {
    // Load all
    rows = await db
      .select()
      .from(schema.analysisResults)
      .innerJoin(schema.companies, eq(schema.analysisResults.companyId, schema.companies.id))
      .innerJoin(schema.companySnapshots, and(
        eq(schema.companySnapshots.companyId, schema.companies.id),
        eq(schema.companySnapshots.scrapeRunId, scrapeRunId),
      ))
      .where(eq(schema.analysisResults.scrapeRunId, scrapeRunId));
  }

  // Apply limit
  if (options.limit && rows.length > options.limit) {
    // Sort by composite score descending, then take top N
    rows.sort((a, b) => Number(b.analysis_results.compositeScore ?? 0) - Number(a.analysis_results.compositeScore ?? 0));
    rows = rows.slice(0, options.limit);
  }

  const analyses: CompanyAnalysis[] = [];
  const enrichedMap = new Map<number, import('../enrichment/flatten-v2.js').EnrichedSnapshot>();

  for (const row of rows) {
    const company = row.companies;
    const result = row.analysis_results;
    const snapshot = row.company_snapshots;

    // Re-enrich from snapshot (needed for LLM data packs)
    const enriched = flattenV2(snapshot, company.sector ?? 'Unknown');
    enrichedMap.set(company.id, enriched);

    // Re-evaluate frameworks (needed for LLM prompts)
    const frameworkResults = evaluateAllFrameworks(enriched);

    const dimensionScores = (result.metricDetails as DimensionScore[]) ?? [];

    analyses.push({
      companyId: company.id,
      companyName: company.name,
      screenerCode: company.screenerCode,
      sector: company.sector ?? 'Unknown',
      dimensionScores,
      compositeScore: Number(result.compositeScore ?? 0),
      disqualified: result.disqualified ?? false,
      disqualificationReasons: (result.disqualificationReasons as string[]) ?? [],
      finalScore: Number(result.finalScore ?? result.compositeScore ?? 0),
      classification: (result.classification ?? 'neutral') as Classification,
      rank: result.rankOverall ?? 0,
      rankInSector: result.rankInSector ?? 0,
      frameworkResults,
      convictionLevel: (result.convictionLevel as 'high' | 'medium' | 'low' | 'none') ?? 'none',
      convictionReasons: (result.convictionReasons as string[]) ?? [],
    });
  }

  // Sort by composite score and assign ranks
  analyses.sort((a, b) => b.compositeScore - a.compositeScore);
  analyses.forEach((a, i) => { a.rank = i + 1; });
  reAssignSectorRanks(analyses);

  return { analyses, enrichedMap }
}
