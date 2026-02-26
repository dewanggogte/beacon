# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          WEEKLY PIPELINE                            │
│                                                                     │
│  ┌────────────┐    ┌─────────────┐    ┌──────────────────────────┐  │
│  │  SCRAPER   │───>│  ANALYZER   │───>│  DASHBOARD (Next.js 15)  │  │
│  │ HTTP+Cheerio│   │ Score+LLM   │    │  7 pages, dark theme     │  │
│  │ ~5,300 cos │    │ 4 frameworks│    │  localhost:3000           │  │
│  └────────────┘    └─────────────┘    └──────────────────────────┘  │
│         │                │                        │                  │
│         └────────────────┴────────────────────────┘                  │
│                          │                                           │
│              ┌───────────v────────────┐                              │
│              │     POSTGRESQL 17      │                              │
│              │  7 tables, JSONB heavy │                              │
│              └────────────────────────┘                              │
└─────────────────────────────────────────────────────────────────────┘
```

## Monorepo Structure

npm workspaces with 4 packages. Dependencies flow one direction: `shared` ← `scraper`, `analyzer`, `dashboard`.

```
packages/
├── shared/      Zero dependencies on other packages. DB schema, types, logger.
├── scraper/     Depends on shared. HTTP client, parsers, storage.
├── analyzer/    Depends on shared. Scoring, frameworks, LLM, backtest.
└── dashboard/   Depends on shared. Next.js 15, server components.
```

Build order is enforced by `tsconfig.build.json` project references.

## Package: @screener/shared

Foundation layer. Contains everything that crosses package boundaries.

```
shared/src/
├── index.ts              Re-exports db, schema, config, logger, types
├── config.ts             Zod-validated environment config
├── db/
│   ├── index.ts          Drizzle ORM client (postgres.js driver)
│   └── schema.ts         All 7 table definitions
├── types/
│   ├── index.ts          Barrel export
│   ├── analysis.ts       CompanyAnalysis, DimensionScore, LLMAnalysis
│   ├── rubric.ts         ScoringRubric, MetricConfig, ClassificationThresholds
│   └── frameworks.ts     BuffettResult, GrahamResult, LynchResult, PabraiResult,
│                          FrameworkResults, ConvictionLevel, LynchCategory
└── utils/
    ├── logger.ts         Structured logger (timestamp + level)
    └── sleep.ts          Async delay utility
