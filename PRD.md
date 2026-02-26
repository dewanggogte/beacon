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

### Non-Goals
- Real-time trading signals or intraday data
- Portfolio management or trade execution
- Serving multiple users (single-user tool)
- Mobile app (responsive web is sufficient)
- Backtesting engine (may add later)

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
| **LLM** | Anthropic Claude (Haiku 4.5 + Sonnet) | Multi-agent architecture with prompt caching. ~$5-7/run. |
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
| Ollama + Qwen 2.5 | Anthropic Claude API | Multi-agent LLM with 4 specialized agents. Prompt caching for efficiency. |
| Single LLM prompt | 4-agent architecture | AG1 (fundamentals), AG2 (governance), AG3 (risk), AG4 (synthesis). Tiered execution. |
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
│   │   │   ├── llm/
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

### 8.2 Layer 2: LLM Qualitative Analysis (Ollama + Qwen, 2-8 hours)

Run only on top 200 + bottom 200 companies by composite score.

**LLM output per company:**
- Trend narrative (2-3 sentences)
- Risk factors (array)
- Catalysts (array)
- Qualitative adjustment (-10 to +10 points)
- Confidence level (high/medium/low)
- Reasoning

**Guardrails:**
- Max adjustment: +/-10 points
- Cannot override automatic disqualifiers
- Low confidence -> adjustment halved
- LLM failure -> Layer 1 score stands alone
- 3 retries per company, then skip

### 8.3 Weekly Comparison

For each company present in both current and previous runs:
- Score delta
- Classification change (e.g., "neutral -> potential_long")
- Biggest movers (sorted by absolute score delta)
- New companies (not in previous run)
- Missing companies (delisted?)

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
- System health: DB connection, Ollama status

---

## 10. Milestones & Acceptance Criteria

### M1: Infrastructure Ready
- [ ] Git repo initialized
- [ ] `npm install` + `npm run typecheck` pass
- [ ] PostgreSQL running, migrations applied
- [ ] Can insert/query company rows

### M2: Scraper Functional
- [ ] Company list fetched (~5,300 companies)
- [ ] 10 companies scraped successfully (test mode)
- [ ] Data stored correctly in company_snapshots
- [ ] Rate limiter enforces delays
- [ ] Resume works after interruption
- [ ] No IP blocking during test runs

### M3: Principles Documented
- [ ] scoring-rubric.json validates against TypeScript schema
- [ ] 5 dimensions with 20+ metrics defined
- [ ] 20+ red flags documented with detection methods
- [ ] Sector-specific adjustments for IT, Banking, Pharma, Manufacturing, FMCG

### M4: Analyzer Functional
- [ ] Layer 1 scores all companies in <5 min
- [ ] Disqualifiers correctly flag companies
- [ ] Classification distribution is reasonable
- [ ] Layer 2 LLM runs on top/bottom 200
- [ ] Weekly comparison detects changes
- [ ] Markdown reports generated

### M5: Dashboard Live
- [ ] Runs at localhost:3000
- [ ] All 5 pages functional with real data
- [ ] Rankings table sorts/filters/exports
- [ ] Charts render correctly
- [ ] Dark mode Bloomberg aesthetic

### M6: Full Pipeline
- [ ] `scripts/run-pipeline.ts` runs end-to-end unattended
- [ ] Dashboard reflects latest data after pipeline run
- [ ] Cron schedule configured for weekly execution

---

## 11. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| IP blocked by Screener.in | Critical | Ultra-conservative rate limiting, realistic headers, random order. Playwright fallback. Never scrape during market hours. |
| Screener.in HTML structure changes | High | Modular parsers per section. Validation warns on missing fields. Quick fix = update one parser. |
| LLM hallucination | Medium | LLM is advisory only (+/-10 points max). Quantitative Layer 1 is primary. Low confidence = halved adjustment. |
| Scrape takes too long | Medium | Scrape only liquid stocks weekly (~2,000). Monthly full scrape. Resume support handles interruptions. |
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

# Ollama (for LLM analysis, Phase 5)
brew install ollama
ollama serve &
ollama pull qwen2.5:7b
```

### Environment Variables
```bash
# .env
DATABASE_URL=postgres://localhost:5432/screener
OLLAMA_URL=http://localhost:11434
SCREENER_BASE_URL=https://www.screener.in
```

---

*Last updated: 2026-02-25*
*Version: 1.0*
*Reference docs: docs/00-PROJECT-OVERVIEW.md, docs/01-TASK1-SCRAPER.md, docs/02-TASK2-PRINCIPLES.md, docs/03-TASK3-ANALYSIS.md*
