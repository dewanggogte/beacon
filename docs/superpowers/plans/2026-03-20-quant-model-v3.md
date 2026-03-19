# Quant Model v3.0 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the additive weighted-average quant composite with hard gates (5 new disqualifiers) + geometric mean scoring that prevents cheap-but-declining companies from reaching the LLM pipeline.

**Architecture:** Three changes to the scoring pipeline: (1) new financial health metrics computed in flattenV2 (Piotroski F-Score, Altman Z-Score, Beneish M-Score, ROCE trailing 3Y, revenue decline count), (2) new hard gate disqualifiers that run before scoring, (3) geometric mean composite replacing the additive V2 blend. Framework scores (Buffett/Graham/Lynch/Pabrai) are still computed and stored but no longer blended into the composite.

**Tech Stack:** TypeScript (ESM), Drizzle ORM (PostgreSQL), Next.js 15 (dashboard)

**Spec:** `docs/superpowers/specs/2026-03-20-quant-model-v3-design.md`

---

## File structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `packages/analyzer/src/enrichment/financial-scores.ts` | Piotroski F-Score, Altman Z-Score, Beneish M-Score computations |
| Modify | `packages/analyzer/src/enrichment/flatten-v2.ts` | Add 5 new fields to `EnrichedSnapshot`, compute them in `flattenV2()` |
| Create | `packages/analyzer/src/scoring/hard-gates.ts` | 5 new gate checks, returns pass/fail + reasons |
| Modify | `packages/analyzer/src/scoring/disqualifier.ts` | Call hard gates from enriched data |
| Modify | `packages/analyzer/src/scoring/composite-scorer.ts` | Replace `computeCompositeV2` with `computeGeometricMean` |
| Modify | `packages/analyzer/src/scoring/engine.ts` | Wire up new gates, use geometric mean, store new scores |
| Modify | `packages/shared/src/db/schema.ts` | Add 4 new columns to `analysis_results` |
| Create | `packages/shared/drizzle/0003_*.sql` | Migration for new columns |
| Modify | `packages/analyzer/src/storage/save-analysis.ts` | Persist new scores |
| Modify | `packages/shared/src/types/analysis.ts` | Add new fields to `CompanyAnalysis` |
| Modify | `packages/dashboard/src/app/company/[code]/page.tsx` | Show Piotroski/Altman/Beneish |
| Modify | `packages/dashboard/src/lib/queries.ts` | Select new columns |

---

## Task 1: Financial health score computations

**Files:**
- Create: `packages/analyzer/src/enrichment/financial-scores.ts`

- [ ] **Step 1: Create Piotroski F-Score function**

