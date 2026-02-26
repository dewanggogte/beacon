import { logger } from '@screener/shared';
import { fetchCompanyList } from './company-list/fetch-company-list.js';
import { bulkUpsertCompanies } from './storage/save-company.js';
import { runScrape } from './pipeline/scrape-run.js';
import { fetchPage } from './client/http-client.js';
import { parseCompanyPage } from './company-detail/index.js';
import { validateSnapshot } from './validation/validate-snapshot.js';
import { SCRAPER_CONFIG } from './config.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0];
  const flags: Record<string, string | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (!flags['_positional']) {
      flags['_positional'] = arg;
    }
  }

  return { command, flags };
}

async function main() {
  const { command, flags } = parseArgs();

  switch (command) {
    case 'list': {
      const searchOnly = !!flags['search-only'];
      logger.info(`Fetching company list from Screener.in (${searchOnly ? 'search API only' : 'full discovery'})...`);
      const companies = await fetchCompanyList({ searchOnly });
      logger.info(`Storing ${companies.length} companies in database...`);
      await bulkUpsertCompanies(companies);
      logger.info('Done.');
      break;
    }

    case 'scrape': {
      const limit = flags['limit'] ? parseInt(flags['limit'] as string, 10) : undefined;
      const resume = !!flags['resume'];
      await runScrape({ limit, resume });
      break;
    }

    case 'test': {
      const code = (flags['_positional'] as string) || 'RELIANCE';
      logger.info(`Testing scrape of single company: ${code}`);

      const url = `${SCRAPER_CONFIG.baseUrl}${SCRAPER_CONFIG.companyPath}${code}/consolidated/`;
      logger.info(`Fetching ${url}...`);

      const html = await fetchPage(url);
      logger.info(`Got ${html.length} bytes of HTML`);

      const snapshot = parseCompanyPage(html);
      const validation = validateSnapshot(code, snapshot);

      console.log('\n=== Company Header ===');
      console.log(JSON.stringify(snapshot.header, null, 2));

      console.log('\n=== Key Ratios ===');
      console.log(JSON.stringify(snapshot.ratios, null, 2));

      console.log('\n=== Pros/Cons ===');
      console.log(`Pros: ${snapshot.pros.length} items`);
      snapshot.pros.forEach((p) => console.log(`  + ${p}`));
      console.log(`Cons: ${snapshot.cons.length} items`);
      snapshot.cons.forEach((c) => console.log(`  - ${c}`));

      console.log('\n=== Financial Tables ===');
      console.log(`Quarterly Results: ${snapshot.quarterlyResults?.length ?? 0} periods`);
      console.log(`Annual P&L: ${snapshot.annualPl?.length ?? 0} years`);
      console.log(`Balance Sheet: ${snapshot.balanceSheet?.length ?? 0} years`);
      console.log(`Cash Flow: ${snapshot.cashFlow?.length ?? 0} years`);
      console.log(`Historical Ratios: ${snapshot.historicalRatios?.length ?? 0} years`);
      console.log(`Shareholding: ${snapshot.shareholding?.length ?? 0} quarters`);
      console.log(`Peer Comparison: ${snapshot.peerComparison?.length ?? 0} peers`);

      console.log('\n=== Validation ===');
      console.log(`Valid: ${validation.valid}`);
      if (validation.warnings.length > 0) {
        console.log('Warnings:');
        validation.warnings.forEach((w) => console.log(`  ! ${w}`));
      }
      break;
    }

    default:
      console.log('Usage: scraper <list|scrape|test> [options]');
      console.log('');
      console.log('Commands:');
      console.log('  list                          Fetch and store all company codes');
      console.log('  scrape [--limit N] [--resume]  Run a scrape');
      console.log('  test [CODE]                   Scrape a single company (default: RELIANCE)');
  }

  process.exit(0);
}

main().catch((err) => {
  logger.error(`Fatal error: ${(err as Error).message}`);
  process.exit(1);
});
