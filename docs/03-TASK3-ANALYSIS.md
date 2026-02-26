# Task 3: Analysis & Ranking — Requirements & Guidance

## Objective

Take the structured data from Task 1 (PostgreSQL database) and the investment principles from Task 2 (scoring rubric + principles documents), and produce a ranked list of stocks categorized as strong long candidates, potential longs, neutral, potential shorts, and strong short/avoid candidates.

The system uses a **hybrid approach**: code-based quantitative scoring (primary) enhanced by LLM-based qualitative analysis (secondary, using locally hosted Qwen 4B).

---

## Two-Layer Analysis Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  LAYER 1: QUANTITATIVE                   │
│              (Code-based, deterministic)                  │
│                                                         │
│   Input: company_snapshots table + scoring_rubric.json  │
│   Output: Numerical scores per dimension + composite    │
│                                                         │
│   ┌──────────┐ ┌───────────┐ ┌────────────┐ ┌────────┐│
│   │Valuation │ │  Quality  │ │ Governance │ │ Safety ││
│   │  Score   │ │   Score   │ │   Score    │ │ Score  ││
│   │  (0-100) │ │  (0-100)  │ │  (0-100)   │ │(0-100) ││
│   └────┬─────┘ └─────┬─────┘ └─────┬──────┘ └───┬────┘│
│        │              │             │             │      │
│        └──────────────┴──────┬──────┴─────────────┘      │
│                              │                           │
│                    Weighted Composite Score               │
│                         (0-100)                          │
│                              │                           │
│                 ┌────────────┴────────────┐              │
│                 │  Automatic Disqualifiers │              │
│                 │  (instant fail checks)   │              │
│                 └────────────┬────────────┘              │
│                              │                           │
│                    Filtered Ranked List                   │
└──────────────────────────────┼───────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────┐
│                  LAYER 2: QUALITATIVE                     │
│             (LLM-based, Qwen 4B locally)                 │
│                                                         │
│   Input: Top 200 + Bottom 200 from Layer 1              │
│          + raw financial data + principles document       │
│   Output: Qualitative insights, risk narrative,          │
│           adjusted recommendation                        │
│                                                         │
│   For each stock:                                        │
│   - Trend analysis (are things improving or declining?)  │
│   - Narrative assessment (what's the story?)             │
│   - Risk identification (what could go wrong?)           │
│   - Catalyst identification (what could drive value?)    │
│   - Confidence level (high/medium/low)                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Layer 1: Quantitative Scoring Engine

### Implementation: Pure TypeScript/Node.js — No LLM

This is deterministic, reproducible, and fast. Same input always produces same output.

### Scoring Dimensions

Load weights and thresholds from `principles/scoring-rubric.json`. The code should be generic — it reads the rubric, not hard-codes thresholds.

#### Scoring Function Design

```typescript
interface DimensionScore {
  dimension: string;        // "valuation", "quality", "governance", "safety", "momentum"
  score: number;            // 0-100
  weight: number;           // from rubric
  metrics: MetricScore[];   // per-metric breakdown
  flags: string[];          // warnings or red flags triggered
}

interface MetricScore {
  metric: string;           // "pe_ratio", "roe_avg_5y", etc.
  rawValue: number | null;  // actual data value
  score: number;            // 0-100 for this metric
  assessment: string;       // "excellent" | "good" | "acceptable" | "poor" | "red_flag" | "N/A"
}

interface CompanyAnalysis {
  companyId: number;
  companyName: string;
  screenerCode: string;
  sector: string;
  
  // Layer 1
  dimensionScores: DimensionScore[];
  compositeScore: number;               // weighted average, 0-100
  disqualified: boolean;
  disqualificationReasons: string[];
  
  // Layer 2 (filled later)
  llmAnalysis?: LLMAnalysis;
  
  // Final
  classification: 'strong_long' | 'potential_long' | 'neutral' | 'potential_short' | 'strong_avoid';
  rank: number;
}
```

#### Scoring Logic Per Metric

For continuous metrics (PE, ROE, etc.), use a normalized scoring function:

```typescript
function scoreMetric(value: number, config: MetricConfig): number {
  // If value is null/undefined, return 0 with "N/A" assessment
  // If value triggers a red flag, return 0
  // If value is in "excellent" range, return 90-100
  // If value is in "ideal" range, return 70-90
  // If value is in "acceptable" range, return 40-70
  // If value is outside acceptable but not red flag, return 10-40
  // Use linear interpolation within ranges
}
```

For boolean/categorical metrics (auditor changes, ASM listing):
```typescript
function scoreBooleanMetric(value: boolean | string, isRedFlag: boolean): number {
  // Red flag present → 0
  // Red flag absent → 100
}
```

#### Sector Adjustments

The rubric allows sector-specific thresholds. The scoring engine must:
1. Look up the company's sector
2. Check if sector-specific thresholds exist for each metric
3. Use sector thresholds if available, otherwise use default thresholds

This is critical — a PE of 30 is terrible for a bank but normal for an IT company.

#### Trend/Momentum Scoring

Compare current metrics to historical values from previous scrape runs:

```typescript
function scoreTrend(currentValue: number, historicalValues: number[]): number {
  // Calculate direction: improving, stable, or declining
  // Improving = higher score, declining = lower score
  // Weight recent data more heavily
  // Use simple linear regression slope or compare last 4 quarters
}
```

Metrics to track trends for:
- ROE (should be stable or improving)
- ROCE (should be stable or improving)
- Debt-to-Equity (should be stable or declining)
- Operating margin (should be stable or improving)
- Promoter holding (should be stable or increasing)
- Promoter pledge % (should be stable or declining)

#### Automatic Disqualifiers

Before scoring, check all disqualifiers from the rubric. If ANY trigger, the company is flagged and classified as "strong_avoid" regardless of other scores.

```typescript
const DISQUALIFIERS = [
  (data) => data.promoter_pledge_pct > 50,
  (data) => data.net_worth < 0,
  (data) => data.asm_gsm_listed === true,
  (data) => data.qualified_audit_opinion === true,
  (data) => data.consecutive_negative_ocf_years >= 3,
  (data) => data.debt_to_equity > 3,
];
```

### Composite Score Calculation

```typescript
compositeScore = sum(dimensionScore[i] * weight[i]) for all dimensions
// Normalize to 0-100
```

### Classification Thresholds

```
Strong Long:      compositeScore >= 80 AND no red flags
Potential Long:   compositeScore >= 65 AND no disqualifiers
Neutral:          compositeScore >= 40 AND compositeScore < 65
Potential Short:  compositeScore >= 20 AND compositeScore < 40
Strong Avoid:     compositeScore < 20 OR disqualified
```

These thresholds should be configurable and tuned based on the distribution of scores.

---

## Layer 2: LLM Qualitative Analysis (Qwen 4B)

### Scope

Only run LLM analysis on:
- **Top 200 by composite score** (long candidates worth deeper analysis)
- **Bottom 200 by composite score** (short/avoid candidates to confirm)
- **Any companies that just crossed classification boundaries** since last week (newly promoted/demoted)

This limits LLM calls to ~400-500 per run, which is manageable for a local 4B model.

### LLM Integration

```typescript
// Connect to locally running Qwen 4B
// Options: Ollama, vLLM, llama.cpp server
// Recommend: Ollama for simplicity on home server

const OLLAMA_URL = 'http://localhost:11434/api/generate';

interface LLMAnalysis {
  trendNarrative: string;       // "Revenue growing but margins declining due to..."
  riskFactors: string[];        // ["High dependence on single client", "Commodity price exposure"]
  catalysts: string[];          // ["New product launch in Q2", "Sector tailwinds from govt policy"]
  qualitativeAdjustment: number; // -10 to +10 adjustment to composite score
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;            // Why the adjustment
}
```

### Prompt Engineering for Qwen 4B

Since Qwen 4B is a smaller model, prompts must be:
- **Specific and structured** — tell it exactly what to output
- **Grounded in data** — provide the actual numbers, don't ask it to recall
- **JSON-formatted output** — easier to parse programmatically
- **One company at a time** — don't batch

```typescript
const prompt = `You are a value investing analyst evaluating Indian stocks. 
Analyze the following company based on the data provided.

Company: ${companyName} (${sector})
Key Metrics:
- PE: ${pe}, ROE: ${roe}%, ROCE: ${roce}%
- Debt/Equity: ${de}, Current Ratio: ${cr}
- 5Y Revenue CAGR: ${revGrowth}%, 5Y Profit CAGR: ${profitGrowth}%
- Promoter Holding: ${promoterHolding}%, Pledge: ${promoterPledge}%
- Free Cash Flow (last 3 years): ${fcf}
- Operating Margin Trend: ${marginTrend}

Quantitative Score: ${compositeScore}/100

Quarterly Revenue Trend (last 8 quarters): ${quarterlyRevenue}
Quarterly Profit Trend (last 8 quarters): ${quarterlyProfit}

Respond in this exact JSON format:
{
  "trend_narrative": "2-3 sentence analysis of the trend in fundamentals",
  "risk_factors": ["risk1", "risk2", "risk3"],
  "catalysts": ["catalyst1", "catalyst2"],
  "qualitative_adjustment": <number from -10 to +10>,
  "confidence": "high" | "medium" | "low",
  "reasoning": "1-2 sentences explaining the adjustment"
}

Rules:
- Be conservative. When in doubt, adjust downward.
- Flag any disconnects between reported profits and cash flow.
- Consider sector-specific risks.
- Do not hallucinate — only use the data provided above.`;
```

### Handling LLM Failures

- If Qwen fails to return valid JSON, retry up to 3 times
- If still failing, skip LLM analysis for that company (Layer 1 score stands alone)
- Log all failures for review
- Never let LLM failure block the pipeline

### LLM Adjustment Guardrails

- Maximum adjustment: ±10 points on the 0-100 composite score
- LLM cannot override automatic disqualifiers
- LLM adjustment is logged with full reasoning for audit trail
- If LLM confidence is "low", reduce adjustment by 50%

---

## Output Generation

### 1. Database: Analysis Results Table

```sql
CREATE TABLE analysis_results (
    id SERIAL PRIMARY KEY,
    company_id INT REFERENCES companies(id),
    scrape_run_id INT REFERENCES scrape_runs(id),
    analyzed_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Layer 1
    valuation_score NUMERIC,
    quality_score NUMERIC,
    governance_score NUMERIC,
    safety_score NUMERIC,
    momentum_score NUMERIC,
    composite_score NUMERIC,
    disqualified BOOLEAN DEFAULT FALSE,
    disqualification_reasons JSONB,
    metric_details JSONB,          -- Full per-metric breakdown
    
    -- Layer 2
    llm_analysis JSONB,            -- Full LLM response
    llm_adjustment NUMERIC,
    
    -- Final
    final_score NUMERIC,           -- composite + llm_adjustment
    classification VARCHAR(20),    -- strong_long, potential_long, etc.
    rank_overall INT,
    rank_in_sector INT,
    
    -- Week-over-week
    score_change NUMERIC,          -- vs previous week
    classification_change VARCHAR(50),  -- e.g., "neutral → potential_long"
    
    UNIQUE(company_id, scrape_run_id)
);

CREATE INDEX idx_analysis_classification ON analysis_results(classification);
CREATE INDEX idx_analysis_score ON analysis_results(final_score DESC);
CREATE INDEX idx_analysis_run ON analysis_results(scrape_run_id);
```

### 2. Markdown Reports

Generate per-run reports:

#### `reports/YYYY-MM-DD-weekly-report.md`
```markdown
# Weekly Stock Analysis Report — {date}

## Summary
- Total companies analyzed: {N}
- Strong Long candidates: {N}
- Potential Long candidates: {N}
- Neutral: {N}
- Potential Short: {N}
- Strong Avoid: {N}

## Top 20 Long Candidates
| Rank | Company | Sector | Score | PE | ROE | Key Catalyst |
...

## Top 20 Short/Avoid Candidates
| Rank | Company | Sector | Score | Key Red Flag |
...

## Notable Changes This Week
| Company | Previous | Current | Driver |
...

## Sector Heatmap
| Sector | Avg Score | #Long | #Short | Trend |
...
```

#### `reports/YYYY-MM-DD-company/{code}.md`
Per-company detail report for top 50 long and top 50 short candidates:
```markdown
# {Company Name} ({NSE Code})

## Score: {final_score}/100 — {classification}
Score change from last week: {change}

## Valuation: {score}/100
- PE: {value} ({assessment})
- PBV: {value} ({assessment})
...

## Quality: {score}/100
- ROE 5Y Avg: {value}% ({assessment})
...

## Governance: {score}/100
...

## LLM Analysis
{trend_narrative}

### Risk Factors
- {risk1}
- {risk2}

### Catalysts
- {catalyst1}
- {catalyst2}

## Historical Scores
| Date | Score | Classification |
...
```

### 3. Dashboard Data API

Expose the analysis results via a simple API for the web dashboard:

```
GET /api/rankings?classification=strong_long&limit=50
GET /api/company/{code}
GET /api/company/{code}/history
GET /api/sectors/summary
GET /api/changes?since=YYYY-MM-DD
GET /api/report/latest
```

---

## Web Dashboard Requirements

### Pages

1. **Dashboard Home**
   - Summary stats (total analyzed, distribution across classifications)
   - Top 10 long candidates (card view with key metrics)
   - Top 10 short/avoid candidates
   - Sector heatmap
   - Week-over-week changes (promotions/demotions)

2. **Rankings Page**
   - Sortable, filterable table of ALL analyzed companies
   - Filter by: classification, sector, market cap range, score range
   - Sort by: overall rank, score, any metric
   - Search by company name or code
   - Export to CSV

3. **Company Detail Page**
   - Full scoring breakdown (visual: radar chart or bar chart)
   - Historical score chart (line graph over weeks)
   - LLM analysis narrative
   - Key metrics table
   - Link to Screener.in page for verification

4. **Principles Reference Page**
   - Rendered version of `investment-principles.md`
   - Scoring rubric visualization
   - Red flags checklist

5. **Pipeline Status Page**
   - Last scrape run: status, timestamp, success rate
   - Last analysis run: timestamp, summary
   - System health (Qwen running, DB connection, disk space)

### Design
- Clean, data-dense UI (think Bloomberg terminal, not consumer app)
- Dark mode by default (easier on eyes for extended analysis)
- Responsive (works on mobile for quick checks)
- Fast — pre-computed data, no heavy queries on page load

---

## Weekly Comparison Logic

Critical for identifying emerging opportunities and deteriorating positions:

```typescript
function computeWeeklyChanges(currentRun: number, previousRun: number) {
  // For each company present in both runs:
  // 1. Score delta = current.final_score - previous.final_score
  // 2. Classification change (e.g., "neutral" → "potential_long")
  // 3. Flag any that crossed the disqualifier threshold
  // 4. Flag new companies (not in previous run)
  // 5. Flag missing companies (in previous, not in current — delisted?)
  
  // Generate "Notable Changes" report section
  // Sort changes by absolute score delta (biggest movers first)
}
```

---

## Performance Considerations

- **Layer 1 scoring**: Should complete in < 5 minutes for 5,500 companies
- **Layer 2 LLM**: ~30-60 seconds per company with Qwen 4B, so ~200-500 companies = 2-8 hours
  - Run in parallel if server has capacity (but respect Qwen memory limits)
  - Priority: score top/bottom first, then work inward
- **Report generation**: < 5 minutes
- **Dashboard**: All queries should return in < 500ms (use materialized views or pre-computed tables)

---

## Deliverables

1. `packages/analyzer/` — Complete analysis engine
2. `packages/dashboard/` — Web dashboard application
3. `reports/` — Generated markdown reports (one per run)
4. `docs/scoring-methodology.md` — Detailed explanation of how scores are computed
5. `docker/Dockerfile.analyzer` — Containerized analyzer
6. `docker/Dockerfile.dashboard` — Containerized dashboard
7. `k8s/analyzer-job.yaml` — Kubernetes Job for analysis
8. `k8s/dashboard-deployment.yaml` — Dashboard deployment

---

## Acceptance Criteria

- [ ] All ~5,500 companies scored in under 5 minutes (Layer 1)
- [ ] LLM analysis completes for top/bottom 200 each
- [ ] Weekly comparison correctly identifies score changes and classification movements
- [ ] Dashboard loads in under 2 seconds
- [ ] Rankings are sortable/filterable by all major dimensions
- [ ] Company detail pages show full scoring breakdown with explanations
- [ ] Markdown reports generated automatically after each analysis run
- [ ] API endpoints return correct data with proper pagination
- [ ] Disqualifiers correctly flag and exclude companies
- [ ] Sector-specific scoring adjustments applied correctly
