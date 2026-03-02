# Running the Pipeline

Step-by-step instructions for every scenario: first run, weekly runs, partial reruns, backtesting, and troubleshooting.

## Prerequisites

Before running anything:

```bash
# 1. PostgreSQL must be running
brew services start postgresql@17

# psql may not be on your PATH by default:
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"

# 2. Database must exist with tables
createdb screener          # first time only
npm run db:migrate         # creates/updates all 7 tables

# 3. Project must be built (requires Node.js 25+)
npm install                # first time or after dependency changes
npm run build              # compiles all TypeScript packages

# 4. Environment variables
export DATABASE_URL=postgres://localhost:5432/screener

# Option A: Anthropic Claude (cloud)
export LLM_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-ant-...

# Option B: Local Qwen 3.5 via SGLang/vLLM ($0, requires GPU)
export LLM_PROVIDER=local
export LOCAL_LLM_URL=http://192.168.0.42:8000
export LOCAL_LLM_MODEL=qwen3.5-35b-a3b
```

Verify everything is ready:

```bash
npm run build                          # should complete with no errors
npx tsx packages/analyzer/src/index.ts rubric   # should print scoring dimensions
```

---

## Scenario 1: First-Time Full Run

You have a fresh database with no data. Run the full pipeline end-to-end.

### Step 1: Populate the company list

The scraper needs to know which companies exist on Screener.in before it can scrape them.

```bash
npx tsx packages/scraper/src/index.ts list
```

This queries the Screener.in search API with 2-letter combinations (786 queries) and discovers ~5,300 companies. Takes about 30 minutes. Upserts into the `companies` table.

### Step 2: Run the full pipeline

```bash
npm run pipeline
```

This runs: **Scrape** → **Analyze (Layer 1 + Frameworks)** → **LLM (Layer 2)** → **Weekly Report**

**Expected timeline:**
| Step | Duration | What happens |
|------|----------|-------------|
| Scraping | 18-24 hours | Fetches ~5,300 company pages with rate limiting |
| Layer 1 scoring | 3-5 minutes | Scores all companies deterministically |
| Framework evaluation | Included above | Buffett, Graham, Lynch, Pabrai |
| LLM Tier 2 (AG1) | 30-60 minutes | ~700 companies, fundamentals agent only |
| LLM Tier 1 (AG1-4) | 60-120 minutes | ~150 companies, full 4-agent pipeline |
| Report generation | < 1 second | Markdown report saved to `reports/` |

**Cost:** ~$5-7 per full run with Anthropic Haiku. ~$15-20 if using Sonnet for synthesis. $0 with local Qwen.

### Step 3: Start the dashboard

```bash
npm run dashboard
```

Open http://localhost:3000 to see results.

---

## Scenario 2: Weekly Recurring Run

You already have a previous scrape. Run the pipeline again to get fresh data and weekly comparisons.

```bash
npm run pipeline
```

Same as a first run, but the weekly comparison step will now compute score deltas and classification changes against the previous run. The report will include a "Biggest Movers" section.

### Skip the scrape (re-analyze existing data)

If you already scraped this week and just want to re-run analysis with different parameters:

```bash
npm run pipeline:analyze
```

This uses the most recent scrape run and runs Layer 1 + LLM + Report.

### Skip LLM (fast quantitative-only run)

```bash
npm run pipeline:quick
```

This scrapes + runs Layer 1 scoring + frameworks, but skips all LLM calls. Useful for quick iterations on scoring logic. Takes about 18-24 hours for scraping, then 3-5 minutes for analysis.

---

## Scenario 3: Partial and Targeted Runs

### Test a single company (no database changes)

Scrape and display parsed data for one company without saving to the database:

```bash
npx tsx packages/scraper/src/index.ts test RELIANCE
npx tsx packages/scraper/src/index.ts test TCS
npx tsx packages/scraper/src/index.ts test INFY
```

Outputs: header info, key ratios, pros/cons count, financial table row counts, and validation results.

### Scrape a small batch

```bash
npx tsx packages/scraper/src/index.ts scrape --limit=100
```

