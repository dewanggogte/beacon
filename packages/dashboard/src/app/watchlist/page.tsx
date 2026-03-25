'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWatchlist } from '../../components/watchlist-provider.js';
import { Skeleton } from '../../components/skeleton.js';
import { formatMetric } from '../../lib/metric-definitions.js';

// Return type of getWatchlistCompanies
type WatchlistCompany = {
  companyId: number;
  companyName: string;
  screenerCode: string;
  sector: string | null;
  compositeScore: number | null;
  finalScore: number | null;
  classification: string | null;
  rankOverall: number | null;
  rankInSector: number | null;
  valuationScore: number | null;
  qualityScore: number | null;
  governanceScore: number | null;
  safetyScore: number | null;
  momentumScore: number | null;
  scoreChange: number | null;
  classificationChange: string | null;
  disqualified: boolean | null;
  buffettScore: number | null;
  grahamScore: number | null;
  pabraiRiskScore: number | null;
  lynchCategoryScore: number | null;
  lynchClassification: string | null;
  convictionLevel: string | null;
  classificationSource: string | null;
  quantClassification: string | null;
  pe: number | null;
  roce: number | null;
  dividendYield: number | null;
  marketCap: number | null;
  piotroskiFScore: number | null;
  llmSynthesis: unknown;
};

// ── Classification helpers ───────────────────────────────────────────────────

const CLASSIFICATION_LABELS: Record<string, string> = {
  strong_long: 'Strong Long',
  potential_long: 'Potential Long',
  neutral: 'Neutral',
  potential_short: 'Potential Short',
  strong_avoid: 'Strong Avoid',
};

const CLASSIFICATION_COLORS: Record<string, string> = {
  strong_long: 'text-accent-green',
  potential_long: 'text-accent-cyan',
  neutral: 'text-text-secondary dark:text-dark-text-secondary',
  potential_short: 'text-accent-amber',
  strong_avoid: 'text-accent-red',
};

const CONVICTION_COLORS: Record<string, string> = {
  high: 'text-accent-green',
  medium: 'text-accent-cyan',
  low: 'text-text-secondary dark:text-dark-text-secondary',
  none: 'text-text-muted dark:text-dark-text-muted',
};

const LYNCH_LABELS: Record<string, string> = {
  fast_grower: 'Fast Grower',
  stalwart: 'Stalwart',
  slow_grower: 'Slow Grower',
  cyclical: 'Cyclical',
  turnaround: 'Turnaround',
  asset_play: 'Asset Play',
};

// ── Cell color coding ────────────────────────────────────────────────────────

type CellColor = 'green' | 'amber' | 'red' | 'neutral';

function scoreColor(value: number | null): CellColor {
  if (value == null) return 'neutral';
  if (value >= 65) return 'green';
  if (value >= 40) return 'amber';
  return 'red';
}

function peColor(value: number | null): CellColor {
  if (value == null) return 'neutral';
  if (value < 20) return 'green';
  if (value <= 30) return 'amber';
  return 'red';
}

function roceColor(value: number | null): CellColor {
  if (value == null) return 'neutral';
  if (value >= 20) return 'green';
  if (value >= 10) return 'amber';
  return 'red';
}

function divYieldColor(value: number | null): CellColor {
  if (value == null) return 'neutral';
  if (value >= 3) return 'green';
  if (value >= 1) return 'amber';
  return 'neutral';
}

function piotroskiColor(value: number | null): CellColor {
  if (value == null) return 'neutral';
  if (value >= 7) return 'green';
  if (value >= 4) return 'amber';
  return 'red';
}

function convictionColor(value: string | null): CellColor {
  if (value === 'high') return 'green';
  if (value === 'medium') return 'amber';
  return 'neutral';
}

function classificationColor(value: string | null): CellColor {
  if (value === 'strong_long' || value === 'potential_long') return 'green';
  if (value === 'neutral') return 'neutral';
  if (value === 'potential_short') return 'amber';
  if (value === 'strong_avoid') return 'red';
  return 'neutral';
}

