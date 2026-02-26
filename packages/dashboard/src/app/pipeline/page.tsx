import { getPipelineStatus } from '@/lib/queries';
import { StatCard } from '@/components/stat-card';

export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const status = await getPipelineStatus();

  const runStatus = status.latestRun?.status ?? 'none';
  const statusColor = runStatus === 'completed' ? 'text-accent-green' : runStatus === 'running' ? 'text-accent-amber' : 'text-text-muted';

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-bold mb-1">Pipeline Status</h1>
        <p className="text-text-muted text-sm">Scraping and analysis pipeline health</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Total Companies" value={status.totalCompanies} />
        <StatCard label="Analyzed" value={status.analyzedCompanies} />
        <StatCard
          label="Last Run Status"
          value={runStatus.toUpperCase()}
          color={statusColor}
        />
      </div>

      {status.latestRun && (
        <div className="bg-bg-card border border-border rounded-lg p-4">
          <h2 className="text-text-muted text-xs uppercase tracking-wider mb-3">Latest Scrape Run</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-muted">Run ID</span>
              <span>#{status.latestRun.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Started At</span>
              <span>{new Date(status.latestRun.startedAt).toLocaleString()}</span>
            </div>
            {status.latestRun.completedAt && (
              <div className="flex justify-between">
                <span className="text-text-muted">Completed At</span>
                <span>{new Date(status.latestRun.completedAt).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-text-muted">Companies Scraped</span>
              <span className="text-accent-green">{status.latestRun.successful ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Failed</span>
              <span className={Number(status.latestRun.failed ?? 0) > 0 ? 'text-accent-red' : 'text-text-muted'}>
                {status.latestRun.failed ?? 0}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
