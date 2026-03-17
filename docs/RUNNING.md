# Running the Project

## Prerequisites

- **Node.js 22+** (ESM support, native fetch)
- **PostgreSQL 17** (Homebrew: `brew install postgresql@17`)
- **Python 3** (optional, only for `scripts/fetch-prices.py`)

## Initial Setup

```bash
# Clone
git clone git@github.com:dewanggogte/beacon.git
cd beacon

# Install all dependencies (npm workspaces)
npm install

# Create the database
createdb screener

# Copy and edit environment config
cp .env.example .env

# Run Drizzle migrations (creates all 7 tables)
npm run db:migrate

# Build TypeScript (validates types across all packages)
npm run build
```

## Environment Variables

All config is validated by Zod at startup (`packages/shared/src/config.ts`).

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgres://localhost:5432/screener` | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | -- | Required when `LLM_PROVIDER=anthropic` |
| `SCREENER_BASE_URL` | `https://www.screener.in` | Screener.in base URL |
| `LLM_PROVIDER` | `anthropic` | `anthropic` or `local` |
| `LOCAL_LLM_URL` | `http://192.168.0.42:8000` | Base URL for local LLM (SGLang/vLLM endpoint) |
| `LOCAL_LLM_MODEL` | `qwen3.5-35b-a3b` | Model name served by local endpoint |
| `LOCAL_LLM_TEMPERATURE` | `0.7` | Temperature for local LLM (Qwen recommends 0.7) |
| `NODE_ENV` | `development` | `development`, `production`, or `test` |
| `SMTP_HOST` | -- | SMTP server for divergence email reports |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | -- | SMTP username |
| `SMTP_PASS` | -- | SMTP password |
| `SMTP_FROM` | (same as SMTP_USER) | Sender address for reports |

SMTP variables are optional. If not configured, divergence reports are written to `reports/` directory instead of emailed.

## Pipeline Commands

### Full pipeline

```bash
# Scrape + score + LLM + report (the weekly pipeline)
npm run pipeline

# Scrape only (fetch data from Screener.in, save to DB)
npm run pipeline:scrape

# Analyze only (score + LLM on latest scrape data)
npm run pipeline:analyze

# Quick (score only, no LLM -- useful for testing)
npm run pipeline:quick
```

### Analyzer CLI

The analyzer package has its own CLI with several subcommands:

```bash
# Run analysis with options
npx tsx packages/analyzer/src/index.ts analyze               # Full analysis
npx tsx packages/analyzer/src/index.ts analyze --skip-llm     # Layer 1 only
npx tsx packages/analyzer/src/index.ts analyze --run=6        # Specific scrape run
npx tsx packages/analyzer/src/index.ts analyze --model=claude-haiku-4-5-20251001

# Targeted analysis (specific companies, sectors, or limits)
npx tsx packages/analyzer/src/index.ts analyze --companies=RELIANCE,TCS,INFY
npx tsx packages/analyzer/src/index.ts analyze --sectors=IT,Banking
npx tsx packages/analyzer/src/index.ts analyze --limit=50
npx tsx packages/analyzer/src/index.ts analyze --sectors=Pharma --limit=20

# LLM-only mode (re-run LLM on existing Layer 1 scores, no re-scoring)
npx tsx packages/analyzer/src/index.ts analyze --llm-only
npx tsx packages/analyzer/src/index.ts analyze --llm-only --companies=RELIANCE,TCS

# Backtesting
npx tsx packages/analyzer/src/index.ts backtest --run=3 --eval-date=2025-06-01
npx tsx packages/analyzer/src/index.ts backtest --run=3 --eval-date=2025-06-01 --top=50 --days=90

# Walk-forward analysis
npx tsx packages/analyzer/src/index.ts walk-forward --from=2024-01 --to=2025-12

# Macro overlay
npx tsx packages/analyzer/src/index.ts macro add --date=2026-02-26 --repo=6.5 --cpi=4.5 --gdp=6.8 --nifty-pe=22 --vix=14 --usd-inr=83.5 --bond=7.1
npx tsx packages/analyzer/src/index.ts macro regime

# View scoring rubric
npx tsx packages/analyzer/src/index.ts rubric
```

