import { getLatestRunId, getSummaryStats, getTopCompanies, getSectorDistribution, getHighConvictionCompanies } from '@/lib/queries';
import { LynchBadge } from '@/components/lynch-badge';
import { ConvictionBadge } from '@/components/conviction-badge';
import { ClassificationTabs } from '@/components/classification-tabs';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const runId = await getLatestRunId();

  if (!runId) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-text-muted text-lg">No analysis data available. Run the pipeline first.</div>
      </div>
    );
  }

  const [stats, strongLongs, potentialLongs, strongAvoids, sectors, conviction] = await Promise.all([
    getSummaryStats(runId),
    getTopCompanies(runId, 'strong_long', 10),
    getTopCompanies(runId, 'potential_long', 10),
    getTopCompanies(runId, 'strong_avoid', 10),
    getSectorDistribution(runId),
    getHighConvictionCompanies(runId),
  ]);

  const highConviction = conviction.filter((c) => c.convictionLevel === 'high');

  // Find max sector avg score for bar width calculation
  const maxAvgScore = Math.max(...sectors.map((s) => Number(s.avgScore)), 1);

  return (
    <div className="space-y-10">
      {/* Section 1: Hero */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-8 border-b border-border">
        <div className="lg:w-3/5">
          <h1 className="text-3xl font-semibold text-text-primary leading-tight">
            <span className="text-accent-green">{stats.highConviction}</span> high conviction picks
          </h1>
          <div className="text-text-muted text-sm mt-2">
            Last analyzed: {new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
          </div>
        </div>
        <div className="lg:w-2/5 flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <div className="flex justify-between w-full">
            <span className="text-text-muted">Total Analyzed</span>
            <span className="text-text-primary font-medium">{stats.total.toLocaleString()}</span>
          </div>
          <div className="flex justify-between w-full">
            <span className="text-text-muted">Strong Long</span>
            <span className="text-accent-green font-medium">{stats.strong_long}</span>
          </div>
          <div className="flex justify-between w-full">
            <span className="text-text-muted">Potential Long</span>
            <span className="text-accent-cyan font-medium">{stats.potential_long}</span>
          </div>
          <div className="flex justify-between w-full">
            <span className="text-text-muted">Strong Avoid</span>
            <span className="text-accent-red font-medium">{stats.strong_avoid}</span>
          </div>
        </div>
      </div>

      {/* Section 2: High Conviction Picks */}
      {highConviction.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            High Conviction Picks
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {highConviction.slice(0, 6).map((c) => {
              const synthesis = c.llmSynthesis as { investment_thesis?: string; conviction_reasoning?: string } | null;
              return (
                <a
                  key={c.screenerCode}
                  href={`/company/${c.screenerCode}`}
                  className="bg-bg-card border border-accent-green/30 rounded-lg p-6 hover:bg-bg-hover transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-accent-cyan">{c.companyName}</div>
                    <div className="text-accent-green font-bold">{Number(c.finalScore ?? 0).toFixed(0)}</div>
                  </div>
                  <div className="flex gap-2 mb-2">
                    <LynchBadge category={c.lynchClassification} />
                    <ConvictionBadge level={c.convictionLevel} />
                  </div>
                  <div className="text-text-muted text-xs mb-1">{c.sector}</div>
                  <div className="flex gap-3 text-xs text-text-secondary mb-2">
                    <span>Buf: {c.buffettScore ? Number(c.buffettScore).toFixed(0) : '-'}</span>
                    <span>Gra: {c.grahamScore ? Number(c.grahamScore).toFixed(0) : '-'}</span>
                    <span>Pab: {c.pabraiRiskScore ? Number(c.pabraiRiskScore).toFixed(0) : '-'}</span>
                  </div>
                  {synthesis?.investment_thesis && (
                    <div className="text-xs text-text-secondary line-clamp-3">
                      {synthesis.investment_thesis}
                    </div>
                  )}
                </a>
              );
            })}
          </div>
          {highConviction.length > 6 && (
            <a href="/conviction" className="block text-center text-accent-cyan text-sm mt-3 hover:underline">
              View all {highConviction.length} high conviction picks &rarr;
            </a>
          )}
        </div>
      )}

      {/* Section 3: Top Rated Companies (tabbed) */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Top Rated Companies
        </h2>
        <ClassificationTabs
          tabs={[
            { label: 'Strong Long', count: stats.strong_long, color: 'text-accent-green', data: strongLongs },
            { label: 'Potential Long', count: stats.potential_long, color: 'text-accent-cyan', data: potentialLongs },
            { label: 'Strong Avoid', count: stats.strong_avoid, color: 'text-accent-red', data: strongAvoids },
          ]}
        />
      </div>

      {/* Section 4: Market Snapshot */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Market Snapshot</h2>
        <div className="overflow-x-auto border border-border rounded-lg max-w-3xl">
          <table className="w-full text-sm">
            <thead className="bg-bg-secondary">
              <tr>
                <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Sector</th>
                <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Companies</th>
                <th className="px-3 py-2 text-left text-xs text-text-muted uppercase w-48">Avg Score</th>
              </tr>
            </thead>
            <tbody>
              {sectors.map((s) => {
                const pct = (Number(s.avgScore) / maxAvgScore) * 100;
                return (
                  <tr key={s.sector ?? 'unknown'} className="border-t border-border hover:bg-bg-hover">
                    <td className="px-3 py-2 text-text-primary">{s.sector ?? 'Unknown'}</td>
                    <td className="px-3 py-2 text-text-secondary">{s.count}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-bg-secondary rounded overflow-hidden">
                          <div
                            className="h-full bg-accent-cyan/40 rounded"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-text-secondary text-xs w-8 text-right">
                          {Number(s.avgScore).toFixed(1)}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 5: Navigation Signpost */}
      <div className="border-t border-border pt-6 flex justify-center gap-6 text-sm">
        <a href="/rankings" className="text-accent-cyan hover:underline">Rankings</a>
        <span className="text-text-muted">&middot;</span>
        <a href="/conviction" className="text-accent-cyan hover:underline">Conviction</a>
        <span className="text-text-muted">&middot;</span>
        <a href="/frameworks" className="text-accent-cyan hover:underline">Frameworks</a>
        <span className="text-text-muted">&middot;</span>
        <a href="/backtest" className="text-accent-cyan hover:underline">Backtest</a>
      </div>
    </div>
  );
}
