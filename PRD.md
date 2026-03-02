# PRD: Indian Stock Market Screener & Analysis Pipeline

## 1. Problem Statement

Indian retail investors face a daunting task: evaluating ~5,500 listed companies across BSE and NSE to find quality investments while avoiding value traps and governance disasters. Existing screeners (Screener.in, Trendlyne) provide raw data but no systematic scoring framework that combines quantitative analysis with qualitative LLM-powered insights.

This project builds an automated pipeline that:
1. Scrapes comprehensive financial data for all listed Indian companies from Screener.in
2. Applies a rigorous, documented scoring framework based on world-class investor methodologies
3. Produces ranked long/short candidate lists optimized for **risk-adjusted returns** (Sharpe ratio)
4. Displays results in a Bloomberg-terminal-style web dashboard

**This is a personal research and analysis tool. It is NOT financial advice.**

---

## 2. Goals & Non-Goals

### Goals
- Identify stocks likely to **outperform** (long candidates) and **underperform** (short/avoid candidates) over 6-12 months
- Optimize for risk-adjusted returns, not maximum returns
- Provide complete transparency: every score traceable to data + documented principle
- Run autonomously on a weekly schedule without manual intervention
- Never get blocked by Screener.in (sustainable, polite scraping)
- Backtest scoring system against historical price data to validate signal quality