Scrapes 100 randomly-selected companies. Creates a new scrape run. Useful for testing or when you only need a subset. The companies are Fisher-Yates shuffled (never alphabetical) to avoid detection patterns.

### Resume an interrupted scrape

If a scrape was interrupted (network issue, machine sleep, IP block):

```bash
npx tsx packages/scraper/src/index.ts scrape --resume
```

This finds the latest incomplete scrape run and continues from where it left off. Only scrapes companies that haven't been scraped in this run yet. The order is re-shuffled.

### Analyze a specific scrape run

```bash
npx tsx packages/analyzer/src/index.ts analyze --run=3
```

Analyzes scrape run #3 specifically, instead of the latest run. Useful when you have multiple scrape runs and want to compare analyses across different snapshots.

### Analyze without LLM

```bash
npx tsx packages/analyzer/src/index.ts analyze --skip-llm
```

Runs only Layer 1 (quantitative scoring + all 4 frameworks). No API calls, no cost. Completes in 3-5 minutes for ~5,300 companies.

### Analyze without generating a report

```bash
npx tsx packages/analyzer/src/index.ts analyze --skip-report
```

Runs full analysis (Layer 1 + LLM) but skips the markdown report generation step.

### Run LLM with a different model

```bash
# Anthropic provider: switch model
npx tsx packages/analyzer/src/index.ts analyze --model=claude-sonnet-4-5

# Local provider: model is set via LOCAL_LLM_MODEL env var
LOCAL_LLM_MODEL=qwen3.5-35b-a3b npx tsx packages/analyzer/src/index.ts analyze
```

With `LLM_PROVIDER=anthropic`, uses the specified model for all agents (default: Haiku for AG1-3, Sonnet for AG4). With `LLM_PROVIDER=local`, all 4 agents use the same local model via the OpenAI-compatible API endpoint.

### Scrape only (no analysis)

```bash
npm run pipeline:scrape
```

Or with a limit:

```bash
npx tsx scripts/run-pipeline.ts --scrape-only --limit=500
```

---

## Scenario 4: Backtesting

Validate the pipeline's picks against actual historical price performance.

### Step 1: Fetch historical prices (one-time setup)

```bash
pip install yfinance psycopg2-binary

python scripts/fetch-prices.py
```

This downloads 10 years of monthly close prices for all ~5,300 companies from Yahoo Finance. Takes 2-4 hours. Inserts ~636,000 rows into `price_history`.

**Options:**

```bash
python scripts/fetch-prices.py --limit 100       # Only first 100 companies
python scripts/fetch-prices.py --code RELIANCE    # Single company
python scripts/fetch-prices.py --period 5y        # 5 years instead of 10
python scripts/fetch-prices.py --update           # Only fetch companies with no existing price data
python scripts/fetch-prices.py --batch-size 100   # Companies per batch before pause (default: 50)
python scripts/fetch-prices.py --delay 1.0        # Seconds between requests (default: 0.5)
```

### Step 2: Run a backtest

```bash
npx tsx packages/analyzer/src/index.ts backtest \
  --run=3 \
  --eval-date=2025-06-01 \
  --top=20 \
  --days=180
```

**What this does:**
1. Loads analysis results from scrape run #3
2. Selects the top 20 picks by `finalScore` (filtered to `strong_long` and `potential_long`)
3. Finds entry prices closest to the scrape run date
4. Finds exit prices closest to 2025-06-01 (or scrape date + 180 days)
5. Calculates: average return, median return, hit rate, Sharpe ratio, best/worst picks

**Parameters:**
| Flag | Default | Description |
|------|---------|-------------|
| `--run=<id>` | Required | Scrape run ID to backtest |
| `--eval-date=DATE` | Required | Date to evaluate exit prices (YYYY-MM-DD) |
| `--top=<n>` | 20 | Number of top picks to include |
| `--days=<n>` | 180 | Holding period in days (used if --eval-date not provided) |

