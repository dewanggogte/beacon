import { load } from 'cheerio';
import { logger } from '@screener/shared';
import { parseHeader, type CompanyHeader } from './parse-header.js';
import { parseKeyRatios, type KeyRatios } from './parse-ratios.js';
import { parseFinancialTable, parseProsConsSection } from './parse-table.js';

export interface CompanySnapshot {
  header: CompanyHeader;
  ratios: KeyRatios;
  pros: string[];
  cons: string[];
  quarterlyResults: Record<string, unknown>[] | null;
  annualPl: Record<string, unknown>[] | null;
  balanceSheet: Record<string, unknown>[] | null;
  cashFlow: Record<string, unknown>[] | null;
  historicalRatios: Record<string, unknown>[] | null;
  shareholding: Record<string, unknown>[] | null;
  peerComparison: Record<string, unknown>[] | null;
}

/**
 * Parse a complete company detail page HTML into a structured snapshot.
 */
export function parseCompanyPage(html: string): CompanySnapshot {
  const $ = load(html);

  const header = parseHeader($);
  const ratios = parseKeyRatios($);
  const { pros, cons } = parseProsConsSection($);

  // Parse all financial table sections by their anchor IDs
  const quarterlyResults = parseFinancialTable($, 'quarters');
  const annualPl = parseFinancialTable($, 'profit-loss');
  const balanceSheet = parseFinancialTable($, 'balance-sheet');
  const cashFlow = parseFinancialTable($, 'cash-flow');
  const historicalRatios = parseFinancialTable($, 'ratios');
  const shareholding = parseFinancialTable($, 'shareholding');
  const peerComparison = parseFinancialTable($, 'peers');

  // Log what we found
  const sections = {
    quarterly: !!quarterlyResults,
    pl: !!annualPl,
    balanceSheet: !!balanceSheet,
    cashFlow: !!cashFlow,
    ratios: !!historicalRatios,
    shareholding: !!shareholding,
    peers: !!peerComparison,
  };
  logger.debug(`Parsed ${header.name}: ${JSON.stringify(sections)}`);

  return {
    header,
    ratios,
    pros,
    cons,
    quarterlyResults,
    annualPl,
    balanceSheet,
    cashFlow,
    historicalRatios,
    shareholding,
    peerComparison,
  };
}
