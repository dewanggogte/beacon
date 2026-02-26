# Screener Automation

Automated Indian stock market screening and analysis pipeline. Scrapes financial data for ~5,300 companies from Screener.in, scores them using four value investing frameworks (Buffett, Graham, Lynch, Pabrai), runs multi-agent LLM qualitative analysis, and displays results in a Bloomberg-terminal-style dashboard.

**This is a personal research and analysis tool. It is not financial advice.**

## Quick Start

### Prerequisites

- Node.js v25+
- PostgreSQL 17 (`brew install postgresql@17 && brew services start postgresql@17`)
- Python 3.10+ with `yfinance` and `psycopg2-binary` (for backtesting only)

### Setup

```bash
# Clone and install
git clone <repo> && cd screener-automation
npm install

# Create database
createdb screener

# Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL and ANTHROPIC_API_KEY

# Run database migrations
npm run db:migrate

# Build
npm run build
```

### Environment Variables

```bash
DATABASE_URL=postgres://localhost:5432/screener
ANTHROPIC_API_KEY=sk-ant-...   # Required for LLM analysis (Layer 2)
```

## Pipeline

The analysis pipeline runs in three stages:

```
Scrape (18-24h) → Analyze (5min quantitative + 2-4h LLM) → Dashboard
```

### Run Everything

```bash
npm run pipeline                  # Full: scrape + analyze + LLM + report
npm run pipeline:quick            # Full: scrape + analyze (no LLM)
npm run pipeline:analyze          # Analyze only (uses latest scrape)
```

### Individual Steps

```bash
# Scraper
npx tsx packages/scraper/src/index.ts scrape              # Full scrape (~5,300 companies)
npx tsx packages/scraper/src/index.ts scrape --limit=100   # Quick test
npx tsx packages/scraper/src/index.ts test RELIANCE        # Test single company

# Analyzer
npx tsx packages/analyzer/src/index.ts analyze             # Full analysis (Layer 1 + LLM)
npx tsx packages/analyzer/src/index.ts analyze --skip-llm  # Layer 1 only (fast)
npx tsx packages/analyzer/src/index.ts analyze --skip-report
npx tsx packages/analyzer/src/index.ts analyze --model=claude-sonnet-4-5

# Dashboard
npm run dashboard                 # Start at http://localhost:3000
```

### Backtesting

```bash
# 1. Fetch historical prices (one-time setup)
pip install yfinance psycopg2-binary
python scripts/fetch-prices.py --period 10y

# 2. Run backtest
npx tsx packages/analyzer/src/index.ts backtest --run=3 --eval-date=2025-06-01
npx tsx packages/analyzer/src/index.ts backtest --run=3 --eval-date=2025-06-01 --top=50

# 3. Walk-forward analysis
npx tsx packages/analyzer/src/index.ts walk-forward --from=2024-01-01 --to=2025-12-01
```

### Macro Overlay

```bash
# Add macro data point
npx tsx packages/analyzer/src/index.ts macro add \
  --date=2026-02-26 --repo=6.5 --cpi=4.5 --gdp=6.8 \
  --nifty-pe=22 --vix=14 --usd-inr=83.5 --bond=7.1

# Check current regime
npx tsx packages/analyzer/src/index.ts macro regime
```

## Project Structure

