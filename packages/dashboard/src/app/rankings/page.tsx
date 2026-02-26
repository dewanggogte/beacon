import { getLatestRunId, getAllRankings } from '@/lib/queries';
import { CompanyTable } from '@/components/company-table';

export const dynamic = 'force-dynamic';

export default async function RankingsPage() {
  const runId = await getLatestRunId();

  if (!runId) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-text-muted text-lg">No analysis data available.</div>
      </div>
    );
  }

  const rankings = await getAllRankings(runId);

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">Full Rankings</h1>
      <p className="text-text-muted text-sm mb-6">
        All {rankings.length} analyzed companies sorted by final score
      </p>
      <CompanyTable data={rankings} />
    </div>
  );
}
