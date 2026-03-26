'use client';

import { useState, useMemo, useEffect } from 'react';
import { LynchBadge } from './lynch-badge';
import { ConvictionBadge } from './conviction-badge';
import { SmartPresets } from '@/components/smart-presets';
import { Sparkline } from '@/components/sparkline';
import { WatchlistButton } from '@/components/watchlist-button';
import { presets, type Preset, type PresetFilter } from '@/lib/presets';

interface CompanyRow {
  companyName: string;
  screenerCode: string;
  sector: string | null;
  finalScore: string | null;
  compositeScore: string | null;
  classification: string | null;
  rankOverall: number | null;
  valuationScore: string | null;
  qualityScore: string | null;
  governanceScore: string | null;
  safetyScore: string | null;
  momentumScore: string | null;
  scoreChange: string | null;
  disqualified: boolean | null;
  // Framework fields (optional for backward compat)
  buffettScore?: string | null;
  grahamScore?: string | null;
  pabraiRiskScore?: string | null;
  lynchCategoryScore?: string | null;
  lynchClassification?: string | null;
  convictionLevel?: string | null;
  classificationSource?: string | null;
  quantClassification?: string | null;
  // Extended snapshot fields
  pe?: string | null;
  roce?: string | null;
  roe?: string | null;
  dividendYield?: string | null;
  marketCap?: string | null;
  bookValue?: string | null;
  quarterlyResults?: unknown;
  piotroskiFScore?: number | null;
  altmanZScore?: string | null;
  beneishMScore?: string | null;
}

interface MetricFilter {
  id: string;
  metric: string;
  operator: '>' | '<' | '>=' | '<=' | '=';
  value: string;
}

interface CompanyTableProps {
  data: CompanyRow[];
  compact?: boolean;
  initialPreset?: string | null;
  initialSector?: string | null;
}

type SortKey =
  | 'rankOverall'
  | 'finalScore'
  | 'valuationScore'
  | 'qualityScore'
  | 'governanceScore'
  | 'safetyScore'
  | 'momentumScore'
  | 'companyName'
  | 'sector'
  | 'buffettScore'
  | 'grahamScore'
  | 'pabraiRiskScore';

const METRIC_OPTIONS = [
  { value: 'roce', label: 'ROCE (%)' },
  { value: 'pe', label: 'P/E' },
  { value: 'dividendYield', label: 'Dividend Yield (%)' },
  { value: 'marketCap', label: 'Market Cap (Cr)' },
  { value: 'piotroski', label: 'Piotroski F-Score' },
];

const OPERATOR_OPTIONS: { value: MetricFilter['operator']; label: string }[] = [
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '>=' },
  { value: '<=', label: '<=' },
  { value: '=', label: '=' },
];

function classificationColor(cls: string | null): string {
  switch (cls) {
    case 'strong_long': return 'text-accent-green';
    case 'potential_long': return 'text-accent-cyan';
    case 'neutral': return 'text-text-secondary';
    case 'potential_short': return 'text-accent-amber';
    case 'strong_avoid': return 'text-accent-red';
    default: return 'text-text-muted';
  }
}

function classificationLabel(cls: string | null): string {
  switch (cls) {
    case 'strong_long': return 'STRONG LONG';
    case 'potential_long': return 'POTENTIAL LONG';
    case 'neutral': return 'NEUTRAL';
    case 'potential_short': return 'POTENTIAL SHORT';
    case 'strong_avoid': return 'STRONG AVOID';
    default: return '-';
  }
}

/** Parse quarterlyResults JSONB to extract last 5 quarters of revenue (Sales) */
function extractSalesSparkline(quarterlyResults: unknown): number[] {
  if (!quarterlyResults || !Array.isArray(quarterlyResults)) return [];
  try {
    // quarterlyResults is an array of rows; find the "Sales" row
    // Each element may be { name: string, values: number[] } or similar
    const salesRow = (quarterlyResults as { name?: string; values?: unknown[] }[]).find(
      (r) => r.name?.toLowerCase().includes('sales') || r.name?.toLowerCase().includes('revenue'),
    );
    if (!salesRow?.values) return [];
    const nums = (salesRow.values as unknown[])
      .map((v) => (typeof v === 'number' ? v : parseFloat(String(v))))
      .filter((n) => !isNaN(n));
    return nums.slice(-5);
  } catch {
    return [];
  }
}

