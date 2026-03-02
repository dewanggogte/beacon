# Indian Stock Market Screener & Analysis Pipeline

## Project Overview

An automated pipeline to identify high-potential and high-risk stocks in the Indian stock market using data scraped from Screener.in, value investing principles from world-class investors, and LLM-powered analysis.

**Goal:** Risk-adjusted returns, not maximum returns. Identify assets likely to perform very well (long candidates) and very poorly (short/avoid candidates) over a 6-month to 1-year horizon.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    OVERALL PIPELINE                           │
│                                                              │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐ │
│  │   TASK 2     │    │   TASK 1      │    │     TASK 3       │ │
│  │  Investment  │───▶│  Screener.in  │───▶│    Analysis &    │ │
│  │  Principles  │    │  Data Scraper │    │    Ranking       │ │
│  │  Research    │    │               │    │                  │ │
│  └─────────────┘    └──────────────┘    └──────────────────┘ │
│     (Run First)       (Weekly Cron)       (After Task 1)     │
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                  WEB DASHBOARD                           │ │
│  │  - Ranked stock list (long & short candidates)           │ │
│  │  - Per-stock detail view with scores                     │ │
│  │  - Historical comparison (week-over-week changes)        │ │
│  │  - Principles reference panel                            │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## Execution Order

1. **Task 2 (Investment Principles Research)** — Run FIRST, independently. This produces the `investment-principles.md` and `scoring-rubric.json` that Task 3 depends on. This is a one-time task, re-run periodically (monthly/quarterly) to update principles.

2. **Task 1 (Screener.in Data Scraping)** — Run weekly on a schedule (cron). Scrapes all companies from Screener.in into a structured database.

3. **Task 3 (Analysis & Ranking)** — Run after Task 1 completes. Uses the database from Task 1 and the principles from Task 2 to produce ranked lists.

---

## Tech Stack

> **Note:** This was the original spec. See `PRD.md` for the current, authoritative tech decisions.

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Scraper | Node.js + native fetch + Cheerio | HTTP-first (no headless browser). Screener.in has no Cloudflare/anti-bot |
| Database | PostgreSQL 17 + Drizzle ORM | Structured queries, JSONB for flexible data, type-safe schema-as-code |
| LLM Analysis | Anthropic Claude API OR local Qwen 3.5 (35B) via SGLang | Dual-provider: cloud (Haiku/Sonnet) for quality, local for cost. 4-agent architecture |
| Web Dashboard | Next.js 15 + Tailwind CSS 4 | Bloomberg-terminal aesthetic, Server Components |
| Scheduling | K8s CronJob | Runs on homelab K3s cluster |
| Infrastructure | K3s cluster, ArgoCD, CNPG PostgreSQL | Deployed at `screener.nikamma.in` (internal) |

---

## Data Scale

- **NSE**: ~2,781 companies (as of Feb 2026)
- **BSE**: ~5,667 companies (as of Feb 2026)
- **Screener.in** covers companies listed on both exchanges, with significant overlap
- **Estimated unique companies on Screener.in**: ~5,000-6,000
- **Per-company data points**: 50-100+ (financials, ratios, quarterly results, shareholding, etc.)
- **Total estimated data**: ~500K-600K data cells per scrape cycle

---

## Project Structure

> **Note:** This was the original spec. See `PRD.md` section 6 for the current, authoritative structure.

```
screener-automation/
├── PRD.md                             # Living design document (authoritative)
├── docs/                              # Original spec documents (historical)
├── packages/
│   ├── shared/                        # @screener/shared (DB, types, config, logger)
│   ├── scraper/                       # @screener/scraper (HTTP + Cheerio)
│   ├── analyzer/                      # @screener/analyzer (scoring, frameworks, LLM, backtest, macro)
│   └── dashboard/                     # @screener/dashboard (Next.js 15)
├── principles/                        # Scoring rubric + framework configs
│   ├── scoring-rubric.json
│   └── frameworks/                    # Buffett, Graham, Lynch, Pabrai configs
├── scripts/                           # Test & utility scripts
├── Dockerfile                         # Multi-stage (3 entrypoint modes)
└── .github/workflows/                 # CI/CD → GHCR → ArgoCD
```

---

## Key Design Principles

1. **Risk-adjusted returns over maximum returns.** We optimize for Sharpe ratio, not raw returns. The system should help avoid catastrophic losses more than it chases moonshots.

2. **Long AND short identification.** Following Dalio's principle of spread — identify both stocks likely to outperform and underperform. This enables hedged strategies.

3. **Data integrity first.** Every data point must be traceable to its source and timestamp. No stale data in analysis.

4. **Stealth and sustainability.** The scraper must operate indefinitely without being blocked. Conservative rate limiting and human-like behavior over speed.

5. **Separation of concerns.** Quantitative filtering (code-based) and qualitative analysis (LLM-based) are distinct layers. The LLM enhances but doesn't replace rule-based scoring.

6. **Comprehensive documentation.** Every decision, every threshold, every principle must be documented. This is real money — no black boxes.

---

## Weekly Pipeline Flow

> **Note:** Timings updated to reflect actual implementation.

```
Saturday ~2:00 AM IST ── Scraper starts (markets closed, data stable)
    ├── Fetch company list (search API, ~5,300 companies)
    ├── Scrape company detail pages (HTTP + Cheerio, ~18-24 hrs)
    ├── Store snapshots in PostgreSQL (JSONB)
    │
~Next day ── Scraper completes
    ├── Layer 1: Quantitative scoring + 4 framework evaluators (<5 min)
    ├── Layer 2: Multi-agent LLM (4 agents, tiered, 2-8 hrs depending on provider)
    ├── Post-validation cross-checks
    ├── Generate reports + save to DB
    │
Sunday ── Dashboard updated at screener.nikamma.in
```

---

## Risk & Limitations

- **Scraper fragility**: Screener.in may change its HTML structure at any time. Modular parsers per section. Validation warns on missing fields.
- **Bot detection**: Weekly cadence + conservative rate limiting + realistic headers. Playwright fallback available but not needed so far.
- **LLM hallucination**: Mitigated by post-validation layer that cross-checks LLM claims against quantitative data. LLM is advisory (+/-15 points max), not decisive.
- **Data staleness**: Screener.in data has filing latency. Weekly scrape is adequate for medium-term (6-12 month) analysis.
- **NOT financial advice**: This is a personal research and analysis tool. All investment decisions are the user's responsibility.

---

## Related Documents

- [Task 1: Scraper Requirements](./01-TASK1-SCRAPER.md)
- [Task 2: Investment Principles Research](./02-TASK2-PRINCIPLES.md)
- [Task 3: Analysis & Ranking](./03-TASK3-ANALYSIS.md)
