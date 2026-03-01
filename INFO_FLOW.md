# Information Flow

How data moves through the pipeline, from raw HTML to conviction-scored investment thesis.

## End-to-End Pipeline

```
Screener.in HTML
       │
       │  HTTP fetch + Cheerio parse
       v
┌─────────────────────────────────────────────────────────────┐
│  company_snapshots table (JSONB)                            │
│                                                             │
│  10 flattened numerics:                                     │
│    market_cap, current_price, stock_pe, book_value,         │
│    high_52w, low_52w, dividend_yield, roce, roe, face_value │
│                                                             │
│  9 JSONB columns (13 years of data):                        │
│    annual_pl, balance_sheet, cash_flow, ratios,             │
│    shareholding, quarterly_results, pros, cons,             │
│    peer_comparison                                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │  flattenV2()
                           v
┌─────────────────────────────────────────────────────────────┐
│  EnrichedSnapshot (60+ typed fields)                        │
│                                                             │
│  From annual_pl (13yr):                                     │
│    roe_history[], opm_history[], revenue_history[],         │
│    net_profit_history[], eps_history[], interest_to_revenue, │
│    dividend_payout_history[]                                │
│                                                             │
│  From balance_sheet (12yr):                                 │
│    de_history[], net_worth_history[], ncav_proxy,           │
│    current_ratio_proxy, retained_earnings_growth            │
│                                                             │
│  From cash_flow (12yr):                                     │
│    ocf_history[], capex_proxy_history[],                    │
│    owner_earnings_history[]                                 │
│                                                             │
│  From ratios (12yr):                                        │
│    roce_history[]                                           │
│                                                             │
│  From shareholding (12 quarters):                           │
│    promoter_holding_history[], fii_history[], dii_history[],│
│    promoter_holding_4q_change, shareholder_count_trend      │
│                                                             │
│  Derived:                                                   │
│    graham_number, earnings_variance_cv, roe_10y_avg,        │
│    roe_consistency_count, revenue_growth_consistency,        │
│    capex_to_profit_avg, revenue_cagr_5y, profit_cagr_5y    │
└──────────┬───────────────────────────────┬──────────────────┘
           │                               │
           │                               │
     ┌─────v──────────┐             ┌──────v───────────┐
     │ DIMENSION       │             │ FRAMEWORK         │
     │ SCORING         │             │ EVALUATION        │
     │                 │             │                   │
     │ enrichedToFlat()│             │ evaluateBuffett() │
     │ → 21 metrics    │             │ evaluateGraham()  │
     │ → 5 dimensions  │             │ evaluateLynch()   │
     │ → 0-100 each    │             │ evaluatePabrai()  │
     └─────┬──────────┘             └──────┬───────────┘
           │                               │
           v                               v
     ┌────────────────────────────────────────────────────┐
     │  COMPOSITE SCORING                                 │
     │                                                    │
     │  V1: Weighted average of 5 dimensions              │
     │  V2: Classification-aware blend (by Lynch category)│
     │                                                    │
     │  Lynch category → weight matrix:                   │
     │    fast_grower:  Lynch 30%, Buf 20%, Pab 20%,     │
     │                  Gra 10%, Dims 20%                 │
     │    stalwart:     Buf 30%, Gra 20%, Pab 20%,       │
     │                  Lynch 15%, Dims 15%               │
     │    turnaround:   Pab 35%, Dims 25%, Buf 15%,      │
     │                  Lynch 15%, Gra 10%                │
     │    ...                                             │
     │                                                    │
     │  + Disqualifier check (8 rules)                    │
     │  + Classification (strong_long → strong_avoid)     │
     │  + Conviction (high/medium/low/none)               │
     │  + Rank assignment (overall + per-sector)          │
     └──────────────────────┬─────────────────────────────┘
                            │
                            │  Tiered by rank
                            v
     ┌────────────────────────────────────────────────────┐
     │  MULTI-AGENT LLM LAYER                             │
     │                                                    │
     │  Provider: Anthropic (Haiku/Sonnet) or local Qwen  │
     │  All agents: maxTokens 4096, structured CoT        │
     │                                                    │
     │  Tier 2 (top 500 + bottom 200):                    │
     │    AG1 only → fundamentals adjustment (-5 to +5)   │
     │    + post-validation cross-check                   │
     │                                                    │
     │  Tier 1 (top 100 + bottom 50):                     │
     │    AG1 → AG2 → AG3 → AG4 (sequential)             │
     │    AG3 has devil's advocate mandate (min 2 risks)  │
     │    AG4 receives macro regime context + peers        │
     │    AG4 uses 7-gate conviction calibration          │
     │    Synthesis adjustment (-15 to +15)               │
     │    + post-validation cross-check on AG1 + AG4      │
     │                                                    │
     │  All others: Layer 1 score stands as-is            │
     └──────────────────────┬─────────────────────────────┘
                            │
                            v
     ┌────────────────────────────────────────────────────┐
     │  FINAL OUTPUT (per company)                        │
     │                                                    │
     │  finalScore = compositeScore + llmAdjustment       │
     │  classification, rank, conviction                  │
     │  frameworkDetails (JSONB)                          │
     │  llmFundamentals, llmGovernance, llmRisk,          │
     │  llmSynthesis (JSONB)                             │
     │                                                    │
     │  → Saved to analysis_results                       │
     │  → Weekly comparison computed                      │
     │  → Markdown report generated                       │
     │  → Dashboard reads via Drizzle queries             │
     └────────────────────────────────────────────────────┘
```

