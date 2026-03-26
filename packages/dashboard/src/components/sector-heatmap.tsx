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
  // Continuous gradient: red (30) → amber (45) → muted olive (55) → green (70)
  // Clamp to 30-70 range for color mapping
  const t = Math.max(0, Math.min(1, (avgScore - 30) / 40)); // 0 at 30, 1 at 70

  // Interpolate RGB: red → amber → olive → green
  let r: number, g: number, b: number;
  if (t < 0.33) {
    // Red to amber
    const p = t / 0.33;
    r = Math.round(158 + (150 - 158) * p);
    g = Math.round(90 + (126 - 90) * p);
    b = Math.round(90 + (80 - 90) * p);
  } else if (t < 0.66) {
    // Amber to olive
    const p = (t - 0.33) / 0.33;
    r = Math.round(150 + (110 - 150) * p);
    g = Math.round(126 + (140 - 126) * p);
    b = Math.round(80 + (85 - 80) * p);
  } else {
    // Olive to green
    const p = (t - 0.66) / 0.34;
    r = Math.round(110 + (61 - 110) * p);
    g = Math.round(140 + (139 - 140) * p);
    b = Math.round(85 + (94 - 85) * p);
  }

  return `rgb(${r}, ${g}, ${b})`;
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
