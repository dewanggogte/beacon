'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Label,
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

/** Hex fill colors for SVG scatter dots — aligned with theme accent tokens */
const CLASSIFICATION_COLORS: Record<string, string> = {
  strong_long: '#2d7a4f',
  potential_long: '#3d9960',
  neutral: '#b8860b',
  potential_short: '#c97a20',
  strong_avoid: '#c0392b',
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  strong_long: 'Strong Long',
  potential_long: 'Potential Long',
  neutral: 'Neutral',
  potential_short: 'Potential Short',
  strong_avoid: 'Strong Avoid',
};

/**
 * Render order: least important first (bottom layer) -> most important last (top layer).
 * This ensures strong_long dots are always visible on top of the mass of neutral/avoid dots.
 */
const RENDER_ORDER = ['strong_avoid', 'potential_short', 'neutral', 'potential_long', 'strong_long'];

/** Metrics that can legitimately be negative (don't clamp domain min to 0) */
const ALLOWS_NEGATIVE: Set<AxisKey> = new Set(['roce', 'roe']);

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
  const clsLabel = CLASSIFICATION_LABELS[d.classification] ?? d.classification;
  const clsColor = CLASSIFICATION_COLORS[d.classification] ?? '#999';
  return (
    <div className="bg-bg-card dark:bg-dark-bg-card border border-border dark:border-dark-border rounded-lg p-2.5 text-xs shadow-lg min-w-[140px]">
      <div className="font-semibold text-text-primary dark:text-dark-text-primary mb-1">{d.name}</div>
      <div className="text-text-secondary dark:text-dark-text-secondary">
        {xLabel}: {d.xVal?.toFixed(1) ?? '—'}
      </div>
      <div className="text-text-secondary dark:text-dark-text-secondary">
        {yLabel}: {d.yVal?.toFixed(1) ?? '—'}
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: clsColor }} />
        <span className="text-text-muted dark:text-dark-text-muted">{clsLabel}</span>
      </div>
    </div>
  );
}

/** Format axis tick values: integers for most metrics, 1 decimal for small ranges */
function tickFmt(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded) >= 10 || Number.isInteger(rounded)) {
    return String(Math.round(rounded));
  }
  return rounded.toFixed(1);
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

export function ScatterPlot({ data }: ScatterPlotProps) {
  const [xAxis, setXAxis] = useState<AxisKey>('pe');
  const [yAxis, setYAxis] = useState<AxisKey>('roce');
  const router = useRouter();

  const { filtered, xDomain, yDomain, xLabel, yLabel } = useMemo(() => {
    const raw = data
      .filter((d) => d[xAxis] != null && d[yAxis] != null)
      .map((d) => ({ ...d, xVal: d[xAxis] as number, yVal: d[yAxis] as number }));

    const xVals = raw.map((d) => d.xVal);
    const yVals = raw.map((d) => d.yVal);

    // 2nd-90th percentile clipping — more aggressive for financial fat tails
    const xMinP = xVals.length > 0 ? percentile(xVals, 0.02) : 0;
    const xMaxP = xVals.length > 0 ? percentile(xVals, 0.90) : 100;
    const yMinP = yVals.length > 0 ? percentile(yVals, 0.02) : 0;
    const yMaxP = yVals.length > 0 ? percentile(yVals, 0.90) : 100;

    // 10% padding
    const xPad = (xMaxP - xMinP) * 0.1 || 1;
    const yPad = (yMaxP - yMinP) * 0.1 || 1;

    // For metrics that can be negative, don't clamp min to 0
    const xLo = ALLOWS_NEGATIVE.has(xAxis) ? xMinP - xPad : Math.max(0, xMinP - xPad);
    const yLo = ALLOWS_NEGATIVE.has(yAxis) ? yMinP - yPad : Math.max(0, yMinP - yPad);

    const xDomainCalc: [number, number] = [
      Math.round(xLo * 10) / 10,
      Math.round((xMaxP + xPad) * 10) / 10,
    ];
    const yDomainCalc: [number, number] = [
      Math.round(yLo * 10) / 10,
      Math.round((yMaxP + yPad) * 10) / 10,
    ];

    const filteredData = raw.filter(
      (d) =>
        d.xVal >= xDomainCalc[0] &&
        d.xVal <= xDomainCalc[1] &&
        d.yVal >= yDomainCalc[0] &&
        d.yVal <= yDomainCalc[1]
    );

    return {
      filtered: filteredData,
      xDomain: xDomainCalc,
      yDomain: yDomainCalc,
      xLabel: AXIS_OPTIONS.find((o) => o.value === xAxis)?.label ?? xAxis,
      yLabel: AXIS_OPTIONS.find((o) => o.value === yAxis)?.label ?? yAxis,
    };
  }, [data, xAxis, yAxis]);

  const selectClass =
    'text-xs border border-border dark:border-dark-border rounded px-2 py-1 bg-bg-card dark:bg-dark-bg-card text-text-primary dark:text-dark-text-primary';

  return (
    <div>
      {/* Controls row: axis selectors */}
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
        <span className="text-[10px] text-text-muted dark:text-dark-text-muted ml-auto">
          {filtered.length.toLocaleString()} companies shown
        </span>
      </div>

      {filtered.length < 5 ? (
        <div className="h-[400px] flex items-center justify-center text-text-muted dark:text-dark-text-muted text-sm">
          Not enough data for scatter plot
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={400}>
          <ScatterChart margin={{ top: 12, right: 20, bottom: 36, left: 20 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border)"
              strokeOpacity={0.4}
            />
            <XAxis
              dataKey="xVal"
              name={xLabel}
              type="number"
              domain={xDomain}
              allowDataOverflow
              tickFormatter={tickFmt}
              tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
              tickLine={{ stroke: 'var(--color-border)' }}
              axisLine={{ stroke: 'var(--color-border)' }}
            >
              <Label
                value={xLabel}
                position="bottom"
                offset={16}
                style={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
              />
            </XAxis>
            <YAxis
              dataKey="yVal"
              name={yLabel}
              type="number"
              domain={yDomain}
              allowDataOverflow
              tickFormatter={tickFmt}
              tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
              tickLine={{ stroke: 'var(--color-border)' }}
              axisLine={{ stroke: 'var(--color-border)' }}
            >
              <Label
                value={yLabel}
                angle={-90}
                position="left"
                offset={4}
                style={{ fontSize: 11, fill: 'var(--color-text-secondary)', textAnchor: 'middle' }}
              />
            </YAxis>
            <Tooltip
              content={<CustomTooltip xLabel={xLabel} yLabel={yLabel} />}
              cursor={{ strokeDasharray: '3 3', stroke: 'var(--color-text-muted)' }}
            />
            {/* Render in reverse importance: avoid -> neutral -> ... -> strong_long (on top) */}
            {RENDER_ORDER.map((cls) => {
              const points = filtered.filter((d) => d.classification === cls);
              if (points.length === 0) return null;
              return (
                <Scatter
                  key={cls}
                  name={cls}
                  data={points}
                  fill={CLASSIFICATION_COLORS[cls] ?? '#999'}
                  opacity={0.45}
                  r={3}
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

      {/* Legend — simple colored dots + labels below chart */}
      <div className="flex items-center justify-center gap-4 mt-2 flex-wrap">
        {RENDER_ORDER.slice().reverse().map((cls) => (
          <div key={cls} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: CLASSIFICATION_COLORS[cls] }}
            />
            <span className="text-[11px] text-text-secondary dark:text-dark-text-secondary">
              {CLASSIFICATION_LABELS[cls]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
