import { db, schema, logger } from '@screener/shared';
import type { ScoringRubric, CompanyAnalysis, DimensionScore } from '@screener/shared';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scoreDimension } from './dimension-scorer.js';
import { computeComposite, computeGeometricMean, classify, computeConviction } from './composite-scorer.js';
import { checkDisqualifiers } from './disqualifier.js';
import { flattenV2, enrichedToFlat, type EnrichedSnapshot } from '../enrichment/flatten-v2.js';
import { evaluateAllFrameworks } from '../frameworks/index.js';

// Broad cyclical sector names (Screener.in uses these)
const CYCLICAL_BROAD_SECTORS = new Set([
  'commodities', 'energy', 'utilities', 'industrials',
]);

// Load granular cyclical sectors for sub-sector matching
let cyclicalSubSectors: string[] | null = null;
function loadCyclicalSectors(): string[] {
  if (cyclicalSubSectors) return cyclicalSubSectors;
  try {
    const path = resolve(process.cwd(), 'principles', 'frameworks', 'cyclical-sectors.json');
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    cyclicalSubSectors = (data.cyclicalSectors as string[]).map((s) => s.toLowerCase());
  } catch {
    cyclicalSubSectors = [];
  }
  return cyclicalSubSectors;
}

function isCyclicalSector(sector: string): boolean {
  const lower = sector.toLowerCase();
  if (CYCLICAL_BROAD_SECTORS.has(lower)) return true;
  return loadCyclicalSectors().some((cs) => lower.includes(cs) || cs.includes(lower));
}

export interface ScoreResult {
  analyses: CompanyAnalysis[];
  enrichedMap: Map<number, EnrichedSnapshot>;
}

/**
 * Score all companies from a given scrape run.
 */
