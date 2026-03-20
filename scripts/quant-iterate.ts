#!/usr/bin/env tsx
/**
 * Quant model iteration tool.
 *
 * Automates the score → analyze → compare loop:
 *   1. score   — Run experimental scoring, write to claude-llm-analysis/v{N}/
 *   2. prepare — Prepare company files for Claude analysis
 *   3. compare — Compare current version against Claude analysis and prior versions
 *   4. report  — Generate a divergence report with improvement recommendations
 *
 * Usage:
 *   npx tsx scripts/quant-iterate.ts score --version=v3.3 [--run=7]
 *   npx tsx scripts/quant-iterate.ts prepare --version=v3.3
 *   npx tsx scripts/quant-iterate.ts compare --version=v3.3 [--baseline=v3.2-final]
 *   npx tsx scripts/quant-iterate.ts report --version=v3.3
 */
import { db, schema, logger } from '@screener/shared';
import { desc, eq } from 'drizzle-orm';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { scoreAllCompanies } from '../packages/analyzer/src/scoring/engine.js';

const BASE_DIR = resolve(process.cwd(), 'claude-llm-analysis');
const command = process.argv[2];
const args = process.argv.slice(3);

function getArg(name: string): string | undefined {
  for (const arg of args) {
    if (arg.startsWith(`--${name}=`)) return arg.split('=')[1];
  }
  return undefined;
}

