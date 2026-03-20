# Beacon Vision

> This document is the north star for all agent work on the Beacon project.
> It is produced and maintained by the CTO agent during vision alignment with DG (Board).
> DG may edit this document directly -- the CTO treats it as authoritative.
> Last aligned: 2026-03-21

---

## 1. What Beacon Is

Beacon is an **autonomous value research engine** for Indian listed equities (~5,300 companies). It runs daily, aggregates signals, analyzes them through value investing frameworks, and maintains a running list of the most cheaply valued good stocks.

Beacon is a **recommendation system**. It advises. It never executes trades or takes financial action.

## 2. The Problem Beacon Solves

1. **Data aggregation**: Continuously collect signals across all listed Indian companies -- stock prices, financials, quarterly/annual reports, news, shareholder meetings.
2. **Signal analysis**: Score and rank companies using proven value investing frameworks (Buffett, Graham, Lynch, Pabrai, Dalio).
3. **Identification**: Surface the most indicative signals for cheaply valued, long-term investment stocks -- companies trading below their intrinsic true value.

## 3. What Success Looks Like

**Primary metric: % gains over Nifty 50 index, measured over 1-2 year holding periods.**

- Beacon picks ~10 stocks at a time.
- Target: **7 out of 10 beat the index modestly** (high hit rate, consistent outperformance).
- This is value investing, not speculation. We optimize for consistent, modest outperformance -- not moonshots with high failure rates.
- Success means a stockholder following Beacon's recommendations **consistently generates gains** above the benchmark.

## 4. Who Uses Beacon

**Today:** DG (founder/Board), making personal investment decisions.

**Tomorrow:** A broader public audience of value-oriented investors.

The product must be built to the quality and UX bar of a public tool, even while it serves one user. Every decision should assume others will eventually use this.

## 5. How Users Interact with Beacon

Two modes:

### Pull (Dashboard)
- Users open the dashboard to browse data, rankings, company analysis, and framework scores.
- UX is **clean and opinionated** -- closer to Robinhood than Bloomberg. Not a data dump; a research advisor.
- Beacon **has strong opinions with clear conviction**: "Company X is 35% undervalued, here's why" -- not just ranked tables.
- Commentary accompanies every recommendation with transparent reasoning.

### Push (Notifications)
- Daily summary notification.
- Alert when the watchlist changes: a new company enters the top X, or a previously top company is downgraded.

## 6. Trust Model

Users trust Beacon because of:

1. **Historical accuracy**: Backtesting results prove the model's recommendations would have outperformed. This is the primary trust signal.
2. **Transparency**: Every recommendation has a full reasoning chain -- which signals, which framework scores, which agent said what.
3. **Reproducibility**: Same input data produces the same quant scores. LLM layer may have minor variance, but the deterministic layer is rock-solid.
4. **No hallucinated data**: LLM agents work exclusively from real scraped data. No fabricated financial numbers, ever.

## 7. Investment Philosophy (Non-Negotiable)

Beacon follows **value investing principles** in the tradition of Buffett, Graham, Pabrai, Lynch, and Dalio:

- Buy companies trading below intrinsic value.
- Hold for 1-2 years minimum.
- Prioritize quality businesses with durable advantages.
- Never chase quick wins, momentum trades, or speculative plays.
- This philosophy is baked into every scoring model, every LLM prompt, every framework. It is not a parameter to be optimized away.

## 8. Current Priorities (Stack-Ranked)

1. **Signal quality**: Improve the quant model, add new data sources (quarterly results, news, shareholder meetings), refine LLM analysis. If the picks aren't good, nothing else matters.
2. **User experience**: Dashboard polish, notifications, making Beacon feel like a product worth showing someone.
3. **Reliability & trust**: Tests, error handling, structured logging -- so Beacon runs correctly every day without babysitting.
4. **Automation**: Daily runs, alerts, self-healing pipeline -- fully autonomous operation.

## 9. The Evolution Loop

Beacon's scoring model, LLM prompts, and financial logic **evolve over time** through a disciplined experimental process:

### Principles
- **Genetic model**: Propose variants, test them, keep the survivors.
- **One dimension at a time**: Only tweak one variable per experiment so improvement can be attributed and documented.
- **Backtest over at least 2 full market cycles**: No change is accepted based on short-term data.
- **Any positive delta is sufficient**: If a change demonstrably improves % gains over Nifty 50, it ships. No minimum threshold beyond positive.
- **Document everything**: Every experiment, every result, every decision. The evolution history is itself valuable.

### Process
1. Agent proposes a change to one dimension (scoring weight, prompt wording, disqualifier threshold, etc.).
2. Change is A/B tested or backtested against historical data (minimum 2 full market cycles).
3. Results are documented with clear attribution of what changed and what improved.
4. Only changes that show positive delta on the primary metric get merged.
5. Over time, the model evolves toward better stock selection.

## 10. Agent Autonomy Boundaries

### Agents CAN change (with experimental validation):
- **Scoring rubric and framework weights** (`principles/` directory) -- this is the job. Must be driven by the primary metric.
- **LLM prompts** (agent system prompts in the analyzer) -- experiment freely, prove results.
- **Financial logic** (quant scoring formulas, composite weights, disqualifier logic) -- same rules: one dimension, backtest, document.
- **Pipeline architecture** -- if restructuring improves signal quality or reliability.

### Agents CANNOT change (Board approval required):
- **Database schema** -- propose via GitHub issue, discuss with Board, implement only after approval.
- **Deployment configuration** -- Dockerfiles, K8s manifests, CI/CD workflows, ArgoCD config.
- **Dependencies** -- additions or upgrades must be justified; Board approves at merge.

### Agents MUST NEVER:
- Modify `.env` files or secrets.
- Use `git push --force`, `git reset --hard`, `git clean`.
- Delete files not created by the agent in the same PR.
- Run commands with `sudo`.
- Publish packages.
- Modify the CLAUDE.md guardrails file.

## 11. Non-Negotiable Quality Standards

1. **Data accuracy**: Scraped numbers must exactly match source (Screener.in). No silent data corruption.
2. **Transparency**: Every recommendation has a traceable reasoning chain.
3. **No hallucinated data**: LLM agents must never fabricate financial numbers.
4. **Reproducibility**: Deterministic quant layer produces identical results for identical inputs.
5. **No blind automation**: Beacon recommends. Humans decide. No auto-trading, ever.
6. **Value investing discipline**: The system must never drift toward momentum trading, speculation, or short-term plays.

## 12. Data Accuracy Standard

Scraped financial data is the foundation of everything. A single wrong number can cascade through scoring, analysis, and recommendations. Data integrity is treated as a **critical system property**:

- Scraper output must be validated against source.
- Any data anomaly (missing fields, impossible values, sudden large changes) must be flagged, not silently passed through.
- The pipeline should fail loudly rather than produce analysis based on corrupt data.

---

*This document was produced during a vision alignment session between the CTO agent and DG (Board) on 2026-03-21. It supersedes any prior vision statements and serves as the authoritative guide for all Beacon development.*
