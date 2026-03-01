/**
 * Scrape Adani Power, run full 4-agent pipeline, display results.
 * Tests: peer comparison, macro regime, structured CoT, devil's advocate,
 * post-validation, conviction calibration.
 *
 * Usage: npx tsx scripts/test-adani-power.ts
 */
import { db, schema, logger } from '@screener/shared';
import { eq } from 'drizzle-orm';
import { fetchPage } from '../packages/scraper/src/client/http-client.js';
import { parseCompanyPage } from '../packages/scraper/src/company-detail/index.js';
import { upsertCompany } from '../packages/scraper/src/storage/save-company.js';
import { saveSnapshot } from '../packages/scraper/src/storage/save-snapshot.js';
import {
  createScrapeRun,
  incrementRunCount,
  completeScrapeRun,
} from '../packages/scraper/src/storage/save-run.js';
import { SCRAPER_CONFIG } from '../packages/scraper/src/config.js';
import { loadRubric } from '../packages/analyzer/src/scoring/rubric-loader.js';
import { scoreAllCompanies } from '../packages/analyzer/src/scoring/engine.js';
import { runQualitativeAnalysis } from '../packages/analyzer/src/llm/qualitative-analyzer.js';

const TARGET_CODE = 'ADANIPOWER';

async function main() {
  // Step 1: Scrape Adani Power
  logger.info(`=== Scraping ${TARGET_CODE} from Screener.in ===`);
  const url = `${SCRAPER_CONFIG.baseUrl}${SCRAPER_CONFIG.companyPath}${TARGET_CODE}/consolidated/`;
  const html = await fetchPage(url);
  logger.info(`Got ${html.length} bytes of HTML`);

  const snapshot = parseCompanyPage(html);
  logger.info(`Parsed: PE=${snapshot.ratios.stockPe ?? 'N/A'}, MCap=${snapshot.ratios.marketCap ?? 'N/A'}, Peers=${snapshot.peerComparison?.length ?? 0}`);

  // Step 2: Save to DB in a new scrape run
  const runId = await createScrapeRun(1);
  const companyId = await upsertCompany(TARGET_CODE, snapshot.header);
  await saveSnapshot(companyId, runId, snapshot);
  await incrementRunCount(runId, 'successful');
  await completeScrapeRun(runId, 'completed');
  logger.info(`Saved to scrape run #${runId}`);

  // Step 3: Layer 1 scoring
  logger.info('\n=== Layer 1: Quantitative Scoring + Frameworks ===');
  const rubric = loadRubric();
  const { analyses, enrichedMap } = await scoreAllCompanies(runId, rubric);
  logger.info(`Scored ${analyses.length} companies`);

  const target = analyses.find((a) => a.screenerCode === TARGET_CODE);
  if (!target) {
    logger.error(`${TARGET_CODE} not found after scoring`);
    process.exit(1);
  }

  logger.info(`\n--- ${TARGET_CODE} Layer 1 ---`);
  logger.info(`  Rank: ${target.rank}/${analyses.length}`);
  logger.info(`  Composite Score: ${target.compositeScore}/100`);
  logger.info(`  Classification: ${target.classification}`);
  logger.info(`  Disqualified: ${target.disqualified}${target.disqualified ? ` (${target.disqualificationReasons.join(', ')})` : ''}`);
  logger.info(`  Conviction (quant): ${target.convictionLevel ?? 'N/A'}`);

  const fr = target.frameworkResults;
  if (fr) {
    logger.info(`  Buffett: ${fr.buffett.score}/100 (${fr.buffett.passCount}/${fr.buffett.totalCriteria})`);
    logger.info(`  Graham: ${fr.graham.score}/100 (${fr.graham.passCount}/${fr.graham.totalCriteria})`);
    logger.info(`  Lynch (${fr.lynch.category}): ${fr.lynch.categoryScore}/100`);
    logger.info(`  Pabrai Risk: ${fr.pabrai.riskScore}/100 (${fr.pabrai.overallRisk})`);
  }

  const enriched = enrichedMap.get(target.companyId);
  if (enriched) {
    logger.info(`  Peers available: ${enriched.peerComparison?.length ?? 0}`);
  }

  // Step 4: Layer 2 — full 4-agent LLM
  logger.info('\n=== Layer 2: 4-Agent LLM Analysis ===');
  await runQualitativeAnalysis([target], enrichedMap, {
    tier1Count: 1,
    tier2Count: 1,
  });

  // Step 5: Display results
  if (target.llmAnalysis) {
    logger.info('\n========== LLM ANALYSIS RESULTS ==========');
    logger.info(`  Final Score: ${target.finalScore} (was ${target.compositeScore}, adjustment: ${target.llmAnalysis.qualitativeAdjustment})`);
    logger.info(`  Confidence: ${target.llmAnalysis.confidence}`);
    logger.info(`  Conviction: ${target.convictionLevel ?? 'N/A'}`);
    logger.info(`\n  Narrative:\n    ${target.llmAnalysis.trendNarrative}`);
    logger.info(`\n  Reasoning:\n    ${target.llmAnalysis.reasoning}`);
    logger.info(`\n  Risks (${target.llmAnalysis.riskFactors?.length}):`);
    for (const r of target.llmAnalysis.riskFactors ?? []) {
      logger.info(`    - ${r}`);
    }
    logger.info(`\n  Catalysts (${target.llmAnalysis.catalysts?.length}):`);
    for (const c of target.llmAnalysis.catalysts ?? []) {
      logger.info(`    - ${c}`);
    }
    logger.info('==========================================');
  } else {
    logger.error('=== LLM ANALYSIS IS NULL — all agents failed to parse ===');
  }

  process.exit(0);
}

main().catch((err) => {
  logger.error(`Failed: ${(err as Error).message}`);
  process.exit(1);
});