/** Get a numeric value from a row for a given metric key */
function getMetricValue(row: CompanyRow, metric: string): number | string | boolean | null {
  switch (metric) {
    case 'roce': return row.roce != null ? Number(row.roce) : null;
    case 'pe': return row.pe != null ? Number(row.pe) : null;
    case 'dividendYield': return row.dividendYield != null ? Number(row.dividendYield) : null;
    case 'marketCap': return row.marketCap != null ? Number(row.marketCap) : null;
    case 'piotroski': return row.piotroskiFScore ?? null;
    case 'lynchClassification': return row.lynchClassification ?? null;
    case 'convictionLevel': return row.convictionLevel ?? null;
    case 'de': return null; // de not available in CompanyRow currently
    case 'disqualified': return row.disqualified;
    default: return null;
  }
}

/** Evaluate a single filter condition against a company row */
function evaluateFilter(row: CompanyRow, filter: PresetFilter | MetricFilter): boolean {
  const raw = getMetricValue(row, filter.metric);
  if (raw === null || raw === undefined) return false;

  const targetVal = filter.value;

  // String equality checks (e.g. classification, convictionLevel)
  if (typeof raw === 'string' || typeof raw === 'boolean') {
    if (filter.operator === '=') {
      return String(raw) === String(targetVal);
    }
    return false;
  }

  const numRaw = raw as number;
  const numTarget = Number(targetVal);
  if (isNaN(numTarget)) return false;

  switch (filter.operator) {
    case '>': return numRaw > numTarget;
    case '<': return numRaw < numTarget;
    case '>=': return numRaw >= numTarget;
    case '<=': return numRaw <= numTarget;
    case '=': return numRaw === numTarget;
    default: return false;
  }
}

let metricFilterCounter = 0;

function TableFooter({ sorted, displayLimit, totalCount, onShowMore, pageSize }: {
  sorted: CompanyRow[]; displayLimit: number; totalCount: number; onShowMore: () => void; pageSize: number;
}) {
  const hasMore = sorted.length > displayLimit;
  const isFiltered = sorted.length !== totalCount;
  if (hasMore) {
    return (
      <div className="flex items-center justify-between mt-3 px-1">
        <span className="text-xs text-text-muted dark:text-dark-text-muted">
          Showing {displayLimit} of {sorted.length} companies
        </span>
        <button onClick={onShowMore} className="text-sm text-accent-cyan hover:underline">
          Show {Math.min(pageSize, sorted.length - displayLimit)} more
        </button>
      </div>
    );
  }
  if (sorted.length > 0 && isFiltered) {
    return (
      <div className="text-xs text-text-muted dark:text-dark-text-muted mt-3 px-1">
        Showing all {sorted.length} matching companies (of {totalCount} total)
      </div>
    );
  }
  return null;
}

