'use client';

import { LineChart, Line, ResponsiveContainer } from 'recharts';

export function Sparkline({
  data,
  color = 'auto',
  width = 80,
  height = 24,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;

  const chartData = data.map((value, index) => ({ index, value }));

  const resolvedColor =
    color === 'auto'
      ? data[data.length - 1] > data[0]
        ? '#16a34a'
        : '#dc2626'
      : color;

  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={resolvedColor}
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