## Agent Data Flow (Detail)

What each LLM agent receives and produces.

### AG1: Fundamentals Analyst

**Input (built by `buildFundamentalsDataPack`):**
```xml
<company_data>
  Company: {name} ({code}), Sector: {sector}
  Lynch Category: {category}
  Composite Score: {score}/100, Classification: {class}

  <framework_scores>
    Buffett: {score}/100 ({pass}/{total} criteria)
    Graham: {score}/100, Graham Number: {gn} vs Price: {price}
    Lynch ({cat}): {score}/100
    Pabrai Risk: {score}/100, Overall: {risk_level}
  </framework_scores>

  <time_series>
    ROE (10yr): [18, 19, 22, ...]
    ROCE (10yr): [20, 21, 23, ...]
    Revenue (Cr): [1200, 1400, 1600, ...]
    Net Profit (Cr): [100, 120, 150, ...]
    OPM%: [15, 16, 17, ...]
    D/E: [0.5, 0.4, 0.3, ...]
    OCF (Cr): [80, 100, 130, ...]
  </time_series>

  <current_metrics>
    Market Cap, P/E, P/B, Div Yield, ROCE, ROE, D/E, 52W range
  </current_metrics>

  <peer_comparison>
    | Name | CMP | P/E | Mar Cap | ROCE | Div Yld | ...
    (top 5 peers from Screener.in)
  </peer_comparison>

  <screener_signals>
    Pros: [list from Screener.in]
    Cons: [list from Screener.in]
  </screener_signals>
</company_data>
```

**Structured CoT (ANALYSIS CHAIN):**
1. TREND: Revenue/profit trajectory — accelerating, steady, or declining? Cite 3+ years.
2. QUALITY: Does OCF confirm earnings? Owner earnings trend?
3. VALUATION: Price justified by growth? PEG, P/E vs sector peers, Graham number.
4. CATEGORY FIT: How well does the company perform AS its Lynch category?
5. VERDICT: Net positive or negative? Magnitude of adjustment.

**Output:**
```json
{
  "trend_assessment": "improving|stable|deteriorating",
  "earnings_quality": "high|medium|low",
  "key_findings": ["finding with specific numbers and years"],
  "red_flags": ["flag with evidence"],
  "positive_signals": ["signal with evidence"],
  "adjustment": -5 to +5,
  "confidence": "high|medium|low",
  "reasoning": "structured CoT following analysis chain"
}
```

**Post-validation** cross-checks AG1 output against quantitative data:
- "improving" trend + revenue declined 2+ of last 3 years → override to "stable" or "deteriorating"
- "high" earnings quality + OCF < 50% of net profit → override to "medium"
- Positive adjustment on disqualified company → capped at 0

### AG2: Governance Analyst

**Input (built by `buildGovernanceDataPack`):**
- Shareholding history (12 quarters): Promoters%, FIIs%, DIIs%, Public%
- Promoter pledge data
- Screener pros/cons (governance-relevant)
- Framework governance dimension score

**Structured CoT (ANALYSIS CHAIN):**
1. PROMOTER: Accumulating, maintaining, or divesting? Pledge risk?
2. INSTITUTIONS: FIIs/DIIs accumulating or exiting? Signal interpretation.
3. RED FLAGS: Governance red flags in pros/cons or shareholding patterns?
4. VERDICT: Net governance risk level and direction.

**Output:**
```json
{
  "governance_quality": "strong|adequate|weak|red_flag",
  "promoter_assessment": "aligned|neutral|concerning|predatory",
  "institutional_signal": "accumulating|stable|exiting|mixed",
  "governance_risks": ["risk with evidence"],
  "adjustment": -5 to +5
}
```

### AG3: Risk Analyst

**Input (built by `buildRiskDataPack`):**
- Pabrai risk screen results (6 factors)
- D/E history, OCF history
- Lynch category + cyclicality data
- Disqualification status and reasons

