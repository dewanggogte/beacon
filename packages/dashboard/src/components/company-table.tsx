'use client';

import { useState, useMemo } from 'react';
import { LynchBadge } from './lynch-badge';
import { ConvictionBadge } from './conviction-badge';

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
}

interface CompanyTableProps {
  data: CompanyRow[];
  compact?: boolean;
}

type SortKey = 'rankOverall' | 'finalScore' | 'valuationScore' | 'qualityScore' | 'governanceScore' | 'safetyScore' | 'momentumScore' | 'companyName' | 'sector' | 'buffettScore' | 'grahamScore' | 'pabraiRiskScore';

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

export function CompanyTable({ data, compact }: CompanyTableProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('rankOverall');
  const [sortAsc, setSortAsc] = useState(true);
  const [filterClass, setFilterClass] = useState<string>('all');
  const [filterLynch, setFilterLynch] = useState<string>('all');
  const [filterConviction, setFilterConviction] = useState<string>('all');
  const [filterSector, setFilterSector] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');

  const hasFrameworks = data.some((r) => r.lynchClassification);

  const sectors = useMemo(() => {
    const s = new Set(data.map((r) => r.sector).filter(Boolean) as string[]);
    return [...s].sort();
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
    return result;
  }, [data, search, filterClass, filterLynch, filterConviction, filterSector, filterSource]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;

      if (sortKey === 'companyName' || sortKey === 'sector') {
        av = (sortKey === 'companyName' ? a.companyName : a.sector ?? '') ?? '';
        bv = (sortKey === 'companyName' ? b.companyName : b.sector ?? '') ?? '';
        return sortAsc ? (av as string).localeCompare(bv as string) : (bv as string).localeCompare(av as string);
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

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === 'rankOverall' || key === 'companyName' || key === 'sector');
    }
  };

  const SortHeader = ({ label, field, tooltip }: { label: string; field: SortKey; tooltip?: string }) => (
    <th
      className="px-3 py-2 text-left text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary select-none whitespace-nowrap"
      onClick={() => handleSort(field)}
      title={tooltip}
    >
      {label} {sortKey === field ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  );

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search company, code, or sector..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-bg-secondary border border-border rounded px-3 py-1.5 text-sm text-text-primary placeholder-text-muted flex-1 max-w-md focus:outline-none focus:border-accent-cyan"
        />
        <select
          value={filterClass}
          onChange={(e) => setFilterClass(e.target.value)}
          className="bg-bg-secondary border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-cyan"
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
              onChange={(e) => setFilterLynch(e.target.value)}
              className="bg-bg-secondary border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-cyan"
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
              onChange={(e) => setFilterConviction(e.target.value)}
              className="bg-bg-secondary border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-cyan"
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
          onChange={(e) => setFilterSector(e.target.value)}
          className="bg-bg-secondary border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-cyan"
        >
          <option value="all">All Sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="bg-bg-secondary border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-cyan"
        >
          <option value="all">All Sources</option>
          <option value="quant">Quant Only</option>
          <option value="ag4">AG4 (LLM)</option>
        </select>
        <div className="text-text-muted text-sm self-center">
          {sorted.length} results
        </div>
      </div>
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-bg-secondary">
            <tr>
              <SortHeader label="#" field="rankOverall" tooltip="Rank by composite score (geometric mean of 5 dimensions)" />
              <SortHeader label="Company" field="companyName" />
              {!compact && <SortHeader label="Sector" field="sector" />}
              <SortHeader label="Score" field="finalScore" tooltip="Composite score (0-100): geometric mean of quality, valuation, governance, safety, momentum" />
              <th className="px-3 py-2 text-left text-xs font-medium text-text-muted uppercase" title="Classification: strong_long (>=80), potential_long (>=65), neutral (>=40), potential_short (>=20), strong_avoid (<20 or disqualified)">Class</th>
              {hasFrameworks && !compact && (
                <>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-muted uppercase" title="Peter Lynch category: fast grower, stalwart, slow grower, cyclical, turnaround, asset play">Lynch</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-muted uppercase" title="Conviction level based on framework alignment: high (score>=80, 2+ frameworks>=75), medium, low, none">Conv.</th>
                  <SortHeader label="Buf" field="buffettScore" tooltip="Buffett quality score (0-100): 10 criteria including ROE consistency, operating margins, low debt, owner earnings" />
                  <SortHeader label="Gra" field="grahamScore" tooltip="Graham value score (0-100): 10 criteria including P/E<15, P/B<1.5, positive earnings, dividend continuity" />
                  <SortHeader label="Pab" field="pabraiRiskScore" tooltip="Pabrai risk score (0-100, higher=safer): debt, interest coverage, OCF predictability, revenue stability" />
                </>
              )}
              {!compact && !hasFrameworks && (
                <>
                  <SortHeader label="Val" field="valuationScore" tooltip="Valuation dimension (25% weight): P/E, P/B, PEG, EV/EBITDA" />
                  <SortHeader label="Qual" field="qualityScore" tooltip="Quality dimension (30% weight): ROE, ROCE, debt/equity, current ratio, FCF, profit and revenue growth" />
                  <SortHeader label="Gov" field="governanceScore" tooltip="Governance dimension (20% weight): promoter holding, pledge percentage, institutional holding" />
                  <SortHeader label="Safe" field="safetyScore" tooltip="Safety dimension (15% weight): market cap, free float" />
                  <SortHeader label="Mom" field="momentumScore" tooltip="Momentum dimension (10% weight): ROE trend, debt trend, margin trend, promoter holding trend" />
                </>
              )}
              <th className="px-3 py-2 text-left text-xs font-medium text-text-muted uppercase" title="Week-over-week score change vs previous analysis run">Chg</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.screenerCode} className="border-t border-border hover:bg-bg-hover transition-colors">
                <td className="px-3 py-2 text-text-muted">{row.rankOverall}</td>
                <td className="px-3 py-2">
                  <a href={`/company/${row.screenerCode}`} className="text-accent-cyan hover:underline">
                    {row.companyName}
                  </a>
                  <span className="text-text-muted text-xs ml-2">{row.screenerCode}</span>
                </td>
                {!compact && <td className="px-3 py-2 text-text-secondary">{row.sector ?? '-'}</td>}
                <td className="px-3 py-2 font-bold">{Number(row.finalScore ?? 0).toFixed(0)}</td>
                <td className={`px-3 py-2 text-xs font-medium ${classificationColor(row.classification)}`}>
                  <span className="flex items-center gap-1">
                    {classificationLabel(row.classification)}
                    {row.classificationSource === 'ag4' && (
                      <span
                        className="inline-block w-4 h-4 rounded-full bg-accent-cyan/20 text-accent-cyan text-[9px] font-bold leading-4 text-center flex-shrink-0"
                        title={row.quantClassification && row.quantClassification !== row.classification
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
                    <td className="px-3 py-2"><LynchBadge category={row.lynchClassification ?? null} /></td>
                    <td className="px-3 py-2"><ConvictionBadge level={row.convictionLevel ?? null} compact /></td>
                    <td className="px-3 py-2 text-text-secondary">{row.buffettScore ? Number(row.buffettScore).toFixed(0) : '-'}</td>
                    <td className="px-3 py-2 text-text-secondary">{row.grahamScore ? Number(row.grahamScore).toFixed(0) : '-'}</td>
                    <td className="px-3 py-2 text-text-secondary">{row.pabraiRiskScore ? Number(row.pabraiRiskScore).toFixed(0) : '-'}</td>
                  </>
                )}
                {!compact && !hasFrameworks && (
                  <>
                    <td className="px-3 py-2 text-text-secondary">{row.valuationScore ?? '-'}</td>
                    <td className="px-3 py-2 text-text-secondary">{row.qualityScore ?? '-'}</td>
                    <td className="px-3 py-2 text-text-secondary">{row.governanceScore ?? '-'}</td>
                    <td className="px-3 py-2 text-text-secondary">{row.safetyScore ?? '-'}</td>
                    <td className="px-3 py-2 text-text-secondary">{row.momentumScore ?? '-'}</td>
                  </>
                )}
                <td className="px-3 py-2">
                  {row.scoreChange ? (
                    <span className={Number(row.scoreChange) > 0 ? 'text-accent-green' : Number(row.scoreChange) < 0 ? 'text-accent-red' : 'text-text-muted'}>
                      {Number(row.scoreChange) > 0 ? '+' : ''}{Number(row.scoreChange).toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-text-muted">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