const COLOR_CLASSES: Record<CellColor, string> = {
  green: 'bg-accent-green/10 text-accent-green',
  amber: 'bg-accent-amber/10 text-accent-amber',
  red: 'bg-accent-red/10 text-accent-red',
  neutral: '',
};

// ── LLM synthesis parser ─────────────────────────────────────────────────────

function parseFirstSentence(llmSynthesis: unknown): string | null {
  if (!llmSynthesis) return null;
  let synthesis: Record<string, unknown> | null = null;

  if (typeof llmSynthesis === 'string') {
    try {
      synthesis = JSON.parse(llmSynthesis) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof llmSynthesis === 'object') {
    synthesis = llmSynthesis as Record<string, unknown>;
  }

  if (!synthesis) return null;

  // Look for common LLM synthesis fields
  const text =
    (synthesis['summary'] as string | undefined) ||
    (synthesis['thesis'] as string | undefined) ||
    (synthesis['narrative'] as string | undefined) ||
    (synthesis['synthesis'] as string | undefined) ||
    (synthesis['recommendation'] as string | undefined);

  if (!text) return null;
  // Return first sentence
  const match = text.match(/^[^.!?]+[.!?]/);
  return match ? match[0].trim() : text.slice(0, 120);
}

// ── Metric rows definition ───────────────────────────────────────────────────

interface MetricRow {
  key: string;
  label: string;
  getValue: (c: WatchlistCompany) => string;
  getColor: (c: WatchlistCompany) => CellColor;
}

const METRIC_ROWS: MetricRow[] = [
  {
    key: 'finalScore',
    label: 'Final Score',
    getValue: (c) => c.finalScore != null ? `${c.finalScore}/100` : '—',
    getColor: (c) => scoreColor(c.finalScore),
  },
  {
    key: 'classification',
    label: 'Classification',
    getValue: (c) => c.classification ? (CLASSIFICATION_LABELS[c.classification] ?? c.classification) : '—',
    getColor: (c) => classificationColor(c.classification),
  },
  {
    key: 'pe',
    label: 'P/E',
    getValue: (c) => formatMetric('pe', c.pe),
    getColor: (c) => peColor(c.pe),
  },
  {
    key: 'roce',
    label: 'ROCE',
    getValue: (c) => formatMetric('roce', c.roce),
    getColor: (c) => roceColor(c.roce),
  },
  {
    key: 'dividendYield',
    label: 'Dividend Yield',
    getValue: (c) => formatMetric('dividendYield', c.dividendYield),
    getColor: (c) => divYieldColor(c.dividendYield),
  },
  {
    key: 'marketCap',
    label: 'Market Cap',
    getValue: (c) => formatMetric('marketCap', c.marketCap),
    getColor: () => 'neutral',
  },
  {
    key: 'piotroskiFScore',
    label: 'Piotroski F-Score',
    getValue: (c) => c.piotroskiFScore != null ? `${c.piotroskiFScore}/9` : '—',
    getColor: (c) => piotroskiColor(c.piotroskiFScore),
  },
  {
    key: 'convictionLevel',
    label: 'Conviction Level',
    getValue: (c) => c.convictionLevel ? c.convictionLevel.charAt(0).toUpperCase() + c.convictionLevel.slice(1) : '—',
    getColor: (c) => convictionColor(c.convictionLevel),
  },
  {
    key: 'lynchClassification',
    label: 'Lynch Category',
    getValue: (c) => c.lynchClassification ? (LYNCH_LABELS[c.lynchClassification] ?? c.lynchClassification) : '—',
    getColor: () => 'neutral',
  },
];

// ── Main Page ────────────────────────────────────────────────────────────────

export default function WatchlistPage() {
  const { watchlist, toggle, clear } = useWatchlist();
  const [companies, setCompanies] = useState<WatchlistCompany[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (watchlist.length === 0) {
      setCompanies([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codes: watchlist }),
    })
      .then((r) => r.json())
      .then((data: WatchlistCompany[]) => {
        if (!cancelled) {
          setCompanies(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [watchlist]);

  // ── Empty state ──────────────────────────────────────────────────────────
  if (watchlist.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-24">
        <div className="text-5xl mb-6 text-text-muted dark:text-dark-text-muted">☆</div>
        <h1 className="text-2xl font-semibold text-text-primary dark:text-dark-text-primary mb-3">
          Your watchlist is empty
        </h1>
        <p className="text-text-secondary dark:text-dark-text-secondary mb-8">
          Star companies from{' '}
          <Link href="/rankings" className="text-accent-cyan hover:underline">Rankings</Link>
          {' '}or{' '}
          <Link href="/explore" className="text-accent-cyan hover:underline">Explore</Link>
          {' '}to compare them here
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/rankings"
            className="px-4 py-2 rounded border border-border dark:border-dark-border text-text-secondary dark:text-dark-text-secondary hover:text-text-primary dark:hover:text-dark-text-primary hover:border-text-muted transition-colors text-sm"
          >
            Go to Rankings
          </Link>
          <Link
            href="/explore"
            className="px-4 py-2 rounded border border-border dark:border-dark-border text-text-secondary dark:text-dark-text-secondary hover:text-text-primary dark:hover:text-dark-text-primary hover:border-text-muted transition-colors text-sm"
          >
            Go to Explore
          </Link>
        </div>
      </div>
    );
  }

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary dark:text-dark-text-primary mb-1">Watchlist</h1>
            <p className="text-text-muted dark:text-dark-text-muted text-sm">{watchlist.length} companies</p>
          </div>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} variant="table-row" />
          ))}
        </div>
      </div>
    );
  }

  // Build a map for quick lookup by code
  const companyMap = new Map(companies.map((c) => [c.screenerCode, c]));

  // Separate found vs stale (in watchlist but not returned from DB)
  const foundCompanies = companies; // ordered by finalScore
  const staleCodes = watchlist.filter((code) => !companyMap.has(code));

  // ── Populated state ──────────────────────────────────────────────────────
  const allColumns = [...foundCompanies.map((c) => c.screenerCode), ...staleCodes];
  const needsScroll = allColumns.length > 4;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary dark:text-dark-text-primary mb-1">Watchlist</h1>
          <p className="text-text-muted dark:text-dark-text-muted text-sm">
            {watchlist.length} {watchlist.length === 1 ? 'company' : 'companies'} — side-by-side comparison
          </p>
        </div>
        <button
          onClick={clear}
          className="text-sm text-text-muted dark:text-dark-text-muted hover:text-accent-red transition-colors"
        >
          Clear all
        </button>
      </div>

      {/* Comparison table */}
      <div className={needsScroll ? 'overflow-x-auto' : ''}>
        <table className="w-full border-collapse text-sm" style={needsScroll ? { minWidth: `${allColumns.length * 180 + 180}px` } : {}}>
          <colgroup>
            {/* Metric label column */}
            <col style={{ width: '180px', minWidth: '140px' }} />
            {/* Company columns */}
            {allColumns.map((code) => (
              <col key={code} style={{ width: '180px', minWidth: '160px' }} />
            ))}
          </colgroup>

          <thead>
            {/* Company header row */}
            <tr className="border-b border-border dark:border-dark-border">
              <th
                className={`py-3 px-4 text-left text-xs uppercase tracking-wider text-text-muted dark:text-dark-text-muted font-medium bg-bg-primary dark:bg-dark-bg-primary ${needsScroll ? 'sticky left-0 z-10' : ''}`}
              >
                Metric
              </th>
              {foundCompanies.map((c) => (
                <th
                  key={c.screenerCode}
                  className="py-3 px-4 text-left align-top"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link
                        href={`/company/${c.screenerCode}`}
                        className="font-semibold text-text-primary dark:text-dark-text-primary hover:text-accent-cyan transition-colors block leading-tight"
                      >
                        {c.companyName}
                      </Link>
                      <span className="text-xs text-text-muted dark:text-dark-text-muted font-normal">
                        {c.screenerCode}
                      </span>
                      {c.sector && (
                        <span className="text-xs text-text-muted dark:text-dark-text-muted font-normal block">
                          {c.sector}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => toggle(c.screenerCode)}
                      title={`Remove ${c.screenerCode} from watchlist`}
                      className="text-accent-amber hover:text-text-muted dark:hover:text-dark-text-muted transition-colors shrink-0 text-base"
                    >
                      ★
                    </button>
                  </div>
                </th>
              ))}
              {staleCodes.map((code) => (
                <th key={code} className="py-3 px-4 text-left align-top opacity-50">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-semibold text-text-muted dark:text-dark-text-muted block leading-tight">
                        {code}
                      </span>
                      <span className="text-xs text-text-muted dark:text-dark-text-muted">No data</span>
                    </div>
                    <button
                      onClick={() => toggle(code)}
                      title={`Remove ${code} from watchlist`}
                      className="text-accent-amber hover:text-text-muted dark:hover:text-dark-text-muted transition-colors shrink-0 text-base"
                    >
                      ★
                    </button>
                  </div>
                </th>
              ))}
            </tr>

            {/* Narrative row (first sentence of LLM synthesis) */}
            {foundCompanies.some((c) => parseFirstSentence(c.llmSynthesis)) && (
              <tr className="border-b border-border dark:border-dark-border bg-bg-secondary/50 dark:bg-dark-bg-secondary/30">
                <td
                  className={`py-2 px-4 text-xs text-text-muted dark:text-dark-text-muted font-medium uppercase tracking-wider bg-bg-secondary/50 dark:bg-dark-bg-secondary/30 ${needsScroll ? 'sticky left-0 z-10' : ''}`}
                >
                  Thesis
                </td>
                {foundCompanies.map((c) => {
                  const sentence = parseFirstSentence(c.llmSynthesis);
                  return (
                    <td key={c.screenerCode} className="py-2 px-4 text-xs text-text-secondary dark:text-dark-text-secondary italic leading-snug">
                      {sentence ?? <span className="text-text-muted dark:text-dark-text-muted not-italic">—</span>}
                    </td>
                  );
                })}
                {staleCodes.map((code) => (
                  <td key={code} className="py-2 px-4 text-xs text-text-muted dark:text-dark-text-muted italic">
                    Data unavailable
                  </td>
                ))}
              </tr>
            )}
          </thead>

          <tbody>
            {METRIC_ROWS.map((row, rowIdx) => (
              <tr
                key={row.key}
                className={`border-b border-border dark:border-dark-border ${rowIdx % 2 === 0 ? '' : 'bg-bg-secondary/30 dark:bg-dark-bg-secondary/20'}`}
              >
                {/* Metric label — sticky in scroll mode */}
                <td
                  className={`py-3 px-4 text-xs text-text-muted dark:text-dark-text-muted font-medium uppercase tracking-wider whitespace-nowrap ${needsScroll ? 'sticky left-0 z-10' : ''} ${rowIdx % 2 === 0 ? 'bg-bg-primary dark:bg-dark-bg-primary' : 'bg-bg-secondary/30 dark:bg-dark-bg-secondary/20'}`}
                >
                  {row.label}
                </td>

                {/* Found companies */}
                {foundCompanies.map((c) => {
                  const colorKey = row.getColor(c);
                  const colorClass = colorKey !== 'neutral' ? COLOR_CLASSES[colorKey] : '';
                  return (
                    <td key={c.screenerCode} className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colorClass || 'text-text-primary dark:text-dark-text-primary'}`}
                      >
                        {row.getValue(c)}
                      </span>
                    </td>
                  );
                })}

                {/* Stale companies — greyed out */}
                {staleCodes.map((code) => (
                  <td key={code} className="py-3 px-4 opacity-40">
                    <span className="text-text-muted dark:text-dark-text-muted text-xs">—</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stale company notice */}
      {staleCodes.length > 0 && (
        <p className="mt-4 text-xs text-text-muted dark:text-dark-text-muted">
          {staleCodes.length === 1
            ? `${staleCodes[0]} has no analysis data in the current run.`
            : `${staleCodes.join(', ')} have no analysis data in the current run.`}
          {' '}You can remove them using the ★ button above.
        </p>
      )}
    </div>
  );
}
