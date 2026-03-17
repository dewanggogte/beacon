interface StatCardProps {
  label: string;
  value: string | number;
  color?: string;
  subtext?: string;
  size?: 'default' | 'large';
}

export function StatCard({ label, value, color, subtext, size = 'default' }: StatCardProps) {
  const isLarge = size === 'large';
  return (
    <div className={`bg-bg-card border border-border rounded-lg ${isLarge ? 'p-6' : 'p-4'}`}>
      <div className={`text-text-muted uppercase tracking-wider mb-1 ${isLarge ? 'text-sm' : 'text-xs'}`}>{label}</div>
      <div className={`font-bold ${isLarge ? 'text-4xl' : 'text-2xl'} ${color ?? 'text-text-primary'}`}>{value}</div>
      {subtext && <div className={`text-text-muted mt-1 ${isLarge ? 'text-sm' : 'text-xs'}`}>{subtext}</div>}
    </div>
  );
}
