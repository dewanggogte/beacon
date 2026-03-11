# Screener Automation

**Indian Stock Market Screener and Analysis Pipeline** -- scrapes, scores, and ranks ~5,300 listed companies using value investing frameworks and multi-agent LLM analysis.

## What it does

- **Scrapes** every listed Indian company from Screener.in (13 years of financials, ratios, shareholding, peer comparisons)
- **Scores** each company across 5 dimensions using 21 quantitative metrics and 4 investing frameworks (Buffett, Graham, Lynch, Pabrai)
- **Analyzes** top and bottom companies with a 4-agent LLM pipeline that produces independent qualitative scores, with post-validation to catch hallucinations
- **Displays** results in a dark Bloomberg-terminal-style dashboard with conviction badges, framework breakdowns, agent analysis panels, and backtest results

## Architecture overview

```
                          +-------------------+
                          |   Screener.in     |
                          | (5,300 companies) |
                          +--------+----------+
                                   |
                              HTTP + Cheerio
                                   |
                          +--------v----------+
                          |     Scraper       |
                          | @screener/scraper |
                          +--------+----------+
                                   |
                          +--------v----------+
                          |   PostgreSQL 17   |
                          |   (Drizzle ORM)   |
                          +--------+----------+
                                   |
                   +---------------+---------------+
                   |                               |
          +--------v----------+           +--------v----------+
          | Layer 1: Quant    |           | Layer 2: LLM      |
          | 21 metrics        |           | 4 agents (AG1-4)  |
          | 4 frameworks      |           | funnel tiering    |
          | 8 disqualifiers   |           | post-validation   |
          +--------+----------+           +--------+----------+
                   |                               |
                   +---------------+---------------+
                                   |
                          +--------v----------+
                          |    Dashboard      |
                          |  Next.js 15       |
                          |  Bloomberg theme  |
                          +-------------------+
```

## Tech stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript (ESM), npm workspaces monorepo |
| Runtime | Node.js 22+ |
| Scraper | Native fetch + Cheerio (no headless browser needed) |
| Database | PostgreSQL 17 + Drizzle ORM |
| LLM | Anthropic Claude (Haiku/Sonnet) or local Qwen 3.5 via SGLang |
| Dashboard | Next.js 15 + Tailwind CSS 4 |
| Infrastructure | Docker multi-stage, K3s, ArgoCD, CNPG PostgreSQL |

## Quick start

### Prerequisites

- Node.js 22+
- PostgreSQL 17
- Python 3 (optional, for historical price data via yfinance)

### Setup

```bash
git clone git@github.com:dewanggogte/screener-automation.git
cd screener-automation

# Install dependencies
npm install

# Create database
createdb screener

# Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL and ANTHROPIC_API_KEY (or local LLM settings)

# Run database migrations
npm run db:migrate

# Build TypeScript
npm run build
```

## Pipeline commands

| Command | Description |
|---------|-------------|
| `npm run pipeline` | Full pipeline: scrape + analyze + LLM + report |
| `npm run pipeline:scrape` | Scrape only (fetch latest data from Screener.in) |
| `npm run pipeline:analyze` | Analyze only (score + LLM on latest scrape data) |
| `npm run pipeline:quick` | Pipeline without LLM (Layer 1 quantitative only) |
| `npm run dashboard` | Start Next.js dev server on :3000 |
| `npm run build` | Build all TypeScript packages |
| `npm run db:migrate` | Run Drizzle database migrations |
| `npm run db:studio` | Open Drizzle Studio (DB browser) |

## Monorepo structure

```
screener-automation/
|-- packages/
|   |-- shared/          @screener/shared    DB schema, types, config, logger
|   |-- scraper/         @screener/scraper   HTTP + Cheerio scraper for Screener.in
|   |-- analyzer/        @screener/analyzer  Scoring, frameworks, LLM agents, backtest, macro
|   |-- dashboard/       @screener/dashboard Next.js 15 web UI (Bloomberg theme)
|-- principles/          Scoring rubric + framework config files (JSON)
|-- scripts/             Pipeline orchestration, test scripts, price fetcher
|-- docs/                Architecture and operational documentation
|-- Dockerfile           Multi-stage build with 3 entrypoint modes
|-- docker-entrypoint.sh Entrypoint dispatcher: dashboard | pipeline | migrate
```

## Analysis pipeline

The pipeline uses a two-layer approach: quantitative scoring followed by qualitative LLM analysis.

### Layer 1: Quantitative scoring

Every company goes through Layer 1:

