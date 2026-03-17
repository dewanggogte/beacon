import { getBacktestRuns } from '@/lib/queries';
import { StatCard } from '@/components/stat-card';

export const dynamic = 'force-dynamic';

interface BacktestPerformance {
  avgReturn: number;
  medianReturn: number;
  hitRate: number;
  sharpeRatio: number | null;
  maxReturn: number;
  minReturn: number;
  pricedPicks: number;
  totalPicks: number;
}

interface BacktestPick {
  screenerCode: string;
  returnPct: number;
  entryPrice: number;
  exitPrice: number;
}

function SetupSection() {
  return (
    <div className="bg-bg-card border border-border rounded-lg p-6">
      <h2 className="text-sm font-medium mb-3">Setup</h2>
      <div className="text-text-secondary text-sm space-y-2">
        <p>1. Fetch historical prices:</p>
        <code className="block bg-bg-secondary px-3 py-1 rounded text-xs">
          python scripts/fetch-prices.py --period 10y
        </code>
        <p>2. Run a backtest on a past analysis:</p>
        <code className="block bg-bg-secondary px-3 py-1 rounded text-xs">
          npx tsx packages/analyzer/src/index.ts backtest --run=3 --eval-date=2025-06-01
        </code>
        <p>3. Or run walk-forward across multiple periods:</p>
        <code className="block bg-bg-secondary px-3 py-1 rounded text-xs">
          npx tsx packages/analyzer/src/index.ts walk-forward --from=2024-01 --to=2025-12
        </code>
      </div>
      <div className="mt-4 pt-3 border-t border-border">
        <a
          href="https://github.com/dewanggogte/beacon"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-cyan text-sm hover:underline"
        >
          View on GitHub &rarr;
        </a>
      </div>
    </div>
  );
}

export default async function BacktestPage() {
  const runs = await getBacktestRuns();

  if (runs.length === 0) {
    return (
      <div className="max-w-4xl space-y-8">
        <div>
          <h1 className="text-xl font-bold mb-1">Backtesting</h1>
          <p className="text-text-muted text-sm">No backtest runs yet.</p>
        </div>
        <SetupSection />
      </div>
    );
  }

  // Aggregate across all runs
  const performances = runs
    .map((r) => r.performance as BacktestPerformance | null)
    .filter((p): p is BacktestPerformance => p !== null);

  const avgReturn = performances.length > 0
    ? performances.reduce((s, p) => s + p.avgReturn, 0) / performances.length
    : 0;
  const avgHitRate = performances.length > 0
    ? performances.reduce((s, p) => s + p.hitRate, 0) / performances.length
    : 0;
  const avgSharpe = performances.filter((p) => p.sharpeRatio != null).length > 0
    ? performances.filter((p) => p.sharpeRatio != null).reduce((s, p) => s + (p.sharpeRatio ?? 0), 0) / performances.filter((p) => p.sharpeRatio != null).length
    : null;

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-xl font-bold mb-1">Backtesting</h1>
        <p className="text-text-muted text-sm">{runs.length} backtest runs</p>
      </div>

      {/* Aggregate Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Runs" value={runs.length} />
        <StatCard
          label="Avg Return"
          value={`${avgReturn.toFixed(1)}%`}
          color={avgReturn > 0 ? 'text-accent-green' : 'text-accent-red'}
        />
        <StatCard
          label="Avg Hit Rate"
          value={`${(avgHitRate * 100).toFixed(0)}%`}
          color={avgHitRate > 0.5 ? 'text-accent-green' : 'text-accent-amber'}
        />
        <StatCard
          label="Avg Sharpe"
          value={avgSharpe !== null ? avgSharpe.toFixed(2) : 'N/A'}
          color={avgSharpe !== null && avgSharpe > 1 ? 'text-accent-green' : 'text-text-secondary'}
        />
      </div>

      {/* Run History */}
      <div>
        <h2 className="text-text-muted text-xs uppercase tracking-wider mb-3">Run History</h2>
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-bg-secondary">
              <tr>
                <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Analysis Date</th>
                <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Eval Date</th>
                <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Days</th>
                <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Picks</th>
                <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Avg Return</th>
                <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Hit Rate</th>
                <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Sharpe</th>
                <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Best/Worst</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const perf = run.performance as BacktestPerformance | null;
                return (
                  <tr key={run.id} className="border-t border-border hover:bg-bg-hover">
                    <td className="px-3 py-2 text-text-primary">{run.analysisDate}</td>
                    <td className="px-3 py-2 text-text-secondary">{run.evaluationDate}</td>
                    <td className="px-3 py-2 text-text-secondary">{run.holdingPeriodDays}</td>
                    <td className="px-3 py-2 text-text-secondary">
                      {perf ? `${perf.pricedPicks}/${perf.totalPicks}` : '-'}
                    </td>
                    <td className={`px-3 py-2 font-bold ${perf && perf.avgReturn > 0 ? 'text-accent-green' : perf && perf.avgReturn < 0 ? 'text-accent-red' : 'text-text-muted'}`}>
                      {perf ? `${perf.avgReturn.toFixed(1)}%` : '-'}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">
                      {perf ? `${(perf.hitRate * 100).toFixed(0)}%` : '-'}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">
                      {perf?.sharpeRatio != null ? perf.sharpeRatio.toFixed(2) : '-'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {perf ? (
                        <>
                          <span className="text-accent-green">+{perf.maxReturn.toFixed(0)}%</span>
                          <span className="text-text-muted mx-1">/</span>
                          <span className="text-accent-red">{perf.minReturn.toFixed(0)}%</span>
                        </>
                      ) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <SetupSection />

      {/* Latest Run Detail */}
      {runs[0] && (runs[0].picks as BacktestPick[] | null) && (
        <div>
          <h2 className="text-text-muted text-xs uppercase tracking-wider mb-3">
            Latest Run Picks ({runs[0].analysisDate} → {runs[0].evaluationDate})
          </h2>
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-bg-secondary">
                <tr>
                  <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Company</th>
                  <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Entry</th>
                  <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Exit</th>
                  <th className="px-3 py-2 text-left text-xs text-text-muted uppercase">Return</th>
                </tr>
              </thead>
              <tbody>
                {((runs[0].picks as BacktestPick[]) ?? [])
                  .sort((a, b) => b.returnPct - a.returnPct)
                  .map((pick) => (
                    <tr key={pick.screenerCode} className="border-t border-border hover:bg-bg-hover">
                      <td className="px-3 py-2">
                        <a href={`/company/${pick.screenerCode}`} className="text-accent-cyan hover:underline">
                          {pick.screenerCode}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-text-secondary">{pick.entryPrice}</td>
                      <td className="px-3 py-2 text-text-secondary">{pick.exitPrice}</td>
                      <td className={`px-3 py-2 font-bold ${pick.returnPct > 0 ? 'text-accent-green' : pick.returnPct < 0 ? 'text-accent-red' : 'text-text-muted'}`}>
                        {pick.returnPct > 0 ? '+' : ''}{pick.returnPct.toFixed(1)}%
                      </td>
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