export function CompanyTable({ data, compact, initialPreset, initialSector }: CompanyTableProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('rankOverall');
  const [sortAsc, setSortAsc] = useState(true);
  const [filterClass, setFilterClass] = useState<string>('all');
  const [filterLynch, setFilterLynch] = useState<string>('all');
  const [filterConviction, setFilterConviction] = useState<string>('all');
  const [filterSector, setFilterSector] = useState<string>(initialSector ?? 'all');
  const [filterSource, setFilterSource] = useState<string>('all');

  // Preset state
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [activePresetFilters, setActivePresetFilters] = useState<PresetFilter[]>([]);

  // Metric filter state
  const [metricFilters, setMetricFilters] = useState<MetricFilter[]>([]);
  const PAGE_SIZE = 100;
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);

  const hasFrameworks = data.some((r) => r.lynchClassification);

  // Apply initialPreset on mount
  useEffect(() => {
    if (initialPreset) {
      const preset = presets.find((p) => p.id === initialPreset);
      if (preset) {
        setActivePreset(preset.id);
        setActivePresetFilters(preset.filters);
      }
    }
  }, [initialPreset]);

  // Apply initialSector on mount (or when it changes)
  useEffect(() => {
    if (initialSector) {
      setFilterSector(initialSector);
    }
  }, [initialSector]);

  const sectors = useMemo(() => {
    const s = new Set(data.map((r) => r.sector).filter(Boolean) as string[]);
    return [...s].sort();
  }, [data]);

  // Compute preset match counts for all presets
  const presetMatchCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const preset of presets) {
      counts[preset.id] = data.filter((row) =>
        preset.filters.every((f) => evaluateFilter(row, f)),
      ).length;
    }
    return counts;
  }, [data]);

  const filtered = useMemo(() => {
    let result = data;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.companyName.toLowerCase().includes(q) ||
          r.screenerCode.toLowerCase().includes(q) ||
          (r.sector?.toLowerCase().includes(q) ?? false),
      );
    }
    if (filterClass !== 'all') {
      result = result.filter((r) => r.classification === filterClass);
    }
    if (filterLynch !== 'all') {
      result = result.filter((r) => r.lynchClassification === filterLynch);
    }
    if (filterConviction !== 'all') {
      result = result.filter((r) => r.convictionLevel === filterConviction);
    }
    if (filterSector !== 'all') {
      result = result.filter((r) => r.sector === filterSector);
    }
    if (filterSource !== 'all') {
      result = result.filter((r) => (r.classificationSource ?? 'quant') === filterSource);
    }

    // Apply active preset filters
    if (activePresetFilters.length > 0) {
      result = result.filter((row) =>
        activePresetFilters.every((f) => evaluateFilter(row, f)),
      );
    }

    // Apply user-defined metric filters
    for (const mf of metricFilters) {
      if (mf.metric && mf.value !== '') {
        result = result.filter((row) => evaluateFilter(row, mf));
      }
    }

    return result;
  }, [
    data,
    search,
    filterClass,
    filterLynch,
    filterConviction,
    filterSector,
    filterSource,
    activePresetFilters,
    metricFilters,
  ]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;

      if (sortKey === 'companyName' || sortKey === 'sector') {
        av = (sortKey === 'companyName' ? a.companyName : a.sector ?? '') ?? '';
        bv = (sortKey === 'companyName' ? b.companyName : b.sector ?? '') ?? '';
        return sortAsc
          ? (av as string).localeCompare(bv as string)
          : (bv as string).localeCompare(av as string);
      }

      if (sortKey === 'rankOverall') {
        av = a.rankOverall ?? 9999;
        bv = b.rankOverall ?? 9999;
      } else {
        av = Number((a as unknown as Record<string, unknown>)[sortKey] ?? 0);
        bv = Number((b as unknown as Record<string, unknown>)[sortKey] ?? 0);
      }

      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [filtered, sortKey, sortAsc]);

  // Reset display limit when filters/sort change
  useEffect(() => { setDisplayLimit(PAGE_SIZE); }, [sorted.length, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === 'rankOverall' || key === 'companyName' || key === 'sector');
    }
  };

  const handleSelectPreset = (preset: Preset) => {
    if (activePreset === preset.id) {
      // Deselect
      setActivePreset(null);
      setActivePresetFilters([]);
    } else {
      setActivePreset(preset.id);
      setActivePresetFilters(preset.filters);
    }
  };

  // Deactivate preset when any manual filter changes
  const handleManualFilterChange = (cb: () => void) => {
    setActivePreset(null);
    setActivePresetFilters([]);
    cb();
  };

  const addMetricFilter = () => {
    metricFilterCounter += 1;
    setMetricFilters((prev) => [
      ...prev,
      { id: String(metricFilterCounter), metric: 'roce', operator: '>', value: '' },
    ]);
  };

  const removeMetricFilter = (id: string) => {
    setMetricFilters((prev) => prev.filter((f) => f.id !== id));
  };

  const updateMetricFilter = (id: string, patch: Partial<MetricFilter>) => {
    setMetricFilters((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    );
  };

  const SortHeader = ({
    label,
    field,
    tooltip,
  }: {
    label: string;
    field: SortKey;
    tooltip?: string;
  }) => (
    <th
      scope="col"
      className="px-3 py-2 text-left text-xs font-medium text-text-muted dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary dark:hover:text-dark-text-primary select-none whitespace-nowrap"
      onClick={() => handleSort(field)}
    >
      {label}
      {tooltip && (
        <span
          className="inline-block ml-0.5 text-text-muted/50 dark:text-dark-text-muted/50 cursor-help"
          title={tooltip}
        >
          ?
        </span>
      )}
      {' '}
      {sortKey === field ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  );

  // Active metric filter chips (only those with a value set)
  const activeMetricChips = metricFilters.filter((f) => f.value !== '');

  return (
    <div>
      {/* Smart Presets Bar */}
      {!compact && (
        <SmartPresets
          activePreset={activePreset}
          onSelectPreset={handleSelectPreset}
          matchCounts={presetMatchCounts}
        />
      )}

      {/* Primary filter row */}
      <div className="flex flex-wrap gap-3 mb-3">
        <input
          type="text"
          placeholder="Search company, code, or sector..."
          value={search}
          onChange={(e) => handleManualFilterChange(() => setSearch(e.target.value))}
          className="bg-bg-secondary dark:bg-dark-bg-secondary border border-border dark:border-dark-border rounded px-3 py-1.5 text-sm text-text-primary dark:text-dark-text-primary placeholder-text-muted dark:placeholder-dark-text-muted flex-1 max-w-md focus:outline-none focus:border-accent-cyan"
        />
        <select
          value={filterClass}
          onChange={(e) => handleManualFilterChange(() => setFilterClass(e.target.value))}
          className="bg-bg-secondary dark:bg-dark-bg-secondary border border-border dark:border-dark-border rounded px-3 py-1.5 text-sm text-text-primary dark:text-dark-text-primary focus:outline-none focus:border-accent-cyan"
        >
          <option value="all">All ({data.length})</option>
          <option value="strong_long">Strong Long</option>
          <option value="potential_long">Potential Long</option>
          <option value="neutral">Neutral</option>
          <option value="potential_short">Potential Short</option>
          <option value="strong_avoid">Strong Avoid</option>
        </select>
        {hasFrameworks && !compact && (
          <>
            <select
              value={filterLynch}
              onChange={(e) => handleManualFilterChange(() => setFilterLynch(e.target.value))}
              className="bg-bg-secondary dark:bg-dark-bg-secondary border border-border dark:border-dark-border rounded px-3 py-1.5 text-sm text-text-primary dark:text-dark-text-primary focus:outline-none focus:border-accent-cyan"
            >
              <option value="all">All Lynch</option>
              <option value="fast_grower">Fast Grower</option>
              <option value="stalwart">Stalwart</option>
              <option value="slow_grower">Slow Grower</option>
              <option value="cyclical">Cyclical</option>
              <option value="turnaround">Turnaround</option>
              <option value="asset_play">Asset Play</option>
            </select>
            <select
              value={filterConviction}
              onChange={(e) => handleManualFilterChange(() => setFilterConviction(e.target.value))}
              className="bg-bg-secondary dark:bg-dark-bg-secondary border border-border dark:border-dark-border rounded px-3 py-1.5 text-sm text-text-primary dark:text-dark-text-primary focus:outline-none focus:border-accent-cyan"
            >
              <option value="all">All Conviction</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="none">None</option>
            </select>
          </>
        )}
        <select
          value={filterSector}
          onChange={(e) => handleManualFilterChange(() => setFilterSector(e.target.value))}
          className="bg-bg-secondary dark:bg-dark-bg-secondary border border-border dark:border-dark-border rounded px-3 py-1.5 text-sm text-text-primary dark:text-dark-text-primary focus:outline-none focus:border-accent-cyan"
        >
          <option value="all">All Sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filterSource}
          onChange={(e) => handleManualFilterChange(() => setFilterSource(e.target.value))}
          className="bg-bg-secondary dark:bg-dark-bg-secondary border border-border dark:border-dark-border rounded px-3 py-1.5 text-sm text-text-primary dark:text-dark-text-primary focus:outline-none focus:border-accent-cyan"
        >
          <option value="all">All Sources</option>
          <option value="quant">Quant Only</option>
          <option value="ag4">AG4 (LLM)</option>
        </select>
        <div className="text-text-muted dark:text-dark-text-muted text-sm self-center">
          {sorted.length} results
        </div>
      </div>

      {/* Multi-Filter Bar */}
      {!compact && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-2 items-center">
            {metricFilters.map((mf) => (
              <div
                key={mf.id}
                className="flex items-center gap-1 bg-bg-secondary dark:bg-dark-bg-secondary border border-border dark:border-dark-border rounded px-2 py-1"
              >
                <select
                  value={mf.metric}
                  onChange={(e) => updateMetricFilter(mf.id, { metric: e.target.value })}
                  className="bg-transparent text-xs text-text-primary dark:text-dark-text-primary focus:outline-none"
                >
                  {METRIC_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <select
                  value={mf.operator}
                  onChange={(e) =>
                    updateMetricFilter(mf.id, { operator: e.target.value as MetricFilter['operator'] })
                  }
                  className="bg-transparent text-xs text-text-primary dark:text-dark-text-primary focus:outline-none w-10"
                >
                  {OPERATOR_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={mf.value}
                  onChange={(e) => updateMetricFilter(mf.id, { value: e.target.value })}
                  placeholder="value"
                  className="bg-transparent text-xs text-text-primary dark:text-dark-text-primary w-16 focus:outline-none border-b border-border dark:border-dark-border"
                />
                <button
                  onClick={() => removeMetricFilter(mf.id)}
                  className="text-text-muted dark:text-dark-text-muted hover:text-accent-red ml-1 text-xs leading-none"
                  aria-label="Remove filter"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={addMetricFilter}
              className="text-xs text-text-muted dark:text-dark-text-muted hover:text-accent-cyan border border-dashed border-border dark:border-dark-border rounded px-2 py-1 transition-colors"
            >
              + Add filter
            </button>
          </div>

          {/* Active filter chips */}
          {activeMetricChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {activeMetricChips.map((chip) => {
                const metricLabel =
                  METRIC_OPTIONS.find((m) => m.value === chip.metric)?.label ?? chip.metric;
                return (
                  <span
                    key={chip.id}
                    className="inline-flex items-center gap-1 bg-accent-cyan/10 text-accent-cyan text-xs rounded-full px-2 py-0.5"
                  >
                    {metricLabel} {chip.operator} {chip.value}
                    <button
                      onClick={() => removeMetricFilter(chip.id)}
                      className="hover:text-accent-red ml-0.5 leading-none"
                      aria-label="Remove filter"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Zero results state */}
      {sorted.length === 0 ? (
        <div className="flex items-center justify-center h-40 border border-border dark:border-dark-border rounded-lg text-text-muted dark:text-dark-text-muted text-sm">
          No companies match these filters. Try relaxing your criteria.
        </div>
      ) : (
        <>
        <div className="overflow-x-auto border border-border dark:border-dark-border rounded-lg">
          <table className="w-full text-sm" aria-label="Company rankings" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead className="bg-bg-secondary dark:bg-dark-bg-secondary sticky top-0 z-10">
              <tr>
                <SortHeader
                  label="#"
                  field="rankOverall"
                  tooltip="Rank by composite score (geometric mean of 5 dimensions)"
                />
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-text-muted dark:text-dark-text-muted uppercase tracking-wider">
                  Company
                </th>
                {!compact && (
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-text-muted dark:text-dark-text-muted uppercase tracking-wider whitespace-nowrap">
                    Revenue
                  </th>
                )}
                {!compact && <SortHeader label="Sector" field="sector" />}
                <SortHeader
                  label="Score (0–100)"
                  field="finalScore"
                  tooltip="Composite score (0-100): geometric mean of quality, valuation, governance, safety, momentum"
                />
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-text-muted dark:text-dark-text-muted uppercase">
                  Class{' '}
                  <span
                    className="text-text-muted/50 dark:text-dark-text-muted/50 cursor-help"
                    title="Classification: strong_long (>=80), potential_long (>=65), neutral (>=40), potential_short (>=20), strong_avoid (<20 or disqualified)"
                  >
                    ?
                  </span>
                </th>
                {hasFrameworks && !compact && (
                  <>
                    <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-text-muted dark:text-dark-text-muted uppercase">
                      Lynch{' '}
                      <span
                        className="text-text-muted/50 dark:text-dark-text-muted/50 cursor-help"
                        title="Peter Lynch category: fast grower, stalwart, slow grower, cyclical, turnaround, asset play"
                      >
                        ?
                      </span>
                    </th>
                    <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-text-muted dark:text-dark-text-muted uppercase">
                      Conv.{' '}
                      <span
                        className="text-text-muted/50 dark:text-dark-text-muted/50 cursor-help"
                        title="Conviction level based on framework alignment: high (score>=80, 2+ frameworks>=75), medium, low, none"
                      >
                        ?
                      </span>
                    </th>
                    <SortHeader
                      label="Buf"
                      field="buffettScore"
                      tooltip="Buffett quality score (0-100): 10 criteria including ROE consistency, operating margins, low debt, owner earnings"
                    />
                    <SortHeader
                      label="Gra"
                      field="grahamScore"
                      tooltip="Graham value score (0-100): 10 criteria including P/E<15, P/B<1.5, positive earnings, dividend continuity"
                    />
                    <SortHeader
                      label="Pab"
                      field="pabraiRiskScore"
                      tooltip="Pabrai risk score (0-100, higher=safer): debt, interest coverage, OCF predictability, revenue stability"
                    />
                  </>
                )}
                {!compact && !hasFrameworks && (
                  <>
                    <SortHeader
                      label="Val (25%)"
                      field="valuationScore"
                      tooltip="Valuation dimension (25% weight): P/E, P/B, PEG, EV/EBITDA"
                    />
                    <SortHeader
                      label="Qual (30%)"
                      field="qualityScore"
                      tooltip="Quality dimension (30% weight): ROE, ROCE, debt/equity, current ratio, FCF, profit and revenue growth"
                    />
                    <SortHeader
                      label="Gov (20%)"
                      field="governanceScore"
                      tooltip="Governance dimension (20% weight): promoter holding, pledge percentage, institutional holding"
                    />
                    <SortHeader
                      label="Safe (15%)"
                      field="safetyScore"
                      tooltip="Safety dimension (15% weight): market cap, free float"
                    />
                    <SortHeader
                      label="Mom (10%)"
                      field="momentumScore"
                      tooltip="Momentum dimension (10% weight): ROE trend, debt trend, margin trend, promoter holding trend"
                    />
                  </>
                )}
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-text-muted dark:text-dark-text-muted uppercase">
                  Chg{' '}
                  <span
                    className="text-text-muted/50 dark:text-dark-text-muted/50 cursor-help"
                    title="Week-over-week score change vs previous analysis run"
                  >
                    ?
                  </span>
                </th>
                {!compact && (
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-text-muted dark:text-dark-text-muted uppercase">
                    Watch
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, displayLimit).map((row) => {
                const sparkData = extractSalesSparkline(row.quarterlyResults);
                return (
                  <tr
                    key={row.screenerCode}
                    className="border-t border-border dark:border-dark-border hover:bg-bg-hover dark:hover:bg-dark-bg-hover transition-colors"
                  >
                    <td className="px-3 py-2 text-text-muted dark:text-dark-text-muted sticky left-0 z-5 bg-bg-card dark:bg-dark-bg-card">
                      {row.rankOverall}
                    </td>
                    <td className="px-3 py-2">
                      <a
                        href={`/company/${row.screenerCode}`}
                        className="text-accent-cyan hover:underline"
                      >
                        {row.companyName}
                      </a>
                      <span className="text-text-muted dark:text-dark-text-muted text-xs ml-2">
                        {row.screenerCode}
                      </span>
                    </td>
                    {!compact && (
                      <td className="px-3 py-2">
                        {sparkData.length >= 2 ? (
                          <Sparkline data={sparkData} width={80} height={24} />
                        ) : (
                          <span className="text-text-muted dark:text-dark-text-muted text-xs">—</span>
                        )}
                      </td>
                    )}
                    {!compact && (
                      <td className="px-3 py-2 text-text-secondary dark:text-dark-text-secondary">
                        {row.sector ?? '-'}
                      </td>
                    )}
                    <td className="px-3 py-2 font-bold">
                      {Number(row.finalScore ?? 0).toFixed(0)}
                    </td>
                    <td className={`px-3 py-2 text-xs font-medium ${classificationColor(row.classification)}`}>
                      <span className="flex items-center gap-1">
                        {classificationLabel(row.classification)}
                        {row.classificationSource === 'ag4' && (
                          <span
                            className="inline-block w-4 h-4 rounded-full bg-accent-cyan/20 text-accent-cyan text-[9px] font-bold leading-4 text-center flex-shrink-0"
                            title={
                              row.quantClassification &&
                              row.quantClassification !== row.classification
                                ? `AG4 override (Quant: ${classificationLabel(row.quantClassification)})`
                                : 'AG4 confirmed'
                            }
                          >
                            A
                          </span>
                        )}
                      </span>
                    </td>
                    {hasFrameworks && !compact && (
                      <>
                        <td className="px-3 py-2">
                          <LynchBadge category={row.lynchClassification ?? null} />
                        </td>
                        <td className="px-3 py-2">
                          <ConvictionBadge level={row.convictionLevel ?? null} compact />
                        </td>
                        <td className="px-3 py-2 text-text-secondary dark:text-dark-text-secondary">
                          {row.buffettScore ? Number(row.buffettScore).toFixed(0) : '-'}
                        </td>
                        <td className="px-3 py-2 text-text-secondary dark:text-dark-text-secondary">
                          {row.grahamScore ? Number(row.grahamScore).toFixed(0) : '-'}
                        </td>
                        <td className="px-3 py-2 text-text-secondary dark:text-dark-text-secondary">
                          {row.pabraiRiskScore ? Number(row.pabraiRiskScore).toFixed(0) : '-'}
                        </td>
                      </>
                    )}
                    {!compact && !hasFrameworks && (
                      <>
                        <td className="px-3 py-2 text-text-secondary dark:text-dark-text-secondary">
                          {row.valuationScore ?? '-'}
                        </td>
                        <td className="px-3 py-2 text-text-secondary dark:text-dark-text-secondary">
                          {row.qualityScore ?? '-'}
                        </td>
                        <td className="px-3 py-2 text-text-secondary dark:text-dark-text-secondary">
                          {row.governanceScore ?? '-'}
                        </td>
                        <td className="px-3 py-2 text-text-secondary dark:text-dark-text-secondary">
                          {row.safetyScore ?? '-'}
                        </td>
                        <td className="px-3 py-2 text-text-secondary dark:text-dark-text-secondary">
                          {row.momentumScore ?? '-'}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2">
                      {row.scoreChange ? (
                        <span
                          className={
                            Number(row.scoreChange) > 0
                              ? 'text-accent-green'
                              : Number(row.scoreChange) < 0
                              ? 'text-accent-red'
                              : 'text-text-muted dark:text-dark-text-muted'
                          }
                        >
                          {Number(row.scoreChange) > 0 ? '+' : ''}
                          {Number(row.scoreChange).toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-text-muted dark:text-dark-text-muted">-</span>
                      )}
                    </td>
                    {!compact && (
                      <td className="px-3 py-2">
                        <WatchlistButton code={row.screenerCode} size="sm" />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <TableFooter sorted={sorted} displayLimit={displayLimit} totalCount={data.length} onShowMore={() => setDisplayLimit(prev => prev + PAGE_SIZE)} pageSize={PAGE_SIZE} />
        </>
      )}
    </div>
  );
}
