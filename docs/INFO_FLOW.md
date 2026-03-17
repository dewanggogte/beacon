# Information Flow

How data moves from Screener.in through the pipeline to the dashboard.

## End-to-End Flow

```
Screener.in                                                    Dashboard
    |                                                              ^
    | 1. HTTP GET /company/{CODE}/consolidated/                    |
    v                                                              |
+--------+    +----------+    +--------+    +---------+    +-------+---+
| Scraper|--->| Snapshot  |--->| Scorer |--->| LLM     |--->| Analysis  |
| (parse)|    | (DB save) |    | (L1)   |    | (L2)    |    | Results   |
+--------+    +----------+    +--------+    +---------+    +-----------+
                  |                |              |               |
                  v                v              v               v
              company_         EnrichedSnapshot  AG1-4         analysis_
              snapshots        (in memory)       outputs       results
              (JSONB)                                          (DB)
```

## Stage 1: Scraping

**Input**: Screener.in HTML pages
**Output**: `company_snapshots` rows (one per company per scrape run)

```
Screener.in company page
    |
    +-- parse-header.ts    --> name, BSE/NSE codes, sector, industry
    +-- parse-ratios.ts    --> P/E, P/B, ROCE, ROE, dividend yield, market cap, 52w high/low
    +-- parse-table.ts     --> quarterly results, annual P&L, balance sheet, cash flow,
    |                          historical ratios, shareholding, peer comparison
    +-- validate-snapshot  --> warnings for missing/suspicious data
    |
    v
company_snapshots table
    - Flat columns: market_cap, stock_pe, roce, roe, etc. (fast queries)
    - JSONB columns: quarterly_results, annual_pl, balance_sheet, cash_flow,
                     ratios, shareholding, peer_comparison, pros, cons
```

## Stage 2: Enrichment

**Input**: `company_snapshots` JSONB
**Output**: `EnrichedSnapshot` (in-memory, ~60+ derived metrics)

```
company_snapshots JSONB
    |
    v
flatten-v2.ts
    |
    +-- Time series extraction (newest-first arrays, up to 13 years):
    |     revenueHistory, netProfitHistory, epsHistory, roeHistory, roceHistory,
    |     opmHistory, netMarginHistory, deHistory, ocfHistory, ownerEarningsHistory,
    |     borrowingsHistory, promoterHoldingHistory, fiiHistory, diiHistory, ...
    |
    +-- Derived metrics:
    |     revenueCagr5Y, profitCagr5Y, revenueGrowthConsistency,
    |     earningsVarianceCv, interestCoverage, interestToRevenue,
    |     grahamNumber, ...
    |
    +-- Scraped text:
    |     pros[], cons[], peerComparison[]
    |
    v
EnrichedSnapshot (passed to scorers and LLM data pack builders)
```

## Stage 3: Layer 1 Scoring

**Input**: `EnrichedSnapshot` + `scoring-rubric.json`
**Output**: `CompanyAnalysis` with dimension scores, composite, classification

```
EnrichedSnapshot + scoring-rubric.json
    |
    v
dimension-scorer.ts    (scores each of 21 metrics 0-100, sector-adjusted)
    |
    v
composite-scorer.ts    (weighted average: valuation 25%, quality 30%,
    |                   governance 20%, safety 15%, momentum 10%)
    |
    v
disqualifier.ts        (8 automatic disqualifiers --> strong_avoid)
    |
    v
Classification thresholds: >=80 strong_long, >=65 potential_long,
                           >=40 neutral, >=20 potential_short, <20 strong_avoid
```

## Stage 4: Framework Evaluators

**Input**: `EnrichedSnapshot`
**Output**: `FrameworkResults` (Buffett, Graham, Lynch, Pabrai scores + conviction)

```
EnrichedSnapshot
    |
    +-- buffett.ts     --> 10 criteria (moat, ROE >15%, OPM, low debt, ...)
    |                      score/100, pass/fail per criterion, moat indicators
    |
    +-- graham.ts      --> 10 criteria (P/E<15, P/B<1.5, earnings stability, ...)
    |                      score/100, Graham number, NCAV, margin of safety
    |
    +-- lynch.ts       --> classify into 6 categories + category-specific score
    |                      (fast_grower, stalwart, slow_grower, cyclical, turnaround, asset_play)
    |
    +-- pabrai.ts      --> 6 risk factors (leverage, simplicity, management, ...)
    |                      risk score/100, overall risk level
    |
    v
composite-v2           --> classification-aware weighting (varies by Lynch category)
    |                      e.g., fast_grower emphasizes Lynch 30%
    v
conviction scoring     --> multi-framework alignment check
                           high/medium/low/none
```

## Stage 4.5: Filtering (optional)

When `--companies`, `--sectors`, or `--limit` flags are provided, the analysis set is narrowed before Layer 2:

```
CompanyAnalysis[] (all companies from Layer 1)
    |
    +-- --companies=A,B,C   --> filter by screener code (case-insensitive)
    +-- --sectors=IT,Banking --> filter by sector (partial match, case-insensitive)
    +-- --limit=N            --> keep top N by quant rank
    |
    v
Filtered CompanyAnalysis[] (passed to Layer 2)

When --companies or --sectors is active, all matching companies bypass
the funnel tiering and go directly to full AG1-AG4 evaluation.

When --llm-only is active, Layer 1 scoring is skipped entirely.
Existing scores are loaded from the analysis_results table in the DB,
snapshots are re-enriched, and frameworks re-evaluated for LLM data packs.
```

