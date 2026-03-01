import { logger } from '@screener/shared';
import { runAnalysis } from './pipeline/analysis-run.js';
import { loadRubric } from './scoring/rubric-loader.js';
import { generateWeeklyReport } from './output/report-generator.js';

const command = process.argv[2];

const flags = new Set(process.argv.slice(3));
const getFlag = (name: string) => flags.has(`--${name}`);
const getFlagValue = (name: string) => {
  const prefix = `--${name}=`;
  for (const arg of process.argv.slice(3)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return undefined;
};

switch (command) {
  case 'analyze': {
    const scrapeRunId = getFlagValue('run') ? Number(getFlagValue('run')) : undefined;
    const llmModel = getFlagValue('model');

    runAnalysis({
      scrapeRunId,
      skipLlm: getFlag('skip-llm'),
      llmOnly: getFlag('llm-only'),
      skipReport: getFlag('skip-report'),
      llmModel,
    })
      .then(() => process.exit(0))
      .catch((err) => {
        logger.error(`Analysis failed: ${(err as Error).message}`);
        process.exit(1);
      });
    break;
  }

  case 'backtest': {
    const runId = getFlagValue('run') ? Number(getFlagValue('run')) : undefined;
    const evalDate = getFlagValue('eval-date');
    const topN = getFlagValue('top') ? Number(getFlagValue('top')) : 20;
    const days = getFlagValue('days') ? Number(getFlagValue('days')) : 180;

    if (!runId || !evalDate) {
      console.log('Usage: analyzer backtest --run=<id> --eval-date=YYYY-MM-DD [--top=20] [--days=180]');
      process.exit(1);
    }

    import('./backtest/backtest-runner.js').then(({ runBacktest }) => {
      runBacktest({
        scrapeRunId: runId,
        evaluationDate: evalDate,
        holdingPeriodDays: days,
        topN,
      })
        .then((perf) => {
          console.log('\n=== Backtest Results ===');
          console.log(`Picks: ${perf.pricedPicks}/${perf.totalPicks}`);
          console.log(`Avg Return: ${perf.avgReturn.toFixed(1)}%`);
          console.log(`Median Return: ${perf.medianReturn.toFixed(1)}%`);
          console.log(`Hit Rate: ${(perf.hitRate * 100).toFixed(0)}%`);
          console.log(`Sharpe: ${perf.sharpeRatio?.toFixed(2) ?? 'N/A'}`);
          console.log(`Best: ${perf.maxReturn.toFixed(1)}% | Worst: ${perf.minReturn.toFixed(1)}%`);
          console.log('\nTop/Bottom Picks:');
          const sorted = [...perf.picks].sort((a, b) => b.returnPct - a.returnPct);
          for (const p of sorted.slice(0, 5)) {
            console.log(`  +${p.returnPct.toFixed(1)}% ${p.screenerCode} (${p.entryPrice} → ${p.exitPrice})`);
          }
          console.log('  ...');
          for (const p of sorted.slice(-3)) {
            console.log(`  ${p.returnPct.toFixed(1)}% ${p.screenerCode} (${p.entryPrice} → ${p.exitPrice})`);
          }
          process.exit(0);
        })
        .catch((err) => {
          logger.error(`Backtest failed: ${(err as Error).message}`);
          process.exit(1);
        });
    });
    break;
  }

  case 'walk-forward': {
    const from = getFlagValue('from');
    const to = getFlagValue('to');
    const topN = getFlagValue('top') ? Number(getFlagValue('top')) : 20;
    const days = getFlagValue('days') ? Number(getFlagValue('days')) : 180;

    if (!from || !to) {
      console.log('Usage: analyzer walk-forward --from=YYYY-MM-DD --to=YYYY-MM-DD [--top=20] [--days=180]');
      process.exit(1);
    }

    import('./backtest/walk-forward.js').then(({ walkForward }) => {
      walkForward({
        fromDate: from,
        toDate: to,
        holdingPeriodDays: days,
        topN,
      })
        .then((result) => {
          console.log('\n=== Walk-Forward Results ===');
          console.log(`Periods: ${result.aggregate.totalPeriods}`);
          console.log(`Avg Return: ${result.aggregate.avgReturn.toFixed(1)}%`);
          console.log(`Avg Hit Rate: ${(result.aggregate.avgHitRate * 100).toFixed(0)}%`);
          console.log(`Avg Sharpe: ${result.aggregate.avgSharpe?.toFixed(2) ?? 'N/A'}`);
          if (result.aggregate.bestPeriod) {
            console.log(`Best Period: ${result.aggregate.bestPeriod.date} (${result.aggregate.bestPeriod.return.toFixed(1)}%)`);
          }
          if (result.aggregate.worstPeriod) {
            console.log(`Worst Period: ${result.aggregate.worstPeriod.date} (${result.aggregate.worstPeriod.return.toFixed(1)}%)`);
          }
          console.log('\nPer-Period:');
          for (const p of result.periods) {
            console.log(`  ${p.analysisDate} → ${p.evaluationDate}: ${p.performance.avgReturn.toFixed(1)}% (${p.performance.pricedPicks} picks, hit ${(p.performance.hitRate * 100).toFixed(0)}%)`);
          }
          process.exit(0);
        })
        .catch((err) => {
          logger.error(`Walk-forward failed: ${(err as Error).message}`);
          process.exit(1);
        });
    });
    break;
  }

  case 'macro': {
    const subCmd = process.argv[3];

    if (subCmd === 'add') {
      // Parse macro data from flags
      const snapshotDate = getFlagValue('date') ?? new Date().toISOString().slice(0, 10);
      const macroData: Record<string, number | undefined> = {
        repoRate: getFlagValue('repo') ? Number(getFlagValue('repo')) : undefined,
        cpi: getFlagValue('cpi') ? Number(getFlagValue('cpi')) : undefined,
        gdpGrowth: getFlagValue('gdp') ? Number(getFlagValue('gdp')) : undefined,
        niftyPe: getFlagValue('nifty-pe') ? Number(getFlagValue('nifty-pe')) : undefined,
        indiaVix: getFlagValue('vix') ? Number(getFlagValue('vix')) : undefined,
        usdInr: getFlagValue('usd-inr') ? Number(getFlagValue('usd-inr')) : undefined,
        bondYield10y: getFlagValue('bond') ? Number(getFlagValue('bond')) : undefined,
      };

      import('./macro/macro-loader.js').then(({ insertMacroSnapshot }) => {
        insertMacroSnapshot({
          snapshotDate,
          ...macroData,
          notes: getFlagValue('notes'),
        })
          .then(() => process.exit(0))
          .catch((err) => {
            logger.error(`Failed: ${(err as Error).message}`);
            process.exit(1);
          });
      });
    } else if (subCmd === 'regime') {
      import('./macro/macro-loader.js').then(({ loadCurrentRegime }) => {
        loadCurrentRegime()
          .then((result) => {
            if (!result) {
              console.log('No macro data available. Add a snapshot first.');
            } else {
              console.log(`\nRegime: ${result.regime.toUpperCase()} (${result.confidence} confidence)`);
              console.log('\nSignals:');
              for (const s of result.signals) {
                console.log(`  ${s}`);
              }

              import('./macro/regime-classifier.js').then(({ getRegimeAdjustments }) => {
                const adj = getRegimeAdjustments(result.regime);
                console.log(`\nAdjustments: ${adj.description}`);
                console.log(`  Growth: ${adj.growthMultiplier}x`);
                console.log(`  Value: ${adj.valueMultiplier}x`);
                console.log(`  Cyclical: ${adj.cyclicalMultiplier}x`);
                console.log(`  Turnaround: ${adj.turnaroundMultiplier}x`);
                console.log(`  Safety bonus: +${adj.safetyBonus}`);
                process.exit(0);
              });
            }
          })
          .catch((err) => {
            logger.error(`Failed: ${(err as Error).message}`);
            process.exit(1);
          });
      });
    } else {
      console.log('Usage:');
      console.log('  analyzer macro add --date=YYYY-MM-DD --repo=6.5 --cpi=4.5 --gdp=6.8 --nifty-pe=22 --vix=14 --usd-inr=83.5 --bond=7.1');
      console.log('  analyzer macro regime                # Show current regime classification');
    }
    break;
  }

  case 'rubric': {
    try {
      const rubric = loadRubric();
      const dims = rubric.scoringDimensions;
      console.log(`Rubric v${rubric.version} (${rubric.lastUpdated})`);
      console.log(`\nDimensions:`);
      for (const [name, dim] of Object.entries(dims)) {
        const metricCount = Object.keys(dim.metrics).length;
        console.log(`  ${name}: weight=${dim.weight}, metrics=${metricCount}`);
      }
      console.log(`\nDisqualifiers (${rubric.automaticDisqualifiers.length}):`);
      for (const d of rubric.automaticDisqualifiers) {
        console.log(`  - ${d}`);
      }
      console.log(`\nThresholds: ${JSON.stringify(rubric.classificationThresholds)}`);
    } catch (err) {
      logger.error(`Failed to load rubric: ${(err as Error).message}`);
    }
    break;
  }

  case 'report':
    logger.info('Generating report from saved results...');
    logger.warn('Standalone report generation not yet implemented — run analyze instead');
    break;

  default:
    console.log('Usage: analyzer <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  analyze              Run full analysis pipeline');
    console.log('  backtest             Run backtest on a past analysis');
    console.log('  walk-forward         Rolling window backtest');
    console.log('  macro add            Add macro snapshot data');
    console.log('  macro regime         Show current macro regime');
    console.log('  rubric               Validate and display scoring rubric');
    console.log('  report               Generate markdown reports');
    console.log('');
    console.log('Options (analyze):');
    console.log('  --skip-llm           Skip LLM qualitative analysis (Layer 1 only)');
    console.log('  --llm-only           Only run LLM on existing Layer 1 results');
    console.log('  --skip-report        Skip report generation');
    console.log('  --run=<id>           Analyze a specific scrape run');
    console.log('  --model=<name>       LLM model name');
    console.log('');
    console.log('Options (backtest):');
    console.log('  --run=<id>           Scrape run to backtest');
    console.log('  --eval-date=DATE     Evaluation date (YYYY-MM-DD)');
    console.log('  --top=<n>            Top N picks (default: 20)');
    console.log('  --days=<n>           Holding period in days (default: 180)');
    console.log('');
    console.log('Options (walk-forward):');
    console.log('  --from=DATE          Start date (YYYY-MM-DD)');
    console.log('  --to=DATE            End date (YYYY-MM-DD)');
    console.log('  --top=<n>            Top N picks per period (default: 20)');
    console.log('  --days=<n>           Holding period in days (default: 180)');
    console.log('');
    console.log('Environment variables (LLM):');
    console.log('  LLM_PROVIDER         "anthropic" (default) or "local"');
    console.log('  LOCAL_LLM_URL        Base URL for local model (default: http://192.168.0.42:8000)');
    console.log('  LOCAL_LLM_MODEL      Model name for local endpoint (default: qwen3.5-35b-a3b)');
    console.log('  LOCAL_LLM_TEMPERATURE Temperature for local model (default: 0.7, Qwen recommends 0.7)');
}
