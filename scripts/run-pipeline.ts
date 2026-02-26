#!/usr/bin/env tsx
/**
 * Full pipeline orchestrator: Scrape → Analyze (Layer 1 + Layer 2) → Report
 *
 * Usage:
 *   npx tsx scripts/run-pipeline.ts [options]
 *
 * Options:
 *   --scrape-only      Only run the scraper
 *   --analyze-only     Only run the analyzer (on latest scrape run)
 *   --skip-llm         Skip LLM qualitative analysis
 *   --limit=N          Limit scraper to N companies
 *   --resume           Resume a previous incomplete scrape run
 */
import { logger } from '@screener/shared';

const args = new Set(process.argv.slice(2));
const getArg = (name: string) => args.has(`--${name}`);
const getArgValue = (name: string) => {
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(`--${name}=`)) return arg.split('=')[1];
  }
  return undefined;
};

async function main() {
  const startTime = Date.now();
  logger.info('=== Stock Screener Pipeline ===');
  logger.info(`Started at ${new Date().toISOString()}`);

  const scrapeOnly = getArg('scrape-only');
  const analyzeOnly = getArg('analyze-only');
  const skipLlm = getArg('skip-llm');
  const resume = getArg('resume');
  const limit = getArgValue('limit') ? Number(getArgValue('limit')) : undefined;

  // Step 1: Scrape
  if (!analyzeOnly) {
    logger.info('\n=== Step 1: Scraping ===');
    const { runScrape } = await import('../packages/scraper/src/pipeline/scrape-run.js');
    await runScrape({ limit, resume });
  }

  // Step 2: Analyze
  if (!scrapeOnly) {
    logger.info('\n=== Step 2: Analysis ===');
    const { runAnalysis } = await import('../packages/analyzer/src/pipeline/analysis-run.js');
    await runAnalysis({ skipLlm });
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  logger.info(`\n=== Pipeline Complete (${elapsed}s) ===`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error(`Pipeline failed: ${(err as Error).message}`);
    console.error(err);
    process.exit(1);
  });