```typescript
// packages/analyzer/src/enrichment/financial-scores.ts

import type { EnrichedSnapshot } from './flatten-v2.js';

/**
 * Piotroski F-Score: 9 binary criteria summed (0-9).
 * Higher = stronger fundamentals.
 *
 * Profitability (4 points):
 *   1. ROA > 0 (net profit / total assets)
 *   2. OCF > 0
 *   3. ROA improving YoY
 *   4. OCF > Net Profit (accruals check)
 *
 * Leverage/Liquidity (3 points):
 *   5. Long-term debt ratio decreasing YoY
 *   6. Current ratio improving YoY
 *   7. No new shares issued (equity not diluted)
 *
 * Efficiency (2 points):
 *   8. Gross margin improving YoY
 *   9. Asset turnover improving YoY (revenue / total assets)
 */
export function computePiotroskiFScore(e: EnrichedSnapshot): number {
  let score = 0;

  // Need at least 2 years of data for YoY comparisons
  // Index 0 = most recent year, index 1 = prior year

  // --- Profitability ---

  // 1. ROA > 0: net profit / total assets (most recent year)
  const netProfit0 = e.netProfitHistory[0];
  const totalAssets0 = e.totalAssetsHistory[0];
  const roa0 = (netProfit0 != null && totalAssets0 != null && totalAssets0 > 0)
    ? netProfit0 / totalAssets0 : null;
  if (roa0 != null && roa0 > 0) score++;

  // 2. OCF > 0
  const ocf0 = e.ocfHistory[0];
  if (ocf0 != null && ocf0 > 0) score++;

  // 3. ROA improving YoY
  const netProfit1 = e.netProfitHistory[1];
  const totalAssets1 = e.totalAssetsHistory[1];
  const roa1 = (netProfit1 != null && totalAssets1 != null && totalAssets1 > 0)
    ? netProfit1 / totalAssets1 : null;
  if (roa0 != null && roa1 != null && roa0 > roa1) score++;

  // 4. Accruals: OCF > Net Profit (cash earnings > reported earnings)
  if (ocf0 != null && netProfit0 != null && ocf0 > netProfit0) score++;

  // --- Leverage/Liquidity ---

  // 5. Long-term debt ratio decreasing (borrowings / total assets)
  const debt0 = e.borrowingsHistory[0];
  const debt1 = e.borrowingsHistory[1];
  const debtRatio0 = (debt0 != null && totalAssets0 != null && totalAssets0 > 0)
    ? debt0 / totalAssets0 : null;
  const debtRatio1 = (debt1 != null && totalAssets1 != null && totalAssets1 > 0)
    ? debt1 / totalAssets1 : null;
  if (debtRatio0 != null && debtRatio1 != null && debtRatio0 < debtRatio1) score++;
  // No debt at all = pass
  if (debt0 != null && debt0 === 0) score++;

  // 6. Current ratio improving (proxy: we use currentRatioProxy)
  // Can't easily get YoY, so check if current ratio > 1.5 as a pass
  if (e.currentRatioProxy != null && e.currentRatioProxy >= 1.5) score++;

  // 7. No dilution: equity count not increasing
  const equity0 = e.equityHistory[0];
  const equity1 = e.equityHistory[1];
  if (equity0 != null && equity1 != null && equity0 <= equity1) score++;
  // If only one year of data, assume no dilution
  if (equity0 != null && equity1 == null) score++;

  // --- Efficiency ---

  // 8. Gross margin improving (use OPM as proxy)
  const opm0 = e.opmHistory[0];
  const opm1 = e.opmHistory[1];
  if (opm0 != null && opm1 != null && opm0 > opm1) score++;

  // 9. Asset turnover improving (revenue / total assets)
  const rev0 = e.revenueHistory[0];
  const rev1 = e.revenueHistory[1];
  const turnover0 = (rev0 != null && totalAssets0 != null && totalAssets0 > 0)
    ? rev0 / totalAssets0 : null;
  const turnover1 = (rev1 != null && totalAssets1 != null && totalAssets1 > 0)
    ? rev1 / totalAssets1 : null;
  if (turnover0 != null && turnover1 != null && turnover0 > turnover1) score++;

  return score;
}

/**
 * Altman Z-Score: bankruptcy prediction model.
 * Z > 3.0 = safe, 1.8-3.0 = grey zone, < 1.8 = distress.
 *
 * Uses Z''-Score (non-manufacturing variant) which drops the
 * revenue/assets term to avoid penalizing service companies:
 *   Z'' = 6.56*X1 + 3.26*X2 + 6.72*X3 + 1.05*X4
 *
 * X1 = Working Capital / Total Assets
 * X2 = Retained Earnings / Total Assets
 * X3 = EBIT / Total Assets
 * X4 = Market Cap / Total Liabilities
 */
export function computeAltmanZScore(e: EnrichedSnapshot): number | null {
  const totalAssets = e.totalAssetsHistory[0];
  const totalLiabilities = (totalAssets != null && e.netWorthHistory[0] != null)
    ? totalAssets - e.netWorthHistory[0] : null;

  if (totalAssets == null || totalAssets <= 0) return null;
  if (totalLiabilities == null || totalLiabilities <= 0) return null;

  // X1: Working Capital / Total Assets
  // WC = Current Assets - Current Liabilities. Proxy: NCAV gives us a rough figure.
  // Better proxy: use (total assets - fixed assets - borrowings) as current assets minus current liab
  const ncav = e.ncav;
  const x1 = ncav != null ? ncav / totalAssets : 0;

  // X2: Retained Earnings / Total Assets
  const reserves = e.reservesHistory[0];
  const x2 = reserves != null ? reserves / totalAssets : 0;

  // X3: EBIT / Total Assets (operating profit as EBIT proxy)
  const ebit = e.operatingProfitHistory[0];
  const x3 = ebit != null ? ebit / totalAssets : 0;

  // X4: Market Cap / Total Liabilities
  const marketCap = e.marketCap;
  const x4 = marketCap != null ? marketCap / totalLiabilities : 0;

  // Z''-Score formula (non-manufacturing variant)
  const z = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;

  return Math.round(z * 100) / 100;
}

/**
 * Beneish M-Score: earnings manipulation detection.
 * M-Score > -1.78 = likely manipulator (aggressive threshold).
 * M-Score > -2.22 = likely manipulator (conservative threshold).
 *
 * Uses 5-variable version (more robust with limited data):
 *   M = -6.065 + 0.823*DSRI + 0.906*GMI + 0.593*AQI + 0.717*SGI + 0.107*DEPI
 *
 * DSRI = Days Sales Receivable Index (receivables growth vs revenue growth)
 * GMI  = Gross Margin Index (prior year GM / current year GM, >1 = declining)
 * AQI  = Asset Quality Index (non-current asset ratio change)
 * SGI  = Sales Growth Index (current revenue / prior revenue)
 * DEPI = Depreciation Index (prior depr rate / current depr rate)
 */
export function computeBeneishMScore(e: EnrichedSnapshot): number | null {
  // Need 2 years of data minimum
  const rev0 = e.revenueHistory[0];
  const rev1 = e.revenueHistory[1];
  if (rev0 == null || rev1 == null || rev0 <= 0 || rev1 <= 0) return null;

  const totalAssets0 = e.totalAssetsHistory[0];
  const totalAssets1 = e.totalAssetsHistory[1];
  if (totalAssets0 == null || totalAssets1 == null || totalAssets0 <= 0 || totalAssets1 <= 0) return null;

  // DSRI: Days Sales Receivable Index
  // Proxy: use (debtorDays current / debtorDays prior). >1 = receivables growing faster than sales.
  const dd0 = e.debtorDaysHistory[0];
  const dd1 = e.debtorDaysHistory[1];
  const dsri = (dd0 != null && dd1 != null && dd1 > 0) ? dd0 / dd1 : 1.0;

  // GMI: Gross Margin Index (prior / current, >1 = margin declining)
  const opm0 = e.opmHistory[0];
  const opm1 = e.opmHistory[1];
  const gmi = (opm0 != null && opm1 != null && opm0 > 0) ? opm1 / opm0 : 1.0;

  // AQI: Asset Quality Index
  // AQI = (1 - (CA+FA)/TA)_current / (1 - (CA+FA)/TA)_prior
  // Proxy: non-current non-fixed assets ratio change
  const fa0 = e.fixedAssetsHistory[0];
  const fa1 = e.fixedAssetsHistory[1];
  const aq0 = (fa0 != null) ? 1 - (fa0 / totalAssets0) : 0.5;
  const aq1 = (fa1 != null) ? 1 - (fa1 / totalAssets1) : 0.5;
  const aqi = aq1 > 0 ? aq0 / aq1 : 1.0;

  // SGI: Sales Growth Index
  const sgi = rev0 / rev1;

  // DEPI: Depreciation Index (prior rate / current rate, >1 = slowing depreciation)
  const dep0 = e.depreciationHistory[0];
  const dep1 = e.depreciationHistory[1];
  const depRate0 = (dep0 != null && fa0 != null && fa0 > 0) ? dep0 / fa0 : null;
  const depRate1 = (dep1 != null && fa1 != null && fa1 > 0) ? dep1 / fa1 : null;
  const depi = (depRate0 != null && depRate1 != null && depRate0 > 0) ? depRate1 / depRate0 : 1.0;

  // 5-variable M-Score
  const m = -6.065 + 0.823 * dsri + 0.906 * gmi + 0.593 * aqi + 0.717 * sgi + 0.107 * depi;

  return Math.round(m * 100) / 100;
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit packages/analyzer/src/enrichment/financial-scores.ts` or `npm run build`