async function score() {
  const version = getArg('version') ?? 'experimental';
  const runId = getArg('run') ? Number(getArg('run')) : null;

  let scrapeRunId = runId;
  if (!scrapeRunId) {
    const latest = await db
      .select({ id: schema.scrapeRuns.id })
      .from(schema.scrapeRuns)
      .orderBy(desc(schema.scrapeRuns.id))
      .limit(1);
    scrapeRunId = latest[0]?.id ?? null;
    if (!scrapeRunId) {
      logger.error('No scrape runs found');
      process.exit(1);
    }
  }

  const rubricPath = resolve(process.cwd(), 'principles', 'scoring-rubric.json');
  const rubric = JSON.parse(readFileSync(rubricPath, 'utf-8'));

  logger.info(`Scoring ${version} on scrape run #${scrapeRunId}`);
  const { analyses } = await scoreAllCompanies(scrapeRunId, rubric);

  const outDir = resolve(BASE_DIR, version);
  mkdirSync(outDir, { recursive: true });

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
    dimensions: Object.fromEntries(a.dimensionScores.map((d) => [d.dimension, d.score])),
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
  writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(scores.filter((s) => !s.disqualified).slice(0, 100), null, 2));

  const dist: Record<string, number> = {};
  for (const s of scores) dist[s.classification] = (dist[s.classification] ?? 0) + 1;
  const summary = {
    version, scrape_run_id: scrapeRunId, total: scores.length,
    distribution: dist, top_score: scores[0]?.composite_score,
    disqualified: scores.filter((s) => s.disqualified).length,
    timestamp: new Date().toISOString(),
  };
  writeFileSync(resolve(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

  logger.info(`Output: ${outDir}/`);
  logger.info(`Distribution: ${JSON.stringify(dist)}`);
  logger.info(`Disqualified: ${summary.disqualified}`);
  logger.info(`\nNext: npx tsx scripts/quant-iterate.ts prepare --version=${version}`);
}

function prepare() {
  const version = getArg('version');
  if (!version) { logger.error('--version required'); process.exit(1); }

  const outDir = resolve(BASE_DIR, version);
  const scoresPath = resolve(outDir, 'scores.json');
  if (!existsSync(scoresPath)) {
    logger.error(`No scores.json in ${outDir}. Run 'score' first.`);
    process.exit(1);
  }

  const scores = JSON.parse(readFileSync(scoresPath, 'utf-8'));
  const top100 = scores.filter((s: { disqualified: boolean }) => !s.disqualified).slice(0, 100);
  const codes: string[] = top100.map((s: { code: string }) => s.code);

  // Try to find company files from prior versions
  const versions = readdirSync(BASE_DIR).filter((d) => d.startsWith('v')).sort().reverse();
  let found = 0;
  let missing: string[] = [];

  for (const code of codes) {
    const target = resolve(outDir, `company-${code}.json`);
    if (existsSync(target)) { found++; continue; }

    let copied = false;
    for (const v of versions) {
      const source = resolve(BASE_DIR, v, `company-${code}.json`);
      if (existsSync(source)) {
        const data = JSON.parse(readFileSync(source, 'utf-8'));
        const s = scores.find((x: { code: string }) => x.code === code);
        if (s) {
          data.composite_score = s.composite_score;
          data.classification = s.classification;
          data.dimensions = s.dimensions;
          data.health = s.health;
        }
        writeFileSync(target, JSON.stringify(data, null, 2));
        found++;
        copied = true;
        break;
      }
    }
    if (!copied) missing.push(code);
  }

  logger.info(`Company files: ${found} ready, ${missing.length} missing`);
  if (missing.length > 0) {
    logger.warn(`Missing companies (need DB fetch): ${missing.join(', ')}`);
    logger.info(`Fetch with: kubectl port-forward + psql query for these codes`);
  }

  // Print batches for Claude analysis
  logger.info(`\n--- Batches for Claude analysis ---`);
  for (let i = 0; i < 5; i++) {
    const batch = codes.slice(i * 20, (i + 1) * 20);
    logger.info(`Batch ${i + 1}: ${batch.join(', ')}`);
  }

  logger.info(`\nRun Claude analysis, then: npx tsx scripts/quant-iterate.ts compare --version=${version}`);
}

function compare() {
  const version = getArg('version');
  const baseline = getArg('baseline');
  if (!version) { logger.error('--version required'); process.exit(1); }

  const outDir = resolve(BASE_DIR, version);

  // Load Claude analysis
  const allAnalysis: Array<{ code: string; ag4: { score: number; recommended_classification: string } }> = [];
  for (let i = 1; i <= 5; i++) {
    const path = resolve(outDir, `batch-${i}-analysis.json`);
    if (existsSync(path)) {
      allAnalysis.push(...JSON.parse(readFileSync(path, 'utf-8')));
    }
  }

  if (allAnalysis.length === 0) {
    logger.error(`No batch analysis files found in ${outDir}. Run Claude analysis first.`);
    process.exit(1);
  }

  // Load scores
  const scores = JSON.parse(readFileSync(resolve(outDir, 'scores.json'), 'utf-8'));
  const scoreLookup = Object.fromEntries(scores.map((s: { code: string }) => [s.code, s]));

  // Compute divergence stats
  const divergences: Array<{ code: string; quant: number; ag4: number; gap: number }> = [];
  const ag4Dist: Record<string, number> = {};

  for (const c of allAnalysis) {
    const s = scoreLookup[c.code];
    if (!s || !c.ag4?.score) continue;
    const gap = s.composite_score - c.ag4.score;
    divergences.push({ code: c.code, quant: s.composite_score, ag4: c.ag4.score, gap });
    const cls = c.ag4.recommended_classification;
    ag4Dist[cls] = (ag4Dist[cls] ?? 0) + 1;
  }

  const avgQuant = divergences.reduce((s, d) => s + d.quant, 0) / divergences.length;
  const avgAg4 = divergences.reduce((s, d) => s + d.ag4, 0) / divergences.length;
  const avgDiv = divergences.reduce((s, d) => s + d.gap, 0) / divergences.length;
  const agree10 = divergences.filter((d) => Math.abs(d.gap) <= 10).length;
  const down20 = divergences.filter((d) => d.gap > 20).length;
  const down40 = divergences.filter((d) => d.gap > 40).length;

  logger.info(`\n=== ${version} Cross-Validation Results ===`);
  logger.info(`Companies analyzed: ${divergences.length}`);
  logger.info(`Avg quant: ${avgQuant.toFixed(1)}, Avg AG4: ${avgAg4.toFixed(1)}`);
  logger.info(`Avg divergence: ${avgDiv.toFixed(1)} pts`);
  logger.info(`Agreement (within 10 pts): ${agree10} (${Math.round(agree10 * 100 / divergences.length)}%)`);
  logger.info(`Downgraded >20 pts: ${down20}`);
  logger.info(`Downgraded >40 pts: ${down40}`);
  logger.info(`AG4 distribution: ${JSON.stringify(ag4Dist)}`);

  // Top matches (smallest gap)
  divergences.sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap));
  logger.info(`\n--- Best matches (quant ≈ AG4) ---`);
  for (const d of divergences.slice(0, 10)) {
    logger.info(`  ${d.code}: quant=${d.quant} ag4=${d.ag4} gap=${d.gap > 0 ? '+' : ''}${d.gap}`);
  }

  // Worst divergences
  divergences.sort((a, b) => b.gap - a.gap);
  logger.info(`\n--- Worst divergences (quant >> AG4) ---`);
  for (const d of divergences.slice(0, 10)) {
    logger.info(`  ${d.code}: quant=${d.quant} ag4=${d.ag4} gap=+${d.gap}`);
  }

  // Compare with baseline if provided
  if (baseline) {
    const baseDir = resolve(BASE_DIR, baseline);
    const baseAnalysis: Array<{ code: string; ag4: { score: number } }> = [];
    for (let i = 1; i <= 5; i++) {
      const path = resolve(baseDir, `batch-${i}-analysis.json`);
      if (existsSync(path)) baseAnalysis.push(...JSON.parse(readFileSync(path, 'utf-8')));
    }
    if (baseAnalysis.length > 0) {
      const baseScores = JSON.parse(readFileSync(resolve(baseDir, 'scores.json'), 'utf-8'));
      const baseLookup = Object.fromEntries(baseScores.map((s: { code: string }) => [s.code, s]));

      const baseDivs = baseAnalysis
        .filter((c) => baseLookup[c.code] && c.ag4?.score)
        .map((c) => ({ gap: baseLookup[c.code].composite_score - c.ag4.score }));
      const baseAvgDiv = baseDivs.reduce((s, d) => s + d.gap, 0) / baseDivs.length;
      const baseAgree = baseDivs.filter((d) => Math.abs(d.gap) <= 10).length;

      logger.info(`\n--- vs ${baseline} ---`);
      logger.info(`Avg divergence: ${baseAvgDiv.toFixed(1)} → ${avgDiv.toFixed(1)} (${(avgDiv - baseAvgDiv) > 0 ? '+' : ''}${(avgDiv - baseAvgDiv).toFixed(1)})`);
      logger.info(`Agreement: ${baseAgree} (${Math.round(baseAgree * 100 / baseDivs.length)}%) → ${agree10} (${Math.round(agree10 * 100 / divergences.length)}%)`);
    }
  }

  // Save report
  const report = {
    version,
    baseline: baseline ?? null,
    total_analyzed: divergences.length,
    avg_quant: Number(avgQuant.toFixed(1)),
    avg_ag4: Number(avgAg4.toFixed(1)),
    avg_divergence: Number(avgDiv.toFixed(1)),
    agreement_10pt: agree10,
    agreement_pct: Math.round(agree10 * 100 / divergences.length),
    downgraded_20: down20,
    downgraded_40: down40,
    ag4_distribution: ag4Dist,
    best_matches: divergences.slice(-10).reverse().map((d) => ({ ...d })),
    worst_divergences: divergences.slice(0, 10).map((d) => ({ ...d })),
    timestamp: new Date().toISOString(),
  };
  writeFileSync(resolve(outDir, 'comparison-report.json'), JSON.stringify(report, null, 2));
  logger.info(`\nReport saved to ${outDir}/comparison-report.json`);
}

