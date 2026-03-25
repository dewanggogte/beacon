import Link from 'next/link';
import {
  getLatestRunId,
  getSectorDistribution,
  getExploreData,
  getTrendData,
  getWhatChanged,
} from '@/lib/queries';
import { SectorHeatmap } from '@/components/sector-heatmap';
import { ScatterPlot, type CompanyPoint } from '@/components/scatter-plot';
import { TrendChart } from '@/components/trend-chart';
import { PresetsNav } from './presets-nav';
import { presets } from '@/lib/presets';

export const dynamic = 'force-dynamic';

// Compute preset match counts server-side given exploreData
function computeMatchCounts(
  data: Awaited<ReturnType<typeof getExploreData>>,
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const preset of presets) {
    let matched = 0;

    for (const company of data) {
      // Build a lookup map for this company's filterable fields
      const fields: Record<string, number | string | boolean | null> = {
        pe: company.pe != null ? Number(company.pe) : null,
        roce: company.roce != null ? Number(company.roce) : null,
        roe: company.roe != null ? Number(company.roe) : null,
        dividendYield: company.dividendYield != null ? Number(company.dividendYield) : null,
        finalScore: company.finalScore != null ? Number(company.finalScore) : null,
        valuationScore: company.valuationScore != null ? Number(company.valuationScore) : null,
        qualityScore: company.qualityScore != null ? Number(company.qualityScore) : null,
        safetyScore: company.safetyScore != null ? Number(company.safetyScore) : null,
        piotroski: company.piotroskiFScore != null ? Number(company.piotroskiFScore) : null,
        convictionLevel: (company as Record<string, unknown>).convictionLevel as string | null ?? null,
        lynchClassification: (company as Record<string, unknown>).lynchClassification as string | null ?? null,
        disqualified: String((company as Record<string, unknown>).disqualified ?? 'false'),
        de: null, // not in exploreData; preset will simply not match
      };

      const allMatch = preset.filters.every((filter) => {
        const raw = fields[filter.metric];
        if (raw == null) return false;

        const fv = filter.value;

        if (filter.operator === '=') {
          return String(raw) === String(fv);
        }

        const numRaw = Number(raw);
        const numFv = Number(fv);
        if (isNaN(numRaw) || isNaN(numFv)) return false;

        switch (filter.operator) {
          case '>': return numRaw > numFv;
          case '<': return numRaw < numFv;
          case '>=': return numRaw >= numFv;
          case '<=': return numRaw <= numFv;
          default: return false;
        }
      });

      if (allMatch) matched++;
    }

    counts[preset.id] = matched;
  }

  return counts;
}

