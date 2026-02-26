import type { CheerioAPI } from 'cheerio';

export interface KeyRatios {
  marketCap: number | null;
  currentPrice: number | null;
  high52w: number | null;
  low52w: number | null;
  stockPe: number | null;
  bookValue: number | null;
  dividendYield: number | null;
  roce: number | null;
  roe: number | null;
  faceValue: number | null;
}

/**
 * Parse Indian number format: "19,10,048" -> 1910048
 * Also handles "1,408" -> 1408 and plain numbers
 */
function parseIndianNumber(text: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[₹,%\s]/g, '').replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export function parseKeyRatios($: CheerioAPI): KeyRatios {
  const ratios: KeyRatios = {
    marketCap: null,
    currentPrice: null,
    high52w: null,
    low52w: null,
    stockPe: null,
    bookValue: null,
    dividendYield: null,
    roce: null,
    roe: null,
    faceValue: null,
  };

  // Key ratios are in a list-like structure at the top of the page
  // Each ratio has a name and a value. We search for the name text and extract the value.
  const ratioElements = $('#top-ratios li, .company-ratios li, .ratios-table li, [class*="ratio"] li');

  // Fallback: search all text nodes
  const allText = $('body').text();

  const extractValue = (label: string): number | null => {
    // Try to find in structured elements first
    let value: number | null = null;

    ratioElements.each((_, el) => {
      const text = $(el).text();
      if (text.includes(label)) {
        const numberMatch = text.replace(label, '').match(/[\d,]+\.?\d*/);
        if (numberMatch) {
          value = parseIndianNumber(numberMatch[0]);
        }
      }
    });

    if (value !== null) return value;

    // Fallback: regex on full text
    const regex = new RegExp(`${label}[\\s₹]*([\\d,]+\\.?\\d*)`, 'i');
    const match = allText.match(regex);
    return match ? parseIndianNumber(match[1]!) : null;
  };

  ratios.marketCap = extractValue('Market Cap');
  ratios.currentPrice = extractValue('Current Price');
  ratios.stockPe = extractValue('Stock P/E');
  ratios.bookValue = extractValue('Book Value');
  ratios.dividendYield = extractValue('Dividend Yield');
  ratios.roce = extractValue('ROCE');
  ratios.roe = extractValue('ROE');
  ratios.faceValue = extractValue('Face Value');

  // High/Low is special: "1,612 / 1,115"
  const hlRegex = /High\s*\/\s*Low[₹\s]*([\d,]+\.?\d*)\s*\/\s*([\d,]+\.?\d*)/i;
  const hlMatch = allText.match(hlRegex);
  if (hlMatch) {
    ratios.high52w = parseIndianNumber(hlMatch[1]!);
    ratios.low52w = parseIndianNumber(hlMatch[2]!);
  }

  return ratios;
}
