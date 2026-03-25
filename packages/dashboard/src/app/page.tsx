import {
  getLatestRunId,
  getSummaryStats,
  getSectorDistribution,
  getHighConvictionCompanies,
  getMarketCommentary,
  getWhatChanged,
  getRunDate,
} from '@/lib/queries';
import { LynchBadge } from '@/components/lynch-badge';
import { ConvictionBadge } from '@/components/conviction-badge';
import { SectorHeatmap } from '@/components/sector-heatmap';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const runId = await getLatestRunId();

  if (!runId) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-text-muted dark:text-dark-text-muted text-lg">
          No analysis data available. Run the pipeline first.
        </div>
      </div>
    );
  }

  const [stats, commentary, conviction, sectorData, whatChanged, runDate] = await Promise.all([
    getSummaryStats(runId),
    getMarketCommentary(runId),
    getHighConvictionCompanies(runId),
    getSectorDistribution(runId),
    getWhatChanged(runId),
    getRunDate(runId),
  ]);

  const highConviction = conviction.filter((c) => c.convictionLevel === 'high');

  // Compute upgrade/downgrade counts from whatChanged
  const upgrades = whatChanged.filter(
    (e) => e.scoreChange !== null && Number(e.scoreChange) > 0,
  ).length;
  const downgrades = whatChanged.filter(
    (e) => e.scoreChange !== null && Number(e.scoreChange) < 0,
  ).length;

  const formattedDate = runDate
    ? runDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  // Normalise sector data for SectorHeatmap (avgScore must be number)
  const heatmapSectors = sectorData
    .filter((s) => s.sector !== null)
    .map((s) => ({
      sector: s.sector as string,
      count: s.count,
      avgScore: Number(s.avgScore),
    }));

  return (
    <div className="space-y-10">
      {/* ── 1. Hero Zone ─────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-8 border-b border-border dark:border-dark-border">
        <div className="lg:w-3/5">
          <h1 className="text-3xl font-semibold text-text-primary dark:text-dark-text-primary leading-tight">
            <span className="text-accent-green">{stats.highConviction}</span> high conviction picks
          </h1>
          {formattedDate && (
            <div className="text-text-muted dark:text-dark-text-muted text-sm mt-2">
              Analysis as of {formattedDate}
            </div>
          )}
          {whatChanged.length > 0 && (
            <div className="flex gap-4 mt-3 text-sm">
              {upgrades > 0 && (
                <span className="text-accent-green">
                  +{upgrades} upgrade{upgrades !== 1 ? 's' : ''}
                </span>
              )}
              {downgrades > 0 && (
                <span className="text-accent-red">
                  -{downgrades} downgrade{downgrades !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="lg:w-2/5 flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <div className="flex justify-between w-full">
            <span className="text-text-muted dark:text-dark-text-muted">Total Analyzed</span>
            <span className="text-text-primary dark:text-dark-text-primary font-medium">
              {stats.total.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between w-full">
            <span className="text-text-muted dark:text-dark-text-muted">Strong Long</span>
            <span className="text-accent-green font-medium">{stats.strong_long}</span>
          </div>
          <div className="flex justify-between w-full">
            <span className="text-text-muted dark:text-dark-text-muted">Potential Long</span>
            <span className="text-accent-cyan font-medium">{stats.potential_long}</span>
          </div>
          <div className="flex justify-between w-full">
            <span className="text-text-muted dark:text-dark-text-muted">Strong Avoid</span>
            <span className="text-accent-red font-medium">{stats.strong_avoid}</span>
          </div>
        </div>
      </div>

      {/* ── 2. LLM Market Commentary ──────────────────────────────── */}
      {commentary && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary dark:text-dark-text-primary mb-3">
            Market Overview
          </h2>
          <div className="bg-bg-card dark:bg-dark-bg-card border border-border dark:border-dark-border rounded-lg p-6">
            <p className="text-text-secondary dark:text-dark-text-secondary text-sm leading-relaxed">
              {commentary}
            </p>
          </div>
        </div>
      )}

      {/* ── 3. High Conviction Picks ──────────────────────────────── */}
      {highConviction.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary dark:text-dark-text-primary mb-4">
            High Conviction Picks
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {highConviction.slice(0, 6).map((c) => {
              const synthesis = c.llmSynthesis as {
                investment_thesis?: string;
                conviction_reasoning?: string;
              } | null;
              // Extract first sentence from investment_thesis for the one-line narrative
              const thesis = synthesis?.investment_thesis ?? null;
              const firstSentence = thesis
                ? thesis.split(/(?<=[.!?])\s+/)[0] ?? thesis
                : null;
              return (
                <a
                  key={c.screenerCode}
                  href={`/company/${c.screenerCode}`}
                  className="bg-bg-card dark:bg-dark-bg-card border border-accent-green/30 rounded-lg p-6 hover:bg-bg-hover dark:hover:bg-dark-bg-hover transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-accent-cyan">{c.companyName}</div>
                    <div className="text-accent-green font-bold">
                      {Number(c.finalScore ?? 0).toFixed(0)}
                    </div>
                  </div>
                  <div className="flex gap-2 mb-2">
                    <LynchBadge category={c.lynchClassification} />
                    <ConvictionBadge level={c.convictionLevel} />
                  </div>
                  <div className="text-text-muted dark:text-dark-text-muted text-xs mb-1">
                    {c.sector}
                  </div>
                  <div className="flex gap-3 text-xs text-text-secondary dark:text-dark-text-secondary mb-2">
                    <span>Buf: {c.buffettScore ? Number(c.buffettScore).toFixed(0) : '-'}</span>
                    <span>Gra: {c.grahamScore ? Number(c.grahamScore).toFixed(0) : '-'}</span>
                    <span>Pab: {c.pabraiRiskScore ? Number(c.pabraiRiskScore).toFixed(0) : '-'}</span>
                  </div>
                  {firstSentence && (
                    <div className="text-xs text-text-secondary dark:text-dark-text-secondary line-clamp-2">
                      {firstSentence}
                    </div>
                  )}
                </a>
              );
            })}
          </div>
          {highConviction.length > 6 && (
            <a
              href="/conviction"
              className="block text-center text-accent-cyan text-sm mt-3 hover:underline"
            >
              View all {highConviction.length} high conviction picks &rarr;
            </a>
          )}
        </div>
      )}

      {/* ── 4. Sector Overview (heatmap) ─────────────────────────── */}
      {heatmapSectors.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary dark:text-dark-text-primary mb-4">
            Sector Overview
          </h2>
          <SectorHeatmap sectors={heatmapSectors} compact />
        </div>
      )}

      {/* ── 5. What Changed ──────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary dark:text-dark-text-primary mb-4">
          What Changed
        </h2>
        {whatChanged.length === 0 ? (
          <p className="text-text-muted dark:text-dark-text-muted text-sm">
            This is the first analysis run — changes will appear after the next run.
          </p>
        ) : (
          <div className="border border-border dark:border-dark-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg-secondary dark:bg-dark-bg-secondary">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-text-muted dark:text-dark-text-muted uppercase tracking-wide">
                    Company
                  </th>
                  <th className="px-4 py-2 text-right text-xs text-text-muted dark:text-dark-text-muted uppercase tracking-wide">
                    Score Δ
                  </th>
                  <th className="px-4 py-2 text-left text-xs text-text-muted dark:text-dark-text-muted uppercase tracking-wide hidden sm:table-cell">
                    Classification
                  </th>
                </tr>
              </thead>
              <tbody>
                {whatChanged.map((entry) => {
                  const delta = entry.scoreChange !== null ? Number(entry.scoreChange) : null;
                  const isPositive = delta !== null && delta > 0;
                  const isNegative = delta !== null && delta < 0;
                  return (
                    <tr
                      key={entry.code}
                      className="border-t border-border dark:border-dark-border hover:bg-bg-hover dark:hover:bg-dark-bg-hover"
                    >
                      <td className="px-4 py-2">
                        <a
                          href={`/company/${entry.code}`}
                          className="text-accent-cyan hover:underline font-medium"
                        >
                          {entry.name}
                        </a>
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">
                        {delta !== null ? (
                          <span
                            className={
                              isPositive
                                ? 'text-accent-green'
                                : isNegative
                                ? 'text-accent-red'
                                : 'text-text-muted dark:text-dark-text-muted'
                            }
                          >
                            {isPositive ? '+' : ''}
                            {delta.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-text-muted dark:text-dark-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 hidden sm:table-cell text-text-secondary dark:text-dark-text-secondary text-xs">
                        {entry.classificationChange ? (
                          <span>{entry.classificationChange}</span>
                        ) : (
                          <span className="text-text-muted dark:text-dark-text-muted">
                            {entry.classification ?? '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Navigation Signpost ───────────────────────────────────── */}
      <div className="border-t border-border dark:border-dark-border pt-6 flex justify-center gap-6 text-sm">
        <a href="/explore" className="text-accent-cyan hover:underline">Explore</a>
        <span className="text-text-muted dark:text-dark-text-muted">&middot;</span>
        <a href="/rankings" className="text-accent-cyan hover:underline">Rankings</a>
        <span className="text-text-muted dark:text-dark-text-muted">&middot;</span>
        <a href="/watchlist" className="text-accent-cyan hover:underline">Watchlist</a>
      </div>
    </div>
  );
}