export default async function ExplorePage() {
  const runId = await getLatestRunId();

  if (!runId) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-text-muted text-lg">
          No analysis data yet. Run the pipeline to start exploring.
        </p>
        <Link
          href="/pipeline"
          className="text-accent-cyan text-sm hover:underline"
        >
          View pipeline status &rarr;
        </Link>
      </div>
    );
  }

  const [sectorData, exploreData, trendData, whatChanged] = await Promise.all([
    getSectorDistribution(runId),
    getExploreData(runId),
    getTrendData(),
    getWhatChanged(runId),
  ]);

  // Count insights
  const upgrades = whatChanged.filter(
    (c) => c.classificationChange?.toLowerCase().includes('upgrade'),
  ).length;
  const downgrades = whatChanged.filter(
    (c) => c.classificationChange?.toLowerCase().includes('downgrade'),
  ).length;
  const bigMovers = whatChanged.filter(
    (c) => c.scoreChange != null && Math.abs(Number(c.scoreChange)) >= 15,
  ).length;

  // Transform exploreData for ScatterPlot — Drizzle numeric fields come as
  // Decimal objects (with .toString()), so we coerce everything to number | null.
  const scatterData: CompanyPoint[] = exploreData.map((d) => ({
    code: d.code,
    name: d.name,
    classification: d.classification ?? 'neutral',
    pe: d.pe != null ? Number(d.pe) : null,
    roce: d.roce != null ? Number(d.roce) : null,
    roe: d.roe != null ? Number(d.roe) : null,
    piotroski: d.piotroskiFScore != null ? Number(d.piotroskiFScore) : null,
    dividendYield: d.dividendYield != null ? Number(d.dividendYield) : null,
    finalScore: d.finalScore != null ? Number(d.finalScore) : null,
    valuationScore: d.valuationScore != null ? Number(d.valuationScore) : null,
    qualityScore: d.qualityScore != null ? Number(d.qualityScore) : null,
    safetyScore: d.safetyScore != null ? Number(d.safetyScore) : null,
  }));

  const matchCounts = computeMatchCounts(exploreData);

  const trendLines = [
    { key: 'avgScore', color: '#3b82f6', label: 'Avg Score' },
    { key: 'strongLong', color: '#2d7a4f', label: 'Strong Long' },
    { key: 'potentialLong', color: '#14b8a6', label: 'Potential Long' },
  ];

  const sectionHeadingClass =
    'text-lg font-semibold text-text-primary dark:text-dark-text-primary mb-1';
  const sectionSubtitleClass =
    'text-sm text-text-secondary dark:text-dark-text-secondary mb-4';

  return (
    <div className="max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary dark:text-dark-text-primary">
          Explore
        </h1>
        <p className="text-text-secondary dark:text-dark-text-secondary text-sm mt-1">
          Discover patterns across {exploreData.length} companies
        </p>
      </div>

      {/* Insights Bar */}
      <div className="mb-8">
        {whatChanged.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {upgrades > 0 && (
              <div className="flex items-center gap-1.5 bg-accent-green/10 border border-accent-green/25 rounded-full px-3 py-1.5 text-xs font-medium text-accent-green">
                <span>&#8593;</span>
                <span>{upgrades} upgrade{upgrades !== 1 ? 's' : ''}</span>
              </div>
            )}
            {downgrades > 0 && (
              <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/25 rounded-full px-3 py-1.5 text-xs font-medium text-red-500">
                <span>&#8595;</span>
                <span>{downgrades} downgrade{downgrades !== 1 ? 's' : ''}</span>
              </div>
            )}
            {bigMovers > 0 && (
              <div className="flex items-center gap-1.5 bg-accent-blue/10 border border-accent-blue/25 rounded-full px-3 py-1.5 text-xs font-medium text-accent-blue">
                <span>&#177;</span>
                <span>{bigMovers} big mover{bigMovers !== 1 ? 's' : ''} (&ge;15 pts)</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-text-muted dark:text-dark-text-muted">
            First analysis run &mdash; comparisons will appear after the next run.
          </p>
        )}
      </div>

      {/* Sector Heatmap */}
      <div className="mb-12">
        <h2 className={sectionHeadingClass}>Sector Overview</h2>
        <p className={sectionSubtitleClass}>
          Average score per sector &mdash; click to filter rankings
        </p>
        <SectorHeatmap sectors={sectorData.map((s) => ({
          sector: s.sector ?? 'Unknown',
          count: s.count,
          avgScore: Number(s.avgScore),
        }))} />
      </div>

      {/* Scatter Plot */}
      <div className="mb-12">
        <h2 className={sectionHeadingClass}>Quality vs Valuation</h2>
        <p className={sectionSubtitleClass}>Select metrics to compare</p>
        <div className="bg-bg-card dark:bg-dark-bg-card border border-border dark:border-dark-border rounded-lg p-4">
          <ScatterPlot data={scatterData} />
        </div>
      </div>

      {/* Trend Chart — only shown with >= 2 runs */}
      {trendData.length >= 2 && (
        <div className="mb-12">
          <h2 className={sectionHeadingClass}>Trends Across Runs</h2>
          <p className={sectionSubtitleClass}>
            How the universe has evolved over pipeline runs
          </p>
          <div className="bg-bg-card dark:bg-dark-bg-card border border-border dark:border-dark-border rounded-lg p-4">
            <TrendChart data={trendData} lines={trendLines} />
          </div>
        </div>
      )}

      {/* Smart Screens */}
      <div className="mb-12">
        <h2 className={sectionHeadingClass}>Smart Screens</h2>
        <p className={sectionSubtitleClass}>
          Pre-built filters &mdash; click to open in rankings
        </p>
        <PresetsNav matchCounts={matchCounts} />
      </div>
    </div>
  );
}