- [ ] **Step 3: Commit**

```bash
git add packages/analyzer/src/enrichment/financial-scores.ts
git commit -m "feat: add Piotroski F-Score, Altman Z-Score, Beneish M-Score computations"
```

---

## Task 2: Add new fields to EnrichedSnapshot and compute them

**Files:**
- Modify: `packages/analyzer/src/enrichment/flatten-v2.ts` (interface + flattenV2 function)

- [ ] **Step 1: Add 5 new fields to the `EnrichedSnapshot` interface**

After `sector: string;` (line 155) add:

```typescript
  // --- v3 financial health scores ---
  piotroskiFScore: number;
  altmanZScore: number | null;
  beneishMScore: number | null;
  roceTrailing3Y: number | null;
  revenueDeclineYears: number;
```

- [ ] **Step 2: Import the score functions and compute them in `flattenV2()`**

Add import at the top of `flatten-v2.ts`:
```typescript
import { computePiotroskiFScore, computeAltmanZScore, computeBeneishMScore } from './financial-scores.js';
```

At the end of the `flattenV2()` function, before the `return enriched` statement, add:
```typescript
  // v3 financial health scores
  enriched.piotroskiFScore = computePiotroskiFScore(enriched);
  enriched.altmanZScore = computeAltmanZScore(enriched);
  enriched.beneishMScore = computeBeneishMScore(enriched);
  enriched.roceTrailing3Y = seriesAverageN(enriched.roceHistory, 3);

  // Count revenue decline years in last 5
  const rev5 = enriched.revenueHistory.slice(0, 5);
  let declineCount = 0;
  for (let i = 0; i < rev5.length - 1; i++) {
    const curr = rev5[i];
    const prev = rev5[i + 1];
    if (curr != null && prev != null && prev > 0 && curr < prev) declineCount++;
  }
  enriched.revenueDeclineYears = declineCount;
```

