interface StatCardProps {
  label: string;
  value: string | number;
  color?: string;
  subtext?: string;
}

export function StatCard({ label, value, color, subtext }: StatCardProps) {
  return (
    <div className="bg-bg-card border border-border rounded-lg p-4">
      <div className="text-text-muted text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color ?? 'text-text-primary'}`}>{value}</div>
      {subtext && <div className="text-text-muted text-xs mt-1">{subtext}</div>}
    </div>
  );
}
