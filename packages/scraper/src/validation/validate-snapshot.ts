import { logger } from '@screener/shared';
import type { CompanySnapshot } from '../company-detail/index.js';

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
}

/**
 * Validate a scraped snapshot for data quality.
 * Returns warnings but does not reject data (we store it either way).
 */
export function validateSnapshot(code: string, snapshot: CompanySnapshot): ValidationResult {
  const warnings: string[] = [];

  // Check that we have a company name
  if (!snapshot.header.name || snapshot.header.name === 'Unknown') {
    warnings.push('Missing company name');
  }

  // Check key ratios
  if (snapshot.ratios.marketCap === null) {
    warnings.push('Missing market cap');
  } else if (snapshot.ratios.marketCap < 0) {
    warnings.push(`Negative market cap: ${snapshot.ratios.marketCap}`);
  }

  if (snapshot.ratios.currentPrice === null) {
    warnings.push('Missing current price');
  }

  if (snapshot.ratios.stockPe !== null && (snapshot.ratios.stockPe < 0 || snapshot.ratios.stockPe > 10000)) {
    warnings.push(`Suspicious P/E: ${snapshot.ratios.stockPe}`);
  }

  // Check that we got at least some financial tables
  const tables = [
    { name: 'quarterly', data: snapshot.quarterlyResults },
    { name: 'P&L', data: snapshot.annualPl },
    { name: 'balance sheet', data: snapshot.balanceSheet },
    { name: 'cash flow', data: snapshot.cashFlow },
  ];

  const missingTables = tables.filter((t) => !t.data || t.data.length === 0);
  if (missingTables.length > 0) {
    warnings.push(`Missing tables: ${missingTables.map((t) => t.name).join(', ')}`);
  }

  if (warnings.length > 0) {
    logger.debug(`Validation warnings for ${code}: ${warnings.join('; ')}`);
  }

  return { valid: warnings.length <= 2, warnings };
}
