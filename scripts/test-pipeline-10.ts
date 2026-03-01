/**
 * Test the pipeline for 10 companies using local LLM.
 * Usage: LLM_PROVIDER=local npx tsx scripts/test-pipeline-10.ts
 */
import { db, schema, logger } from '@screener/shared';
import { loadRubric } from '../packages/analyzer/src/scoring/rubric-loader.js';
import { scoreAllCompanies } from '../packages/analyzer/src/scoring/engine.js';
import { runQualitativeAnalysis } from '../packages/analyzer/src/llm/qualitative-analyzer.js';

async function main() {
  const scrapeRunId = 6;

  // Layer 1
  const rubric = loadRubric();
  const { analyses, enrichedMap } = await scoreAllCompanies(scrapeRunId, rubric);
  logger.info(`Layer 1 complete: ${analyses.length} companies scored`);

  // Take top 10
  const top10 = analyses.slice(0, 10);
  logger.info(`Testing LLM on top 10 companies`);

  // tier1Count=5 → rank 1-5 get full 4-agent, tier2Count=10 → rank 6-10 get AG1 only
  await runQualitativeAnalysis(top10, enrichedMap, {
    tier1Count: 5,
    tier2Count: 10,
  });

  // Summary
  let withLlm = 0;
  let withoutLlm = 0;
  for (const a of top10) {
    if (a.llmAnalysis) {
      withLlm++;
      logger.info(`  ${a.screenerCode}: ${a.compositeScore} → ${a.finalScore} (adj=${a.llmAnalysis.qualitativeAdjustment}, conf=${a.llmAnalysis.confidence})`);
    } else {
      withoutLlm++;
      logger.warn(`  ${a.screenerCode}: NO LLM ANALYSIS (parse failed)`);
    }
  }
  logger.info(`Results: ${withLlm}/10 with LLM analysis, ${withoutLlm}/10 failed`);

  process.exit(0);
}

main().catch((err) => {
  logger.error(`Failed: ${(err as Error).message}`);
  process.exit(1);
});
