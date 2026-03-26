# Beacon Dashboard & Pipeline Audit

**Date:** 2026-03-27
**Type:** Comprehensive audit — pipeline data flow, dashboard UX, production data integrity
**Scope:** Pipeline save logic, all 7 dashboard pages, homelab production data

---

## Executive Summary

Three critical issues found, plus 15+ improvement opportunities.

**Critical:**
1. **LLM data is written to the wrong column** — pipeline writes to `llm_analysis` (legacy blob), dashboard reads `llm_synthesis`/`llm_fundamentals`/`llm_governance`/`llm_risk` (four separate columns that are always NULL). This means **zero companies display agent analysis** despite 200 being AG4-classified and 721 having LLM data.
2. **`getLatestRunId()` doesn't check run completion** — if a pipeline is mid-run, the dashboard shows incomplete data from the partial run instead of the last completed one.
3. **Home page run date is wrong** — `getRunDate` returns the run's `completedAt` timestamp, but `getLatestRunId` selects by highest `scrapeRunId` in `analysis_results`, not the latest completed scrape run. These can diverge.

---

## 1. Pipeline: LLM Data Column Mismatch (CRITICAL)

### The Problem

The pipeline's `save-analysis.ts` writes LLM output to a **single legacy column**:

```typescript
// save-analysis.ts line 32
llmAnalysis: analysis.llmAnalysis ?? null,   // → column: llm_analysis (jsonb)
llmAdjustment: analysis.llmAnalysis?.qualitativeAdjustment?.toString() ?? null,
```

The dashboard's company page reads **four separate columns** that were added for the multi-agent v2.2 architecture:

```typescript
// company/[code]/page.tsx lines 103-105
const syn = analysis?.llmSynthesis as SynthesisData | null;    // → column: llm_synthesis
const fund = analysis?.llmFundamentals as FundamentalsData | null; // → column: llm_fundamentals
const rsk = analysis?.llmRisk as RiskData | null;              // → column: llm_risk
```

### Production Evidence

```
run 11 (latest, 5,491 companies):
  llm_analysis (legacy):     721 companies have data ✓
  llm_synthesis:             0 companies
  llm_fundamentals:          0 companies
  llm_governance:            0 companies
  llm_risk:                  0 companies
```

### Root Cause

When the v2.2 multi-agent architecture was built, four new columns were added to the schema (`llm_synthesis`, `llm_fundamentals`, `llm_governance`, `llm_risk`) to store per-agent outputs. But the `qualitative-analyzer.ts` pipeline still writes everything into the single `llmAnalysis` field on `CompanyAnalysis`, which maps to the legacy `llm_analysis` column. The four new columns are **never populated**.

### The Fix

Two options:

**Option A (Recommended): Fix the pipeline to write to all 5 columns.**
In `qualitative-analyzer.ts`, after running AG1-AG4, set:
- `analysis.llmFundamentals = fundParsed` (AG1 output)
- `analysis.llmGovernance = govParsed` (AG2 output)
- `analysis.llmRisk = riskParsed` (AG3 output)
- `analysis.llmSynthesis = synthParsed` (AG4 output)
- `analysis.llmAnalysis = { ... }` (legacy blob, keep for backwards compat)

Then in `save-analysis.ts`, add these to the values object:
```typescript
llmFundamentals: analysis.llmFundamentals ?? null,
llmGovernance: analysis.llmGovernance ?? null,
llmRisk: analysis.llmRisk ?? null,
llmSynthesis: analysis.llmSynthesis ?? null,
```
And add conditional upsert logic (same pattern as `llmAnalysis`).

**Option B: Fix the dashboard to read the legacy column.**
Parse `llm_analysis` JSONB in the company page and extract the relevant fields. Quicker but messier — the legacy blob has a different structure than what the dashboard components expect.

### Impact
All 200 AG4 companies would display full agent analysis (synthesis, fundamentals, governance, risk tabs). The narrative verdict on the company page would also work.

---

## 2. Run Date & Latest Run Logic (CRITICAL)

### The Problem

`getLatestRunId()` in `queries.ts` (lines 4-13):
```typescript
const runs = await db
  .select({ scrapeRunId: schema.analysisResults.scrapeRunId })
  .from(schema.analysisResults)
  .groupBy(schema.analysisResults.scrapeRunId)
  .orderBy(desc(schema.analysisResults.scrapeRunId))
  .limit(1);
```

This returns the **highest `scrapeRunId` that has any analysis results** — not necessarily a completed run. If a pipeline is mid-run (status = 'running'), this query could return the in-progress run ID, causing the dashboard to show partial/stale data.

`getRunDate()` then fetches `completedAt` from `scrape_runs` for that ID — if the run isn't completed, `completedAt` could be NULL or stale.

### Production Evidence

