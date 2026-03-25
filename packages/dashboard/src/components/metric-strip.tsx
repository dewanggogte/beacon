import { metricDefinitions, formatMetric } from '../lib/metric-definitions.js';
import { Tooltip, InfoIcon } from './tooltip.js';

interface MetricItem {
  key: string;
  value: number | null;
  sectorMedian?: number | null;
}

interface MetricStripProps {
  metrics: MetricItem[];
}

function getContextLine(
  key: string,
  value: number | null,
  sectorMedian: number | null | undefined,
): { text: string; color: string } | null {
  if (value == null || sectorMedian == null) return null;
  const def = metricDefinitions[key];
  if (!def) return null;

  const pct = Math.abs((value - sectorMedian) / (Math.abs(sectorMedian) || 1));
  const formattedMedian = formatMetric(key, sectorMedian);

  if (pct <= 0.1) {
    return { text: `≈ sector ${formattedMedian}`, color: 'text-accent-amber' };
  }

  const isBetter = def.higherIsBetter ? value > sectorMedian : value < sectorMedian;
  if (isBetter) {
    return { text: `▲ vs sector ${formattedMedian}`, color: 'text-accent-green' };
  } else {
    return { text: `▼ vs sector ${formattedMedian}`, color: 'text-accent-red' };
  }
}

export function MetricStrip({ metrics }: MetricStripProps) {
  return (
    <div className="grid grid-cols-2 md:flex gap-px bg-border dark:bg-dark-border rounded-lg overflow-hidden">
      {metrics.map(({ key, value, sectorMedian }) => {
        const def = metricDefinitions[key];
        const label = def?.fullName ?? key;
        const contextLine = getContextLine(key, value, sectorMedian);

        const tooltipContent = def ? (
          <div>
            <div className="font-semibold mb-1">{def.fullName}</div>
            <div className="text-text-secondary dark:text-dark-text-secondary mb-1">{def.explanation}</div>
            <div className="text-text-muted dark:text-dark-text-muted">Good: {def.goodRange}</div>
          </div>
        ) : (
          <span>{key}</span>
        );

        return (
          <div
            key={key}
            className="flex-1 bg-bg-card dark:bg-dark-bg-card p-3 text-center min-w-0"
          >
            <div className="flex items-center justify-center gap-0.5 mb-1">
              <span
                className="text-[11px] uppercase tracking-wider text-text-muted dark:text-dark-text-muted truncate"
                style={{ fontSize: '11px' }}
              >
                {label}
              </span>
              <Tooltip content={tooltipContent}>
                <InfoIcon />
              </Tooltip>
            </div>
            <div className="text-lg font-semibold text-text-primary dark:text-dark-text-primary">
              {formatMetric(key, value)}
            </div>
            {contextLine && (
              <div className={`mt-0.5 ${contextLine.color}`} style={{ fontSize: '10px' }}>
                {contextLine.text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