function report() {
  const version = getArg('version');
  if (!version) { logger.error('--version required'); process.exit(1); }

  const outDir = resolve(BASE_DIR, version);
  const reportPath = resolve(outDir, 'comparison-report.json');
  if (!existsSync(reportPath)) {
    logger.error(`No comparison report. Run 'compare' first.`);
    process.exit(1);
  }

  const rpt = JSON.parse(readFileSync(reportPath, 'utf-8'));

  // Load analysis to find patterns in downgrades
  const allAnalysis: Array<{ code: string; ag4: { score: number; recommended_classification: string; conviction_reasoning: string; investment_thesis: string } }> = [];
  for (let i = 1; i <= 5; i++) {
    const path = resolve(outDir, `batch-${i}-analysis.json`);
    if (existsSync(path)) allAnalysis.push(...JSON.parse(readFileSync(path, 'utf-8')));
  }

  const scores = JSON.parse(readFileSync(resolve(outDir, 'scores.json'), 'utf-8'));
  const scoreLookup = Object.fromEntries(scores.map((s: { code: string }) => [s.code, s]));

  // Find common themes in worst divergences
  const worstCodes = new Set(rpt.worst_divergences.map((d: { code: string }) => d.code));
  const worstAnalysis = allAnalysis.filter((c) => worstCodes.has(c.code));

  logger.info(`\n=== ${version} Improvement Report ===`);
  logger.info(`Agreement rate: ${rpt.agreement_pct}%`);
  logger.info(`Avg divergence: ${rpt.avg_divergence} pts\n`);

  logger.info(`Worst divergences and their AG4 reasoning:`);
  for (const c of worstAnalysis) {
    const s = scoreLookup[c.code];
    if (!s) continue;
    logger.info(`\n  ${c.code} (quant ${s.composite_score} → AG4 ${c.ag4.score}):`);
    logger.info(`    ${c.ag4.investment_thesis}`);
  }

  logger.info(`\n--- Suggested next iteration focus ---`);
  logger.info(`1. Review the worst divergences above`);
  logger.info(`2. Identify common patterns (cyclical peak? cash flow? other income?)`);
  logger.info(`3. Add gates or penalties for those patterns`);
  logger.info(`4. Run: npx tsx scripts/quant-iterate.ts score --version=v{NEXT}`);
}

