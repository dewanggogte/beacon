import { getLatestRunId, getAllRankings } from '@/lib/queries';
import { CompanyTable } from '@/components/company-table';

export const dynamic = 'force-dynamic';

interface RankingsPageProps {
  searchParams: Promise<{ preset?: string; sector?: string }>;
}

export default async function RankingsPage({ searchParams }: RankingsPageProps) {
  const params = await searchParams;
  const runId = await getLatestRunId();

  if (!runId) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-text-muted dark:text-dark-text-muted text-lg">No analysis data available.</div>
      </div>
    );
  }

  const rankings = await getAllRankings(runId);

  return (
    <div>
      <h1 className="text-xl font-bold text-text-primary dark:text-dark-text-primary mb-1">Full Rankings</h1>
      <p className="text-text-muted dark:text-dark-text-muted text-sm mb-6">
        All {rankings.length} analyzed companies sorted by final score
      </p>
      <CompanyTable
        data={rankings}
        initialPreset={params.preset ?? null}
        initialSector={params.sector ?? null}
      />
    </div>
  );
}