### Non-Goals
- Real-time trading signals or intraday data
- Portfolio management or trade execution
- Serving multiple users (single-user tool)
- Mobile app (responsive web is sufficient)
- ~~Backtesting engine~~ → Moved to Goals (built in v2 Phase 5)

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        WEEKLY PIPELINE                            │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────────┐  │
│  │   TASK 2      │    │   TASK 1      │    │      TASK 3        │  │
│  │  Investment   │───>│  Screener.in  │───>│   Analysis &       │  │
│  │  Principles   │    │  Data Scraper │    │   Ranking          │  │
│  │  (Research)   │    │  (HTTP+Cheerio│    │   (Scoring+LLM)    │  │
│  └──────────────┘    └──────────────┘    └────────────────────┘  │
│   Monthly refresh      Weekly cron         After scraper          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                   POSTGRESQL DATABASE                         ││
│  │  companies | scrape_runs | company_snapshots | analysis_results│
│  └──────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                   NEXT.JS DASHBOARD                           ││
│  │  Rankings | Company Detail | Sector Heatmap | Pipeline Status ││
│  └──────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

### Pipeline Flow (Every Saturday)

```
Saturday ~2:00 AM IST ── Scraper starts (markets closed, data stable)
    ├── Fetch company list via search API
    ├── Scrape each company detail page (HTTP + Cheerio)
    ├── Store snapshots in PostgreSQL
    │
~20:00-02:00 next day ── Scraper completes (~5,300 companies)
    ├── Run Layer 1: Quantitative scoring (<5 min)
    ├── Run Layer 2: LLM analysis on top/bottom 200 (2-8 hours)
    ├── Generate ranked output + markdown reports
    │
Sunday ── Dashboard updated with new data
```

---

## 4. Tech Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Language** | TypeScript (ESM) | Type safety for complex financial data structures |
| **Runtime** | Node.js v25+ | Latest LTS features, native fetch, ESM support |
| **Dev runner** | tsx | Zero-config TS execution, watch mode |
| **Build** | tsc (project references) | Incremental builds across monorepo packages |
| **Package manager** | npm workspaces | Built-in, no extra dependencies |
| **Scraper (primary)** | undici + Cheerio | Lightweight HTTP + HTML parsing. Screener.in has no heavy anti-bot protection |
| **Scraper (fallback)** | Playwright | Only activated if HTTP approach gets blocked |
| **Database** | PostgreSQL 17 (Homebrew) | Structured queries, JSONB for flexible data, time-series snapshots |
| **ORM** | Drizzle ORM | Type-safe schema-as-code, auto-generated migrations, studio UI |
| **DB driver** | postgres (postgres.js) | Fast, native ESM, recommended by Drizzle |
| **LLM** | Anthropic Claude OR local Qwen 3.5 | 4-agent architecture (AG1 fundamentals, AG2 governance, AG3 risk, AG4 synthesis). Dual-provider: Anthropic (Haiku/Sonnet, prompt caching) or local Qwen 3.5-35B via SGLang (`LLM_PROVIDER` env var). Structured chain-of-thought prompts, devil's advocate in AG3, post-LLM validation, macro regime context in AG4, peer comparison data. Tiered: Tier 1 = full 4-agent, Tier 2 = AG1 only, Tier 3 = no LLM. |
| **Dashboard** | Next.js 15 + Tailwind CSS | Best for interactive data-dense apps, Server Components |
| **Data grid** | TanStack Table | High-performance virtual scrolling, type-safe |
| **Charts** | Lightweight Charts + Recharts | Financial charts (TradingView) + general charts |
| **Validation** | Zod | Runtime type validation for config and API responses |

### What Changed from Original Spec

| Original Spec | Updated Decision | Reason |
|---------------|-----------------|--------|
| Puppeteer + stealth plugin | HTTP + Cheerio (Playwright fallback) | Screener.in has no Cloudflare/anti-bot. HTTP is 10x faster and simpler. puppeteer-extra-plugin-stealth is unmaintained since 2022. |
| Raw `pg` client | Drizzle ORM | Type-safe queries, auto migrations, studio UI. Better DX. |
| 6-8 hour scrape estimate | 18-24 hour realistic estimate | Conservative rate limiting (2-8s delays + batch/session breaks) with ~5,300 companies. May scrape only liquid stocks weekly. |
| pnpm/unspecified | npm workspaces | User preference. npm comes with Node.js, no extra install. |
| Ollama + Qwen 2.5 | Anthropic Claude OR local Qwen 3.5 | Multi-agent LLM with 4 specialized agents. Dual-provider support. Prompt caching (Anthropic), thinking-mode disabled (Qwen). |
| Single LLM prompt | 4-agent architecture | AG1-3 specialist analysts + AG4 CIO synthesis. Structured CoT, devil's advocate, post-validation, macro regime, peer comparison, conviction calibration. |
| No frameworks | Buffett/Graham/Lynch/Pabrai | 4 independent framework evaluators with classification-aware composite scoring. |
| No backtesting | yfinance + walk-forward | Historical price data + performance validation infrastructure. |

---

## 5. Data Model

### 5.1 Companies Table
Master list of all companies on Screener.in.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Internal ID |
| screener_code | VARCHAR(100) UNIQUE | URL slug (e.g., "RELIANCE") |
| name | VARCHAR(255) | Full company name |
| bse_code | VARCHAR(20) | BSE ticker |
| nse_code | VARCHAR(20) | NSE ticker |
| sector | VARCHAR(100) | Sector classification |
| industry | VARCHAR(100) | Industry sub-classification |
| website | VARCHAR(500) | Company website |
| created_at | TIMESTAMPTZ | First seen |
| updated_at | TIMESTAMPTZ | Last updated |

### 5.2 Scrape Runs Table
Metadata for each scrape cycle.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Run ID |
| started_at | TIMESTAMPTZ | When scrape began |
| completed_at | TIMESTAMPTZ | When scrape finished |
| total_companies | INT | Total companies to scrape |
| successful | INT | Successfully scraped |
| failed | INT | Failed to scrape |
| status | VARCHAR(20) | running / completed / failed |

### 5.3 Company Snapshots Table
One row per company per scrape run. The core data table.

**Flattened key metrics** (for fast querying):
market_cap, current_price, high_52w, low_52w, stock_pe, book_value, dividend_yield, roce, roe, face_value

**JSONB columns** (for flexible/variable-length data):
pros, cons, quarterly_results, annual_pl, balance_sheet, cash_flow, ratios, shareholding, peer_comparison

**Indexes:** company_id, scrape_run_id, market_cap. Unique constraint on (company_id, scrape_run_id).

### 5.4 Analysis Results Table
Scoring output per company per run.

**Layer 1 scores:** valuation_score, quality_score, governance_score, safety_score, momentum_score, composite_score, disqualified, disqualification_reasons, metric_details (JSONB)

**Layer 2 LLM:** llm_analysis (JSONB), llm_adjustment

**Final:** final_score, classification, rank_overall, rank_in_sector

**Week-over-week:** score_change, classification_change

---

## 6. Package Structure

```
screener-automation/
├── PRD.md                              # This document
├── package.json                        # Root: npm workspaces config
├── tsconfig.base.json                  # Shared TypeScript options
├── tsconfig.build.json                 # Project references for tsc --build
├── .gitignore
├── .env.example
├── docs/                               # Original spec documents
│   ├── 00-PROJECT-OVERVIEW.md
│   ├── 01-TASK1-SCRAPER.md
│   ├── 02-TASK2-PRINCIPLES.md
│   └── 03-TASK3-ANALYSIS.md
├── packages/
│   ├── shared/                         # @screener/shared
│   │   ├── src/
│   │   │   ├── index.ts               # Re-exports
│   │   │   ├── config.ts              # Zod-validated env config
│   │   │   ├── db/
│   │   │   │   ├── index.ts           # Drizzle client
│   │   │   │   ├── schema.ts          # All table definitions
│   │   │   │   └── migrate.ts         # Migration runner
│   │   │   ├── types/
│   │   │   │   ├── index.ts
│   │   │   │   ├── company.ts
│   │   │   │   ├── analysis.ts
│   │   │   │   ├── scraper.ts
│   │   │   │   └── rubric.ts
│   │   │   └── utils/
│   │   │       ├── logger.ts
│   │   │       └── sleep.ts
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   ├── scraper/                        # @screener/scraper
│   │   ├── src/
│   │   │   ├── index.ts               # CLI entry point
│   │   │   ├── config.ts              # Scraper-specific config
│   │   │   ├── client/
│   │   │   │   ├── http-client.ts     # Polite HTTP client
│   │   │   │   ├── rate-limiter.ts    # Token bucket + jitter
│   │   │   │   ├── retry.ts           # Exponential backoff
│   │   │   │   └── playwright-fallback.ts
│   │   │   ├── company-list/
│   │   │   │   ├── fetch-company-list.ts
│   │   │   │   └── parse-company-list.ts
│   │   │   ├── company-detail/
│   │   │   │   ├── fetch-company.ts
│   │   │   │   ├── parse-header.ts
│   │   │   │   ├── parse-ratios.ts
│   │   │   │   ├── parse-quarterly.ts
│   │   │   │   ├── parse-annual-pl.ts
│   │   │   │   ├── parse-balance-sheet.ts
│   │   │   │   ├── parse-cash-flow.ts
│   │   │   │   ├── parse-ratios-table.ts
│   │   │   │   ├── parse-shareholding.ts
│   │   │   │   ├── parse-peers.ts
│   │   │   │   └── index.ts
│   │   │   ├── pipeline/
│   │   │   │   ├── scrape-run.ts
│   │   │   │   ├── batch-processor.ts
│   │   │   │   ├── progress-tracker.ts
│   │   │   │   └── scheduler.ts
│   │   │   ├── storage/
│   │   │   │   ├── save-company.ts
│   │   │   │   ├── save-snapshot.ts
│   │   │   │   └── save-run.ts
│   │   │   └── validation/
│   │   │       ├── validate-snapshot.ts
│   │   │       └── detect-blocking.ts
│   │   └── package.json
│   ├── analyzer/                       # @screener/analyzer
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── scoring/
│   │   │   ├── enrichment/
│   │   │   │   └── flatten-v2.ts      # 60+ metric extraction from JSONB
│   │   │   ├── frameworks/
│   │   │   │   ├── buffett-evaluator.ts
│   │   │   │   ├── graham-evaluator.ts
│   │   │   │   ├── lynch-classifier.ts
│   │   │   │   ├── pabrai-risk.ts
│   │   │   │   └── composite-v2.ts
│   │   │   ├── llm/
│   │   │   │   ├── qualitative-analyzer.ts   # Orchestrator: tiered execution, macro loading
│   │   │   │   ├── create-llm-client.ts      # Factory: Anthropic or local Qwen
│   │   │   │   ├── llm-client.ts             # Interface
│   │   │   │   ├── anthropic-client.ts        # Anthropic SDK client
│   │   │   │   ├── openai-compatible-client.ts # Local LLM (SGLang/vLLM) client
│   │   │   │   └── agents/
│   │   │   │       ├── agent-types.ts         # Shared types
│   │   │   │       ├── data-pack-builder.ts   # Agent-specific data payloads
│   │   │   │       ├── fundamentals-agent.ts  # AG1: structured CoT, peer methodology
│   │   │   │       ├── governance-agent.ts    # AG2: structured CoT
│   │   │   │       ├── risk-agent.ts          # AG3: structured CoT, devil's advocate
│   │   │   │       ├── synthesis-agent.ts     # AG4: macro regime, conviction calibration
│   │   │   │       └── post-validation.ts     # Cross-check LLM output vs quant data
│   │   │   ├── macro/
│   │   │   │   ├── macro-loader.ts
│   │   │   │   └── regime-classifier.ts
│   │   │   ├── backtest/
│   │   │   ├── pipeline/
│   │   │   ├── output/
│   │   │   └── storage/
│   │   └── package.json
│   └── dashboard/                      # @screener/dashboard (Next.js)
│       ├── src/app/
│       ├── src/components/
│       ├── src/lib/
│       └── package.json
├── principles/                         # Task 2 output
│   ├── investment-principles.md
│   ├── scoring-rubric.json
│   ├── red-flags.md
│   ├── investor-profiles.md
│   └── long-short-framework.md
├── scripts/
│   ├── run-pipeline.ts
│   └── validate-rubric.ts
├── reports/                            # Generated per-run reports
└── logs/                               # Pipeline execution logs
```

---

## 7. Scraper Design

### 7.1 HTTP-First Approach

Screener.in renders financial tables **server-side in HTML** (not via AJAX/JS). This means simple HTTP requests + Cheerio HTML parsing works for all data extraction. No headless browser needed.

### 7.2 Anti-Blocking Strategy

**This is the #1 priority.** The user's IP must never get blocked from Screener.in.

| Layer | Measure | Detail |
|-------|---------|--------|
| **Headers** | Realistic browser fingerprint | Rotate 10+ Chrome User-Agents, include Accept/Accept-Language/Referer headers |
| **Timing** | Random delays | Normal-distribution 2-8s between requests (not uniform) |
| **Batching** | Batch breaks | Every 50 companies, pause 3-8 minutes |
| **Sessions** | Session breaks | Every 300 requests, pause 5-15 minutes |
| **Order** | Randomized | Fisher-Yates shuffle of company list (never alphabetical) |
| **Detection** | Active monitoring | Detect 403/429/captcha responses immediately |
| **Response** | Exponential backoff | 429 -> wait 5/15/30 min. 403 -> stop, wait 1 hour |
| **Fallback** | Playwright | Only if 10+ consecutive HTTP failures |
| **Ethics** | Respect robots.txt | Individual company pages are allowed. Avoid paginated listing endpoints. |

### 7.3 Company List Acquisition

Use Screener.in's search API (`/api/company/search/?q=X`) queried with each letter a-z and digits 0-9 (36 lightweight API calls). Deduplicate by company ID. This avoids the robots.txt-disallowed paginated listing pages.

### 7.4 Data Extracted Per Company

From `https://www.screener.in/company/{CODE}/consolidated/`:

| Section | HTML Anchor | Data |
|---------|-------------|------|
| Header | Top of page | Name, BSE/NSE codes, price, market cap, sector |
| Key Ratios | Top section | P/E, P/B, ROCE, ROE, dividend yield, 52w high/low, face value |
| Pros/Cons | Below ratios | Machine-generated text arrays |
| Quarterly Results | `#quarters` | Last 8-12 quarters: revenue, expenses, OPM%, net profit, EPS |
| Profit & Loss | `#profit-loss` | 10-12 years annual: revenue, expenses, OPM%, net profit, EPS |
| Balance Sheet | `#balance-sheet` | 10-12 years: assets, liabilities, equity, borrowings |
| Cash Flow | `#cash-flow` | 10-12 years: operations, investing, financing, net cash flow |
| Ratios | `#ratios` | 10-12 years: ROCE, ROE, D/E, current ratio |
| Shareholding | `#shareholding` | Quarterly: promoter%, FII%, DII%, public%, pledge% |
| Peer Comparison | `#peers` | Sector peers with key metrics |

### 7.5 Scrape Time Budget

| Parameter | Value |
|-----------|-------|
| Companies | ~5,300 |
| Requests per company | 1 |
| Avg delay per request | ~5s |
| Batch size / break | 50 companies / 5.5 min avg |
| Session size / break | 300 requests / 10 min avg |
| **Estimated total** | **~18-24 hours** |

**Optimization**: Scrape only liquid companies (market cap > 500 Cr, ~2,000) weekly. Scrape the remainder monthly. This reduces weekly time to ~8-10 hours.

---

## 8. Analysis Engine

### 8.1 Layer 1: Quantitative Scoring (Deterministic, <5 min)

Reads `principles/scoring-rubric.json` and scores every company across 5 dimensions:

| Dimension | Weight | Key Metrics |
|-----------|--------|-------------|
| **Valuation** | 25% | P/E, P/B, PEG, EV/EBITDA |
| **Quality** | 30% | ROE 5Y avg, ROCE 5Y avg, D/E, current ratio, interest coverage, FCF, profit CAGR, revenue CAGR |
| **Governance** | 20% | Promoter holding %, pledge %, institutional holding %, auditor changes |
| **Safety** | 15% | Market cap, avg daily volume, free float % |
| **Momentum** | 10% | ROE trend, debt trend, margin trend, promoter holding trend |

Each metric scored 0-100 with **sector-specific thresholds** (e.g., IT P/E of 30 is normal, Banking P/E of 30 is expensive).

**6 Automatic Disqualifiers** (instant "strong_avoid"):
1. Promoter pledge > 50%
2. Negative net worth
3. Listed in ASM/GSM (SEBI surveillance)
4. Qualified audit opinion
5. Negative operating cash flow 3+ consecutive years
6. Debt-to-equity > 3

**Classification thresholds:**
- Strong Long: composite >= 80, no red flags
- Potential Long: composite >= 65, no disqualifiers
- Neutral: 40-65
- Potential Short: 20-40
- Strong Avoid: <20 or disqualified

#### 8.1.1 Planned Scoring Model Additions

The following quantitative models will be added to Layer 1, ordered by expected impact on identifying undervalued stocks:

| Model | Priority | What It Adds |
|-------|----------|-------------|
| **DCF Intrinsic Value** | P1 | 10-year DCF using owner earnings (net profit + depreciation − capex), 3-tier discount rates (12/15/18%), terminal growth 3-4%. Outputs intrinsic value + margin of safety %. Replaces simplistic P/E-only valuation. |
| **Reverse DCF** | P2 | Given current market price, solve for implied growth rate. If market implies >25% growth for a stalwart, it's overpriced regardless of other metrics. |
| **Piotroski F-Score** | P3 | 9-point binary quality score (profitability 4pts, leverage/liquidity 3pts, efficiency 2pts). Academic research shows +7.5% annual alpha. All input data already available in flattenV2. |
| **Earnings Yield + FCF Yield** | P4 | EBIT/EV (earnings yield) and FCF/EV (FCF yield) — superior to P/E for cross-sector comparison. Accounts for capital structure differences. |
| **Price Momentum** | P5 | 6-month and 12-month price returns from `price_history` table. Combined with value metrics for "trending value" strategy (value + momentum outperforms either alone in academic literature). |
| **Quarterly Acceleration** | P6 | QoQ revenue and profit growth acceleration (is growth speeding up or slowing?). Leading indicator — catches turnarounds and deterioration 1-2 quarters before annual data shows it. |
| **Greenblatt Magic Formula** | P7 | Rank all companies by earnings yield (EBIT/EV) + ROIC. Combined rank identifies cheap + quality stocks. Simple but powerful — 30% CAGR in Greenblatt's original study. |
| **Altman Z-Score** | P10 | Bankruptcy prediction model (5 financial ratios). Z < 1.8 = distress zone → auto-disqualifier candidate. Adds to safety dimension. |

**Additional metrics for flattenV2 enrichment:**
- **Beneish M-Score**: Earnings manipulation detection — flags companies likely inflating earnings via accruals.
- **ROIC** (Return on Invested Capital): More accurate than ROE for companies with significant debt. Key input for Magic Formula and Buffett evaluator.

### 8.2 Layer 2: LLM Qualitative Analysis (~1-20 min depending on provider)

Multi-agent architecture with tiered execution. Supports two LLM providers:
- **Anthropic Claude** (`LLM_PROVIDER=anthropic`): Haiku for AG1-3, Sonnet for AG4. Prompt caching (5-min TTL).
- **Local Qwen 3.5** (`LLM_PROVIDER=local`): Same model (qwen3.5-35b-a3b) for all 4 agents via SGLang/vLLM on `LOCAL_LLM_URL`. Thinking mode disabled via `chat_template_kwargs`.

**4-Agent Design:**

| Agent | Role | Max Tokens | Key Features |
|-------|------|-----------|--------------|
| AG1 Fundamentals | Financial strength, trends, valuation | 4,096 | Structured CoT (5-step), peer comparison data when available |
| AG2 Governance | Promoter behavior, institutional confidence | 4,096 | Structured CoT (4-step), shareholding trend analysis |
| AG3 Risk | Downside scenarios, Pabrai risk hierarchy | 4,096 | Structured CoT (5-step), devil's advocate mandate (min 2 risks), risk parser pads to 2 if model under-delivers |
| AG4 Synthesis | Combines AG1-3 into final thesis | 4,096 | Structured CoT (5-step), macro regime context, peer comparison, unambiguous conviction calibration (7 gates) |

AG1→AG2→AG3→AG4 run sequentially per company (AG4 depends on AG1-3 outputs). Different companies can run in parallel.

**Tiered Execution:**

| Tier | Companies | Agents | Rationale |
|------|-----------|--------|-----------|
| Tier 1 | Top + bottom 100 by composite | All 4 (AG1→AG4) | Full analysis for actionable candidates |
| Tier 2 | Top 500 (minus Tier 1) | AG1 only | Quick fundamentals check for watchlist |
| Tier 3 | Remaining ~4,800 | None | Layer 1 score stands alone |

**Prompt Caching (Anthropic only):** All agents use `cacheSystemPrompt: true` (ephemeral cache, 5-min TTL). System prompts cached after first company, reducing input costs ~90% within TTL.

**Data Context Fed to Agents:**

| Data | Fed to | Source |
|------|--------|--------|
| Framework scores (Buffett/Graham/Lynch/Pabrai) | AG1, AG3, AG4 | Layer 1 framework evaluators |
| 13-year time series (ROE, revenue, OCF, etc.) | AG1, AG3 | flattenV2 enrichment |
| Shareholding history (12 quarters) | AG2 | flattenV2 enrichment |
| Peer comparison table (top 5 peers) | AG1, AG4 | Scraped from Screener.in (when available) |
| Macro regime (goldilocks/reflation/stagflation/deflation) | AG4 | `macro_snapshots` table + regime classifier |
| AG1-3 raw outputs | AG4 | Previous agent responses |

**Post-LLM Validation (`post-validation.ts`):**

After parsing each agent's output, cross-checks LLM claims against quantitative data:

| Rule | Agent | Override |
|------|-------|----------|
| "improving" trend but revenue declined 2+ of 3 years | AG1 | Override to "deteriorating" |
| "high" earnings quality but OCF < 50% of net profit | AG1 | Override to "medium" |
| Positive adjustment > 3 but company disqualified | AG1 | Cap at 0 |
| "high" conviction but company disqualified | AG4 | Override to "none" |
| "high" conviction but signals "conflicting" | AG4 | Override to "medium" |
| Adjustment > 10 but composite < 40 | AG4 | Cap at 5 |

All overrides logged as warnings for transparency.

**Conviction Calibration (AG4):**

HIGH conviction requires ALL of:
1. Buffett score >= 75
2. Graham >= 70 OR Lynch category score >= 70
3. Pabrai overall risk is "low" or "moderate"
4. AG2 governance is "strong" or "adequate"
5. AG3 overall risk is "low" or "moderate"
6. Company is NOT disqualified
7. Strengths align with Lynch category expectations

MEDIUM = at least 4 of 7 met, no severe failures. LOW = some positive signals. NONE = disqualified or multiple severe failures.

"Conviction" (how strongly to act) is explicitly distinguished from "confidence" (analysis certainty).

**Parse Failure Handling:**

Three separate counters tracked: `completed` (successful parse), `failed` (exceptions), `parseFailures` (LLM returned but couldn't parse). Only successful parses increment `completed`. Parse failures logged with company name for diagnosis.

**Cost Projection (weekly, 5,300 companies, Anthropic):**

| Tier | Companies | Cost/company | Subtotal |
|------|-----------|-------------|----------|
| Tier 1 (full 4-agent) | ~200 | ~$0.35 | ~$70 |
| Tier 2 (AG1 only) | ~300 | ~$0.05 | ~$15 |
| Tier 3 (no LLM) | ~4,800 | $0 | $0 |
| **Total** | **~5,300** | | **~$85/week** |

With local Qwen: $0/week (self-hosted on homelab GPU).

**Guardrails:**
- Max adjustment: +/-10 (Tier 2), +/-15 (Tier 1 via AG4 synthesis)
- Cannot override automatic disqualifiers
- Low/none conviction -> adjustment halved
- Post-validation cross-checks override contradictory LLM claims
- LLM failure -> Layer 1 score stands alone
- 3 retries per company, then skip

#### 8.2.1 Planned LLM Pipeline Enhancements

| Enhancement | Priority | Description |
|-------------|----------|-------------|
| **Expand LLM to all companies** | P8 | Run AG1 (fundamentals only) on ALL ~5,300 companies, not just Tier 1+2 (~700). With local Qwen at $0 cost and parallelization, full coverage is feasible in ~4-6 hours. Tier system still applies for AG2-4 depth. |
| **Pre-parse AG1-3 for AG4** | P9 | Currently AG4 receives raw JSON strings from AG1-3. Parse these into structured summaries so AG4 gets clean, consistent input. Reduces AG4 input tokens ~30% and improves synthesis quality. |
| **LLM retry on parse failure** | P11 | When JSON parsing fails, retry the specific agent call (up to 2 retries) with a "your previous output was invalid JSON" nudge in the prompt. Currently parse failures silently skip the company. |
| **News sentiment integration** | P12 | Feed recent news headlines/sentiment into AG4 synthesis. Source: free RSS feeds or Google News API. Adds temporal context the LLM currently lacks. Lowest priority — requires a new data source. |

### 8.3 Weekly Comparison

For each company present in both current and previous runs:
- Score delta
- Classification change (e.g., "neutral -> potential_long")
- Biggest movers (sorted by absolute score delta)
- New companies (not in previous run)
- Missing companies (delisted?)

### 8.4 Pipeline Resilience: Error Handling, Testing & Logging

A March 2026 audit of all 68 source files across 4 packages identified systemic gaps in error handling, test coverage, and observability. This section documents current state and planned improvements.

#### 8.4.1 Error Handling — Current State

**Strengths:**
- Scraper retry logic is well-structured: `retry.ts` discriminates `CaptchaError` vs `BlockedError` (429 vs 403) with per-type backoff strategies
- Consecutive failure tracking halts scrape before wasting time on a blocked IP
- LLM gracefully degrades: macro regime failure doesn't crash analysis, per-company LLM failure doesn't kill the batch
- Agent output parsers use defensive fallbacks (invalid enum values → safe defaults)

**Gaps (ranked by severity):**

| # | Issue | Severity | Location | Impact |
|---|-------|----------|----------|--------|
| 1 | No `process.on('unhandledRejection')` | High | Both CLI entry points | Escaped promise rejections crash silently — no log, no cleanup, no exit code |
| 2 | DB queries unwrapped | High | `engine.ts`, `analysis-run.ts`, `walk-forward.ts` | Any DB hiccup (connection timeout, lock) kills entire pipeline with raw Drizzle stack trace |
| 3 | No LLM retry logic | High | `anthropic-client.ts`, `openai-compatible-client.ts` | Transient API failures (502, timeout, rate limit) kill that company's analysis — no retry at transport level |
| 4 | Silent catch in company list fetch | Medium | `fetch-company-list.ts:76` | Bare `catch {}` swallows failed search queries — incomplete company lists, zero logging |
| 5 | Parse errors swallowed | Medium | All 4 agent parsers | `catch { return null }` without logging the actual error. Only counter increments. Debugging parse failures requires reproducing the exact input |
| 6 | Config file loading unprotected | Medium | `rubric-loader.ts` | Missing or malformed JSON → raw `SyntaxError`, no context about which file failed |
| 7 | No custom error hierarchy | Low | Everywhere except scraper | Only `BlockedError` and `CaptchaError` exist. Everything else is `new Error(string)`. No programmatic error discrimination possible |
| 8 | Error type erasure in `.catch()` | Low | All CLI entry points | `(err as Error).message` — if thrown value isn't an `Error`, silently produces `undefined` |

**Planned error hierarchy:**
```
PipelineError (base)
├── ScraperError
│   ├── BlockedError (existing)
│   └── CaptchaError (existing)
├── AnalysisError
│   ├── ScoringError
│   └── EnrichmentError
├── LLMError
│   ├── LLMTimeoutError
│   ├── LLMRateLimitError
│   └── LLMParseError
└── ConfigError
```

#### 8.4.2 Testing — Current State

**There are no automated tests.** Zero test files, zero test runner, zero test dependencies, zero CI quality gates.

| Metric | Value |
|--------|-------|
| Test files (`.test.ts` / `.spec.ts`) | 0 |
| Test runner configured | None |
| Test dependencies installed | None |
| CI test gate | None — every push deploys directly to production |
| Code coverage | 0% across ~6,950 lines |

12 manual `scripts/test-*.ts` files exist (e.g., `test-adani-power.ts`, `test-pipeline-10.ts`) — no assertions, no runner, just "run and eyeball the output."

**Highest-risk untested code (by investment-decision impact):**

| Area | Files | Risk |
|------|-------|------|
| Disqualifier logic | `disqualifier.ts` | A single bug means recommending a company that should be auto-avoided (promoter pledge >50%, negative net worth). Hard stop filters for investment decisions. |
| Scoring engine | `engine.ts`, `metric-scorer.ts`, `dimension-scorer.ts` | Determines every company's classification. Off-by-one in threshold check → wrong category for thousands of companies. |
| Framework evaluators | `buffett.ts`, `graham.ts`, `lynch.ts`, `pabrai.ts` | Lynch classifier determines composite weights. Misclassification cascades through entire scoring. |
| HTML parsers | `parse-ratios.ts`, `parse-header.ts`, `parse-table.ts` | `parseIndianNumber("19,10,048")` → 1910048. Regex-based, no edge case tests. HTML structure changes break extraction silently. |
| Post-validation | `post-validation.ts` | 6 rules cross-checking LLM claims vs quant data. Incorrect override flips valid "improving" → "deteriorating." |
| Trend math | `trend-analyzer.ts` | CAGR, slope, consistency calculations feed every framework. Off-by-one in `years` → wrong growth rates everywhere. |
| flattenV2 | `flatten-v2.ts` | 60+ derived metrics from 13-year JSONB. Null handling, series alignment, averages — all untested. |

**Planned test framework:** Vitest (fast, ESM-native, TypeScript-first, no config overhead).

**Planned test infrastructure:**
- HTML fixtures: real Screener.in page snapshots for parser regression tests
- Mock factories: `CompanyFactory`, `SnapshotFactory`, `AnalysisFactory` for generating typed test data
- Mock clients: `MockHttpClient` (scraper), `MockLLMClient` (agents) — no network in tests
- Snapshot tests: given known JSONB input → expected flattenV2 output (60+ metrics)

#### 8.4.3 Logging — Current State

**Logger:** Custom 4-level console wrapper (`debug`/`info`/`warn`/`error`) in `packages/shared/src/utils/logger.ts`. Configurable via `LOG_LEVEL` env var. Supports optional structured `data` parameter.

| Dimension | Rating | Notes |
|-----------|--------|-------|
| Level consistency | Good | `info`/`warn`/`error` used correctly in business logic |
| Structured data | Poor | Logger supports `data?: Record<string, unknown>` but it's **never used**. All logs are string interpolation. |
| Console bypass | Poor | 107 `console.log` calls vs 98 `logger.*` calls. CLI entry points bypass the logger entirely — no timestamps, no level filtering. |
| Trace/correlation | Fair | Run IDs logged at start, but no correlation ID threaded through a company's full journey (scrape → score → LLM → save). |
| Debug coverage | Poor | Only 5 `logger.debug()` calls across 68 files. Scoring decisions, LLM prompts, framework evaluations — all invisible. |
| Performance timing | Fair | Pipeline total time logged, but no per-company scrape duration, no per-agent LLM latency breakdown. |
| Sensitive data | Good | No API keys or DB credentials leaked. |
| Log volume | Good | Progress batched every 50 companies, not per-request. |
| Destinations | Stdout only | Appropriate for K8s; local runs lose logs on restart. |

**Planned improvements:**
- Migrate CLI `console.log` to logger (or separate `ui.print()` for user-facing output that skips log level filtering)
- Add structured fields to key operations: `logger.info('company scored', { company, composite, classification, tier })`
- Pipeline-scoped correlation ID (UUID at pipeline start, threaded through all function calls)
- Per-agent LLM timing: `logger.info('agent complete', { agent: 'AG1', company, durationMs, inputTokens, outputTokens })`
- Expand debug-level logging in scoring, framework, and enrichment paths

---

## 9. Dashboard Requirements

### 9.1 Design Language
- Bloomberg-terminal aesthetic: dark background (#0a0a0f), data-dense
- Color coding: green (#00ff88) for longs, red (#ff4444) for shorts, blue (#4488ff) for neutral
- Monospace numbers for financial data
- Responsive (works on mobile for quick checks)

### 9.2 Pages

**1. Home Dashboard**
- Summary cards: total analyzed, distribution across classifications
- Top 10 long candidates (card view with key metrics + score)
- Top 10 short/avoid candidates
- Sector heatmap (avg score per sector, color-coded)
- Notable changes this week (promotions/demotions)

**2. Rankings**
- Full sortable/filterable table (TanStack Table with virtual scrolling)
- Filter by: classification, sector, market cap range, score range
- Sort by: rank, score, any metric
- Search by company name or code
- Export to CSV

**3. Company Detail (`/company/[code]`)**
- Score breakdown radar chart (5 dimensions)
- Historical score line chart (over weeks)
- Per-metric scoring table with assessments
- LLM analysis narrative
- Key financial metrics
- Link to Screener.in for verification

**4. Principles Reference**
- Rendered `investment-principles.md`
- Scoring rubric visualization
- Red flags checklist

**5. Pipeline Status**
- Last scrape: timestamp, success rate, duration
- Last analysis: timestamp, summary stats
- System health: DB connection, API status

---

## 10. Milestones & Acceptance Criteria

### M1: Infrastructure Ready ✓
- [x] Git repo initialized
- [x] `npm install` + `npm run typecheck` pass
- [x] PostgreSQL running, migrations applied
- [x] Can insert/query company rows

### M2: Scraper Functional ✓
- [x] Company list fetched (~5,300 companies via search API + 2-letter combos)
- [x] Companies scraped successfully with HTTP + Cheerio
- [x] Data stored correctly in company_snapshots (JSONB)
- [x] Rate limiter enforces delays (normal-distribution 2-8s)
- [x] Resume works after interruption
- [x] No IP blocking during test runs

### M3: Principles Documented ✓
- [x] scoring-rubric.json validates against TypeScript schema
- [x] 5 dimensions with 21 metrics defined
- [x] 20+ red flags documented with detection methods
- [x] Sector-specific adjustments for IT, Banking, Pharma, Manufacturing, FMCG
- [x] 4 framework configs: Buffett, Graham, Lynch, Pabrai

### M4: Analyzer Functional ✓
- [x] Layer 1 scores all companies in <5 min
- [x] 8 disqualifiers correctly flag companies
- [x] Classification distribution is reasonable
- [x] Layer 2 LLM runs with 4-agent architecture (Anthropic Claude)
- [x] 4 framework evaluators with classification-aware composite scoring
- [x] Weekly comparison detects changes
- [x] Markdown reports generated

### M5: Dashboard Live ✓
- [x] Runs at localhost:3000 and screener.nikamma.in
- [x] 6 pages functional: home, conviction, frameworks, rankings, backtest, company detail
- [x] Rankings table sorts/filters/exports
- [x] Lynch category badges, conviction indicators, framework score panels
- [x] Dark mode Bloomberg aesthetic

### M6: Full Pipeline ✓
- [x] `scripts/run-pipeline.ts` runs end-to-end unattended
- [x] Dashboard reflects latest data after pipeline run
- [x] Cron schedule configured for weekly execution (K8s CronJob)

### M7: Homelab Deployment ✓
- [x] Dockerized with multi-stage build (3 entrypoint modes: dashboard, pipeline, migrate)
- [x] GitHub Actions CI/CD → GHCR container image → ArgoCD rollout
- [x] K3s cluster deployment at `screener.nikamma.in` (internal only)
- [x] CNPG-managed PostgreSQL database
- [x] SealedSecrets for DATABASE_URL + ANTHROPIC_API_KEY
- [x] Weekly CronJob for pipeline execution

### M8: Pipeline Optimizations
- [ ] Don't retry permanent HTTP errors (4xx except 429) — saves ~4 min per 404
- [ ] Parallelize LLM company analysis with p-map (concurrency=5) — ~18 min → ~4 min
- [ ] Per-company LLM progress logging (replace modulo-gated logging)
- [ ] DB connectivity check in `/api/healthz` endpoint (return 503 if DB unreachable)
- [ ] Auto-seed companies table if empty (run search API before scrape step)

### M9: Production Readiness
- [ ] Full 5,300-company pipeline run on homelab
- [ ] LLM cost monitoring and alerting
- [ ] Evaluate Haiku for AG4 synthesis (potential ~$45/week savings)
- [ ] Tune Tier 1 count (top+bottom 50 vs 100)
- [ ] Summarize AG1-3 outputs before AG4 (reduce Sonnet input tokens by 20-30%)

### M10: Scoring Model Upgrades
- [ ] DCF intrinsic value calculator (owner earnings, 3-tier discount rates, margin of safety %)
- [ ] Reverse DCF (implied growth rate from current price)
- [ ] Piotroski F-Score (9-point quality score from existing flattenV2 data)
- [ ] Earnings yield (EBIT/EV) and FCF yield (FCF/EV) metrics
- [ ] Price momentum (6m/12m returns from price_history)
- [ ] Quarterly acceleration (QoQ revenue/profit growth rate of change)
- [ ] Greenblatt Magic Formula (combined earnings yield + ROIC rank)
- [ ] Altman Z-Score (bankruptcy prediction, <1.8 = new disqualifier)
- [ ] Beneish M-Score (earnings manipulation detection)
- [ ] ROIC metric in flattenV2 enrichment
- [ ] Banking sector separate scoring path (different metrics for financial companies)

### M11: LLM Pipeline v3
- [ ] Expand AG1 coverage to all ~5,300 companies (with parallelization)
- [ ] Pre-parse AG1-3 outputs into structured summaries for AG4
- [ ] LLM retry with error feedback on parse failure
- [ ] News sentiment data source + integration into AG4
- [ ] Backtesting: benchmark comparison (Nifty 50/500), factor attribution, position sizing simulation
- [ ] Composite weight optimization via backtesting feedback loop

### M12: Testing Foundation
- [ ] Vitest setup (config, scripts, CI integration)
- [ ] Test infrastructure: HTML fixtures, mock factories (Company/Snapshot/Analysis), MockHttpClient, MockLLMClient
- [ ] `trend-analyzer.ts` tests: CAGR, slope, consistency, YoY growth (boundary values, null series, negative bases)
- [ ] `parseIndianNumber` + parser tests: number formats, malformed input, real HTML fixtures for regression
- [ ] `disqualifier.ts` tests: all 8 disqualifiers, boundary values (exactly 50% pledge, D/E exactly 3.0), null handling
- [ ] `metric-scorer.ts` + `dimension-scorer.ts` tests: threshold boundaries, sector-specific adjustments
- [ ] Framework evaluator tests: Buffett weight sums, Graham boundary values, Lynch classification logic, Pabrai risk combinations
- [ ] `post-validation.ts` tests: all 6 override rules, null revenue series, edge cases
- [ ] `flatten-v2.ts` snapshot tests: known JSONB input → expected 60+ metric output
- [ ] LLM agent parser tests: valid JSON, malformed JSON, missing fields, fallback defaults
- [ ] Add `npm test` + `npm run typecheck` to GitHub Actions CI before deploy
- [ ] Integration test: seed DB → run Layer 1 → verify classification distribution is reasonable

### M13: Error Handling & Logging Hardening
- [ ] `process.on('unhandledRejection')` + `process.on('uncaughtException')` in both entry points
- [ ] Custom error hierarchy: `PipelineError` → `ScraperError`, `AnalysisError`, `LLMError`, `ConfigError`
- [ ] LLM transport-level retry wrapper (2 retries, exponential backoff, non-retryable error detection)
- [ ] Wrap critical DB queries in try/catch with contextual error messages
- [ ] Log actual parse errors in agent parsers before returning null
- [ ] Fix silent `catch {}` in `fetch-company-list.ts` — log failed queries at warn level
- [ ] Guard rubric/config file loading with try/catch and actionable error messages
- [ ] Type-safe error catching: `err instanceof Error ? err.message : String(err)` in all `.catch()` handlers
- [ ] Migrate CLI `console.log` to logger (or `ui.print()` for user-facing output)
- [ ] Structured logging fields in key operations (company, tier, composite, classification, durationMs)
- [ ] Pipeline-scoped correlation ID (UUID at pipeline start, threaded through calls)
- [ ] Per-agent LLM timing logs (agent name, company, duration, token counts)
- [ ] Expand `logger.debug()` coverage in scoring, framework evaluation, and enrichment paths

---

## 11. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| IP blocked by Screener.in | Critical | Ultra-conservative rate limiting, realistic headers, random order. Playwright fallback. Never scrape during market hours. |
| Zero test coverage | Critical | 0% coverage across ~6,950 lines. Scoring bugs directly affect investment recommendations. Mitigation: M12 testing foundation — prioritize disqualifier, scorer, and parser tests. |
| Screener.in HTML structure changes | High | Modular parsers per section. Validation warns on missing fields. Quick fix = update one parser. HTML fixture tests (M12) will catch regressions. |
| No CI quality gates | High | Every push deploys to production without tests or type checking. Mitigation: add `npm test` + `npm run typecheck` to GitHub Actions (M12). |
| Unhandled promise rejections | High | Escaped async errors crash process silently with no log output. Mitigation: process-level handlers in M13. |
| DB query failures | High | Unwrapped Drizzle queries crash pipeline with raw stack traces. Mitigation: contextual try/catch wrappers in M13. |
| LLM hallucination | Medium | LLM is advisory only (+/-10 points max). Quantitative Layer 1 is primary. Low confidence = halved adjustment. |
| LLM transient failures not retried | Medium | API 502s, timeouts, rate limits kill company analysis immediately. Mitigation: transport-level retry wrapper in M13. |
| Scrape takes too long | Medium | Scrape only liquid stocks weekly (~2,000). Monthly full scrape. Resume support handles interruptions. |
| Silent error swallowing | Medium | Bare `catch {}` in company list fetch + agent parsers returning null without logging. Mitigation: fix in M13. |
| Data staleness | Low | Screener.in data itself has filing latency. Weekly scrape is adequate for medium-term analysis. |
| PostgreSQL disk usage | Low | ~5,300 rows/week x 100+ JSONB fields. ~50-100 MB/week. Manageable for years. |

---

## 12. Environment Setup

### Prerequisites
```bash
# Node.js v25+ (already installed)
node --version  # v25.3.0

# PostgreSQL
brew install postgresql@17
brew services start postgresql@17
createdb screener

# Python (for price history fetcher)
pip install yfinance pandas
```

### Environment Variables
```bash
# .env
DATABASE_URL=postgres://localhost:5432/screener
ANTHROPIC_API_KEY=sk-ant-...          # Required when LLM_PROVIDER=anthropic
SCREENER_BASE_URL=https://www.screener.in

# LLM Provider (choose one)
LLM_PROVIDER=anthropic                # "anthropic" (default) or "local"
LOCAL_LLM_URL=http://192.168.0.42:8000  # Base URL for local model (SGLang/vLLM)
LOCAL_LLM_MODEL=qwen3.5-35b-a3b        # Model name for local endpoint
LOCAL_LLM_TEMPERATURE=0.7              # Temperature for local model
```

### Docker Build (for homelab deployment)
```bash
# Build the container image
docker build -t screener-automation .

# Run modes (set via CMD or entrypoint argument):
docker run screener-automation dashboard   # Next.js server on :3000
docker run screener-automation pipeline    # Scraper + analyzer
docker run screener-automation migrate     # Run drizzle-kit migrations
```

---

## 13. Homelab Deployment

The application is deployed to a K3s cluster and accessible at `screener.nikamma.in` (internal network only).

### Architecture
```
GitHub push → GitHub Actions CI → Docker build (amd64) → Push to GHCR
                                                            ↓
                                              ArgoCD detects new image
                                                            ↓
                                              K3s rollout restart
```

### Components
| Component | Detail |
|-----------|--------|
| **Container registry** | `ghcr.io/dewanggogte/screener-automation:latest` (public) |
| **K8s namespace** | `screener-automation` (ArgoCD auto-creates) |
| **Database** | CNPG-managed PostgreSQL, `screener` DB on `postgres-rw.postgres.svc.cluster.local:5432` |
| **Secrets** | `screener-secrets` SealedSecret (DATABASE_URL + ANTHROPIC_API_KEY) |
| **Ingress** | Internal-only at `screener.nikamma.in` |
| **Pipeline schedule** | Weekly CronJob |
| **Health probe** | `/api/healthz` (readiness + liveness) |

### Manifest locations
- **K8s manifests**: `/Users/dg/Documents/lab/nikamma/apps/screener-automation/`
- **ArgoCD app**: `/Users/dg/Documents/lab/nikamma/argocd/apps/screener-automation.yaml`

### First-run note
The pipeline requires companies in the DB to scrape. On a fresh deploy, the `list` command must run first to seed the companies table (~5 min via search API). See M8 for auto-seed improvement.

---

## 14. Next Steps: Pipeline Improvements

Based on the first homelab pipeline run (20 companies, ~23 min), these improvements are prioritized by impact.

### 14.1 Don't Retry Permanent HTTP Errors (Quick Win)

**Problem:** The retry logic retries ALL non-blocked errors 3x with exponential backoff (30s/60s/120s). A 404 is permanent — retrying wastes ~3.5 minutes per company.

**Fix:** After BlockedError checks, bail out immediately on 4xx status codes (except 429 rate limit). 404, 401, 410 fail immediately. 429 and 5xx still retry.

**Impact:** Saves ~4 minutes per company with a bad URL. No downside — permanent errors don't become temporary by waiting.

### 14.2 Parallelize LLM Company Analysis (Big Win)

**Problem:** Companies are analyzed sequentially. Each Tier 1 company = 4 sequential API calls (~57 sec). 19 companies = ~18 min of serial execution.

**Fix:** Use `p-map` (concurrency=5) to process multiple companies simultaneously. The AG1→AG4 chain stays sequential per company (AG4 depends on AG1-3), but different companies are independent.

**Impact:** ~18 min → ~4-5 min for LLM phase. Haiku rate limit is generous (50+ RPM). At concurrency 5 with 4 calls/company, peak is ~20 RPM — well within limits. Anthropic SDK auto-retries if rate limited.

**Dependency:** `p-map` (~8KB, 300M+ weekly downloads, actively maintained, pure ESM).

### 14.3 Per-Company LLM Progress Logging (Observability)

**Problem:** Current logging uses `completed % 50 === 0` (Tier 2) and `completed % 10 === 0` (Tier 1). For 19 companies, you get exactly one progress line then silence until done.

**Fix:** Log before each company starts and after completion with company code and tier. With parallelization, lines interleave — the company code identifies each line.

### 14.4 DB Connectivity in Health Endpoint (Reliability)

**Problem:** `/api/healthz` returns `{ status: "ok" }` unconditionally. If the DB goes down, K8s thinks the pod is healthy and keeps routing traffic to it.

**Fix:** Run `SELECT 1` against the DB. Return 503 on failure so K8s readiness probe pulls the pod from service, and liveness probe eventually restarts it.

### 14.5 Auto-Seed Companies if Table Empty (Correctness)

**Problem:** The weekly CronJob runs the pipeline, but if the companies table is empty (fresh deploy, DB wipe), it silently produces 0 results. The `list` command is a separate manual step.

**Fix:** Before the scrape step, check if companies table has 0 rows. If empty, run `fetchCompanyList({ searchOnly: true })` automatically (~5 min, ~4,000 companies via search API). Only triggers once on a fresh DB.

### 14.6 Token Cost Optimization (Future)

| Idea | Potential savings | Trade-off |
|------|-------------------|-----------|
| Evaluate Haiku for AG4 synthesis | ~$45/week (65% of LLM cost) | May reduce synthesis quality — needs benchmarking |
| Reduce Tier 1 to top+bottom 50 | ~$35/week | Fewer companies get full analysis |
| Summarize AG1-3 outputs before AG4 | ~$10-15/week | Adds complexity, may lose nuance |

### 14.7 Scoring Model Additions (M10)

Add 8 new quantitative scoring models to Layer 1 (see §8.1.1 for full details). Highest impact items: DCF intrinsic value replaces P/E-only valuation, Piotroski F-Score adds academic-backed quality signal, Magic Formula combines cheapness + quality in a single rank. All models use data already available in flattenV2 or price_history — no new scraping required (except ROIC which needs a flattenV2 enrichment addition).

### 14.8 LLM Pipeline v3 (M11)

Expand AG1 coverage to all ~5,300 companies (feasible at $0 with local Qwen), pre-parse AG1-3 outputs into structured summaries before feeding to AG4 (reduces tokens ~30%), add retry-with-feedback on JSON parse failures, and integrate news sentiment as a new data source for AG4 context. See §8.2.1 for details.

### 14.9 Backtesting Improvements

Current backtesting validates absolute returns. Next phase adds: benchmark comparison against Nifty 50/500 (alpha measurement), factor attribution (which scoring dimensions drive returns), and position sizing simulation (Kelly criterion or equal-weight comparison). These feed into composite weight optimization — use backtest results to tune dimension weights empirically rather than relying solely on first-principles reasoning.

### 14.10 Banking Sector Scoring

Banking/NBFC companies have fundamentally different financial structures (no "revenue" in the traditional sense, NIM instead of OPM, NPA instead of D/E). Current sector adjustments tweak thresholds but still use the same metrics. A separate scoring path for financials would use NIM, NPA, CASA ratio, CAR, and provision coverage as primary metrics — significantly improving signal quality for the ~800 listed financial companies.

### 14.11 Testing Foundation (M12) — Highest Priority

The codebase has **zero automated tests** (0% coverage across ~6,950 lines). Every deploy goes to production unvalidated. This is the single highest-ROI improvement.

**Phase 1 — Framework + Critical Path** (highest impact):
- Set up Vitest with ESM/TypeScript config. Add `npm test` script to root and all packages.
- Test the money path first: `disqualifier.ts` (8 disqualifiers, boundary values), `metric-scorer.ts` (threshold edges), `parseIndianNumber` (Indian number formats, malformed input), `cagr()` / `consistencyCount()` (math correctness).
- HTML parser regression tests using real Screener.in page fixtures.
- Add `npm test` + `npm run typecheck` to GitHub Actions CI before the Docker build step.

**Phase 2 — Expand Coverage**:
- Framework evaluators: Buffett weight validation, Graham boundaries, Lynch classification logic, Pabrai risk combinations.
- Post-validation rule tests (all 6 override rules).
- LLM agent parser tests with mock responses (valid JSON, malformed, missing fields).
- flattenV2 snapshot tests (known JSONB → expected 60+ metrics).

**Phase 3 — Integration**:
- Integration test: seed DB → run Layer 1 → verify classification distribution.
- Pipeline smoke test: mock HTTP + mock LLM → full pipeline completes without error.

### 14.12 Error Handling Hardening (M13)

**Process-level resilience:**
- Add `process.on('unhandledRejection')` and `process.on('uncaughtException')` to both CLI entry points (`scraper/src/index.ts`, `analyzer/src/index.ts`). Log the error, exit with code 1.
- Custom error hierarchy: `PipelineError` base class with `ScraperError`, `AnalysisError`, `LLMError`, `ConfigError` subclasses. Enables programmatic error discrimination (retry LLMTimeoutError but not LLMParseError).

**Transport-level LLM retry:**
- Wrap LLM API calls with retry logic (2 retries, exponential backoff). Retry on 429/502/503/timeout. Don't retry on 400/401/parse failures.
- Separate from the existing "retry on parse failure" item in M11 — this is transport-level, that is application-level.

**DB and I/O hardening:**
- Wrap critical DB queries (`engine.ts`, `analysis-run.ts`, `walk-forward.ts`) in try/catch with contextual messages ("Failed to load scrape run #5: connection refused").
- Guard rubric/config file loading with try/catch and actionable messages ("scoring-rubric.json not found at {path}").
- Fix silent `catch {}` in `fetch-company-list.ts` — log failed search queries at warn level.
- Log actual parse errors in agent parsers before returning null (currently invisible).
- Type-safe catch: `err instanceof Error ? err.message : String(err)` in all `.catch()` handlers.

### 14.13 Logging & Observability Upgrades (M13)

**Structured logging:**
- Use the logger's existing `data` parameter (currently unused everywhere) for machine-parseable fields: `logger.info('company scored', { company: 'RELIANCE', composite: 78.5, classification: 'potential_long', tier: 1 })`.
- Migrate 107 `console.log` calls in CLI entry points to `logger.info` (or a separate `ui.print()` helper for user-facing output that bypasses level filtering).

**Correlation and tracing:**
- Generate a UUID correlation ID at pipeline start. Thread it through logger calls so a single company's journey (scrape → enrich → score → LLM → save) can be traced end-to-end.

**Performance visibility:**
- Per-agent LLM timing: `logger.info('agent complete', { agent: 'AG1', company: 'RELIANCE', durationMs: 1234, inputTokens: 2800, outputTokens: 450 })`.
- Per-company scrape duration (not just aggregate total).
- DB query timing for slow-query detection.

**Debug coverage:**
- Expand from 5 `logger.debug()` calls to meaningful coverage: scoring decisions, framework evaluation steps, LLM prompt construction, enrichment calculations. Invisible when `LOG_LEVEL=info`, invaluable when troubleshooting with `LOG_LEVEL=debug`.

---

*Last updated: 2026-03-02*
*Version: 2.3*
*Reference docs: docs/00-PROJECT-OVERVIEW.md, docs/01-TASK1-SCRAPER.md, docs/02-TASK2-PRINCIPLES.md, docs/03-TASK3-ANALYSIS.md*
