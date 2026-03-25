const CONVICTION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: 'HIGH CONVICTION', color: 'text-accent-green', bg: 'bg-accent-green/15' },
  medium: { label: 'MEDIUM', color: 'text-accent-cyan', bg: 'bg-accent-cyan/10' },
  low: { label: 'LOW', color: 'text-text-secondary', bg: 'bg-text-secondary/10' },
  none: { label: 'NONE', color: 'text-text-muted dark:text-dark-text-muted', bg: 'bg-bg-secondary dark:bg-dark-bg-secondary' },
};

export function ConvictionBadge({ level, compact }: { level: string | null; compact?: boolean }) {
  if (!level) return null;
  const config = CONVICTION_CONFIG[level] ?? { label: '-', color: 'text-text-muted dark:text-dark-text-muted', bg: 'bg-bg-secondary dark:bg-dark-bg-secondary' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${config.color} ${config.bg}`}>
      {compact ? level.toUpperCase() : config.label}
    </span>
  );
}
