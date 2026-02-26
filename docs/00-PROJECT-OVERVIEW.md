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

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Scraper | Node.js + Puppeteer (puppeteer-extra + stealth plugin) | Best stealth ecosystem for anti-detection |
| Database | PostgreSQL | Structured, queryable, supports complex joins and time-series |
| LLM Analysis | Qwen 4B (locally hosted) | Privacy, no API costs, runs on home server |
| Web Dashboard | Next.js or Astro + React | Familiar stack, SSR for fast loads |
| Scheduling | Cron (systemd timers) | Native Linux, reliable, no extra dependencies |
| Infrastructure | Home Kubernetes cluster | Already running on Mukul's home server |

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

```
indian-stock-screener/
├── README.md                          # Quick start, how to run
├── docs/
│   ├── 00-PROJECT-OVERVIEW.md         # This file
│   ├── 01-TASK1-SCRAPER.md            # Scraper requirements
│   ├── 02-TASK2-PRINCIPLES.md         # Investment principles research requirements
│   ├── 03-TASK3-ANALYSIS.md           # Analysis & ranking requirements
│   ├── ideology.md                    # Investment ideology & philosophy
│   ├── tech-decisions.md              # Why we chose each technology
│   ├── anti-detection-playbook.md     # Bot evasion strategies
│   └── data-dictionary.md             # Every field we scrape and what it means
├── packages/
│   ├── scraper/                       # Task 1: Puppeteer scraper
│   │   ├── src/
│   │   │   ├── browser/               # Browser setup, stealth config
│   │   │   ├── scrapers/              # Per-page scraping logic
│   │   │   ├── human/                 # human_click, human_type, human_scroll
│   │   │   ├── anti-detect/           # Proxy rotation, fingerprint management
│   │   │   └── db/                    # Database write layer
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── analyzer/                      # Task 3: LLM-based analysis
│   │   ├── src/
│   │   │   ├── scoring/               # Quantitative scoring engine
│   │   │   ├── llm/                   # Qwen integration for qualitative analysis
│   │   │   └── output/                # Report generation
│   │   └── package.json
│   └── dashboard/                     # Web dashboard
│       ├── src/
│       └── package.json
├── principles/                        # Task 2 output
│   ├── investment-principles.md       # Curated principles document
│   ├── scoring-rubric.json            # Machine-readable scoring criteria
│   ├── red-flags.md                   # What to avoid
│   └── investor-profiles.md           # Per-investor philosophy summaries
├── k8s/                               # Kubernetes manifests
│   ├── scraper-cronjob.yaml
│   ├── postgres.yaml
│   ├── dashboard-deployment.yaml
│   └── analyzer-job.yaml
├── scripts/
│   ├── setup-db.sql                   # Database schema
│   ├── run-pipeline.sh                # Orchestrates Task 1 → Task 3
│   └── healthcheck.sh                 # Verify all services running
└── docker/
    ├── Dockerfile.scraper
    ├── Dockerfile.analyzer
    └── Dockerfile.dashboard
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

```
Saturday 2:00 AM IST ─── Scraper starts (markets closed, data stable)
                    │
                    ├── Phase 1: Get company list (all companies page)
                    ├── Phase 2: Scrape each company detail page
                    │   ├── Financial ratios
                    │   ├── Quarterly results
                    │   ├── Profit & Loss
                    │   ├── Balance Sheet
                    │   ├── Cash Flow
                    │   ├── Shareholding pattern
                    │   └── Peer comparison
                    ├── Phase 3: Store in PostgreSQL with timestamp
                    │
Saturday ~8:00 AM ──── Scraper complete
                    │
                    ├── Phase 4: Run quantitative scoring (code-based)
                    ├── Phase 5: Run LLM analysis on top candidates (Qwen 4B)
                    ├── Phase 6: Generate ranked output
                    │
Saturday ~10:00 AM ─── Dashboard updated with new data
                    │
                    └── Notification sent (optional)
```

---

## Risk & Limitations

- **Scraper fragility**: Screener.in may change its HTML structure at any time. Build selectors that are resilient and log warnings on structural changes.
- **Bot detection**: Weekly cadence reduces risk, but Screener.in may still detect and block. The anti-detection system must be robust. See `anti-detection-playbook.md`.
- **LLM hallucination**: Qwen 4B is a small model. It may produce incorrect analysis. Always cross-reference LLM output with quantitative scores. The LLM is advisory, not decisive.
- **Data staleness**: Screener.in data itself has latency (typically updated within days of filings). Our weekly scrape adds another layer. For time-sensitive decisions, manual verification is needed.
- **NOT financial advice**: This is a research and analysis tool. All investment decisions are the user's responsibility.

---

## Related Documents

- [Task 1: Scraper Requirements](./01-TASK1-SCRAPER.md)
- [Task 2: Investment Principles Research](./02-TASK2-PRINCIPLES.md)
- [Task 3: Analysis & Ranking](./03-TASK3-ANALYSIS.md)