**Structured CoT (ANALYSIS CHAIN):**
1. SURVIVAL: Can the company survive 2 years of zero revenue? D/E, OCF, borrowings.
2. PRIMARY RISK: #1 risk for this Lynch category? How severe here?
3. HIDDEN RISKS: What do pros/cons suggest that numbers don't show?
4. TAIL RISK: Worst-case scenario and probability.
5. VERDICT: Overall risk level and magnitude of adjustment.

**Devil's Advocate Mandate:** AG3 MUST identify at least 2 non-trivial risks. "No significant risks" is never acceptable — every company has risks. The parser enforces a minimum of 2 entries in `primary_risks` (padded with generic entries if the model returns fewer).

**Output:**
```json
{
  "overall_risk": "low|moderate|elevated|high|extreme",
  "primary_risks": [{"risk": "...", "severity": "high", "evidence": "..."}],
  "risk_mitigants": ["mitigant"],
  "tail_risk": "worst case scenario",
  "adjustment": -5 to +5
}
```

### AG4: Synthesis (Tier 1 only)

**Input (built by `buildSynthesisDataPack`):**
- AG1, AG2, AG3 full JSON outputs (key_findings propagate)
- All framework scores + methodology context
- Composite score + classification
- Peer comparison data (top 5 peers)
- Macro regime context (if available): regime name, confidence, signals, category-specific guidance

**Structured CoT (ANALYSIS CHAIN):**
1. CONSENSUS: Where do the 3 analysts agree? Where do they disagree?
2. RISK OVERRIDE: Does the risk analyst raise concerns that override positive fundamentals?
3. CATEGORY FIT: How well does this stock fit its Lynch category expectations?
4. CONVICTION TEST: Does it pass ALL gates (fundamentals + governance + risk + valuation)?
5. VERDICT: Investment thesis direction and magnitude.

**Conviction Calibration (7 gates):**
- HIGH requires ALL of: Buffett >= 75, Graham >= 70 OR Lynch >= 70, Pabrai risk low/moderate, AG2 governance strong/adequate, AG3 risk low/moderate, not disqualified, strengths align with Lynch category
- MEDIUM: At least 4 of 7 HIGH criteria met, no single severe failure
- LOW: Some positive signals but significant concerns
- NONE: Disqualified, or multiple severe failures

Note: "conviction" = how strongly to act on the thesis. "confidence" = certainty about the analysis. A well-analyzed terrible company = high confidence, none conviction.

**Output:**
```json
{
  "investment_thesis": "3-4 sentence thesis",
  "signal_alignment": "aligned|mixed|conflicting",
  "final_adjustment": -15 to +15,
  "conviction": "high|medium|low|none",
  "conviction_reasoning": "why this conviction level",
  "time_horizon": "6m|1y|2y|5y",
  "key_monitor_items": ["what to watch"]
}
```

**Post-validation** cross-checks AG4 output against quantitative data:
- "high" conviction on disqualified company → override to "none"
- "high" conviction with conflicting signal alignment → override to "medium"
- Adjustment > 10 on composite < 40 → capped at 5

## Post-Validation Flow

After each agent's output is parsed, a cross-check validates LLM claims against quantitative data.

```
AG1 parsed output + EnrichedSnapshot + CompanyAnalysis
    │
    v
validateFundamentals()
    │
    ├── trend vs revenue history    → override if contradicted
    ├── earnings quality vs OCF     → override if contradicted
    └── adjustment vs disqualified  → cap at 0
    │
    v
AG1 output with overrides applied + warnings logged

AG4 parsed output + CompanyAnalysis
    │
    v
validateSynthesis()
    │
    ├── conviction vs disqualified      → override to "none"
    ├── conviction vs signal_alignment  → downgrade if conflicting
    └── adjustment vs composite score   → cap if score too low
    │
    v
AG4 output with overrides applied + warnings logged
```

## Insight Propagation

How findings flow between layers:

```
flattenV2 time series
    │
    ├── "ROE declining 3 years" ──────────────> AG1 (interprets the trend)
    │
    ├── Buffett: "Failed ROE consistency    ──> AG1 (explains WHY)
    │   (6/10 years above 15%)"
    │
    ├── Lynch: "cyclical (metals,           ──> AG1 (cycle position)
    │   CV = 0.8)"                          ──> AG3 (cyclical risk)
    │
    ├── Pabrai: "D/E 2.1,                  ──> AG3 (survivability)
    │   interest coverage 1.8"
    │
    ├── Screener cons: "Promoter            ──> AG2 (pledge trajectory)
    │   pledge at 42%"
    │
    ├── peer_comparison[]:                  ──> AG1 (relative valuation)
    │   "P/E, ROCE, margins vs              ──> AG4 (sector positioning)
    │    top 5 sector peers"
    │
    ├── macro regime:                       ──> AG4 (regime-aware thesis)
    │   "goldilocks / stagflation / ..."
    │
    ├── AG1 key_findings:                   ──> AG4 (weighs heavily)
    │   "OCF negative 3yr"
    │
    ├── AG2 key_findings:                   ──> AG4 (governance signal)
    │   "Promoter accumulating"
    │
    ├── AG3 key_findings:                   ──> AG4 (may cap conviction)
    │   "Covenant breach risk"
    │   (min 2 risks enforced by
    │    devil's advocate mandate)
    │
    └── Post-validation:                    ──> overrides applied
        "trend contradicts data"                before final score
```

