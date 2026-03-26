import {
  getLatestRunId,
  getSummaryStats,
  getSectorDistribution,
  getHighConvictionCompanies,
  getMarketCommentary,
  getWhatChanged,
  getRunDate,
  getPipelineStatus,
} from '@/lib/queries';
import { LynchBadge } from '@/components/lynch-badge';
import { ConvictionBadge } from '@/components/conviction-badge';
import { SectorHeatmap } from '@/components/sector-heatmap';
import { AutoRefresh } from '@/components/auto-refresh';

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

  const [stats, commentary, conviction, sectorData, whatChanged, runDate, pipelineStatus] = await Promise.all([
    getSummaryStats(runId),
    getMarketCommentary(runId),
    getHighConvictionCompanies(runId),
    getSectorDistribution(runId),
    getWhatChanged(runId),
    getRunDate(runId),
    getPipelineStatus(),
  ]);

  const isRunning = pipelineStatus.latestRun?.status === 'running';
  const runStarted = pipelineStatus.latestRun?.startedAt
    ? new Date(pipelineStatus.latestRun.startedAt)
    : null;

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
      {/* ── 0. Pipeline Status Banner ──────────────────────────────── */}
      {isRunning && <AutoRefresh intervalMs={30000} />}
      {isRunning && runStarted && (
        <div className="flex items-center gap-3 bg-accent-amber/10 border border-accent-amber/30 rounded-lg px-4 py-3 text-sm">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-amber opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent-amber" />
          </span>
          <span className="text-text-primary dark:text-dark-text-primary">
            Pipeline is running
          </span>
          <span className="text-text-muted dark:text-dark-text-muted">
            — started {runStarted.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            {pipelineStatus.analyzedCompanies > 0 && ` · ${pipelineStatus.analyzedCompanies.toLocaleString()} of ${pipelineStatus.totalCompanies.toLocaleString()} analyzed`}
          </span>
        </div>
      )}

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
          <div className="bg-bg-card dark:bg-dark-bg-card border border-border dark:border-dark-border rounded-lg p-6 max-w-4xl">
            <div className="text-text-secondary dark:text-dark-text-secondary text-sm leading-relaxed space-y-4">
              {commentary.split(/\n\n+/).map((block: string, i: number) => {
                const trimmed = block.trim();
                if (!trimmed || trimmed === '---') return null;
                // Render ## headings
                if (trimmed.startsWith('## ')) {
                  return (
                    <h3 key={i} className="text-base font-semibold text-text-primary dark:text-dark-text-primary mt-2 first:mt-0">
                      {trimmed.replace(/^## /, '')}
                    </h3>
                  );
                }
                // Render paragraphs with **bold** support
                const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
                return (
                  <p key={i}>
                    {parts.map((part: string, j: number) =>
                      part.startsWith('**') && part.endsWith('**')
                        ? <strong key={j} className="text-text-primary dark:text-dark-text-primary font-medium">{part.slice(2, -2)}</strong>
                        : part
                    )}
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── 3. High Conviction Picks — Top 3 spotlight ─────────────── */}
      {highConviction.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary dark:text-dark-text-primary">
              High Conviction Picks
            </h2>
            {highConviction.length > 3 && (
              <a
                href="/rankings?preset=high-conviction"
                className="text-accent-cyan text-sm hover:underline"
              >
                All {highConviction.length} picks &rarr;
              </a>
            )}
          </div>
          <div className="space-y-3">
            {highConviction.slice(0, 3).map((c) => {
              const synthesis = c.llmSynthesis as {
                investment_thesis?: string;
              } | null;
              const thesis = synthesis?.investment_thesis ?? null;
              const firstSentence = thesis
                ? thesis.split(/(?<=[.!?])\s+/)[0] ?? thesis
                : null;
              return (
                <a
                  key={c.screenerCode}
                  href={`/company/${c.screenerCode}`}
                  className="flex items-start gap-4 bg-bg-card dark:bg-dark-bg-card border border-accent-green/20 rounded-lg px-5 py-3 hover:bg-bg-hover dark:hover:bg-dark-bg-hover transition-colors"
                >
                  <div className="text-2xl font-bold text-accent-green leading-none pt-0.5">
                    {Number(c.finalScore ?? 0).toFixed(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-accent-cyan">{c.companyName}</span>
                      <span className="text-text-muted dark:text-dark-text-muted text-xs">{c.sector}</span>
                      <LynchBadge category={c.lynchClassification} />
                    </div>
                    {firstSentence && (
                      <div className="text-xs text-text-secondary dark:text-dark-text-secondary line-clamp-1">
                        {firstSentence}
                      </div>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
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
