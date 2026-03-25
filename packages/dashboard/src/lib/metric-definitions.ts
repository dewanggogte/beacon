export interface MetricDefinition {
  key: string;
  fullName: string;
  explanation: string;
  goodRange: string;
  unit: string; // '×', '%', '₹ Cr', '/9', '/100', ''
  higherIsBetter: boolean;
}

export const metricDefinitions: Record<string, MetricDefinition> = {
  pe: {
    key: 'pe',
    fullName: 'Price-to-Earnings Ratio',
    explanation: 'How much investors pay per rupee of earnings. Lower = cheaper.',
    goodRange: '<20 (value), 20-30 (fair), >30 (expensive)',
    unit: '×',
    higherIsBetter: false,
  },
  pb: {
    key: 'pb',
    fullName: 'Price-to-Book Ratio',
    explanation: 'Price relative to book value. Lower may indicate undervaluation.',
    goodRange: '<2 (value), 2-4 (fair), >4 (expensive)',
    unit: '×',
    higherIsBetter: false,
  },
  roce: {
    key: 'roce',
    fullName: 'Return on Capital Employed',
    explanation: 'Profit generated per rupee of capital used. Higher = more efficient.',
    goodRange: '>20% (excellent), 15-20% (good), 10-15% (acceptable), <10% (poor)',
    unit: '%',
    higherIsBetter: true,
  },
  roe: {
    key: 'roe',
    fullName: 'Return on Equity',
    explanation: 'Profit generated per rupee of shareholder equity.',
    goodRange: '>20% (excellent), 15-20% (good), <15% (weak)',
    unit: '%',
    higherIsBetter: true,
  },
  de: {
    key: 'de',
    fullName: 'Debt-to-Equity Ratio',
    explanation: 'Total debt relative to equity. Lower = less leveraged.',
    goodRange: '<0.5 (low), 0.5-1 (moderate), >1 (high)',
    unit: '',
    higherIsBetter: false,
  },
  dividendYield: {
    key: 'dividendYield',
    fullName: 'Dividend Yield',
    explanation: 'Annual dividends as % of stock price.',
    goodRange: '>3% (high), 1-3% (moderate), <1% (low)',
    unit: '%',
    higherIsBetter: true,
  },
  marketCap: {
    key: 'marketCap',
    fullName: 'Market Capitalization',
    explanation: 'Total market value of the company.',
    goodRange: '>50,000 Cr (large cap), 10,000-50,000 (mid), <10,000 (small)',
    unit: '₹ Cr',
    higherIsBetter: true, // contextual
  },
  piotroski: {
    key: 'piotroski',
    fullName: 'Piotroski F-Score',
    explanation: '9-point financial strength test. Higher = healthier fundamentals.',
    goodRange: '7-9 (strong), 4-6 (average), 0-3 (weak)',
    unit: '/9',
    higherIsBetter: true,
  },
  altmanZ: {
    key: 'altmanZ',
    fullName: 'Altman Z-Score',
    explanation: 'Bankruptcy risk predictor. Higher = safer.',
    goodRange: '>2.99 (safe), 1.81-2.99 (grey zone), <1.81 (distress)',
    unit: '',
    higherIsBetter: true,
  },
  beneishM: {
    key: 'beneishM',
    fullName: 'Beneish M-Score',
    explanation: 'Earnings manipulation detector. More negative = less likely manipulated.',
    goodRange: '<-2.22 (unlikely manipulation), >-2.22 (possible)',
    unit: '',
    higherIsBetter: false,
  },
  icr: {
    key: 'icr',
    fullName: 'Interest Coverage Ratio',
    explanation: 'How easily the company can pay interest on debt.',
    goodRange: '>3× (comfortable), 1.5-3× (adequate), <1.5× (risky)',
    unit: '×',
    higherIsBetter: true,
  },
  opm: {
    key: 'opm',
    fullName: 'Operating Profit Margin',
    explanation: 'Operating profit as % of revenue. Sector-dependent.',
    goodRange: 'Sector-dependent. Higher is better.',
    unit: '%',
    higherIsBetter: true,
  },
  npm: {
    key: 'npm',
    fullName: 'Net Profit Margin',
    explanation: 'Net profit as % of revenue. Sector-dependent.',
    goodRange: 'Sector-dependent. Higher is better.',
    unit: '%',
    higherIsBetter: true,
  },
  revenueCagr: {
    key: 'revenueCagr',
    fullName: 'Revenue CAGR',
    explanation: 'Compound annual growth rate of revenue.',
    goodRange: '>15% (fast growth), 10-15% (moderate), <10% (slow)',
    unit: '%',
    higherIsBetter: true,
  },
  profitCagr: {
    key: 'profitCagr',
    fullName: 'Profit CAGR',
    explanation: 'Compound annual growth rate of net profit.',
    goodRange: '>15% (fast growth), 10-15% (moderate), <10% (slow)',
    unit: '%',
    higherIsBetter: true,
  },
  promoterHolding: {
    key: 'promoterHolding',
    fullName: 'Promoter Holding',
    explanation: '% of shares held by promoters/founders.',
    goodRange: '>50% (strong), 30-50% (moderate), <30% (low)',
    unit: '%',
    higherIsBetter: true,
  },
  pledgePercent: {
    key: 'pledgePercent',
    fullName: 'Promoter Pledge',
    explanation: '% of promoter shares pledged as collateral.',
    goodRange: '0% (ideal), <10% (acceptable), >10% (concerning)',
    unit: '%',
    higherIsBetter: false,
  },
  ocfPat: {
    key: 'ocfPat',
    fullName: 'Operating Cash Flow / Profit After Tax',
    explanation: 'Cash flow quality. >1 means cash backs up reported profits.',
    goodRange: '>1× (good), 0.5-1× (acceptable), <0.5× (poor)',
    unit: '×',
    higherIsBetter: true,
  },
  evEbitda: {
    key: 'evEbitda',
    fullName: 'Enterprise Value / EBITDA',
    explanation: 'Valuation ratio accounting for debt. Lower = cheaper.',
    goodRange: '<10 (cheap), 10-15 (fair), >15 (expensive)',
    unit: '×',
    higherIsBetter: false,
  },
  // Dimension scores
  valuation: {
    key: 'valuation',
    fullName: 'Valuation Score',
    explanation: 'Composite score for how cheaply the stock is priced relative to fundamentals. Weight: 25%.',
    goodRange: '>70 (cheap), 40-70 (fair), <40 (expensive)',
    unit: '/100',
    higherIsBetter: true,
  },
  quality: {
    key: 'quality',
    fullName: 'Quality Score',
    explanation: 'Composite score for earnings quality, profitability, and consistency. Weight: 30%.',
    goodRange: '>70 (high quality), 40-70 (average), <40 (low)',
    unit: '/100',
    higherIsBetter: true,
  },
  governance: {
    key: 'governance',
    fullName: 'Governance Score',
    explanation: 'Composite score for promoter behavior, pledging, and institutional confidence. Weight: 20%.',
    goodRange: '>70 (strong), 40-70 (average), <40 (weak)',
    unit: '/100',
    higherIsBetter: true,
  },
  safety: {
    key: 'safety',
    fullName: 'Safety Score',
    explanation: 'Composite score for balance sheet strength and financial health. Weight: 15%.',
    goodRange: '>70 (safe), 40-70 (average), <40 (risky)',
    unit: '/100',
    higherIsBetter: true,
  },
  momentum: {
    key: 'momentum',
    fullName: 'Momentum Score',
    explanation: 'Composite score for price and earnings momentum trends. Weight: 10%.',
    goodRange: '>70 (strong momentum), 40-70 (average), <40 (weak)',
    unit: '/100',
    higherIsBetter: true,
  },
};

// Helper to render a metric value with its unit
export function formatMetric(key: string, value: number | null | undefined): string {
  if (value == null) return '—';
  const def = metricDefinitions[key];
  if (!def) return String(value);

  const formatted = key === 'marketCap'
    ? formatIndianNumber(value)
    : Number.isInteger(value) ? String(value) : value.toFixed(1);

  switch (def.unit) {
    case '×': return `${formatted}×`;
    case '%': return `${formatted}%`;
    case '₹ Cr': return `₹${formatted} Cr`;
    case '/9': return `${formatted}/9`;
    case '/100': return `${formatted}/100`;
    default: return formatted;
  }
}

function formatIndianNumber(num: number): string {
  if (num >= 100000) return `${(num / 100000).toFixed(1)}L`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toFixed(0);
}
