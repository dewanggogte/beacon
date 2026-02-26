import type { CheerioAPI } from 'cheerio';

/**
 * Generic financial table parser.
 * Screener.in tables have:
 * - Column headers in <thead> (date labels like "Mar 2024", "Dec 2023")
 * - Row headers as first <td> in each <tbody><tr> (metric names like "Sales", "Expenses")
 * - Values as subsequent <td> elements
 *
 * Returns an array of objects, one per column (time period), with all row metrics as keys.
 */
export interface TableData {
  headers: string[];
  rows: Record<string, (string | null)[]>;
}

function parseIndianNumber(text: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[₹,%\s]/g, '').replace(/,/g, '').trim();
  if (cleaned === '' || cleaned === '--') return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export function parseFinancialTable($: CheerioAPI, sectionId: string): Record<string, unknown>[] | null {
  const section = $(`#${sectionId}`).closest('section');
  let table = section.find('table').first();

  if (section.length > 0) {
    table = section.find('table').first();
  } else {
    // Fallback: find the section heading and look for a table nearby
    const heading = $(`#${sectionId}`);
    table = heading.nextAll('table').first();
    if (table.length === 0) {
      table = heading.parent().find('table').first();
    }
  }

  if (table.length === 0) return null;

  // Extract column headers (time periods)
  const headers: string[] = [];
  table.find('thead th, thead td').each((i, el) => {
    if (i === 0) return; // Skip the first header (row label column)
    headers.push($(el).text().trim());
  });

  if (headers.length === 0) return null;

  // Extract rows
  const result: Record<string, unknown>[] = headers.map((h) => ({ period: h }));

  table.find('tbody tr').each((_, row) => {
    const cells = $(row).find('td, th');
    const metricName = cells.first().text().trim();

    if (!metricName) return;

    // Normalize key: strip trailing " +" suffix from Screener.in headers
    const normalizedName = metricName.replace(/\s*\+\s*$/, '').trim();

    cells.each((colIdx, cell) => {
      if (colIdx === 0) return; // Skip row label
      const dataIdx = colIdx - 1;
      if (dataIdx < result.length) {
        const cellText = $(cell).text().trim();
        result[dataIdx]![normalizedName] = parseIndianNumber(cellText) ?? (cellText || null);
      }
    });
  });

  // Reverse so newest period (e.g. "TTM", "Mar 2025") is at index 0
  return result.reverse();
}

/**
 * Parse the pros/cons section.
 * Structure: <div class="pros"> and <div class="cons"> with <ul><li> inside.
 */
export function parseProsConsSection($: CheerioAPI): { pros: string[]; cons: string[] } {
  const pros: string[] = [];
  const cons: string[] = [];

  // Screener.in uses <div class="pros"> and <div class="cons">
  $('.pros ul li, div.pros li').each((_, li) => {
    const text = $(li).text().trim();
    if (text) pros.push(text);
  });

  $('.cons ul li, div.cons li').each((_, li) => {
    const text = $(li).text().trim();
    if (text) cons.push(text);
  });

  return { pros, cons };
}
