# Architecture

## Overview

A monorepo with 4 npm workspace packages that form a weekly pipeline: scrape financial data, score companies, run LLM analysis, display in a dashboard.

```
                     +-----------+
                     | Screener  |
                     |   .in     |
                     +-----+-----+
                           |
                     HTTP + Cheerio
                           |
                     +-----v-----+         +--------------+
                     |  SCRAPER  |-------->| PostgreSQL 17|
                     | @scraper  |         |              |
                     +-----------+         |  companies   |
                                           |  snapshots   |
                     +-----------+         |  analysis    |
   principles/ ----->|  ANALYZER |-------->|  price_hist  |
   (rubric +         | @analyzer |         |  backtest    |
    frameworks)      +-----+-----+         |  macro       |
                           |               +---------+----+
                     LLM (Anthropic                   |
                      or local Qwen)                  |
                                           +----------v---+
                                           |  DASHBOARD   |
                                           | @dashboard   |
                                           |  Next.js 15  |
                                           |  :3000       |
                                           +--------------+
```

## Packages

### @screener/shared

Foundation package. All other packages depend on it.

- **DB**: Drizzle ORM client + schema definitions (7 tables)
- **Config**: Zod-validated environment variables
- **Types**: `CompanyAnalysis`, `FrameworkResults`, `EnrichedSnapshot`, etc.
- **Logger**: Structured logging with timestamps

### @screener/scraper

Fetches data from Screener.in. HTTP-first approach (no headless browser needed).

- **Company list**: Search API + 2-letter combos discover ~5,300 companies
- **Company detail**: Parses each company's consolidated page (ratios, financials, shareholding, peers)
- **Anti-blocking**: Random delays (2-8s), batch breaks, session breaks, randomized order, realistic headers
- **Storage**: Saves to `company_snapshots` table with JSONB columns for flexible data

### @screener/analyzer

The scoring and analysis engine. Three layers:

**Layer 1 -- Quantitative Scoring** (deterministic, <5 min for all companies):
- 5 dimensions: valuation (25%), quality (30%), governance (20%), safety (15%), momentum (10%)
- 21 metrics with sector-specific thresholds (IT, Banking, Pharma, Manufacturing, FMCG)
- 8 automatic disqualifiers (promoter pledge >50%, negative net worth, D/E >3, etc.)
- Classification: strong\_long (>=80), potential\_long (>=65), neutral (>=40), potential\_short (>=20), strong\_avoid (<20)

**Layer 1.5 -- Framework Evaluators** (deterministic):
- Buffett checklist (10 criteria: moat, ROE consistency, margins, low debt)
- Graham screen (10 criteria: P/E, P/B, earnings stability, Graham number)
- Lynch classifier (6 categories: fast\_grower, stalwart, slow\_grower, cyclical, turnaround, asset\_play)
- Pabrai risk (6 factors: leverage, business simplicity, management, concentration, regulatory, cyclical)
- Classification-aware composite with conviction scoring (high/medium/low/none)

**Layer 2 -- Multi-Agent LLM** (tiered funnel):

```
  All ~5,300 companies
        |
  Layer 1 quant rank
        |
        v
  +--- Tier 1 (top 100) --------+
  |  AG1 -> AG2 -> AG3 -> AG4   |  ~100 full evaluations
  +------------------------------+
        |
  +--- Tier 2 (next 500) -------+
  |  AG1 screening               |
  |  promotion_score =            |
  |    AG1_score*0.6 +            |
  |    quant_score*0.4 +          |
  |    confidence_bonus +         |
  |    trend_bonus                |
  |  Top 100 promoted -> AG2-AG4 |  ~100 promoted evaluations
  +------------------------------+
        |
  +--- Bottom (~4,700) ---------+
  |  No LLM. Layer 1 score stands|
  +------------------------------+

  Total AG4 evaluations: ~200 (100 Tier 1 + 100 promoted)
```

| Agent | Role | Output | Key features |
|-------|------|--------|-------------|
| AG1 Fundamentals | Financial trends, valuation, earnings quality | `score` (0-100); quant score passed as reference signal | 5-step CoT, peer comparison data |
| AG2 Governance | Promoter behavior, institutional signals | `score` (0-100) | 4-step CoT, 12-quarter shareholding analysis |
| AG3 Risk | Downside scenarios, Pabrai risk hierarchy | `score` (0-100) | 5-step CoT, devil's advocate mandate (min 2 risks) |
| AG4 Synthesis | CIO combining AG1-3 into investment thesis | `score` (0-100), `recommended_classification`, `classification_reasoning` | 5-step CoT, macro regime context, 7-gate conviction calibration, full authority to override quant classification and conviction |

Tiered execution (funnel model):
- **Tier 1** (top 100 by quant rank): Direct AG1 -> AG2 -> AG3 -> AG4
- **Tier 2** (next 500): AG1 screening only. Promotion score = (AG1\_score \* 0.6) + (quant\_score \* 0.4) + confidence\_bonus + trend\_bonus. Top 100 promoted to AG2 -> AG3 -> AG4
- **Bottom** (rest): No LLM, Layer 1 score stands
- **Targeted mode** (`--companies` or `--sectors`): Bypasses tiering entirely -- all matching companies get full AG1-AG4 regardless of rank

