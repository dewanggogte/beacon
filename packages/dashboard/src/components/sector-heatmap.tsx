'use client';

import { useRouter } from 'next/navigation';

interface SectorData {
  sector: string;
  count: number;
  avgScore: number;
}

interface SectorHeatmapProps {
  sectors: SectorData[];
  compact?: boolean;
}

function scoreToColor(avgScore: number): string {
  if (avgScore >= 65) return '#3d8b5e';
  if (avgScore >= 55) return '#5a9e72';
  if (avgScore >= 45) return '#8b7d5e';
  if (avgScore >= 35) return '#9e7e5a';
  return '#9e5a5a';
}

export function SectorHeatmap({ sectors, compact = false }: SectorHeatmapProps) {
  const router = useRouter();

  const sorted = [...sectors].sort((a, b) => b.count - a.count);
  const maxCount = sorted.length > 0 ? sorted[0].count : 1;

  const gridClass = compact
    ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-px bg-border dark:bg-dark-border rounded-lg overflow-hidden'
    : 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-px bg-border dark:bg-dark-border rounded-lg overflow-hidden';

  return (
    <div className={gridClass}>
      {sorted.map(({ sector, count, avgScore }) => {
        const color = scoreToColor(avgScore);
        const paddingScale = compact
          ? 'p-2'
          : count / maxCount > 0.7
          ? 'p-4'
          : count / maxCount > 0.4
          ? 'p-3'
          : 'p-2';

        return (
          <button
            key={sector}
            onClick={() => router.push(`/rankings?sector=${encodeURIComponent(sector)}`)}
            className={`${paddingScale} text-left hover:opacity-80 transition-opacity`}
            style={{ backgroundColor: color }}
          >
            <div className="font-semibold text-white truncate text-xs leading-tight">
              {sector}
            </div>
            <div className="text-white text-xs opacity-90 mt-0.5">
              {avgScore.toFixed(0)}
            </div>
            {!compact && (
              <div className="text-white text-[10px] opacity-75 mt-0.5">
                {count} co.
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