Also add the initial values in the `flattenV2()` constructor object (after `sector,`):
```typescript
    piotroskiFScore: 0,
    altmanZScore: null,
    beneishMScore: null,
    roceTrailing3Y: null,
    revenueDeclineYears: 0,
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add packages/analyzer/src/enrichment/flatten-v2.ts
git commit -m "feat: add Piotroski, Altman, Beneish, ROCE 3Y, revenue decline to EnrichedSnapshot"
```

---

## Task 3: Hard gates

**Files:**
- Create: `packages/analyzer/src/scoring/hard-gates.ts`
- Modify: `packages/analyzer/src/scoring/disqualifier.ts`

- [ ] **Step 1: Create the hard gates module**

```typescript
// packages/analyzer/src/scoring/hard-gates.ts

import type { EnrichedSnapshot } from '../enrichment/flatten-v2.js';

export interface GateResult {
  gate: string;
  passed: boolean;
  value: number | null;
  threshold: string;
}

/**
 * Run the 5 new hard gates. Returns failing gate reasons (empty = all passed).
 * These supplement the existing 8 disqualifiers in disqualifier.ts.
 */
export function checkHardGates(enriched: EnrichedSnapshot): { reasons: string[]; gateResults: GateResult[] } {
  const reasons: string[] = [];
  const gateResults: GateResult[] = [];
  const isFinancialSector = isBankingOrNBFC(enriched.sector);

  // Gate 9: Piotroski F-Score <= 2
  const fScore = enriched.piotroskiFScore;
  const fScorePassed = fScore > 2;
  gateResults.push({ gate: 'piotroski_f_score', passed: fScorePassed, value: fScore, threshold: '> 2' });
  if (!fScorePassed) {
    reasons.push(`Piotroski F-Score ${fScore}/9 (severe fundamental weakness)`);
  }

  // Gate 10: Altman Z-Score < 1.8 (skip for banking/NBFC)
  const zScore = enriched.altmanZScore;
  if (!isFinancialSector && zScore != null) {
    const zPassed = zScore >= 1.8;
    gateResults.push({ gate: 'altman_z_score', passed: zPassed, value: zScore, threshold: '>= 1.8' });
    if (!zPassed) {
      reasons.push(`Altman Z-Score ${zScore.toFixed(2)} (distress zone, bankruptcy risk)`);
    }
  } else {
    gateResults.push({ gate: 'altman_z_score', passed: true, value: zScore, threshold: 'skipped (financial sector)' });
  }

  // Gate 11: ROCE trailing 3Y < 6% (skip for banking/NBFC)
  const roce3y = enriched.roceTrailing3Y;
  if (!isFinancialSector && roce3y != null) {
    const rocePassed = roce3y >= 6;
    gateResults.push({ gate: 'roce_3y_floor', passed: rocePassed, value: roce3y, threshold: '>= 6%' });
    if (!rocePassed) {
      reasons.push(`ROCE trailing 3Y avg ${roce3y.toFixed(1)}% (below fixed deposit returns)`);
    }
  } else {
    gateResults.push({ gate: 'roce_3y_floor', passed: true, value: roce3y, threshold: 'skipped (financial sector or no data)' });
  }

  // Gate 12: Revenue declining 4+ of last 5 years
  const declineYears = enriched.revenueDeclineYears;
  const revPassed = declineYears < 4;
  gateResults.push({ gate: 'revenue_decline', passed: revPassed, value: declineYears, threshold: '< 4 years declining' });
  if (!revPassed) {
    reasons.push(`Revenue declined ${declineYears} of last 5 years (structural shrinkage)`);
  }

  // Gate 13: Beneish M-Score > -1.78 (earnings manipulation flag)
  const mScore = enriched.beneishMScore;
  if (mScore != null) {
    const mPassed = mScore <= -1.78;
    gateResults.push({ gate: 'beneish_m_score', passed: mPassed, value: mScore, threshold: '<= -1.78' });
    if (!mPassed) {
      reasons.push(`Beneish M-Score ${mScore.toFixed(2)} (potential earnings manipulation)`);
    }
  } else {
    gateResults.push({ gate: 'beneish_m_score', passed: true, value: null, threshold: 'skipped (insufficient data)' });
  }

  return { reasons, gateResults };
}

function isBankingOrNBFC(sector: string): boolean {
  const lower = sector.toLowerCase();
  return lower.includes('bank') || lower.includes('nbfc') || lower.includes('financial');
}
```

