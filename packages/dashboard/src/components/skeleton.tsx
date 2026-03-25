export function Skeleton({ className = '', variant = 'text' }: {
  className?: string;
  variant?: 'text' | 'card' | 'badge' | 'chart' | 'table-row';
}) {
  const base = 'animate-pulse rounded bg-bg-secondary dark:bg-dark-bg-secondary';
  const variants: Record<string, string> = {
    text: 'h-4 w-full',
    card: 'h-24 w-full rounded-lg',
    badge: 'h-6 w-16 rounded-full',
    chart: 'h-48 w-full rounded-lg',
    'table-row': 'h-10 w-full',
  };
  return <div className={`${base} ${variants[variant]} ${className}`} />;
}