async function run() {
  const version = getArg('version');
  if (!version) { logger.error('--version required'); process.exit(1); }

  const outDir = resolve(BASE_DIR, version);
  const hasScores = existsSync(resolve(outDir, 'scores.json'));
  const hasBatchFiles = existsSync(resolve(outDir, 'batch-1-analysis.json'));

  if (!hasScores) {
    // Step 1: Score
    logger.info('=== Step 1/4: Scoring ===');
    await score();

    // Step 2: Prepare
    logger.info('\n=== Step 2/4: Preparing company files ===');
    prepare();

    // Step 3: Print Claude analysis prompt
    const manifest = JSON.parse(readFileSync(resolve(outDir, 'manifest.json'), 'utf-8'));
    const codes: string[] = manifest.map((s: { code: string }) => s.code);
    const batches: string[][] = [];
    for (let i = 0; i < 5; i++) batches.push(codes.slice(i * 20, (i + 1) * 20));

    logger.info('\n=== Step 3/4: Claude analysis needed ===');
    logger.info('Copy-paste this into Claude Code to run the analysis:\n');

    console.log('Run 5 parallel agents to analyze the top 100 companies for version ' + version + '.');
    console.log('Each agent should read company files from claude-llm-analysis/' + version + '/company-{CODE}.json');
    console.log('and write AG1-AG4 analysis to claude-llm-analysis/' + version + '/batch-{N}-analysis.json\n');

    for (let i = 0; i < 5; i++) {
      console.log(`Batch ${i + 1}: ${batches[i]!.join(', ')}`);
    }

    const baseline = getArg('baseline');
    console.log(`\nAfter analysis completes, re-run:`);
    console.log(`  npx tsx scripts/quant-iterate.ts run --version=${version}${baseline ? ` --baseline=${baseline}` : ''}`);
    return;
  }

  if (!hasBatchFiles) {
    logger.info('Scores exist but no Claude analysis found.');
    logger.info('Run Claude analysis first, then re-run this command.');

    // Re-print batches
    const manifest = JSON.parse(readFileSync(resolve(outDir, 'manifest.json'), 'utf-8'));
    const codes: string[] = manifest.map((s: { code: string }) => s.code);
    for (let i = 0; i < 5; i++) {
      logger.info(`Batch ${i + 1}: ${codes.slice(i * 20, (i + 1) * 20).join(', ')}`);
    }
    return;
  }

  // Step 4: Compare + Report
  logger.info('=== Step 3/4: Comparing scores ===');
  compare();

  logger.info('\n=== Step 4/4: Generating report ===');
  report();
}

async function main() {
  switch (command) {
    case 'run': await run(); break;
    case 'score': await score(); break;
    case 'prepare': prepare(); break;
    case 'compare': compare(); break;
    case 'report': report(); break;
    default:
      console.log(`
Quant Model Iteration Tool

Usage:
  npx tsx scripts/quant-iterate.ts run --version=vX.Y [--run=N] [--baseline=vX.Z]
  npx tsx scripts/quant-iterate.ts <subcommand> [options]

Commands:
  run      --version=vX.Y [--run=N] [--baseline=vX.Z]
           Full iteration: score → prepare → (pause for Claude) → compare → report.
           Run once to score + prepare. Run again after Claude analysis to compare + report.

  score    --version=vX.Y [--run=N]           Score all companies, write to local files
  prepare  --version=vX.Y                     Prepare company files for Claude analysis
  compare  --version=vX.Y [--baseline=vX.Z]   Compare Claude analysis vs quant scores
  report   --version=vX.Y                     Show improvement recommendations

Workflow:
  1. npx tsx scripts/quant-iterate.ts run --version=v3.3 --run=7 --baseline=v3.2-final
     → scores + prepares + prints batches for Claude analysis
  2. Run Claude analysis (5 parallel agents on the printed batches)
  3. npx tsx scripts/quant-iterate.ts run --version=v3.3 --baseline=v3.2-final
     → detects analysis files, runs compare + report
  4. Read the report, make code changes, bump version, repeat
`);
  }
  process.exit(0);
}

main().catch((err) => {
  logger.error(err.message);
  process.exit(1);
});