```
screener-automation/
├── packages/
│   ├── shared/          @screener/shared — DB schema, types, config, logger
│   ├── scraper/         @screener/scraper — Screener.in HTTP scraper
│   ├── analyzer/        @screener/analyzer — Scoring, frameworks, LLM, backtest
│   └── dashboard/       @screener/dashboard — Next.js 15 web UI
├── principles/          Scoring rubric + framework configs (JSON)
├── scripts/             Pipeline orchestrator, price fetcher
├── reports/             Generated weekly markdown reports
├── docs/                Original task specifications
└── PRD.md               Product requirements document
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed module design.
See [INFO_FLOW.md](INFO_FLOW.md) for data flow through the pipeline.
See [RUNNING.md](RUNNING.md) for step-by-step instructions for every scenario.

## Analysis Methodology

### Layer 1: Quantitative (Deterministic)

**21 metrics** across 5 dimensions score every company 0-100:

| Dimension | Weight | Focus |
|-----------|--------|-------|
| Valuation | 25% | P/E, P/B, PEG, EV/EBITDA |
| Quality | 30% | ROE, ROCE, profit CAGR, revenue CAGR, D/E |
| Governance | 20% | Promoter holding, pledge, institutional holding |
| Safety | 15% | Market cap, volume, free float |
| Momentum | 10% | ROE trend, debt trend, margin trend |

**8 automatic disqualifiers** (instant "strong_avoid"):
Promoter pledge >50%, negative net worth, ASM/GSM, qualified audit, negative OCF 3yr, D/E >3, net losses 3/5yr, promoter decline >10pp/yr.

### Investment Frameworks

Four independent evaluators produce scores that blend into a classification-aware composite:

| Framework | Criteria | Focus |
|-----------|----------|-------|
| **Buffett** | 10 criteria | Competitive moat, consistent ROE, low debt, owner earnings |
| **Graham** | 10 criteria | Margin of safety, Graham Number, earnings stability |
| **Lynch** | 6 categories | Classify → score per category (fast grower, stalwart, cyclical...) |
| **Pabrai** | 6 risk factors | Downside protection, business simplicity, leverage risk |

Lynch classification determines composite weight allocation. A "fast grower" weights Lynch 30%, Buffett 20%; a "stalwart" weights Buffett 30%, Graham 20%.

### Layer 2: Multi-Agent LLM (Qualitative)

Tiered execution using Anthropic Claude with prompt caching:

| Tier | Companies | Agents | Model |
|------|-----------|--------|-------|
| All ~5,300 | Layer 1 only | None | — |
| Top 500 + bottom 200 | AG1 (fundamentals) | 1 | Haiku |
| Top 100 + bottom 50 | AG1-AG4 (full pipeline) | 4 | Haiku + Sonnet |

AG1 (Fundamentals) → AG2 (Governance) → AG3 (Risk) → AG4 (Synthesis)

Each agent receives pre-computed framework scores and methodology context. AG4 synthesizes into a final thesis with conviction scoring.

### Conviction Scoring

- **High**: finalScore >= 80, 2+ frameworks >= 75, Pabrai >= 60, no disqualifiers
- **Medium**: finalScore >= 70, 1+ framework >= 70, no disqualifiers
- **Low**: finalScore >= 60
- **None**: Below 60 or disqualified

### Classifications

| Classification | Score Range | Meaning |
|---------------|------------|---------|
| Strong Long | >= 80 | High confidence buy candidate |
| Potential Long | >= 65 | Worth investigating |
| Neutral | 40-64 | Hold / no action |
| Potential Short | 20-39 | Possible avoid |
| Strong Avoid | < 20 or DQ | Do not touch |

## Dashboard

7 pages at `http://localhost:3000`:

- **Home** — Overview stats, high conviction picks, top longs/avoids, sector distribution
- **Rankings** — Full sortable table with Lynch type, conviction, framework scores, filters
- **Conviction** — Concentrated picks with investment thesis and framework breakdown
- **Frameworks** — Side-by-side Buffett/Graham/Pabrai/Lynch comparison
- **Backtest** — Historical performance validation results
- **Company Detail** — Per-company deep dive with framework scores, agent analysis panels
- **Pipeline** — Scrape run status and health

## Database

PostgreSQL 17 with 7 tables:

| Table | Purpose | Rows |
|-------|---------|------|
| `companies` | Master company list | ~5,300 |
| `scrape_runs` | Scrape metadata | 1/week |
| `company_snapshots` | Point-in-time financial data (JSONB) | ~5,300/run |
| `analysis_results` | Scores, frameworks, LLM analysis | ~5,300/run |
| `price_history` | Monthly close prices (yfinance) | ~636K (10yr) |
| `backtest_runs` | Backtest results | As needed |
| `macro_snapshots` | Macro indicators + regime | Monthly |

## Cost

| Component | Cost |
|-----------|------|
| Screener.in scraping | Free |
| LLM (per full run) | ~$5-7 (Haiku) / ~$15-20 (with Sonnet synthesis) |
| Yahoo Finance prices | Free |
| PostgreSQL | Self-hosted |

## Build

```bash
npm run build          # TypeScript compilation (all packages)
npm run clean          # Clean dist/ artifacts
npm run typecheck      # Type-check only
npm run db:studio      # Drizzle Studio UI at localhost:4983
```