- **5-dimension scoring** (21 metrics): valuation (25%), quality (30%), governance (20%), safety (15%), momentum (10%), with sector-specific adjustments for IT, Banking, Pharma, Manufacturing, and FMCG
- **4 framework evaluators**: Buffett checklist (10 criteria), Graham screen (10 criteria), Lynch classification (6 categories with category-aware weighting), Pabrai risk assessment (6 factors)
- **8 disqualifiers**: Hard filters that flag companies regardless of score (e.g., net losses 3 of 5 years, promoter decline >10pp/year)
- **Composite scoring**: Classification-aware weighting that varies by Lynch category (e.g., fast growers emphasize Lynch weight at 30%)

Companies are classified into: strong_long (>=80), potential_long (>=65), neutral (>=40), potential_short (>=20), strong_avoid (<20).

### Layer 2: Multi-agent LLM with funnel tiering (v2.2)

Layer 2 applies qualitative analysis using 4 specialized agents with structured chain-of-thought prompts:

- **AG1 -- Fundamentals**: Business quality, competitive moats, growth trajectory
- **AG2 -- Governance**: Promoter track record, related-party transactions, capital allocation
- **AG3 -- Risk (Devil's Advocate)**: Must surface at least 2 risks per company
- **AG4 -- Synthesis**: Final assessment with macro regime context and peer comparison

**Funnel tiering** controls LLM cost by focusing depth where it matters:

- **Tier 1**: Top 100 companies by quant score receive full AG1 through AG4 evaluation
- **Tier 2**: Next 500 companies receive AG1 screening; the top 100 from that group are promoted to full AG2 through AG4 evaluation

**Dual evaluation and scoring**:

- AG1 and AG4 each produce independent scores (0-100), not just adjustments to the quant score
- AG4 has full authority to override the quantitative classification
- Both quant and AG4 classifications are preserved; the dashboard shows attribution for each
- Post-validation cross-checks LLM claims against quantitative data and overrides contradictions

**Divergence watcher**: When AG4 and quant classifications disagree significantly, an email report is sent to flag the divergence for review.

## Deployment

Deployed to a K3s homelab cluster at `screener.nikamma.in` (internal network only).

```
GitHub push --> GitHub Actions CI --> Docker build (amd64) --> GHCR
                                                                |
                                                   ArgoCD syncs new image
                                                                |
                                                   K3s rollout restart
```

The Dockerfile uses a multi-stage build with 3 entrypoint modes:

| Mode | Command | Description |
|------|---------|-------------|
| `dashboard` | `node packages/dashboard/.next/standalone/server.js` | Serves the Next.js dashboard |
| `pipeline` | `node packages/analyzer/dist/index.js` | Runs the scrape + analyze pipeline |
| `migrate` | `npx drizzle-kit migrate` | Applies database migrations |

Container image: `ghcr.io/dewanggogte/screener-automation:latest`

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (e.g., `postgres://user:pass@host:5432/screener`) |
| `ANTHROPIC_API_KEY` | If using Anthropic | API key for Claude Haiku/Sonnet |
| `LLM_PROVIDER` | No | `anthropic` (default) or `local` |
| `LOCAL_LLM_URL` | If using local LLM | SGLang/vLLM endpoint (e.g., `http://192.168.0.42:8000`) |
| `LOCAL_LLM_MODEL` | If using local LLM | Model name (e.g., `qwen3.5-35b-a3b`) |
| `SMTP_HOST` | No | SMTP server for divergence watcher email reports |
| `SMTP_PORT` | No | SMTP port (default: 587) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |

## Dashboard pages

The dashboard uses a dark Bloomberg-terminal aesthetic with 7 pages:

| Page | Description |
|------|-------------|
| **Home** | Pipeline overview, latest run stats, top/bottom movers |
| **Conviction** | Companies filtered by conviction level (high/medium/low), with Lynch category badges |
| **Frameworks** | Side-by-side Buffett, Graham, Lynch, and Pabrai scores for each company |
| **Rankings** | Full sortable ranking table across all scored companies |
| **Backtest** | Historical backtest results with walk-forward analysis |
| **Company detail** | Deep dive into a single company: all metrics, framework scores, agent analysis panels |
| **Pipeline status** | Current and historical pipeline run progress and timing |

## Documentation

| Document | Contents |
|----------|----------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, components, LLM agent architecture |
| [docs/INFO_FLOW.md](docs/INFO_FLOW.md) | Data flow from scrape to dashboard, agent data packs, post-validation |
| [docs/RUNNING.md](docs/RUNNING.md) | All commands, scenarios, environment variables, troubleshooting |
| [PRD.md](PRD.md) | Full product requirements document (v2.2) |

---

**Disclaimer**: This is a personal research and analysis tool. It is NOT financial advice. Do not make investment decisions based solely on the output of this system.