**Output example:**
```
=== Backtest Results ===
Picks: 18/20
Avg Return: 14.2%
Median Return: 11.8%
Hit Rate: 72%
Sharpe: 1.45
Best: 48.3% | Worst: -12.1%

Top/Bottom Picks:
  +48.3% BAJFINANCE (5200 → 7712)
  +32.1% HDFCBANK (1650 → 2180)
  ...
  -8.5% TATAMOTORS (680 → 622)
  -12.1% RELIANCE (2450 → 2154)
```

### Step 3: Walk-forward analysis

Test the pipeline across multiple historical periods:

```bash
npx tsx packages/analyzer/src/index.ts walk-forward \
  --from=2024-01-01 \
  --to=2025-12-01 \
  --top=20 \
  --days=180
```

**What this does:**
1. Finds all scrape runs between the `--from` and `--to` dates
2. For each run, performs a backtest with the specified holding period
3. Aggregates results across all periods: average return, average hit rate, average Sharpe
4. Reports best and worst periods

**Output example:**
```
=== Walk-Forward Results ===
Periods: 8
Avg Return: 12.5%
Avg Hit Rate: 68%
Avg Sharpe: 1.12
Best Period: 2024-03-15 (22.3%)
Worst Period: 2024-09-01 (-3.1%)

Per-Period:
  2024-01-15 → 2024-07-15: 15.2% (18 picks, hit 72%)
  2024-03-01 → 2024-09-01: 22.3% (20 picks, hit 80%)
  ...
```

---

## Scenario 5: Macro Overlay

Add macroeconomic data to adjust scores based on the economic regime.

### Add a macro data point

```bash
npx tsx packages/analyzer/src/index.ts macro add \
  --date=2026-02-26 \
  --repo=6.5 \
  --cpi=4.5 \
  --gdp=6.8 \
  --nifty-pe=22 \
  --vix=14 \
  --usd-inr=83.5 \
  --bond=7.1
```

All fields are optional. The regime is auto-classified based on GDP growth and CPI.

**Fields:**
| Flag | Description |
|------|-------------|
| `--date` | Snapshot date (default: today) |
| `--repo` | RBI repo rate (%) |
| `--cpi` | Consumer Price Index inflation (%) |
| `--gdp` | GDP growth rate (%) |
| `--nifty-pe` | Nifty 50 P/E ratio |
| `--vix` | India VIX (volatility index) |
| `--usd-inr` | USD/INR exchange rate |
| `--bond` | 10-year government bond yield (%) |
| `--notes` | Free-text notes |

### Check the current regime

```bash
npx tsx packages/analyzer/src/index.ts macro regime
```

**Output example:**
```
Regime: GOLDILOCKS (high confidence)

Signals:
  GDP growth 6.8% above 6.0% threshold (expansionary)
  CPI 4.5% below 5.0% threshold (controlled inflation)

Adjustments: Favorable for growth — strong GDP with controlled inflation
  Growth: 1.1x
  Value: 1.0x
  Cyclical: 1.05x
  Turnaround: 1.05x
  Safety bonus: +0
```

**Regime types:**
| Regime | Condition | Effect |
|--------|-----------|--------|
| Goldilocks | GDP high + CPI low | Growth stocks boosted |
| Reflation | GDP high + CPI high | Cyclicals boosted, safety penalized |
| Stagflation | GDP low + CPI high | Everything penalized except safety |
| Deflation | GDP low + CPI low | Value stocks boosted, growth penalized |

---

## Scenario 6: Dashboard Only

If analysis has already been run and you just want to view results:

```bash
npm run dashboard
```

Pages available at http://localhost:3000:

| Page | URL | Content |
|------|-----|---------|
| Home | `/` | Overview stats, high conviction picks, top longs/avoids |
| Rankings | `/rankings` | Full sortable table with filters (class, Lynch, conviction) |
| Conviction | `/conviction` | Concentrated picks with investment thesis |
| Frameworks | `/frameworks` | Side-by-side Buffett/Graham/Pabrai/Lynch comparison |
| Backtest | `/backtest` | Historical performance results |
| Company | `/company/{CODE}` | Deep dive: frameworks, agent analysis, metrics |
| Pipeline | `/pipeline` | Scrape run status and progress |