Scrape runs in the homelab DB:

| ID | Started | Completed | Status | Commentary |
|----|---------|-----------|--------|------------|
| 1 | Feb 26 | Feb 26 | completed | No |
| 2 | Feb 26 | Feb 26 | completed | No |
| 3 | Feb 28 | Feb 28 | completed | No |
| 4 | Mar 01 | Mar 02 | completed | No |
| 6 | Mar 07 | Mar 08 | completed | No |
| 7 | Mar 14 | Mar 15 | completed | No |
| 9 | Mar 20 | Mar 21 | completed | No |
| 10 | Mar 21 | Mar 22 | completed | No |
| 11 | Mar 21 | Mar 22 | completed | Yes |

Run IDs 5 and 8 are missing (gaps). Runs 10 and 11 have identical start times (possible cron overlap). The home page shows "22 Mar 2026" as the analysis date, which comes from run 11's `completedAt`.

### The Fix

Replace `getLatestRunId()`:
```typescript
export async function getLatestRunId(): Promise<number | null> {
  const runs = await db
    .select({ id: schema.scrapeRuns.id })
    .from(schema.scrapeRuns)
    .where(eq(schema.scrapeRuns.status, 'completed'))
    .orderBy(desc(schema.scrapeRuns.id))
    .limit(1);
  return runs[0]?.id ?? null;
}
```

This queries `scrape_runs` directly (faster, no GROUP BY on large table) and only considers completed runs.

---

## 3. Pipeline Data Flow: LLM Output Lifecycle

### How LLM Data Flows (Current)

```
AG1 (fundamentals) → fundParsed → qualitative-analyzer.ts
AG2 (governance)   → govParsed  → qualitative-analyzer.ts
AG3 (risk)         → riskParsed → qualitative-analyzer.ts
AG4 (synthesis)    → synthParsed → qualitative-analyzer.ts
                                         │
                     ┌───────────────────┘
                     ▼
         analysis.llmAnalysis = {        ← ONLY this gets saved
           trendNarrative: synthParsed.investment_thesis,
           riskFactors: riskParsed?.primary_risks,
           catalysts: fundParsed?.positive_signals,
           qualitativeAdjustment: delta,
           confidence: ...,
           reasoning: synthParsed.conviction_reasoning,
         }
                     │
                     ▼
         save-analysis.ts → llm_analysis column (JSONB blob)

         NEVER SAVED:
         ❌ analysis.llmFundamentals → llm_fundamentals column
         ❌ analysis.llmGovernance   → llm_governance column
         ❌ analysis.llmRisk         → llm_risk column
         ❌ analysis.llmSynthesis    → llm_synthesis column
```

### Data Loss Points

| Point | Location | Consequence |
|-------|----------|-------------|
| AG1 parse failure | qualitative-analyzer.ts:161 | No fundamentals data; company keeps quant score only |
| AG4 parse failure | qualitative-analyzer.ts:332 | No synthesis; AG1 data kept but no classification override |
| Tier 2 non-promotion | qualitative-analyzer.ts:182-192 | Only AG1 data; no AG2-AG4 |
| `--llm-only` reload | analysis-run.ts:268 | Prior `llmAnalysis` NOT reloaded from DB |
| Four columns never written | save-analysis.ts:20-56 | Dashboard can't display per-agent data |

---

## 4. Dashboard UX Audit

### 4.1 Home Page

**Issues:**
- Run date can show wrong date (see Section 2)
- Pipeline status banner (`isRunning` check) only works if the latest run by ID is the running one
- Market commentary uses `split(/\n\n+/)` but LLM may not use double newlines — may render as single block

**Good:**
- Hero zone with delta indicators
- High conviction spotlight (top 3)
- What Changed section with links

### 4.2 Explore Page

**Issues:**
- Preset match counts use O(n×m) loop server-side (6 presets × 3,500 companies) — not slow but wasteful
- `de` (debt/equity) is `null` in all data — "Value Picks" preset (requires de < 0.5) will always show 0 matches
- Scatter plot outlier handling improved but still needs the latest push

**Good:**
- Parallel data fetching
- Sector heatmap with continuous gradient
- Smart screens with live counts

### 4.3 Rankings Page

**Issues:**
- Full 5,491-row dataset sent to client for client-side filtering — ~500KB payload
- `de` metric in presets never matches (see above)
- Sparkline parsing of `quarterlyResults` JSONB may fail silently if format varies

**Good:**
- Smart presets with deep linking (?preset=, ?sector=)
- Multi-filter bar with add/remove chips
- Sticky headers and tabular-nums

### 4.4 Company Detail Page

**Issues:**
- Agent Analysis always empty (LLM column mismatch — Section 1)
- Narrative verdict always empty (reads `llmSynthesis` which is null)
- N+1 query: `getSectorMedians()` called separately after `getCompanyDetail()`
- Hardcoded "21 metrics across 5 dimensions" in preview text
- `getCompanyDetail()` makes 3 sequential queries internally

