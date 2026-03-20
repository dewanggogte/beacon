#!/usr/bin/env tsx
/**
 * Experimental scoring: runs the quant engine and writes results to JSON files
 * instead of the database. Used for iterative model improvement.
 *
 * Usage:
 *   npx tsx scripts/experimental-score.ts --version=v3.1 [--run=7]
 */
import { db, schema, logger } from '@screener/shared';
import { eq } from 'drizzle-orm';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { scoreAllCompanies } from '../packages/analyzer/src/scoring/engine.js';

const args = process.argv.slice(2);
const getArgValue = (name: string) => {
  for (const arg of args) {
    if (arg.startsWith(`--${name}=`)) return arg.split('=')[1];
  }
  return undefined;
};

async function main() {
  const version = getArgValue('version') ?? 'experimental';
  const runId = getArgValue('run') ? Number(getArgValue('run')) : null;

  // Find latest scrape run if not specified
  let scrapeRunId = runId;
  if (!scrapeRunId) {
    const latest = await db
      .select({ id: schema.scrapeRuns.id })
      .from(schema.scrapeRuns)
      .orderBy(schema.scrapeRuns.id)
      .limit(1);
    scrapeRunId = latest[0]?.id ?? null;
    if (!scrapeRunId) {
      logger.error('No scrape runs found');
      process.exit(1);
    }
  }

  // Load rubric
  const rubricPath = resolve(process.cwd(), 'principles', 'scoring-rubric.json');
  const rubric = JSON.parse(readFileSync(rubricPath, 'utf-8'));

  logger.info(`Experimental scoring ${version} on scrape run #${scrapeRunId}`);

  // Run scoring engine
  const { analyses } = await scoreAllCompanies(scrapeRunId, rubric);

  // Prepare output directory
  const outDir = resolve(process.cwd(), 'claude-llm-analysis', version);
  mkdirSync(outDir, { recursive: true });

  // Write scores (compact format)
  const scores = analyses.map((a) => ({
    rank: a.rank,
    code: a.screenerCode,
    name: a.companyName,
    sector: a.sector,
    composite_score: a.compositeScore,
    classification: a.classification,
    conviction: a.convictionLevel,
    disqualified: a.disqualified,
    disqualification_reasons: a.disqualificationReasons,
    dimensions: Object.fromEntries(
      a.dimensionScores.map((d) => [d.dimension, d.score]),
    ),
    frameworks: a.frameworkResults ? {
      buffett: a.frameworkResults.buffett.score,
      graham: a.frameworkResults.graham.score,
      pabrai: a.frameworkResults.pabrai.riskScore,
      lynch_score: a.frameworkResults.lynch.categoryScore,
      lynch_category: a.frameworkResults.lynch.category,
    } : null,
    health: {
      piotroski: a.piotroskiFScore,
      altman_z: a.altmanZScore,
      beneish_m: a.beneishMScore,
    },
    gate_results: a.gateResults,
  }));

  writeFileSync(resolve(outDir, 'scores.json'), JSON.stringify(scores, null, 2));

  // Write top 100 manifest
  const top100 = scores.slice(0, 100);
  writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(top100, null, 2));

  // Summary stats
  const dist: Record<string, number> = {};
  for (const s of scores) {
    dist[s.classification] = (dist[s.classification] ?? 0) + 1;
  }

  const summary = {
    version,
    scrape_run_id: scrapeRunId,
    total_companies: scores.length,
    classification_distribution: dist,
    top_score: scores[0]?.composite_score,
    disqualified_count: scores.filter((s) => s.disqualified).length,
    timestamp: new Date().toISOString(),
  };

  writeFileSync(resolve(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

  logger.info(`Results written to ${outDir}/`);
  logger.info(`Distribution: ${JSON.stringify(dist)}`);
  logger.info(`Top score: ${summary.top_score}, Disqualified: ${summary.disqualified_count}`);

  process.exit(0);
}

main().catch((err) => {
  logger.error(`Experimental scoring failed: ${err.message}`);
  process.exit(1);
});