**LLM-only mode** (`--llm-only`): Loads existing Layer 1 results from the database and re-runs only the LLM layer. Useful for re-evaluating companies after LLM prompt changes without re-scoring quant metrics. Combines with `--companies`/`--sectors`/`--limit` for targeted re-evaluation.

**Dual evaluation**: Each company retains both its quant-derived and AG4-derived classifications:
- `quantClassification` / `quantConvictionLevel` -- preserved from Layer 1
- `classificationSource`: `quant` or `ag4` -- indicates which system set the final classification
- If AG4 evaluates a company, it has full authority to override classification and conviction in both directions. `classificationSource` = `ag4`

**Post-validation** cross-checks LLM claims against quantitative data:
- "Improving" trend with declining revenue gets overridden
- Disqualified companies cannot be classified `strong_long` or `potential_long` by AG4
- Max divergence detection: logged when AG4 disagrees by 2+ classification levels or 25+ point score delta
- Divergence watcher (`divergence-watcher.ts`) generates HTML/JSON report post-pipeline, emails to hello@dewanggogte.com via nodemailer

**LLM Providers** (set via `LLM_PROVIDER` env var):
- `anthropic`: Claude Haiku (AG1-3) + Sonnet (AG4), ephemeral prompt caching
- `local`: Qwen 3.5-35B (all agents) via SGLang/vLLM, thinking mode disabled

**Additional modules**:
- Backtesting: Historical price data (yfinance), performance calculator, walk-forward validation
- Macro overlay: Regime classifier (goldilocks/reflation/stagflation/deflation), score adjustments per regime
- Divergence watcher (`divergence-watcher.ts`): Post-pipeline analysis of quant vs AG4 disagreements, generates HTML/JSON report, emails via nodemailer

### @screener/dashboard

Next.js 15 app with Tailwind CSS 4. Warm, minimal light theme (Beacon).

**Pages**:

| Page | Route | Content |
|------|-------|---------|
| Home | `/` | High conviction picks, tabbed classification view, market snapshot |
| Overview | `/overview` | Visual pipeline explainer — stages, scoring dimensions, agents, analysis funnel |
| Rankings | `/rankings` | Full sortable/filterable company table, "A" icon for AG4-evaluated companies |
| Conviction | `/conviction` | Companies filtered by conviction level |
| Frameworks | `/frameworks` | Framework scores table (Buffett/Graham/Lynch/Pabrai) |
| Backtest | `/backtest` | Backtest results, walk-forward analysis, setup instructions, GitHub link |
| Company | `/company/[code]` | Score breakdown, agent analysis panels, framework details, QUANT/AG4 badge |
| Pipeline | `/pipeline` | Pipeline status and run history |

## Database Schema

PostgreSQL 17, managed by Drizzle ORM. 7 tables:

| Table | Purpose |
|-------|---------|
| `companies` | Master list (~5,300 companies, screener_code, name, sector, BSE/NSE codes) |
| `scrape_runs` | Metadata per scrape cycle (started_at, status, success/fail counts) |
| `company_snapshots` | One row per company per scrape run. Flat ratios + JSONB financials/shareholding/peers |
| `analysis_results` | Scoring output per company per run. Layer 1 + Layer 2 + final score + classification. Includes `quant_classification`, `quant_conviction_level`, `classification_source` columns for dual evaluation tracking |
| `price_history` | Daily OHLCV from Yahoo Finance (for backtesting) |
| `backtest_runs` | Backtest configuration and aggregate results |
| `macro_snapshots` | Point-in-time macro data (repo rate, CPI, GDP, Nifty P/E, VIX, USD/INR, bond yield) |

## Deployment

Deployed to K3s homelab cluster. Internal only at `screener.nikamma.in`.

```
GitHub push
    |
    v
GitHub Actions CI
    |
    v
Docker build (amd64) --> ghcr.io/dewanggogte/screener-automation:latest
    |
    v
ArgoCD detects new image --> K3s rollout restart
```

| Component | Detail |
|-----------|--------|
| Image | `ghcr.io/dewanggogte/screener-automation:latest` |
| Namespace | `screener-automation` |
| Database | CNPG-managed PostgreSQL (`postgres-rw.postgres.svc.cluster.local:5432`) |
| Secrets | `screener-secrets` SealedSecret (DATABASE\_URL + ANTHROPIC\_API\_KEY) |
| Ingress | Internal at `screener.nikamma.in` |
| Health | `/api/healthz` (K8s readiness + liveness probes) |
| Pipeline | Weekly CronJob |

Docker entrypoint modes: `dashboard` (default), `pipeline`, `pipeline:scrape`, `pipeline:analyze`, `pipeline:quick`, `migrate`. All modes pass through extra arguments, so `pipeline:analyze --companies=RELIANCE,TCS` works.