### Database browser

```bash
npm run db:studio
```

Opens Drizzle Studio at http://localhost:4983 for direct database inspection.

---

## Scenario 7: Inspect the Scoring Rubric

View the current scoring configuration without running anything:

```bash
npx tsx packages/analyzer/src/index.ts rubric
```

Outputs: version, dimensions with weights, metric counts, disqualifier rules, classification thresholds.

The rubric is defined in `principles/scoring-rubric.json` and the framework configs live in `principles/frameworks/*.json`.

---

## Common Workflows

### "I changed the scoring rubric and want to see the impact"

```bash
npx tsx packages/analyzer/src/index.ts analyze --skip-llm
npm run dashboard
```

Re-runs Layer 1 with the updated rubric on the latest scrape data. No API cost. 3-5 minutes.

### "I want to test framework threshold changes"

```bash
# Edit principles/frameworks/buffett-checklist.json (or graham, lynch, pabrai)
npx tsx packages/analyzer/src/index.ts analyze --skip-llm --skip-report
# Check results in the dashboard or DB
```

### "I want to re-run LLM analysis on existing scores"

The `--llm-only` flag is defined but not yet implemented. For now, run the full analysis:

```bash
npx tsx packages/analyzer/src/index.ts analyze
```

Layer 1 scoring is fast (~5 minutes), so the overhead is minimal.

### "I want to analyze just the top companies with a better model"

```bash
# Cloud: switch to Sonnet
npx tsx packages/analyzer/src/index.ts analyze --model=claude-sonnet-4-5

# Local: switch to a larger model
LOCAL_LLM_MODEL=qwen3-72b npx tsx packages/analyzer/src/index.ts analyze
```

The tiering still applies (Tier 1 gets AG1-4, Tier 2 gets AG1 only).

### "I want to compare this week's results to last week"

The weekly comparison runs automatically as part of the analysis pipeline. Results are:
1. Saved in `analysis_results` table (`score_change`, `classification_change` columns)
2. Included in the markdown report in `reports/weekly-report-YYYY-MM-DD.md`
3. Visible in the dashboard Rankings table (Chg column)

---

## Timing and Rate Limits

### Scraper timing

The scraper uses aggressive rate limiting to avoid detection:

| Behavior | Timing |
|----------|--------|
| Between pages | Random 2-8 seconds (normal distribution) |
| Between batches (every 50 companies) | Random 3-8 minutes |
| Between sessions (every 300 requests) | Random 5-15 minutes |
| After 429 (rate limited) | 5 minutes backoff |
| After 403 (forbidden) | 1 hour backoff |
| After 10+ consecutive failures | Full stop |

A full scrape of ~5,300 companies takes 18-24 hours.

### LLM rate limits

**Anthropic (cloud):**
- Haiku: High throughput, rarely an issue
- Sonnet: Lower rate limits, may see 429 errors with large batches
- Prompt caching enabled (ephemeral) — reduces cost on repeated system prompts

**Local Qwen (SGLang/vLLM):**
- No rate limits — throughput depends on GPU
- All 4 agents use the same model (no Haiku/Sonnet split)
- Thinking mode disabled (`enable_thinking: false`) to avoid `<think>` blocks in output
- Temperature configurable via `LOCAL_LLM_TEMPERATURE` (default: 0.7, recommended by Qwen)

Both providers handle retries automatically. All agents use `maxTokens: 4096`.

---

## Troubleshooting

### "No scrape runs found"

```
Error: No scrape runs found. Run the scraper first.
```

You need to scrape before analyzing. Run:

```bash
npx tsx packages/scraper/src/index.ts scrape --limit=10   # quick test
```

### "ANTHROPIC_API_KEY not set"

```
WARN: ANTHROPIC_API_KEY not set — skipping qualitative analysis
```

Only relevant when `LLM_PROVIDER=anthropic`. Layer 2 (LLM) is skipped but Layer 1 still runs. Either set the key or switch to local:

```bash
# Option A: Set the API key
export ANTHROPIC_API_KEY=sk-ant-...

# Option B: Use local LLM instead
export LLM_PROVIDER=local
export LOCAL_LLM_URL=http://192.168.0.42:8000
export LOCAL_LLM_MODEL=qwen3.5-35b-a3b
```

### "LLM parse failures"

The log shows `parseFailures: N` after an LLM analysis run. This means the LLM returned output that didn't match the expected JSON schema.

**Common causes:**
1. Model output too long (truncated) — all agents now use `maxTokens: 4096` to prevent this
2. Model returned `<think>` blocks mixed with JSON — local Qwen should have `enable_thinking: false`
3. Model hallucinated extra fields or wrong types

**Actions:**
1. Run `npx tsx scripts/diagnose-llm.ts` to test the LLM endpoint
2. Check if `LLM_PROVIDER` matches your actual setup
3. For local models, verify the SGLang/vLLM endpoint is running and responsive

### "Post-validation overrides"

The log shows warnings like `[PostValidation] AG1 override: trend_assessment "improving" → "stable"`. This means the LLM's qualitative assessment contradicted the quantitative data.

**This is expected behavior.** Post-validation catches cases like:
- "improving" trend with declining revenue
- "high" earnings quality with OCF < 50% of net profit
- "high" conviction on a disqualified company

The overrides are logged as warnings for transparency. No action needed unless you see excessive overrides (>30% of companies), which may indicate a model quality issue.

### "Cannot read properties of undefined (reading 'OPM %')" in Layer 1

```
Pipeline failed: Cannot read properties of undefined (reading 'OPM %')
    at num (flatten-v2.ts:20:13)
```

A company has `annualPl` with only a TTM entry and no real yearly data. After slicing off the TTM row, the array is empty, and `plData[0]` is undefined. **Fixed in v2.3** — flattenV2 now guards `plData.length > 0` and `num()` handles undefined records.

If you see this on an older version, update and rebuild:

```bash
git pull && npm run build
```

### "Scrape aborted: 10 consecutive failures"

The scraper detected too many consecutive failures, likely meaning the IP is temporarily blocked.

**Actions:**
1. Wait 1-2 hours and resume: `npx tsx packages/scraper/src/index.ts scrape --resume`
2. Check if Screener.in is accessible in a browser
3. If the problem persists, check your network/VPN

### "Database connection refused"

```bash
brew services start postgresql@17
```

### "Table does not exist"

```bash
npm run db:migrate
```

### "Build errors after pulling changes"

```bash
npm install          # install new dependencies
npm run clean        # clean old compiled output
npm run build        # rebuild
```

### "Dashboard shows no data"

1. Check that analysis has been run: look for rows in `analysis_results`
2. Check the correct scrape run is being queried (dashboard uses the latest)
3. Try `npm run db:studio` to inspect the database directly

### "Backtest shows 0 picks with prices"

Historical prices haven't been fetched yet:

```bash
python scripts/fetch-prices.py --limit 100   # start with a subset
```

### "yfinance returns no data for a company"

Not all Screener.in companies have Yahoo Finance tickers. The script tries NSE (.NS) first, then BSE (.BO) as fallback. Coverage is typically 80-90% of the company list.

---

## Scenario 8: Test LLM Pipeline

Test the full 4-agent LLM pipeline on a small set of companies without running a full scrape.

### Single company end-to-end (scrape + analyze)

```bash
npx tsx scripts/test-adani-power.ts
```

Scrapes ADANIPOWER from Screener.in, saves to a new scrape run, runs Layer 1 scoring, then runs the full 4-agent LLM pipeline. Useful for verifying LLM output quality and post-validation.

### Test pipeline on 1 company (from existing scrape)

```bash
npx tsx scripts/test-pipeline-1.ts
```

Picks one company from the latest scrape run and runs the full 4-agent LLM analysis. Check the output for:
- All 4 agents parsing successfully
- Structured chain-of-thought in reasoning fields
- Post-validation warnings (if any)
- Devil's advocate risks in AG3 (minimum 2 required)
- Conviction calibration in AG4

