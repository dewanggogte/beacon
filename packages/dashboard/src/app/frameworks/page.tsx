import { getLatestRunId, getFrameworkComparison } from '@/lib/queries';
import { FrameworksTable } from './frameworks-table';

export const dynamic = 'force-dynamic';

export default async function FrameworksPage() {
  const runId = await getLatestRunId();

  if (!runId) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-text-muted text-lg">No analysis data available.</div>
      </div>
    );
  }

  const data = await getFrameworkComparison(runId, 500);

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">Framework Comparison</h1>
      <p className="text-text-muted text-sm mb-6">
        Side-by-side Buffett, Graham, Lynch, and Pabrai scores for top {data.length} companies
      </p>
      <FrameworksTable data={data} />
    </div>
  );
}
