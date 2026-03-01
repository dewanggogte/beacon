# Screener Automation

Automated Indian stock market analysis pipeline. Scrapes financial data from [Screener.in](https://www.screener.in), scores ~5,300 listed companies using value investing frameworks (Buffett, Graham, Lynch, Pabrai), and runs a multi-agent LLM layer for qualitative analysis. Results are displayed in a Bloomberg-terminal-style dashboard.

**This is a personal research and analysis tool. It is NOT financial advice.**

## What it does

1. **Scrapes** every listed Indian company from Screener.in (financials, ratios, shareholding, peers)
2. **Scores** each company across 5 dimensions (valuation, quality, governance, safety, momentum) using 21 metrics
3. **Evaluates** against 4 investing frameworks (Buffett checklist, Graham screen, Lynch classification, Pabrai risk)
4. **Analyzes** top/bottom companies with 4 LLM agents using structured chain-of-thought (fundamentals, governance, risk with devil's advocate, synthesis with macro regime context)
5. **Validates** LLM outputs against quantitative data to catch hallucinations (post-validation cross-checks)
6. **Ranks** and classifies into: strong\_long, potential\_long, neutral, potential\_short, strong\_avoid
7. **Displays** results in a dark-mode dashboard with conviction badges, framework scores, and agent analysis

## Quick start

### Prerequisites

- Node.js 22+
- PostgreSQL 17
- Python 3 (optional, for historical price data)

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

### Run the pipeline

```bash
# Full pipeline: scrape + score + LLM + report
npm run pipeline

# Score only (no scraping, no LLM)
npm run pipeline:quick

# Analyze only (uses latest scrape data)
npm run pipeline:analyze

# Start the dashboard
npm run dashboard
# Open http://localhost:3000
```

### LLM provider

Set `LLM_PROVIDER` in `.env`:

```bash
# Option A: Anthropic Claude (cloud, ~$85/week for 5,300 companies)
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Option B: Local Qwen 3.5 via SGLang/vLLM ($0, requires GPU)
LLM_PROVIDER=local
LOCAL_LLM_URL=http://192.168.0.42:8000
LOCAL_LLM_MODEL=qwen3.5-35b-a3b
```

## Project structure

```
screener-automation/
+-- packages/
|   +-- shared/          @screener/shared   (DB schema, types, config, logger)
|   +-- scraper/         @screener/scraper  (HTTP + Cheerio scraper)
|   +-- analyzer/        @screener/analyzer (scoring, frameworks, LLM agents, backtest, macro)
|   +-- dashboard/       @screener/dashboard (Next.js 15 web UI)
+-- principles/          Scoring rubric + framework configs (JSON)
+-- scripts/             Pipeline orchestration + test scripts
+-- docs/                Architecture and flow documentation
+-- Dockerfile           Multi-stage build (3 entrypoint modes)
+-- docker-entrypoint.sh dashboard | pipeline | migrate
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system design and [docs/INFO_FLOW.md](docs/INFO_FLOW.md) for how data moves through the pipeline.

## Key commands

| Command | Description |
|---------|-------------|
| `npm run pipeline` | Full pipeline (scrape + analyze + report) |
| `npm run pipeline:quick` | Pipeline without LLM (Layer 1 only) |
| `npm run pipeline:analyze` | Analyze latest scrape data |
| `npm run dashboard` | Start Next.js dev server on :3000 |
| `npm run build` | Build all TypeScript packages |
| `npm run db:migrate` | Run Drizzle migrations |
| `npm run db:studio` | Open Drizzle Studio (DB browser) |
| `npx tsx scripts/test-pipeline-1.ts` | Test 4-agent LLM on 1 company |
| `npx tsx scripts/test-pipeline-10.ts` | Test 4-agent LLM on 10 companies |

See [RUNNING.md](RUNNING.md) for the full command reference with all scenarios.

## Deployment

Deployed to a K3s homelab cluster at `screener.nikamma.in` (internal network).

```
GitHub push --> GitHub Actions CI --> Docker build (amd64) --> GHCR
                                                                |
                                                   ArgoCD syncs new image
                                                                |
                                                   K3s rollout restart
```

Container image: `ghcr.io/dewanggogte/screener-automation:latest`

## Tech stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript (ESM), npm workspaces monorepo |
| Scraper | Native fetch + Cheerio (no headless browser) |
| Database | PostgreSQL 17 + Drizzle ORM |
| LLM | Anthropic Claude (Haiku/Sonnet) or local Qwen 3.5 via SGLang/vLLM. 4 agents with structured CoT, post-validation, 7-gate conviction calibration |
| Dashboard | Next.js 15 + Tailwind CSS 4 |
| Infrastructure | Docker, K3s, ArgoCD, CNPG PostgreSQL |

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) -- System design, components, LLM agents
- [INFO_FLOW.md](INFO_FLOW.md) -- Data flow from scrape to dashboard, agent data packs, post-validation
- [RUNNING.md](RUNNING.md) -- All commands, scenarios, environment variables, troubleshooting
- [PRD.md](PRD.md) -- Full product requirements document
