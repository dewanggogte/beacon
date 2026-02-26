/**
 * Framework orchestrator — runs all four evaluators.
 */
import type { FrameworkResults } from '@screener/shared';
import type { EnrichedSnapshot } from '../enrichment/flatten-v2.js';
import { evaluateBuffett } from './buffett.js';
import { evaluateGraham } from './graham.js';
import { evaluateLynch } from './lynch.js';
import { evaluatePabrai } from './pabrai.js';

export { evaluateBuffett } from './buffett.js';
export { evaluateGraham } from './graham.js';
export { evaluateLynch } from './lynch.js';
export { evaluatePabrai } from './pabrai.js';

export function evaluateAllFrameworks(data: EnrichedSnapshot): FrameworkResults {
  return {
    buffett: evaluateBuffett(data),
    graham: evaluateGraham(data),
    lynch: evaluateLynch(data),
    pabrai: evaluatePabrai(data),
  };
}
