#!/usr/bin/env tsx
/**
 * Full pipeline orchestrator: Scrape → Analyze (Layer 1 + Layer 2) → Report
 *
 * Usage:
 *   npx tsx scripts/run-pipeline.ts [options]
 *
 * Options:
 *   --scrape-only          Only run the scraper
 *   --analyze-only         Only run the analyzer (on latest scrape run)
 *   --skip-llm             Skip LLM qualitative analysis
 *   --llm-only             Re-run LLM on existing Layer 1 results
 *   --limit=N              Limit scraper to N companies (scrape) or top N (analyze)
 *   --resume               Resume a previous incomplete scrape run
 *   --companies=A,B,C      Analyze specific companies (comma-separated codes)
 *   --sectors=IT,Banking    Filter by sector (comma-separated, partial match)
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
  const llmOnly = getArg('llm-only');
  const resume = getArg('resume');
  const limit = getArgValue('limit') ? Number(getArgValue('limit')) : undefined;
  const runId = getArgValue('run') ? Number(getArgValue('run')) : undefined;
  const companiesRaw = getArgValue('companies');
  const sectorsRaw = getArgValue('sectors');

  // Step 1: Scrape (skip if analyze-only, llm-only, or targeting specific companies)
  if (!analyzeOnly && !llmOnly && !companiesRaw && !sectorsRaw) {
    logger.info('\n=== Step 1: Scraping ===');
    const { runScrape } = await import('../packages/scraper/src/pipeline/scrape-run.js');
    await runScrape({ limit, resume });
  }

  // Step 2: Analyze
  if (!scrapeOnly) {
    logger.info('\n=== Step 2: Analysis ===');
    const { runAnalysis } = await import('../packages/analyzer/src/pipeline/analysis-run.js');
    await runAnalysis({
      skipLlm,
      llmOnly,
      scrapeRunId: runId,
      companies: companiesRaw ? companiesRaw.split(',').map((c) => c.trim()) : undefined,
      sectors: sectorsRaw ? sectorsRaw.split(',').map((s) => s.trim()) : undefined,
      limit,
    });
  }

  // Step 3: Sync to Neon (if configured)
  if (process.env.NEON_DATABASE_URL) {
    logger.info('\n=== Step 3: Syncing to Neon ===');
    const { execSync } = await import('child_process');
    execSync('npx tsx scripts/sync-to-neon.ts', {
      stdio: 'inherit',
      env: process.env as NodeJS.ProcessEnv,
    });
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
