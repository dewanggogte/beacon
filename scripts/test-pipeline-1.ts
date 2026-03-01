/**
 * Test the full pipeline for 1 company using local LLM.
 * Usage: LLM_PROVIDER=local npx tsx scripts/test-pipeline-1.ts
 */
import { db, schema, logger } from '@screener/shared';
import { desc, eq } from 'drizzle-orm';
import { loadRubric } from '../packages/analyzer/src/scoring/rubric-loader.js';
import { scoreAllCompanies } from '../packages/analyzer/src/scoring/engine.js';
import { runQualitativeAnalysis } from '../packages/analyzer/src/llm/qualitative-analyzer.js';

async function main() {
  const scrapeRunId = 6;

  // Layer 1: Score all companies
  const rubric = loadRubric();
  const { analyses, enrichedMap } = await scoreAllCompanies(scrapeRunId, rubric);
  logger.info(`Layer 1 complete: ${analyses.length} companies scored`);

  // Pick the top-ranked company for LLM test
  const top1 = analyses.slice(0, 1);
  logger.info(`Testing LLM on: ${top1[0]!.screenerCode} (rank=${top1[0]!.rank}, score=${top1[0]!.compositeScore})`);

  // Layer 2: Run LLM for just this 1 company (tier1Count=1 means rank 1 = tier1)
  await runQualitativeAnalysis(top1, enrichedMap, {
    tier1Count: 1,
    tier2Count: 1,
  });

  // Check results
  const result = top1[0]!;
  if (result.llmAnalysis) {
    logger.info('=== LLM ANALYSIS SAVED ===');
    logger.info(`  finalScore: ${result.finalScore} (was ${result.compositeScore})`);
    logger.info(`  adjustment: ${result.llmAnalysis.qualitativeAdjustment}`);
    logger.info(`  confidence: ${result.llmAnalysis.confidence}`);
    logger.info(`  narrative: ${result.llmAnalysis.trendNarrative?.slice(0, 150)}`);
    logger.info(`  risks: ${result.llmAnalysis.riskFactors?.length} items`);
    logger.info(`  catalysts: ${result.llmAnalysis.catalysts?.length} items`);
  } else {
    logger.error('=== LLM ANALYSIS IS NULL — parsing failed ===');
  }

  process.exit(0);
}

main().catch((err) => {
  logger.error(`Failed: ${(err as Error).message}`);
  process.exit(1);
});