export async function scoreAllCompanies(
  scrapeRunId: number,
  rubric: ScoringRubric,
): Promise<ScoreResult> {
  // Load all snapshots for this run, joined with company data
  const snapshots = await db
    .select()
    .from(schema.companySnapshots)
    .innerJoin(schema.companies, eq(schema.companySnapshots.companyId, schema.companies.id))
    .where(eq(schema.companySnapshots.scrapeRunId, scrapeRunId));

  logger.info(`Scoring ${snapshots.length} companies from run #${scrapeRunId}`);

  const analyses: CompanyAnalysis[] = [];
  const enrichedMap = new Map<number, EnrichedSnapshot>();
  let skippedCount = 0;

  for (const row of snapshots) {
    const company = row.companies;
    const snapshot = row.company_snapshots;

    // Skip empty snapshots (sparse/new listings with no data)
    if (!snapshot.marketCap && !snapshot.stockPe && !snapshot.roe && !snapshot.roce) {
      skippedCount++;
      continue;
    }

    // Deep data extraction (Phase 1)
    const enriched = flattenV2(snapshot, company.sector ?? 'Unknown');
    enrichedMap.set(company.id, enriched);
    const flat = enrichedToFlat(enriched);

    // Check disqualifiers (including v3 hard gates)
    const { reasons: disqualificationReasons, gateResults } = checkDisqualifiers(flat, rubric.automaticDisqualifiers, enriched);
    const disqualified = disqualificationReasons.length > 0;

    // Score each dimension (v1 — preserved for backwards compatibility)
    const dims = rubric.scoringDimensions;
    const dimensionScores: DimensionScore[] = [
      scoreDimension('valuation', dims.valuation, flat, company.sector ?? undefined),
      scoreDimension('quality', dims.quality, flat, company.sector ?? undefined),
      scoreDimension('governance', dims.governance, flat, company.sector ?? undefined),
      scoreDimension('safety', dims.safety, flat, company.sector ?? undefined),
      scoreDimension('momentum', dims.momentum, flat, company.sector ?? undefined),
    ];

    // v3.2 quality + valuation adjustments
    const qualityDim = dimensionScores.find((d) => d.dimension === 'quality');
    const valuationDim = dimensionScores.find((d) => d.dimension === 'valuation');

    if (qualityDim) {
      // Other income inflation: tiered penalty
      // >60% → slash quality by 40% (ASHOKA-type: core business barely profitable)
      // >40% → reduce quality by 25%
      // >25% → reduce quality by 10%
      const otherIncome = enriched.otherIncomeToProfit;
      if (otherIncome != null && otherIncome > 0.25) {
        const pctStr = Math.round(otherIncome * 100);
        let factor: number;
        if (otherIncome > 0.6) {
          factor = 0.4;
        } else if (otherIncome > 0.4) {
          factor = 0.25;
        } else {
          factor = 0.1;
        }
        const penalty = Math.round(qualityDim.score * factor);
        qualityDim.score = Math.max(1, qualityDim.score - penalty);
        qualityDim.flags.push(`Other income ${pctStr}% of profit (-${penalty})`);
      }
    }

    // Cyclical peak: penalize BOTH quality AND valuation
    // When margins are far above historical average, current PE is misleadingly low
    if (enriched.opmAvg5YToCurrentRatio != null && enriched.opmAvg5YToCurrentRatio > 1.3) {
      const ratio = enriched.opmAvg5YToCurrentRatio;
      // >2.0x → aggressive penalty (margins more than double the average)
      // >1.5x → moderate penalty
      // >1.3x → mild penalty
      let qualPenalty: number;
      let valPenalty: number;
      if (ratio > 2.0) {
        qualPenalty = 0.25;
        valPenalty = 0.30;
      } else if (ratio > 1.5) {
        qualPenalty = 0.15;
        valPenalty = 0.20;
      } else {
        qualPenalty = 0.08;
        valPenalty = 0.10;
      }

      if (qualityDim) {
        const qp = Math.round(qualityDim.score * qualPenalty);
        qualityDim.score = Math.max(1, qualityDim.score - qp);
        qualityDim.flags.push(`Cyclical peak: OPM ${ratio.toFixed(1)}x 5Y avg (-${qp})`);
      }
      if (valuationDim) {
        const vp = Math.round(valuationDim.score * valPenalty);
        valuationDim.score = Math.max(1, valuationDim.score - vp);
        valuationDim.flags.push(`Cyclical peak valuation: PE on inflated margins (-${vp})`);
      }
    }

    // v3.2: Cyclical sector + deteriorating fundamentals penalty
    // If sector is cyclical AND Piotroski <= 4, the company has declining fundamentals
    // even if current margins look high. Penalize quality and valuation.
    if (isCyclicalSector(company.sector ?? '') && enriched.piotroskiFScore <= 4) {
      if (qualityDim) {
        const qp = Math.round(qualityDim.score * 0.15);
        qualityDim.score = Math.max(1, qualityDim.score - qp);
        qualityDim.flags.push(`Cyclical sector + Piotroski ${enriched.piotroskiFScore}/9 (-${qp})`);
      }
      if (valuationDim) {
        const vp = Math.round(valuationDim.score * 0.15);
        valuationDim.score = Math.max(1, valuationDim.score - vp);
        valuationDim.flags.push(`Cyclical sector: earnings may be at peak (-${vp})`);
      }
    }

    // V1 composite (preserved for reference)
    const dimensionComposite = computeComposite(dimensionScores);

    // Framework evaluators (still computed and stored, not blended into composite)
    const frameworkResults = evaluateAllFrameworks(enriched);

    // V3 composite: geometric mean of dimensions (frameworks NOT blended in)
    const compositeScore = computeGeometricMean(dimensionScores);

    // Classification
    const classification = classify(compositeScore, disqualified, rubric.classificationThresholds);

    // Conviction
    const conviction = computeConviction(compositeScore, disqualified, frameworkResults);

    analyses.push({
      companyId: company.id,
      companyName: company.name,
      screenerCode: company.screenerCode,
      sector: company.sector ?? 'Unknown',
      dimensionScores,
      compositeScore,
      disqualified,
      disqualificationReasons,
      finalScore: compositeScore, // Will be adjusted by LLM later
      classification,
      rank: 0, // Assigned below
      rankInSector: 0,
      frameworkResults,
      convictionLevel: conviction.level,
      convictionReasons: conviction.reasons,
      // v3 financial health scores
      piotroskiFScore: enriched.piotroskiFScore,
      altmanZScore: enriched.altmanZScore,
      beneishMScore: enriched.beneishMScore,
      gateResults,
    });
  }

  // Sort and assign ranks
  analyses.sort((a, b) => b.compositeScore - a.compositeScore);
  analyses.forEach((a, i) => { a.rank = i + 1; });

  // Assign per-sector ranks
  const sectorGroups = new Map<string, CompanyAnalysis[]>();
  for (const a of analyses) {
    const list = sectorGroups.get(a.sector) ?? [];
    list.push(a);
    sectorGroups.set(a.sector, list);
  }
  for (const [, group] of sectorGroups) {
    group.sort((a, b) => b.compositeScore - a.compositeScore);
    group.forEach((a, i) => { a.rankInSector = i + 1; });
  }

  // Summary
  if (skippedCount > 0) {
    logger.info(`Skipped ${skippedCount} companies with empty snapshots`);
  }
  const counts = { strong_long: 0, potential_long: 0, neutral: 0, potential_short: 0, strong_avoid: 0 };
  for (const a of analyses) { counts[a.classification]++; }
  logger.info(`Classification distribution: ${JSON.stringify(counts)}`);

  // Lynch distribution
  const lynchCounts: Record<string, number> = {};
  for (const a of analyses) {
    const cat = a.frameworkResults?.lynch.category ?? 'unknown';
    lynchCounts[cat] = (lynchCounts[cat] ?? 0) + 1;
  }
  logger.info(`Lynch distribution: ${JSON.stringify(lynchCounts)}`);

  // Conviction distribution
  const convCounts: Record<string, number> = {};
  for (const a of analyses) {
    const lvl = a.convictionLevel ?? 'none';
    convCounts[lvl] = (convCounts[lvl] ?? 0) + 1;
  }
  logger.info(`Conviction distribution: ${JSON.stringify(convCounts)}`);

  return { analyses, enrichedMap };
}