- [ ] **Step 2: Integrate hard gates into the existing disqualifier**

In `packages/analyzer/src/scoring/disqualifier.ts`, add import and call after the existing enriched checks (after line 38, before `return reasons`):

```typescript
import { checkHardGates, type GateResult } from './hard-gates.js';
```

Change the function signature and add the hard gate call:

```typescript
export function checkDisqualifiers(
  snapshot: Record<string, unknown>,
  disqualifiers: string[],
  enriched?: EnrichedSnapshot,
): { reasons: string[]; gateResults?: GateResult[] } {
  const reasons: string[] = [];
  // ... existing code unchanged ...

  // v3 hard gates
  let gateResults: GateResult[] | undefined;
  if (enriched) {
    // ... existing enriched checks ...

    const gates = checkHardGates(enriched);
    reasons.push(...gates.reasons);
    gateResults = gates.gateResults;
  }

  return { reasons, gateResults };
}
```

- [ ] **Step 3: Update callers of `checkDisqualifiers`**

In `packages/analyzer/src/scoring/engine.ts` line 51, update to destructure:
```typescript
    const { reasons: disqualificationReasons, gateResults } = checkDisqualifiers(flat, rubric.automaticDisqualifiers, enriched);
```

Store `gateResults` in the analysis object (will be added to the type in Task 5).