**Good:**
- Score cards with color coding
- Metric strip with sector median comparison
- Progressive disclosure with expand-all toggle
- Graceful fallback for quant-only companies

### 4.5 Watchlist Page

**Issues:**
- API route calls `getLatestRunId()` on every request (should cache or pass from client)
- No debounce — rapid star clicks trigger multiple API calls
- Table cramped on mobile with >4 companies

**Good:**
- localStorage persistence
- Empty state with CTAs
- Stale company handling (greyed out)

### 4.6 Overview Page

**Issues:**
- Hardcoded funnel numbers ("~5,300 scraped", "~3,500 scored", "600 enter LLM") — should be from DB
- Date formatting uses `toLocaleString()` without locale (browser-dependent)

### 4.7 Pipeline Page

**Issues:**
- Date formatting uses `toLocaleString()` without 'en-IN' locale
- No auto-refresh during active pipeline runs

---

## 5. Production Data Anomalies

### 5.1 Classification Distribution (Run 11)

| Classification | Count | % |
|---|---|---|
| strong_avoid | 4,015 | 73.1% |
| potential_long | 746 | 13.6% |
| neutral | 608 | 11.1% |
| potential_short | 122 | 2.2% |
| strong_long | 0 | 0% |

**No strong_long companies.** This is the AG4 effect — AG4 analyzed the top 200 and downgraded many from strong_long to potential_long. The quant model produces strong_longs, but AG4 overrides them.

### 5.2 Analysis History

- 5,491 rows across 1 run — the backfill only captured the current state (expected, documented in spec)
- Time-series features won't work until more pipeline runs accumulate data

### 5.3 Metric Completeness

- 0 null final_score (good)
- 0 null piotroski (good)
- 80 companies with null market_cap (missing snapshots)

### 5.4 Weekly Changes

- 418 companies have score_change values
- 18 have classification changes
- Indicates comparison with run 10 worked

### 5.5 Market Commentary

- Only run 11 has commentary (feature was just added)
- Runs 1-10 have no commentary

### 5.6 Missing Run IDs

Run IDs 5 and 8 are missing — likely failed/abandoned runs that were cleaned up

### 5.7 Overlapping Runs

Runs 10 and 11 both started at Mar 21 13:00 — possible cron overlap. This shouldn't cause data corruption (the upsert handles it) but wastes resources.

---

## 6. Recommendations (Priority Order)

### CRITICAL (Fix Now)

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | LLM data written to wrong columns | Zero agent analysis displayed for all companies | Write AG1-AG4 outputs to `llm_fundamentals`/`llm_governance`/`llm_risk`/`llm_synthesis` columns in save-analysis.ts and qualitative-analyzer.ts |
| 2 | `getLatestRunId()` doesn't check completion | Dashboard shows partial data during pipeline runs | Query `scrape_runs WHERE status='completed'` instead of grouping analysis_results |
| 3 | Re-run pipeline after fix #1 | Populate the 4 LLM columns for 200 AG4 companies | `npx tsx packages/analyzer/src/index.ts analyze --llm-only --limit=200` |

### HIGH (Fix This Week)

| # | Issue | Impact | Fix |
|---|---|---|---|
| 4 | Remove `de` from presets | "Value Picks" shows 0 matches | Remove de filter from presets.ts or extract D/E from ratios JSONB |
| 5 | Fix date locale on pipeline/overview pages | Inconsistent date formatting | Add `'en-IN'` to all `toLocaleString()` calls |
| 6 | Batch company detail queries | N+1 on every company page view | Combine getCompanyDetail + getSectorMedians into single function |
| 7 | Fix cron overlap | Duplicate pipeline runs | Add a lock/guard in the K8s CronJob or pipeline entrypoint |

### MEDIUM (Fix Next Sprint)

