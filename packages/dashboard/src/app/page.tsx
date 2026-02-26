import { getLatestRunId, getSummaryStats, getTopCompanies, getSectorDistribution, getHighConvictionCompanies } from '@/lib/queries';
import { StatCard } from '@/components/stat-card';
import { CompanyTable } from '@/components/company-table';
import { LynchBadge } from '@/components/lynch-badge';
import { ConvictionBadge } from '@/components/conviction-badge';

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
    getTopCompanies(runId, 'strong_avoid', 5),
    getSectorDistribution(runId),
    getHighConvictionCompanies(runId),
  ]);

  const highConviction = conviction.filter((c) => c.convictionLevel === 'high');

  return (
    <div className="space-y-8">
      {/* Summary Stats */}
      <div>
        <h2 className="text-text-muted text-xs uppercase tracking-wider mb-3">Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
          <StatCard label="Total Analyzed" value={stats.total} />
          <StatCard label="Strong Long" value={stats.strong_long} color="text-accent-green" />
          <StatCard label="Potential Long" value={stats.potential_long} color="text-accent-cyan" />
          <StatCard label="Neutral" value={stats.neutral} color="text-text-secondary" />
          <StatCard label="Potential Short" value={stats.potential_short} color="text-accent-amber" />
          <StatCard label="Strong Avoid" value={stats.strong_avoid} color="text-accent-red" />
          <StatCard label="High Conviction" value={stats.highConviction} color="text-accent-green" subtext="concentrated picks" />
        </div>
      </div>

      {/* High Conviction Picks */}
      {highConviction.length > 0 && (
        <div>
          <h2 className="text-accent-green text-xs uppercase tracking-wider mb-3">
            High Conviction Picks
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {highConviction.slice(0, 6).map((c) => {
              const synthesis = c.llmSynthesis as { investment_thesis?: string; conviction_reasoning?: string } | null;
              return (
                <a
                  key={c.screenerCode}
                  href={`/company/${c.screenerCode}`}
                  className="bg-bg-card border border-accent-green/30 rounded-lg p-4 hover:bg-bg-hover transition-colors"
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
                    <div className="text-xs text-text-secondary line-clamp-2">
                      {synthesis.investment_thesis}
                    </div>
                  )}
                </a>
              );
            })}
          </div>
          {highConviction.length > 6 && (
            <a href="/conviction" className="block text-center text-accent-cyan text-sm mt-3 hover:underline">
              View all {highConviction.length} high conviction picks →
            </a>
          )}
        </div>
      )}

      {/* Top Longs */}
      <div className="grid lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-accent-green text-xs uppercase tracking-wider mb-3">
            Top Strong Longs
          </h2>
          {strongLongs.length > 0 ? (
            <CompanyTable data={strongLongs} compact />
          ) : (
            <div className="bg-bg-card border border-border rounded-lg p-6 text-text-muted text-center">
              No strong long candidates in current run
            </div>
          )}
        </div>
        <div>
          <h2 className="text-accent-cyan text-xs uppercase tracking-wider mb-3">
            Top Potential Longs
          </h2>
          {potentialLongs.length > 0 ? (
            <CompanyTable data={potentialLongs} compact />
          ) : (
            <div className="bg-bg-card border border-border rounded-lg p-6 text-text-muted text-center">
              No potential long candidates in current run
            </div>
          )}
        </div>
      </div>

      {/* Strong Avoids */}
      {strongAvoids.length > 0 && (
        <div>
          <h2 className="text-accent-red text-xs uppercase tracking-wider mb-3">
            Strong Avoid
          </h2>
          <CompanyTable data={strongAvoids} compact />
        </div>
      )}

      {/* Sector Distribution */}
      <div>
        <h2 className="text-text-muted text-xs uppercase tracking-wider mb-3">Sector Distribution</h2>
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-bg-secondary">
              <tr>
                <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Sector</th>
                <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Companies</th>
                <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Avg Score</th>
              </tr>
            </thead>
            <tbody>
              {sectors.map((s) => (
                <tr key={s.sector ?? 'unknown'} className="border-t border-border hover:bg-bg-hover">
                  <td className="px-3 py-2 text-text-primary">{s.sector ?? 'Unknown'}</td>
                  <td className="px-3 py-2 text-text-secondary">{s.count}</td>
                  <td className="px-3 py-2 text-text-secondary">{Number(s.avgScore).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
