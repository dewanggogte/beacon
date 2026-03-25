'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export interface CompanyPoint {
  code: string;
  name: string;
  classification: string;
  pe?: number | null;
  roce?: number | null;
  roe?: number | null;
  piotroski?: number | null;
  dividendYield?: number | null;
  finalScore?: number | null;
  valuationScore?: number | null;
  qualityScore?: number | null;
  safetyScore?: number | null;
}

type AxisKey = 'pe' | 'roce' | 'roe' | 'piotroski' | 'dividendYield' | 'finalScore' | 'valuationScore' | 'qualityScore' | 'safetyScore';

const AXIS_OPTIONS: { value: AxisKey; label: string }[] = [
  { value: 'pe', label: 'P/E' },
  { value: 'roce', label: 'ROCE %' },
  { value: 'roe', label: 'ROE %' },
  { value: 'piotroski', label: 'Piotroski' },
  { value: 'dividendYield', label: 'Div Yield %' },
  { value: 'finalScore', label: 'Final Score' },
  { value: 'valuationScore', label: 'Valuation' },
  { value: 'qualityScore', label: 'Quality' },
  { value: 'safetyScore', label: 'Safety' },
];

const CLASSIFICATION_COLORS: Record<string, string> = {
  strong_long: '#2d7a4f',
  potential_long: '#3d9960',
  neutral: '#b8860b',
  potential_short: '#c97a20',
  strong_avoid: '#c0392b',
};

const CLASSIFICATIONS = ['strong_long', 'potential_long', 'neutral', 'potential_short', 'strong_avoid'];

interface ScatterPlotProps {
  data: CompanyPoint[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: CompanyPoint & { xVal: number; yVal: number } }>;
  xLabel: string;
  yLabel: string;
}

function CustomTooltip({ active, payload, xLabel, yLabel }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-bg-card dark:bg-dark-bg-card border border-border dark:border-dark-border rounded-lg p-2 text-xs shadow-lg">
      <div className="font-semibold text-text-primary dark:text-dark-text-primary mb-1">{d.name}</div>
      <div className="text-text-secondary dark:text-dark-text-secondary">
        {xLabel}: {d.xVal?.toFixed(1) ?? '—'}
      </div>
      <div className="text-text-secondary dark:text-dark-text-secondary">
        {yLabel}: {d.yVal?.toFixed(1) ?? '—'}
      </div>
    </div>
  );
}

export function ScatterPlot({ data }: ScatterPlotProps) {
  const [xAxis, setXAxis] = useState<AxisKey>('pe');
  const [yAxis, setYAxis] = useState<AxisKey>('roce');
  const router = useRouter();

  const filtered = data
    .filter((d) => d[xAxis] != null && d[yAxis] != null)
    .map((d) => ({ ...d, xVal: d[xAxis] as number, yVal: d[yAxis] as number }));

  const xLabel = AXIS_OPTIONS.find((o) => o.value === xAxis)?.label ?? xAxis;
  const yLabel = AXIS_OPTIONS.find((o) => o.value === yAxis)?.label ?? yAxis;

  const selectClass =
    'text-xs border border-border dark:border-dark-border rounded px-2 py-1 bg-bg-card dark:bg-dark-bg-card text-text-primary dark:text-dark-text-primary';

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-1 text-xs text-text-secondary dark:text-dark-text-secondary">
          <span>X:</span>
          <select className={selectClass} value={xAxis} onChange={(e) => setXAxis(e.target.value as AxisKey)}>
            {AXIS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1 text-xs text-text-secondary dark:text-dark-text-secondary">
          <span>Y:</span>
          <select className={selectClass} value={yAxis} onChange={(e) => setYAxis(e.target.value as AxisKey)}>
            {AXIS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length < 5 ? (
        <div className="h-[320px] flex items-center justify-center text-text-muted dark:text-dark-text-muted text-sm">
          Not enough data for scatter plot
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="xVal"
              name={xLabel}
              type="number"
              label={{ value: xLabel, position: 'insideBottom', offset: -10, fontSize: 11 }}
              tick={{ fontSize: 10 }}
            />
            <YAxis
              dataKey="yVal"
              name={yLabel}
              type="number"
              label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: 10, fontSize: 11 }}
              tick={{ fontSize: 10 }}
            />
            <Tooltip
              content={<CustomTooltip xLabel={xLabel} yLabel={yLabel} />}
              cursor={{ strokeDasharray: '3 3' }}
            />
            {CLASSIFICATIONS.map((cls) => {
              const points = filtered.filter((d) => d.classification === cls);
              if (points.length === 0) return null;
              return (
                <Scatter
                  key={cls}
                  name={cls}
                  data={points}
                  fill={CLASSIFICATION_COLORS[cls] ?? '#999'}
                  opacity={0.75}
                  onClick={(point) => {
                    if (point?.code) router.push(`/company/${point.code}`);
                  }}
                  style={{ cursor: 'pointer' }}
                />
              );
            })}
          </ScatterChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
