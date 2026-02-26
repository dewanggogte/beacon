const LYNCH_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  fast_grower: { label: 'FAST GROWER', color: 'text-accent-green', bg: 'bg-accent-green/10' },
  stalwart: { label: 'STALWART', color: 'text-accent-cyan', bg: 'bg-accent-cyan/10' },
  slow_grower: { label: 'SLOW GROWER', color: 'text-text-secondary', bg: 'bg-text-secondary/10' },
  cyclical: { label: 'CYCLICAL', color: 'text-accent-amber', bg: 'bg-accent-amber/10' },
  turnaround: { label: 'TURNAROUND', color: 'text-accent-red', bg: 'bg-accent-red/10' },
  asset_play: { label: 'ASSET PLAY', color: 'text-accent-blue', bg: 'bg-accent-blue/10' },
};

export function LynchBadge({ category }: { category: string | null }) {
  if (!category) return null;
  const config = LYNCH_CONFIG[category] ?? { label: category.toUpperCase(), color: 'text-text-muted', bg: 'bg-bg-secondary' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${config.color} ${config.bg}`}>
      {config.label}
    </span>
  );
}
