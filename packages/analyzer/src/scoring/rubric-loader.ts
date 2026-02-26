import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from '@screener/shared';
import type { ScoringRubric } from '@screener/shared';

let cachedRubric: ScoringRubric | null = null;

export function loadRubric(rubricPath?: string): ScoringRubric {
  if (cachedRubric) return cachedRubric;

  const defaultPath = resolve(process.cwd(), 'principles', 'scoring-rubric.json');
  const path = rubricPath ?? defaultPath;

  logger.info(`Loading scoring rubric from ${path}`);
  const raw = readFileSync(path, 'utf-8');
  const rubric = JSON.parse(raw) as ScoringRubric;

  // Validate weights sum to ~1.0
  const dims = rubric.scoringDimensions;
  const totalWeight =
    dims.valuation.weight +
    dims.quality.weight +
    dims.governance.weight +
    dims.safety.weight +
    dims.momentum.weight;

  if (Math.abs(totalWeight - 1.0) > 0.01) {
    throw new Error(`Scoring dimension weights sum to ${totalWeight}, expected 1.0`);
  }

  logger.info(
    `Rubric v${rubric.version}: ` +
    `${Object.keys(dims.valuation.metrics).length} valuation, ` +
    `${Object.keys(dims.quality.metrics).length} quality, ` +
    `${Object.keys(dims.governance.metrics).length} governance, ` +
    `${Object.keys(dims.safety.metrics).length} safety, ` +
    `${Object.keys(dims.momentum.metrics).length} momentum metrics`,
  );

  cachedRubric = rubric;
  return rubric;
}