### Test pipeline on 10 companies

```bash
npx tsx scripts/test-pipeline-10.ts
```

Same as above but on 10 large-cap companies. Checks parse success rate and aggregate output quality.

### Diagnose LLM issues

```bash
npx tsx scripts/diagnose-llm.ts        # Test LLM connectivity and response format
npx tsx scripts/test-local-llm.ts       # Test local Qwen endpoint specifically
npx tsx scripts/compare-providers.ts    # Compare Anthropic vs local output quality
```

---

## Scenario 9: Re-Run Analysis Only on Homelab

If the scraper completed but analysis failed (e.g., a bug in Layer 1), you don't need to re-scrape. The scrape data is already in the database.

### Verify scrape data exists

```bash
# Port-forward the CNPG database
kubectl port-forward -n postgres svc/postgres-rw 5433:5432

# Check the scrape run (in another terminal)
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
psql -h localhost -p 5433 -U screener -d screener \
  -c "SELECT id, status, successful, failed FROM scrape_runs ORDER BY id DESC LIMIT 3;"
```

The password is in the SealedSecret. Extract it:

```bash
kubectl get secret -n screener-automation screener-secrets \
  -o jsonpath='{.data.DATABASE_URL}' | base64 -d
# Password is between : and @ in the URL
```

### Re-run analysis only

Create a one-off job using the analysis-only pipeline mode:

```bash
kubectl create job screener-analyze-manual \
  --from=cronjob/screener-pipeline \
  -n screener-automation \
  -- pipeline:analyze

# Watch progress
kubectl logs -f job/screener-analyze-manual -n screener-automation

# Clean up
kubectl delete job screener-analyze-manual -n screener-automation
```

Or for Layer 1 only (no LLM, fastest):

```bash
kubectl create job screener-quick-manual \
  --from=cronjob/screener-pipeline \
  -n screener-automation \
  -- pipeline:quick
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Full pipeline | `npm run pipeline` |
| Pipeline without LLM | `npm run pipeline:quick` |
| Analyze only (latest scrape) | `npm run pipeline:analyze` |
| Scrape only | `npm run pipeline:scrape` |
| Test single company scrape | `npx tsx packages/scraper/src/index.ts test RELIANCE` |
| Scrape with limit | `npx tsx packages/scraper/src/index.ts scrape --limit=100` |
| Resume interrupted scrape | `npx tsx packages/scraper/src/index.ts scrape --resume` |
| Layer 1 only (no LLM) | `npx tsx packages/analyzer/src/index.ts analyze --skip-llm` |
| Backtest | `npx tsx packages/analyzer/src/index.ts backtest --run=3 --eval-date=2025-06-01` |
| Walk-forward | `npx tsx packages/analyzer/src/index.ts walk-forward --from=2024-01 --to=2025-12` |
| Add macro data | `npx tsx packages/analyzer/src/index.ts macro add --gdp=6.8 --cpi=4.5` |
| Check macro regime | `npx tsx packages/analyzer/src/index.ts macro regime` |
| View scoring rubric | `npx tsx packages/analyzer/src/index.ts rubric` |
| Start dashboard | `npm run dashboard` |
| Database browser | `npm run db:studio` |
| Build | `npm run build` |
| Clean build | `npm run clean && npm run build` |
| Test LLM pipeline (1 co) | `npx tsx scripts/test-pipeline-1.ts` |
| Test LLM pipeline (10 co) | `npx tsx scripts/test-pipeline-10.ts` |
| Test single company E2E | `npx tsx scripts/test-adani-power.ts` |
| Diagnose LLM | `npx tsx scripts/diagnose-llm.ts` |
| Fetch historical prices | `python scripts/fetch-prices.py` |
| Re-run analysis (homelab) | `kubectl create job screener-analyze-manual --from=cronjob/screener-pipeline -n screener-automation -- pipeline:analyze` |
| Check scrape data (homelab) | `kubectl port-forward -n postgres svc/postgres-rw 5433:5432` then `psql -h localhost -p 5433 -U screener -d screener` |