```

### Database Schema

7 tables defined in `schema.ts` with Drizzle ORM:

| Table | Key Design Decisions |
|-------|---------------------|
| `companies` | Unique on `screener_code`. Master dimension. |
| `scrape_runs` | One per weekly scrape. Links snapshots and analyses. |
| `company_snapshots` | 10 flattened numerics for fast queries + 9 JSONB columns for 13 years of financial data. Unique on (company_id, scrape_run_id). |
| `analysis_results` | Layer 1 scores (5 dimensions + composite), framework scores (Buffett, Graham, Pabrai, Lynch), LLM outputs (4 agents), conviction, classification, weekly changes. Unique on (company_id, scrape_run_id). |
| `price_history` | Monthly close prices from yfinance. Unique on (company_id, price_date). |
| `backtest_runs` | Picks + performance JSONB. Linked to scrape_run_id. |
| `macro_snapshots` | 7 macro indicators + auto-classified regime. Unique on date. |

JSONB columns in `company_snapshots` store the raw financial table data:
- `annual_pl` — 13 years: Sales, Net Profit, EPS, OPM%, etc.
- `balance_sheet` — 12 years: Equity, Reserves, Borrowings, Fixed Assets
- `cash_flow` — 12 years: OCF, Investing CF, Financing CF
- `ratios` — 12 years: ROCE%, Debtor Days, Inventory Days
- `shareholding` — 12 quarters: Promoters%, FIIs%, DIIs%, Pledge%
- `quarterly_results` — 8-12 quarters
- `pros`, `cons` — Text arrays
- `peer_comparison` — Sector peer metrics

## Package: @screener/scraper

HTTP-first scraper. Screener.in has no Cloudflare/anti-bot, so native `fetch` + Cheerio suffices. No headless browser needed.

```
scraper/src/
├── index.ts                 CLI entry (scrape, test, list)
├── config.ts                Delay ranges, batch sizes, UA rotation
├── client/
│   ├── http-client.ts       Native fetch with realistic headers, UA rotation
│   ├── rate-limiter.ts      Token bucket + jitter (2-8s per request)
│   └── retry.ts             Exponential backoff (429→5min, 403→1hr)
├── company-list/
│   └── fetch-company-list.ts   Search API + 2-letter combos + pagination
├── company-detail/
│   ├── index.ts             Orchestrates all parsers for one company
│   ├── parse-header.ts      Name, BSE/NSE codes, sector, industry
│   ├── parse-ratios.ts      Market cap, P/E, ROCE, ROE (Indian number format)
│   └── parse-table.ts       Financial tables (#profit-loss, #balance-sheet, etc.)
├── validation/
│   ├── validate-snapshot.ts  Schema validation
│   └── detect-blocking.ts    403/429/captcha detection
├── storage/
│   ├── save-company.ts      Upsert company master record
│   ├── save-snapshot.ts     Insert snapshot with JSONB
│   └── save-run.ts          Track scrape run progress
└── pipeline/
    ├── scrape-run.ts        Main loop: list → shuffle → scrape → save
    └── progress-tracker.ts  Resumable checkpoints
```

### Anti-Blocking Strategy

| Layer | Implementation |
|-------|---------------|
| Headers | 10+ Chrome User-Agents, Accept/Referer/Accept-Language |
| Timing | Normal-distribution 2-8s delays between requests |
| Batching | Pause 3-8min every 50 companies |
| Sessions | Pause 5-15min every 300 requests |
| Order | Fisher-Yates shuffle (never alphabetical) |
| Detection | Active 403/429/captcha monitoring |
| Backoff | 429→5min, 403→1hr, 10+ failures→stop |

## Package: @screener/analyzer

The analysis engine. Three layers: quantitative scoring, framework evaluation, and LLM qualitative analysis.

```
analyzer/src/
├── index.ts                  CLI (analyze, backtest, walk-forward, macro, rubric)
│
├── enrichment/               DATA PREPARATION
│   ├── flatten-v2.ts         Extracts 60+ metrics from JSONB time series
│   └── trend-analyzer.ts     CAGR, CV, consistency count, slope, series avg
│
├── scoring/                  LAYER 1: QUANTITATIVE
│   ├── rubric-loader.ts      Loads principles/scoring-rubric.json
│   ├── metric-scorer.ts      Scores individual metrics 0-100
│   ├── dimension-scorer.ts   Aggregates into 5 dimensions
│   ├── composite-scorer.ts   V1 composite + V2 (classification-aware) + conviction
│   ├── disqualifier.ts       8 automatic disqualification rules
│   └── engine.ts             Orchestrator: load → enrich → score → rank
│
├── frameworks/               INVESTMENT FRAMEWORKS
│   ├── index.ts              Runs all 4 evaluators
│   ├── buffett.ts            10 criteria (ROE consistency, moat, owner earnings)
│   ├── graham.ts             10 criteria (Graham Number, NCAV, margin of safety)
│   ├── lynch.ts              Classify → category-specific scoring
│   └── pabrai.ts             6 risk factors (leverage, simplicity, OCF)
│
├── llm/                      LAYER 2: MULTI-AGENT LLM
│   ├── anthropic-client.ts   Claude API client with prompt caching
│   ├── qualitative-analyzer.ts  Multi-agent orchestrator (tiered execution)
│   └── agents/
│       ├── agent-types.ts        Shared types for agent I/O
│       ├── data-pack-builder.ts  Builds agent-specific XML data payloads
│       ├── fundamentals-agent.ts AG1: Trend, earnings quality, growth
│       ├── governance-agent.ts   AG2: Promoter behavior, FII/DII signals
│       ├── risk-agent.ts         AG3: Leverage, cyclical risk, tail risk
│       └── synthesis-agent.ts    AG4: Combines AG1-3 → thesis + conviction
│
├── macro/                    MACRO OVERLAY
│   ├── regime-classifier.ts  4-quadrant: goldilocks/reflation/stagflation/deflation
│   └── macro-loader.ts       Load/insert macro snapshots
│
├── backtest/                 BACKTESTING
│   ├── price-loader.ts       Load historical prices from DB
│   ├── performance-calculator.ts  Returns, hit rate, Sharpe ratio
│   ├── backtest-runner.ts    Single backtest: picks → prices → returns
│   └── walk-forward.ts       Rolling window across multiple runs
│
├── pipeline/
│   ├── analysis-run.ts       Main pipeline: Layer 1 → Layer 2 → save → compare → report
│   └── weekly-comparison.ts  Score deltas and classification changes
│
├── output/
│   └── report-generator.ts   Markdown reports with tables and distributions
│
└── storage/
    └── save-analysis.ts      Upsert analysis results to DB
```

### Scoring Engine Flow

```
company_snapshots (JSONB)
        │
        v
  flattenV2()  ──── Extracts 60+ typed metrics from 13yr time series
        │              ROE history, OPM history, D/E history, OCF history,
        │              CAGR, Graham Number, NCAV, owner earnings, etc.
        │
        ├──> scoreDimension() x5 ──> computeComposite() ──> classify()
        │       valuation, quality,      weighted average      strong_long..
        │       governance, safety,                             strong_avoid
        │       momentum (21 metrics)
        │
        ├──> evaluateAllFrameworks()
        │       ├── evaluateBuffett()  → score 0-100, 10 criteria, moatIndicators
        │       ├── evaluateGraham()   → score 0-100, 10 criteria, grahamNumber
        │       ├── evaluateLynch()    → category + categoryScore 0-100
        │       └── evaluatePabrai()   → riskScore 0-100 (100=safest)
        │
        ├──> computeCompositeV2()  ──> Blends by Lynch category
        │       fast_grower:  Lynch 30%, Buffett 20%, Pabrai 20%, ...
        │       stalwart:     Buffett 30%, Graham 20%, Pabrai 20%, ...
        │       turnaround:   Pabrai 35%, Momentum 25%, ...
        │
        └──> computeConviction()  ──> high / medium / low / none
```

### Multi-Agent LLM Architecture

```
         ┌─────────────────────────────────────────┐
         │         DATA PACK BUILDER               │
         │  Structures Layer 1 output for each agent│
         │  XML-tagged, agent-specific payloads     │
         └────┬──────────┬──────────┬──────────────┘
              │          │          │
        ┌─────v──┐ ┌────v───┐ ┌───v──────┐
        │  AG1   │ │  AG2   │ │   AG3    │   Each receives:
        │ Funds  │ │  Gov   │ │   Risk   │   - Pre-computed metrics
        │ Haiku  │ │ Haiku  │ │  Haiku   │   - Framework scores
        └───┬────┘ └───┬────┘ └───┬──────┘   - Methodology context
            │          │          │           - Screener pros/cons
            └──────────┼──────────┘
                       │
                 ┌─────v──────┐
                 │    AG4     │  Receives: AG1-3 JSON outputs
                 │  Synthesis │  + all framework scores
                 │   Sonnet   │  + Lynch category guidance
                 └────────────┘
                       │
                 investment_thesis + conviction + adjustment
```

Prompt design principles:
- XML tags for structure (`<methodology>`, `<company_data>`, `<framework_results>`)
- System prompts cached across companies (90% token savings)
- All ratios pre-computed — LLM interprets, never calculates
- Structured JSON output with validation + clamping

### Tiered Execution

| Tier | Companies | Agents | Model | Est. Cost |
|------|-----------|--------|-------|-----------|
| None | ~4,450 | Layer 1 only | — | $0 |
| Tier 2 | ~700 | AG1 only | Haiku | ~$3 |
| Tier 1 | ~150 | AG1-AG4 | Haiku+Sonnet | ~$4 |

Tier assignment by rank: Tier 1 = top 100 + bottom 50. Tier 2 = top 500 + bottom 200.

## Package: @screener/dashboard

Next.js 15 with App Router. All pages use `force-dynamic` for server-side data fetching. Dark Bloomberg-terminal theme with monospace fonts.

```
dashboard/src/
├── app/
│   ├── layout.tsx              Root layout + nav (7 links)
│   ├── globals.css             Tailwind v4 theme (dark: #0a0a0f, monospace)
│   ├── page.tsx                Home: stats + conviction picks + longs/avoids
│   ├── rankings/page.tsx       Full table with Lynch/conviction filters
│   ├── conviction/page.tsx     High/medium conviction cards with thesis
│   ├── frameworks/
│   │   ├── page.tsx            Server component (data loader)
│   │   └── frameworks-table.tsx Client component (sort/filter)
│   ├── backtest/page.tsx       Backtest runs + aggregate performance
│   ├── company/[code]/page.tsx Company detail: frameworks, agents, metrics
│   └── pipeline/page.tsx       Scrape run status
├── components/
│   ├── company-table.tsx       Client: search, sort, filter (class/Lynch/conviction)
│   ├── stat-card.tsx           Server: label + value + color
│   ├── lynch-badge.tsx         Lynch category color badge
│   ├── conviction-badge.tsx    Conviction level indicator
│   ├── framework-scores.tsx    4-framework cards with bars + details
│   └── agent-analysis-panel.tsx Tabbed panel: Synthesis/Fundamentals/Gov/Risk
└── lib/
    └── queries.ts              9 query functions (Drizzle typed)
```

## Configuration

All scoring configuration lives in `principles/` as JSON files, not hardcoded:

```
principles/
├── scoring-rubric.json           21 metrics, 5 dimensions, sector adjustments
└── frameworks/
    ├── buffett-checklist.json    10 criteria with weights
    ├── graham-screen.json        10 criteria with weights
    ├── lynch-categories.json     Classification rules + per-category scoring
    ├── pabrai-risk.json          6 risk factors with threshold levels
    ├── cyclical-sectors.json     37 sector strings for Lynch cyclical detection
    └── composite-weights.json    Weight matrix by Lynch category
```

## Technology Choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| TypeScript ESM | Strong types for financial data, native ESM for modern tooling |
| Native fetch + Cheerio | Screener.in is server-rendered HTML, no JS challenges |
| PostgreSQL + Drizzle | JSONB for 13yr financial data, typed queries, studio UI |
| Anthropic Claude | Prompt caching reduces cost 90%, multi-agent for specialization |
| Next.js 15 | Server Components for DB queries, App Router, force-dynamic |
| Tailwind CSS 4 | Custom Bloomberg theme via CSS variables, minimal bundle |
| yfinance (Python) | Free historical prices, NSE/BSE support, no API key |