| # | Issue | Impact | Fix |
|---|---|---|---|
| 8 | Add ARIA labels to tabs/tables | Accessibility compliance | Add role="tablist", aria-expanded, aria-label attributes |
| 9 | Debounce watchlist API | Unnecessary API calls on rapid clicks | Add 300ms debounce to useEffect in watchlist page |
| 10 | Replace hardcoded funnel numbers | Stale overview page | Fetch from DB or config |
| 11 | Add pagination to rankings | 500KB+ client payload | Server-side pagination with limit/offset |
| 12 | Focus trap on mobile nav | Accessibility | Trap focus inside slide-out panel |
| 13 | Cache sector medians | Redundant DB call per company page | Cache per sector+runId (they don't change within a run) |

### LOW (Nice to Have)

| # | Issue | Fix |
|---|---|---|
| 14 | Skip-to-main link | Add hidden skip link in layout.tsx |
| 15 | Keyboard nav for agent tabs | Arrow key support in AgentAnalysisPanel |
| 16 | Auto-refresh during pipeline | Polling interval on home page when isRunning |
| 17 | Standardize score units | Always show /100 for dimension scores |

---

## 7. Pipeline Structural Issues

### 7.1 `--llm-only` Doesn't Reload Prior LLM Data

When `loadExistingAnalyses()` reconstructs `CompanyAnalysis` objects from the DB, it loads dimension scores and framework data but **does not load `llmAnalysis`**. This means:
- If you run `--llm-only` and the LLM fails for a company, the prior LLM data is lost
- The conditional upsert (line 94) prevents DB overwrite, but the in-memory object has no LLM data

**Fix:** Add `llmAnalysis` to the fields loaded in `loadExistingAnalyses()`.

### 7.2 Parse Failure Handling

When an LLM agent's output fails to parse (malformed JSON, missing fields), the failure is logged to stderr but the company gets no LLM data. There's no retry, no fallback, and no record in the DB that the attempt was made.

**Fix:** Add a `llmParseFailures` JSONB column to `analysis_results` to track which companies had parse failures, enabling investigation and targeted re-runs.

### 7.3 Tiering Doesn't Account for Prior LLM Success

The tiering logic assigns companies to Tier 1/2 based on rank alone. A company that was successfully analyzed by AG4 in the previous run gets no special treatment — it could be assigned to Tier 2 and only get AG1 screening.

**Fix:** If a company had `classificationSource = 'ag4'` in the previous run, auto-promote to Tier 1.

---

## 8. Data Flow Diagram

```
                        CLI ENTRY
                           │
              ┌────────────┼────────────┐
              │            │            │
          --skip-llm    normal     --llm-only
              │            │            │
              │      Score All Co.   Load from DB
              │         │               │
              │      Apply filters   Apply filters
              │         │               │
              │      [Tier 1: top 100]  [Force all Tier 1]
              │      [Tier 2: next 500]    │
              │         │               │
              │      AG1→AG2→AG3→AG4  AG1→AG2→AG3→AG4
              │         │               │
              │      Set on CompanyAnalysis:
              │        ✓ llmAnalysis (legacy blob)
              │        ✓ finalScore (AG4)
              │        ✓ classification (AG4)
              │        ✓ classificationSource = 'ag4'
              │        ✗ llmFundamentals  ← NEVER SET
              │        ✗ llmGovernance    ← NEVER SET
              │        ✗ llmRisk          ← NEVER SET
              │        ✗ llmSynthesis     ← NEVER SET
              │         │               │
              └─────────┼───────────────┘
                        │
                  saveAnalysisResults()
                  ┌─────┴──────────────┐
                  │ WRITES:            │
                  │  llm_analysis ✓    │
                  │  llm_adjustment ✓  │
                  │  llm_synthesis ✗   │ ← null (never set)
                  │  llm_fundamentals ✗│ ← null (never set)
                  │  llm_governance ✗  │ ← null (never set)
                  │  llm_risk ✗        │ ← null (never set)
                  └────────────────────┘
                        │
                  Dashboard reads:
                  ┌─────┴──────────────┐
                  │ READS:             │
                  │  llm_synthesis     │ ← always null
                  │  llm_fundamentals  │ ← always null
                  │  llm_governance    │ ← always null
                  │  llm_risk          │ ← always null
                  │  (never reads      │
                  │   llm_analysis)    │
                  └────────────────────┘
```

---

## Appendix: Files Referenced

**Pipeline:**
- `packages/analyzer/src/pipeline/analysis-run.ts` — orchestrator
- `packages/analyzer/src/storage/save-analysis.ts` — DB persistence
- `packages/analyzer/src/llm/qualitative-analyzer.ts` — LLM agent execution + tiering
- `packages/analyzer/src/llm/agents/` — AG1-AG4 agent implementations
- `packages/analyzer/src/llm/agents/post-validation.ts` — output validation
- `packages/analyzer/src/pipeline/weekly-comparison.ts` — score/classification diff

**Dashboard:**
- `packages/dashboard/src/lib/queries.ts` — all DB queries
- `packages/dashboard/src/app/page.tsx` — home page
- `packages/dashboard/src/app/explore/page.tsx` — explore page
- `packages/dashboard/src/app/rankings/page.tsx` — rankings page
- `packages/dashboard/src/app/company/[code]/page.tsx` — company detail
- `packages/dashboard/src/app/watchlist/page.tsx` — watchlist
- `packages/dashboard/src/app/overview/page.tsx` — overview
- `packages/dashboard/src/app/pipeline/page.tsx` — pipeline status

**Schema:**
- `packages/shared/src/db/schema.ts` — all table definitions
