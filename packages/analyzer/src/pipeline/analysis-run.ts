import { db, schema, logger } from '@screener/shared';
import { desc } from 'drizzle-orm';
import { loadRubric } from '../scoring/rubric-loader.js';
import { scoreAllCompanies } from '../scoring/engine.js';
import { runQualitativeAnalysis } from '../llm/qualitative-analyzer.js';
import { saveAnalysisResults } from '../storage/save-analysis.js';
import { computeWeeklyChanges } from './weekly-comparison.js';
import { generateWeeklyReport } from '../output/report-generator.js';

export interface AnalysisOptions {
  scrapeRunId?: number;
  skipLlm?: boolean;
  llmOnly?: boolean;
  skipReport?: boolean;
  llmModel?: string;
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

  if (!options.llmOnly) {
    // Layer 1: Quantitative scoring + Frameworks
    logger.info('=== Layer 1: Quantitative Scoring + Frameworks ===');
    const { analyses, enrichedMap } = await scoreAllCompanies(scrapeRunId, rubric);

    if (analyses.length === 0) {
      logger.error('No companies found for this scrape run.');
      return;
    }

    // Layer 2: Multi-agent LLM qualitative analysis
    if (!options.skipLlm) {
      logger.info('=== Layer 2: Multi-Agent LLM Analysis ===');
      await runQualitativeAnalysis(analyses, enrichedMap, {
        model: options.llmModel,
      });

      // Re-sort by final score after LLM adjustments
      analyses.sort((a, b) => b.finalScore - a.finalScore);
      analyses.forEach((a, i) => { a.rank = i + 1; });
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
  } else {
    // LLM-only mode: load existing Layer 1 results, run LLM, update
    logger.info('LLM-only mode: loading existing analysis results...');
    logger.warn('LLM-only mode not yet implemented — run full analysis instead');
  }
}