## Stage 5: Layer 2 LLM Analysis

**Input**: `CompanyAnalysis` + `EnrichedSnapshot` + `FrameworkResults` + macro regime
**Output**: Qualitative adjustment, investment thesis, conviction

```
                    +-------- macro regime (from macro_snapshots table) ------+
                    |                                                          |
CompanyAnalysis + EnrichedSnapshot + FrameworkResults                          |
    |                                                                         |
    +-- data-pack-builder.ts builds agent-specific payloads:                  |
    |     AG1: framework scores, time series, current metrics, peers, pros/cons
    |     AG2: shareholding history, governance scores, pros/cons              |
    |     AG3: Pabrai screen, leverage history, earnings stability, pros/cons  |
    |     AG4: all framework scores, current metrics, peers, AG1-3 outputs ---+
    |                                                                macro regime
    v
+--------+    +----------+    +------+
|  AG1   |    |   AG2    |    | AG3  |    (Tier 1: top 100 → all 4 agents)
| Funda- |    | Gover-   |    | Risk |    (Tier 2: next 500 → AG1 screen → top 100 promoted to AG2-4)
| mentals|    | nance    |    |      |    (Rest: no LLM)
+---+----+    +----+-----+    +--+---+
    |              |             |
    | Structured CoT per agent:  |
    | AG1: Trend->Quality->      |
    |   Valuation->CategoryFit   |
    |   ->Verdict                |
    | AG2: Promoter->Institutions|
    |   ->RedFlags->Verdict      |
    | AG3: Survival->PrimaryRisk |
    |   ->HiddenRisks->TailRisk  |
    |   ->Verdict                |
    |  (+ Devil's advocate:      |
    |   must find >= 2 risks)    |
    |                            |
    +-------+-------+------+----+
            |              |
      +-----v-----+  +----v---------+
      |    AG4     |  |    Post-     |
      |  Synthesis |  |  Validation  |
      +-----+------+  +----+---------+
            |               |
            |  Conviction   |  Cross-checks:
            |  calibration  |  - "improving" + declining revenue? override
            |  (7 gates)    |  - "high" conviction + disqualified? override
            |               |  - "high" earnings quality + low OCF? override
            |               |
            +-------+-------+
                    |
                    v
            llmAnalysis on CompanyAnalysis:
              - trendNarrative (investment thesis)
              - riskFactors[] (from AG3)
              - catalysts[] (from AG1)
              - AG1 score (0-100, independent fundamental score)
              - AG4 score (0-100, independent synthesis score)
              - AG4 recommended_classification + classification_reasoning
              - AG4 overrides classification and conviction (in both directions)
              - confidence (high/medium/low)
              - reasoning
              - quantClassification / quantConvictionLevel preserved for comparison
```

## Stage 6: Results & Storage

**Input**: Scored + LLM-analyzed `CompanyAnalysis[]`
**Output**: `analysis_results` table + markdown reports

```
CompanyAnalysis[]
    |
    +-- Re-sort by finalScore (AG4 score if evaluated, AG1 score if Tier 2, compositeScore otherwise)
    +-- Re-rank (1..N)
    |
    +-- save-analysis.ts --> analysis_results table
    |     (dimension scores, composite, framework results,
    |      llm_analysis JSONB, final_score, classification, rank,
    |      quant_classification, quant_conviction_level, classification_source)
    |
    +-- weekly-comparison.ts --> score deltas, classification changes
    |
    +-- report-generator.ts --> reports/YYYY-MM-DD-weekly-report.md
    |
    +-- divergence-watcher --> reports/divergence-YYYY-MM-DD.html + email
    |
    v
Dashboard reads from analysis_results (via queries.ts)
```

## Stage 7: Dashboard

**Input**: `analysis_results` + `companies` tables
**Output**: Web UI on :3000

```
analysis_results + companies
    |
    v
queries.ts (server-side data fetching)
    |
    +-- /               --> summary cards, top 10 longs/shorts
    +-- /conviction     --> conviction-filtered table
    +-- /frameworks     --> Buffett/Graham/Lynch/Pabrai score table
    +-- /rankings       --> full sortable/filterable table (all companies, "A" icon for AG4-evaluated)
    +-- /backtest       --> backtest results, walk-forward
    +-- /company/[code] --> score breakdown, radar chart, agent analysis panels,
    |                      framework details, Lynch badge, conviction badge,
    |                      classification attribution (QUANT/AG4 badge, override comparison)
    +-- /pipeline       --> run history, status
    +-- /api/healthz    --> K8s health probe
```

## Data Dependencies

```
scoring-rubric.json --+
                      +--> Layer 1 scoring
EnrichedSnapshot -----+
                      |
                      +--> Framework evaluators
                      |
                      +--> LLM data pack builders --> Agent prompts
                      |
macro_snapshots ------+--> AG4 synthesis prompt

price_history --------+--> Backtesting (independent of main pipeline)
```
