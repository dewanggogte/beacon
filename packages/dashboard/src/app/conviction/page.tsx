import { getLatestRunId, getHighConvictionCompanies } from '@/lib/queries';
import { LynchBadge } from '@/components/lynch-badge';
import { ConvictionBadge } from '@/components/conviction-badge';

export const dynamic = 'force-dynamic';

export default async function ConvictionPage() {
  const runId = await getLatestRunId();

  if (!runId) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-text-muted text-lg">No analysis data available.</div>
      </div>
    );
  }

  const companies = await getHighConvictionCompanies(runId);
  const high = companies.filter((c) => c.convictionLevel === 'high');
  const medium = companies.filter((c) => c.convictionLevel === 'medium');

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-xl font-bold mb-1">Conviction Picks</h1>
        <p className="text-text-muted text-sm">
          {high.length} high conviction, {medium.length} medium conviction companies
        </p>
      </div>

      {/* High Conviction */}
      {high.length > 0 && (
        <div>
          <h2 className="text-accent-green text-xs uppercase tracking-wider mb-3">
            High Conviction ({high.length})
          </h2>
          <div className="space-y-4">
            {high.map((c) => {
              const synthesis = c.llmSynthesis as {
                investment_thesis?: string;
                conviction_reasoning?: string;
                time_horizon?: string;
                key_monitor_items?: string[];
                category_verdict?: string;
              } | null;
              const reasons = c.convictionReasons as string[] | null;

              return (
                <a
                  key={c.screenerCode}
                  href={`/company/${c.screenerCode}`}
                  className="block bg-bg-card border border-accent-green/30 rounded-lg p-5 hover:bg-bg-hover transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-bold text-lg text-accent-cyan">{c.companyName}</span>
                      <span className="text-text-muted text-sm ml-3">{c.screenerCode}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-accent-green font-bold text-xl">{Number(c.finalScore ?? 0).toFixed(0)}</div>
                      <div className="text-text-muted text-xs">#{c.rankOverall}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    <LynchBadge category={c.lynchClassification} />
                    <ConvictionBadge level={c.convictionLevel} />
                    <span className="text-text-muted text-xs self-center">{c.sector}</span>
                  </div>

                  <div className="grid grid-cols-4 gap-3 text-center mb-3">
                    <div>
                      <div className="text-text-muted text-xs">Buffett</div>
                      <div className="font-bold">{c.buffettScore ? Number(c.buffettScore).toFixed(0) : '-'}</div>
                    </div>
                    <div>
                      <div className="text-text-muted text-xs">Graham</div>
                      <div className="font-bold">{c.grahamScore ? Number(c.grahamScore).toFixed(0) : '-'}</div>
                    </div>
                    <div>
                      <div className="text-text-muted text-xs">Pabrai</div>
                      <div className="font-bold">{c.pabraiRiskScore ? Number(c.pabraiRiskScore).toFixed(0) : '-'}</div>
                    </div>
                    <div>
                      <div className="text-text-muted text-xs">Lynch</div>
                      <div className="font-bold">{c.lynchCategoryScore ? Number(c.lynchCategoryScore).toFixed(0) : '-'}</div>
                    </div>
                  </div>

                  {synthesis?.investment_thesis && (
                    <div className="text-sm text-text-secondary mb-2">{synthesis.investment_thesis}</div>
                  )}

                  {reasons && reasons.length > 0 && (
                    <div className="text-xs text-text-muted">
                      {reasons.slice(0, 3).map((r, i) => (
                        <div key={i}>- {r}</div>
                      ))}
                    </div>
                  )}

                  {synthesis?.time_horizon && (
                    <div className="text-xs text-text-muted mt-2">
                      Time horizon: {synthesis.time_horizon}
                    </div>
                  )}
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Medium Conviction */}
      {medium.length > 0 && (
        <div>
          <h2 className="text-accent-cyan text-xs uppercase tracking-wider mb-3">
            Medium Conviction ({medium.length})
          </h2>
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-bg-secondary">
                <tr>
                  <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">#</th>
                  <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Company</th>
                  <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Sector</th>
                  <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Score</th>
                  <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Lynch</th>
                  <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Buf</th>
                  <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Gra</th>
                  <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Pab</th>
                </tr>
              </thead>
              <tbody>
                {medium.map((c) => (
                  <tr key={c.screenerCode} className="border-t border-border hover:bg-bg-hover">
                    <td className="px-3 py-2 text-text-muted">{c.rankOverall}</td>
                    <td className="px-3 py-2">
                      <a href={`/company/${c.screenerCode}`} className="text-accent-cyan hover:underline">{c.companyName}</a>
                      <span className="text-text-muted text-xs ml-2">{c.screenerCode}</span>
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{c.sector ?? '-'}</td>
                    <td className="px-3 py-2 font-bold">{Number(c.finalScore ?? 0).toFixed(0)}</td>
                    <td className="px-3 py-2"><LynchBadge category={c.lynchClassification} /></td>
                    <td className="px-3 py-2 text-text-secondary">{c.buffettScore ? Number(c.buffettScore).toFixed(0) : '-'}</td>
                    <td className="px-3 py-2 text-text-secondary">{c.grahamScore ? Number(c.grahamScore).toFixed(0) : '-'}</td>
                    <td className="px-3 py-2 text-text-secondary">{c.pabraiRiskScore ? Number(c.pabraiRiskScore).toFixed(0) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
