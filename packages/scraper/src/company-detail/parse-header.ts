import type { CheerioAPI } from 'cheerio';

export interface CompanyHeader {
  name: string;
  bseCode: string | null;
  nseCode: string | null;
  sector: string | null;
  industry: string | null;
  website: string | null;
}

export function parseHeader($: CheerioAPI): CompanyHeader {
  // Company name from h1 - appears doubled, so take half
  let name = $('h1').first().text().trim();
  // Deduplicate doubled names (e.g., "Reliance Industries LtdReliance Industries Ltd")
  if (name.length > 4 && name.length % 2 === 0) {
    const half = name.substring(0, name.length / 2);
    if (name === half + half) {
      name = half;
    }
  }

  // BSE/NSE codes are in <a> tags with text "BSE: 500325" and "NSE: RELIANCE"
  const allText = $('body').text();
  const bseMatch = allText.match(/BSE:\s*(\d+)/);
  const nseMatch = allText.match(/NSE:\s*([A-Z0-9]+)/);

  // Sector/Industry: found in <p class="sub"> containing .icon-industry
  // Structure: <p class="sub"><span class="icon-industry"></span> <a>Energy</a> <a>Oil, Gas & Consumable Fuels</a> ...</p>
  let sector: string | null = null;
  let industry: string | null = null;
  const iconIndustry = $('.icon-industry');
  if (iconIndustry.length > 0) {
    const sectorParent = iconIndustry.closest('p, div');
    const links = sectorParent.find('a');
    if (links.length >= 1) {
      sector = links.first().text().trim() || null;
    }
    if (links.length >= 2) {
      industry = $(links.get(1)).text().trim() || null;
    }
  }

  // Website: link to company's own site (e.g., ril.com)
  let website: string | null = null;
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    if (href && href.startsWith('http') && !href.includes('screener.in') && !href.includes('bse') && !href.includes('nse')) {
      if (!website) {
        website = href;
      }
    }
  });

  return {
    name: name || 'Unknown',
    bseCode: bseMatch?.[1] ?? null,
    nseCode: nseMatch?.[1] ?? null,
    sector,
    industry,
    website,
  };
}