### Scraper CLI

```bash
# Fetch and store all company codes (~5,300 via search API)
npx tsx packages/scraper/src/index.ts list

# Scrape all companies (creates new scrape run)
npx tsx packages/scraper/src/index.ts scrape

# Scrape with limit
npx tsx packages/scraper/src/index.ts scrape --limit 50

# Resume an interrupted scrape
npx tsx packages/scraper/src/index.ts scrape --resume

# Test scrape a single company (prints to console, does not save)
npx tsx packages/scraper/src/index.ts test RELIANCE
npx tsx packages/scraper/src/index.ts test ADANIPOWER
```

### Dashboard

```bash
# Dev server (hot reload)
npm run dashboard
# Open http://localhost:3000

# Pages:
#   /              Home (summary, top longs/shorts)
#   /conviction    Conviction-filtered view
#   /frameworks    Framework scores table
#   /rankings      Full sortable/filterable table
#   /backtest      Backtest results
#   /company/CODE  Company detail (e.g., /company/RELIANCE)
#   /pipeline      Pipeline status
```

### Database

```bash
# Generate new migration after schema changes
npm run db:generate

# Run pending migrations
npm run db:migrate

# Open Drizzle Studio (visual DB browser)
npm run db:studio
```

### Build and Typecheck

```bash
# Build all packages (tsc project references)
npm run build

# Clean build artifacts
npm run clean
```

## Test Scripts

Located in `scripts/`. Run with `npx tsx`:

```bash
# Test full 4-agent pipeline on a single company
npx tsx scripts/test-pipeline-1.ts

# Test pipeline on 10 companies
npx tsx scripts/test-pipeline-10.ts

# Scrape + analyze a specific company end-to-end
npx tsx scripts/test-adani-power.ts

# Fetch historical prices from Yahoo Finance (Python)
python scripts/fetch-prices.py

# Seed companies table (for fresh DB)
npx tsx scripts/seed-companies.ts
```

## Docker

The Dockerfile produces a single image with 3 entrypoint modes:

```bash
# Build locally
docker build -t beacon .

# Run dashboard (default)
docker run -p 3000:3000 beacon

# Run pipeline
docker run beacon pipeline

# Run with limit and LLM options
docker run -e LLM_PROVIDER=local -e LOCAL_LLM_URL=http://host:8000 \
  beacon pipeline --limit 50

# Run migrations
docker run beacon migrate
```

Entrypoint modes: `dashboard`, `pipeline`, `pipeline:scrape`, `pipeline:analyze`, `pipeline:quick`, `migrate`.

## First Run on Fresh Database

1. Run migrations: `npm run db:migrate`
2. Seed company list: `npx tsx packages/scraper/src/index.ts list`
3. Scrape a small batch: `npx tsx packages/scraper/src/index.ts scrape --limit 20`
4. Run analysis: `npx tsx packages/analyzer/src/index.ts analyze`
5. Start dashboard: `npm run dashboard`

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `tsx -e` fails with top-level await | Use a script file instead of inline `-e` |
| Dashboard can't resolve `@screener/shared` | Ensure `extensionAlias` is set in `next.config.ts` |
| Drizzle migration missing tables | Run `npm run db:generate` to detect schema changes |
| LLM parse failures | Check `LLM_PROVIDER`, model availability, and token limits (all set to 4096) |
| Scraper gets 403 | Reduce scrape rate, check if IP is blocked, wait 1 hour |
| Divergence report not emailed | Set SMTP_HOST/PORT/USER/PASS env vars. Reports fall back to `reports/divergence-*.html` |
| AG4 parse failures increased | Check LLM model -- AG4 now outputs more fields (score, recommended_classification, classification_reasoning) |
| `--llm-only` shows "No existing analysis results" | Run full analysis first (`analyze` without `--llm-only`) to generate Layer 1 scores |
| `--companies` returns 0 results | Check screener codes are correct (case-insensitive). Run `list` command first if companies table is empty |
| `--sectors` returns 0 results | Sector matching is partial and case-insensitive. Check available sectors in the DB |