## Conviction Flow

```
                    Layer 1                          Layer 2
                    ──────                           ──────
computeConviction()                         AG4 synthesis (7-gate calibration)
│                                           │
├── score >= 80?                            ├── Buffett >= 75?
├── 2+ frameworks >= 75?                    ├── Graham >= 70 OR Lynch >= 70?
├── Pabrai >= 60?                           ├── Pabrai risk low/moderate?
├── No disqualifiers?                       ├── AG2 governance strong/adequate?
│                                           ├── AG3 risk low/moderate?
└── → high / medium / low / none            ├── Not disqualified?
                                            ├── Strengths align with Lynch category?
                                            │
                                            ├── ALL 7 → HIGH conviction
                                            ├── 4+ of 7 → MEDIUM conviction
                                            ├── Some positive → LOW conviction
                                            └── Disqualified or severe failures → NONE
                                            │
                                            v
                                     Post-validation:
                                       HIGH + disqualified → NONE
                                       HIGH + conflicting signals → MEDIUM
                                       adjustment > 10 + score < 40 → cap at 5
```

## Dashboard Data Flow

```
PostgreSQL (analysis_results + companies + snapshots)
       │
       │  Drizzle ORM queries (queries.ts)
       v
Next.js Server Components (force-dynamic)
       │
       │  9 query functions:
       │    getLatestRunId, getSummaryStats, getTopCompanies,
       │    getAllRankings, getCompanyDetail, getHighConvictionCompanies,
       │    getFrameworkComparison, getBacktestRuns, getMacroSnapshots,
       │    getSectorDistribution, getPipelineStatus
       │
       ├──> Server pages render HTML with data
       │      (page.tsx files in app/ directory)
       │
       └──> Client components for interactivity
              CompanyTable (sort, filter, search)
              AgentAnalysisPanel (tabbed view)
              FrameworksTable (sort, filter)
```

## Backtest Data Flow

```
1. Price ingestion:
   Yahoo Finance API → yfinance Python → price_history table
   (~636K rows for 5,300 companies × 10yr monthly)

2. Backtest execution:
   analysis_results (past run)
       │
       ├── Select top N by finalScore + classification filter
       │
       ├── Load entry prices (closest to analysis date)
       │
       ├── Load exit prices (at evaluation date)
       │
       └── Calculate: return%, hit rate, Sharpe ratio
                │
                v
          backtest_runs table (picks + performance JSONB)

3. Walk-forward:
   For each scrape_run in [from, to]:
       run backtest(run, run_date + holding_period)
       aggregate returns, hit rates, Sharpe ratios
```

## Macro Overlay Flow

```
Manual entry (CLI) → macro_snapshots table
                          │
                          v
                   classifyRegime()
                   ┌────────────────────────┐
                   │ GDP growth × CPI       │
                   │                        │
                   │  Growth↑ Inflation↓    │ → Goldilocks
                   │  Growth↑ Inflation↑    │ → Reflation
                   │  Growth↓ Inflation↑    │ → Stagflation
                   │  Growth↓ Inflation↓    │ → Deflation
                   └────────────┬───────────┘
                          │     │
                          │     └──────────────> AG4 synthesis prompt
                          │                      (regime name, confidence,
                          v                       signals, category guidance)
                   getRegimeAdjustments()
                   ┌────────────────────────┐
                   │ Per Lynch category:    │
                   │  Growth stocks: 0.90x  │  (stagflation)
                   │  Cyclicals:    1.15x   │  (reflation)
                   │  Value stocks: 1.10x   │  (deflation)
                   │  Safety bonus: +5      │  (stagflation)
                   └────────────────────────┘
```

## Weekly Comparison Flow

```
Previous analysis_results (run N-1)
       +
Current analysis_results (run N)
       │
       v
computeWeeklyChanges()
       │
       ├── Score delta per company
       ├── Classification change ("neutral → potential_long")
       ├── Biggest movers (by absolute score delta)
       ├── New companies (first appearance)
       └── Missing companies (potential delisting)
              │
              v
       score_change + classification_change columns
       + weekly markdown report
```