- [ ] **Step 4: Build and verify**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add packages/analyzer/src/scoring/hard-gates.ts packages/analyzer/src/scoring/disqualifier.ts packages/analyzer/src/scoring/engine.ts
git commit -m "feat: add 5 new hard gate disqualifiers (Piotroski, Altman, ROCE, revenue decline, Beneish)"
```

---

## Task 4: Geometric mean composite

**Files:**
- Modify: `packages/analyzer/src/scoring/composite-scorer.ts`
- Modify: `packages/analyzer/src/scoring/engine.ts`

- [ ] **Step 1: Add `computeGeometricMean` function to `composite-scorer.ts`**

Add after the existing `computeCompositeV2` function:

```typescript
/**
 * Compute composite score v3: geometric mean of dimension scores.
 * Multiplicative — a low score in any dimension drags the total down.
 * Prevents high valuation from compensating terrible quality.
 */
export function computeGeometricMean(dimensions: DimensionScore[]): number {
  if (dimensions.length === 0) return 0;

  // Clamp scores to [1, 100] to avoid log(0)
  let weightedLogSum = 0;
  let totalWeight = 0;

  for (const dim of dimensions) {
    const clamped = Math.max(1, Math.min(100, dim.score));
    weightedLogSum += dim.weight * Math.log(clamped);
    totalWeight += dim.weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round(Math.exp(weightedLogSum / totalWeight));
}
```

- [ ] **Step 2: Switch `engine.ts` from V2 composite to geometric mean**

In `packages/analyzer/src/scoring/engine.ts`, change the import:

```typescript
import { computeComposite, computeGeometricMean, classify, computeConviction } from './composite-scorer.js';
```

Replace lines 64-71 (the V1/V2 composite computation):

```typescript
    // V1 composite (preserved for reference)
    const dimensionComposite = computeComposite(dimensionScores);

    // Framework evaluators (still computed and stored)
    const frameworkResults = evaluateAllFrameworks(enriched);

    // V3 composite: geometric mean of dimensions (frameworks NOT blended in)
    const compositeScore = computeGeometricMean(dimensionScores);
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add packages/analyzer/src/scoring/composite-scorer.ts packages/analyzer/src/scoring/engine.ts
git commit -m "feat: replace additive composite with geometric mean (v3)

Frameworks still computed and stored but no longer blended into
the composite. Prevents cheap-but-declining companies from scoring
high due to valuation compensating bad quality."
```

---

## Task 5: Type updates and DB migration

**Files:**
- Modify: `packages/shared/src/types/analysis.ts`
- Modify: `packages/shared/src/db/schema.ts`
- Create: migration SQL via `drizzle-kit generate`

- [ ] **Step 1: Add new fields to `CompanyAnalysis` type**

In `packages/shared/src/types/analysis.ts`, add to the `CompanyAnalysis` interface:

```typescript
  // v3 financial health scores
  piotroskiFScore?: number;
  altmanZScore?: number | null;
  beneishMScore?: number | null;
  gateResults?: Array<{ gate: string; passed: boolean; value: number | null; threshold: string }>;
```

- [ ] **Step 2: Add new columns to DB schema**

In `packages/shared/src/db/schema.ts`, add after the `classificationChange` column (around line 141):

```typescript
    // v3 financial health scores
    piotroskiFScore: integer('piotroski_f_score'),
    altmanZScore: numeric('altman_z_score'),
    beneishMScore: numeric('beneish_m_score'),
    gateResults: jsonb('gate_results'),
```

- [ ] **Step 3: Generate the migration**

Run: `cd packages/shared && npx drizzle-kit generate`

This will create `drizzle/0003_*.sql` with the ALTER TABLE statements.

- [ ] **Step 4: Run the migration locally**

Run: `npm run db:migrate`

- [ ] **Step 5: Build and verify**

Run: `npm run build`

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types/analysis.ts packages/shared/src/db/schema.ts packages/shared/drizzle/
git commit -m "feat: add piotroski_f_score, altman_z_score, beneish_m_score, gate_results to schema"
```

---

## Task 6: Persist new scores

**Files:**
- Modify: `packages/analyzer/src/storage/save-analysis.ts`
- Modify: `packages/analyzer/src/scoring/engine.ts`

- [ ] **Step 1: Store new scores on the CompanyAnalysis object in engine.ts**

In `engine.ts`, in the `analyses.push()` call, add:

```typescript
      piotroskiFScore: enriched.piotroskiFScore,
      altmanZScore: enriched.altmanZScore,
      beneishMScore: enriched.beneishMScore,
      gateResults,
```

- [ ] **Step 2: Save new fields in save-analysis.ts**

Find the object passed to `db.insert(schema.analysisResults)` or `db.update()` and add:

```typescript
        piotroskiFScore: a.piotroskiFScore ?? null,
        altmanZScore: a.altmanZScore != null ? String(a.altmanZScore) : null,
        beneishMScore: a.beneishMScore != null ? String(a.beneishMScore) : null,
        gateResults: a.gateResults ?? null,
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add packages/analyzer/src/storage/save-analysis.ts packages/analyzer/src/scoring/engine.ts
git commit -m "feat: persist Piotroski, Altman, Beneish scores and gate results to DB"
```

---

## Task 7: Dashboard — show new scores on company detail page

**Files:**
- Modify: `packages/dashboard/src/lib/queries.ts`
- Modify: `packages/dashboard/src/app/company/[code]/page.tsx`

- [ ] **Step 1: Add new columns to the company detail query**

In `queries.ts`, in the `getCompanyDetail` function's analysis select, ensure the new columns are included. Since it uses `select()` (all columns), they'll be included automatically. No change needed if using `.*`.

- [ ] **Step 2: Show scores on company detail page**

In `packages/dashboard/src/app/company/[code]/page.tsx`, add a new section after the dimension scores (or in the existing stats grid):

```tsx
      {/* Financial Health Scores (v3) */}
      {analysis && (analysis.piotroskiFScore != null || analysis.altmanZScore != null) && (
        <div>
          <h2 className="text-text-muted text-xs uppercase tracking-wider mb-3">Financial Health</h2>
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="Piotroski F-Score"
              value={analysis.piotroskiFScore != null ? `${analysis.piotroskiFScore}/9` : '-'}
              color={Number(analysis.piotroskiFScore ?? 0) >= 7 ? 'text-accent-green' : Number(analysis.piotroskiFScore ?? 0) <= 3 ? 'text-accent-red' : 'text-text-secondary'}
              subtext={Number(analysis.piotroskiFScore ?? 0) >= 7 ? 'Strong' : Number(analysis.piotroskiFScore ?? 0) <= 3 ? 'Weak' : 'Moderate'}
            />
            <StatCard
              label="Altman Z-Score"
              value={analysis.altmanZScore != null ? Number(analysis.altmanZScore).toFixed(1) : '-'}
              color={Number(analysis.altmanZScore ?? 0) >= 3 ? 'text-accent-green' : Number(analysis.altmanZScore ?? 0) < 1.8 ? 'text-accent-red' : 'text-accent-amber'}
              subtext={Number(analysis.altmanZScore ?? 0) >= 3 ? 'Safe' : Number(analysis.altmanZScore ?? 0) < 1.8 ? 'Distress' : 'Grey zone'}
            />
            <StatCard
              label="Beneish M-Score"
              value={analysis.beneishMScore != null ? Number(analysis.beneishMScore).toFixed(1) : '-'}
              color={Number(analysis.beneishMScore ?? 0) > -1.78 ? 'text-accent-red' : 'text-accent-green'}
              subtext={Number(analysis.beneishMScore ?? 0) > -1.78 ? 'Manipulation flag' : 'Clean'}
            />
          </div>
        </div>
      )}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/app/company/\[code\]/page.tsx packages/dashboard/src/lib/queries.ts
git commit -m "feat: show Piotroski, Altman, Beneish scores on company detail page"
```

---

## Task 8: Threshold recalibration

This task runs the new scoring on historical data and adjusts classification thresholds.

**Files:**
- Modify: `principles/scoring-rubric.json` (thresholds)

- [ ] **Step 1: Run a local analysis with new scoring to see the score distribution**

```bash
npx tsx packages/analyzer/src/index.ts analyze --skip-llm
```

Check the log output for `Classification distribution:` — this shows how many companies land in each bucket.

- [ ] **Step 2: Assess the distribution**

The geometric mean will compress scores. Expected behavior:
- Max score drops from ~82 to ~70-75 (geometric mean penalizes any weak dimension)
- Current thresholds (strong_long >= 80) may produce zero strong_longs

If the distribution is too compressed, adjust thresholds in `principles/scoring-rubric.json`:

```json
"classificationThresholds": {
  "strongLong": 72,
  "potentialLong": 58,
  "neutral": 38,
  "potentialShort": 20
}
```

The exact numbers depend on the observed distribution. Target:
- ~2-5% strong_long (100-250 companies)
- ~10-15% potential_long (500-750 companies)
- ~40-50% neutral
- ~20-30% potential_short
- ~10-15% strong_avoid (disqualified + very low scores)

- [ ] **Step 3: Verify known companies score sensibly**

Check that:
- TCS, Infosys, HDFC Bank → potential_long or strong_long (strong businesses)
- RAMCOIND → neutral or lower (ROCE 3.6% should be caught by gate or penalized by geometric mean)
- RAMCOIND may be disqualified entirely by the ROCE < 6% gate

- [ ] **Step 4: Commit threshold changes**

```bash
git add principles/scoring-rubric.json
git commit -m "feat: recalibrate classification thresholds for geometric mean scoring"
```

---

## Task 9: Validation run and comparison

- [ ] **Step 1: Run full analysis (skip LLM) locally**

```bash
npx tsx packages/analyzer/src/index.ts analyze --skip-llm
```

- [ ] **Step 2: Compare the new top 100 with run 7's AG4 outcomes**

The key question: would the new top 100 include companies AG4 would approve of (TCS, Infosys, HDFC Bank) and exclude companies AG4 rejected (RAMCOIND, SYSTANGO, KSL)?

Query the DB to check the new rankings vs AG4's historical judgments.

- [ ] **Step 3: Check gate disqualification rate**

Target: 15-25% of companies disqualified by new gates. If much higher, gates may be too aggressive. If much lower, they're not catching enough.

- [ ] **Step 4: Document results**

Add a summary to the spec doc or create a validation report.

- [ ] **Step 5: Final commit and push**

```bash
git add -A
git commit -m "feat: quant model v3.0 — hard gates + geometric mean scoring

- 5 new disqualifiers: Piotroski F-Score, Altman Z-Score, ROCE floor,
  revenue decline, Beneish M-Score
- Geometric mean composite replaces additive weighted average
- Framework scores computed but not blended into composite
- Financial health scores shown on company detail page
- Classification thresholds recalibrated for new score distribution"
git push
```
