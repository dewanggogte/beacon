'use client';

import { useState, useMemo } from 'react';
import { LynchBadge } from '@/components/lynch-badge';
import { ConvictionBadge } from '@/components/conviction-badge';

interface FrameworkRow {
  companyName: string;
  screenerCode: string;
  sector: string | null;
  finalScore: string | null;
  classification: string | null;
  buffettScore: string | null;
  grahamScore: string | null;
  pabraiRiskScore: string | null;
  lynchCategoryScore: string | null;
  lynchClassification: string | null;
  convictionLevel: string | null;
}

type SortKey = 'finalScore' | 'buffettScore' | 'grahamScore' | 'pabraiRiskScore' | 'lynchCategoryScore' | 'companyName';

function scoreCell(score: string | null): string {
  const n = Number(score ?? 0);
  if (n >= 75) return 'text-accent-green font-bold';
  if (n >= 55) return 'text-accent-cyan';
  if (n >= 35) return 'text-text-secondary';
  if (n >= 20) return 'text-accent-amber';
  return 'text-accent-red';
}

export function FrameworksTable({ data }: { data: FrameworkRow[] }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('finalScore');
  const [sortAsc, setSortAsc] = useState(false);
  const [filterLynch, setFilterLynch] = useState<string>('all');
  const [filterConviction, setFilterConviction] = useState<string>('all');

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
    if (filterLynch !== 'all') {
      result = result.filter((r) => r.lynchClassification === filterLynch);
    }
    if (filterConviction !== 'all') {
      result = result.filter((r) => r.convictionLevel === filterConviction);
    }
    return result;
  }, [data, search, filterLynch, filterConviction]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortKey === 'companyName') {
        return sortAsc
          ? a.companyName.localeCompare(b.companyName)
          : b.companyName.localeCompare(a.companyName);
      }
      const av = Number((a as unknown as Record<string, unknown>)[sortKey] ?? 0);
      const bv = Number((b as unknown as Record<string, unknown>)[sortKey] ?? 0);
      return sortAsc ? av - bv : bv - av;
    });
  }, [filtered, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === 'companyName');
    }
  };

  const SortHeader = ({ label, field, className: cls }: { label: string; field: SortKey; className?: string }) => (
    <th
      className={`px-3 py-2 text-left text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary select-none whitespace-nowrap ${cls ?? ''}`}
      onClick={() => handleSort(field)}
    >
      {label} {sortKey === field ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  );

  // Lynch category distribution
  const lynchCounts: Record<string, number> = {};
  for (const r of data) {
    const cat = r.lynchClassification ?? 'unknown';
    lynchCounts[cat] = (lynchCounts[cat] ?? 0) + 1;
  }

  return (
    <div>
      {/* Lynch Distribution Summary */}
      <div className="flex flex-wrap gap-3 mb-6">
        {Object.entries(lynchCounts).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
          <button
            key={cat}
            onClick={() => setFilterLynch(filterLynch === cat ? 'all' : cat)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs transition-colors ${
              filterLynch === cat
                ? 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan'
                : 'border-border bg-bg-card text-text-secondary hover:bg-bg-hover'
            }`}
          >
            <LynchBadge category={cat} />
            <span>{count}</span>
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search company, code, or sector..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-bg-secondary border border-border rounded px-3 py-1.5 text-sm text-text-primary placeholder-text-muted flex-1 max-w-md focus:outline-none focus:border-accent-cyan"
        />
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
        <div className="text-text-muted text-sm self-center">{sorted.length} results</div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-bg-secondary">
            <tr>
              <SortHeader label="Company" field="companyName" />
              <th className="px-3 py-2 text-left text-xs font-medium text-text-muted uppercase">Sector</th>
              <SortHeader label="Score" field="finalScore" />
              <th className="px-3 py-2 text-left text-xs font-medium text-text-muted uppercase">Lynch</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-text-muted uppercase">Conv.</th>
              <SortHeader label="Buffett" field="buffettScore" />
              <SortHeader label="Graham" field="grahamScore" />
              <SortHeader label="Pabrai" field="pabraiRiskScore" />
              <SortHeader label="Lynch Sc." field="lynchCategoryScore" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.screenerCode} className="border-t border-border hover:bg-bg-hover transition-colors">
                <td className="px-3 py-2">
                  <a href={`/company/${row.screenerCode}`} className="text-accent-cyan hover:underline">
                    {row.companyName}
                  </a>
                  <span className="text-text-muted text-xs ml-2">{row.screenerCode}</span>
                </td>
                <td className="px-3 py-2 text-text-secondary text-xs">{row.sector ?? '-'}</td>
                <td className="px-3 py-2 font-bold">{Number(row.finalScore ?? 0).toFixed(0)}</td>
                <td className="px-3 py-2"><LynchBadge category={row.lynchClassification} /></td>
                <td className="px-3 py-2"><ConvictionBadge level={row.convictionLevel} compact /></td>
                <td className={`px-3 py-2 ${scoreCell(row.buffettScore)}`}>
                  {row.buffettScore ? Number(row.buffettScore).toFixed(0) : '-'}
                </td>
                <td className={`px-3 py-2 ${scoreCell(row.grahamScore)}`}>
                  {row.grahamScore ? Number(row.grahamScore).toFixed(0) : '-'}
                </td>
                <td className={`px-3 py-2 ${scoreCell(row.pabraiRiskScore)}`}>
                  {row.pabraiRiskScore ? Number(row.pabraiRiskScore).toFixed(0) : '-'}
                </td>
                <td className={`px-3 py-2 ${scoreCell(row.lynchCategoryScore)}`}>
                  {row.lynchCategoryScore ? Number(row.lynchCategoryScore).toFixed(0) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
