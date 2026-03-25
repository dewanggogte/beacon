'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface TrendChartProps {
  data: { runDate: string; [key: string]: string | number }[];
  lines: { key: string; color: string; label: string }[];
}

export function TrendChart({ data, lines }: TrendChartProps) {
  if (data.length < 2) {
    return (
      <div className="h-[280px] flex items-center justify-center text-text-muted dark:text-dark-text-muted text-sm">
        Need at least 2 pipeline runs to show trends
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          dataKey="runDate"
          tick={{ fontSize: 10 }}
          tickFormatter={(v: string) => {
            try {
              return new Date(v).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
            } catch {
              return v;
            }
          }}
        />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelFormatter={(v: string) => {
            try {
              return new Date(v).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
            } catch {
              return v;
            }
          }}
        />
        <Legend wrapperStyle={{ fontSize: '11px' }} />
        {lines.map(({ key, color, label }) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            name={label}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
