# Development Log

Problems encountered, how they were solved, and interesting findings along the way. Useful for blog posts and future reference.

---

## 2026-03-20: Building a human-in-the-loop scoring iteration tool

### The idea

The quant model can't be debugged by looking at code. You have to look at what it produces — which companies score high, and whether those companies actually deserve it. The only reliable judge is qualitative analysis (reading the financials and forming an opinion). That's expensive if done by the LLM pipeline ($10/run, 7 hours), so we built a faster loop using Claude Code as the analyst.

### The iteration loop

1. Run the scoring engine on all 5,800 companies, write to local JSON (not the DB)
2. Take the top 100, have Claude perform AG1-AG4 analysis on each
3. Compare quant scores to Claude's scores — find divergences
4. The divergences tell you exactly what the quant model is getting wrong
5. Fix the scoring code, repeat

### What made it work

The key insight was making it stateless and file-based. Each version (`v3.0`, `v3.1`, `v3.2-final`) gets its own directory with scores, company data, and analysis results. Nothing overwrites anything. You can always go back and compare.

The `quant-iterate.ts` script handles scoring, file preparation, comparison, and reporting in one command. It's state-aware — run it once to score and prepare, run it again after Claude analysis to compare and report. No manual file juggling.

Dispatching 5 parallel Claude agents (20 companies each) takes about 8 minutes and provides 100 independent investment analyses. Each one reads the actual financials — revenue trends, cash flow, promoter behavior, debt trajectory — not just the scores. When Claude says "SHAKTIPUMP has 5% OCF/profit and 152-day debtors," that's a concrete bug report for the quant model.

### Results across three iterations

| Metric | v3.0 | v3.1 | v3.2 |
|--------|------|------|------|
| Agreement rate | 6% | 6% | 9% |
| Avg divergence | 33.7 | 31.3 | 29.3 |
| Strong longs confirmed | 3 | 6 | 8 |
| Known-bad caught | 0/5 | 2/5 | 5/5 |

Each iteration found and fixed specific failure modes: v3.1 caught promoter pledge parsing from text, added OCF gates, data completeness checks. v3.2 tightened the OCF gate to catch latest-year collapses, made extreme other income a hard disqualifier, and added cyclical sector penalties.

---

## 2026-03-20: Quant model v3 — iterative improvement

### The starting problem

The v2 quant model used an additive weighted average to combine framework scores and dimension scores. This meant a high valuation score could fully compensate for terrible business quality. RAMCOIND (ROCE 3.6%, ROE 4.4%) scored 81 (strong_long) because its Graham score (92) and valuation score (95) overwhelmed its quality score (49).

In run 7, AG4 (the LLM synthesis agent) downgraded every single one of the top 100 quant-ranked companies. 88 of 127 potential_longs were reclassified to strong_avoid. The quant model was systematically sending value traps to the expensive LLM pipeline.

### v3.0: Geometric mean + hard gates

Replaced the additive composite with a geometric mean: `quality^0.30 * valuation^0.25 * governance^0.20 * safety^0.15 * momentum^0.10`. Key property: if any dimension is weak, the total score collapses. Added 5 hard gate disqualifiers: Piotroski F-Score <= 2, Altman Z-Score < 1.8, ROCE 3Y avg < 6%, revenue declining 4+/5 years, Beneish M-Score > -1.78.

**Result**: 96 strong_longs, 9 high conviction. But Claude cross-validation of the top 100 found only 3 genuinely deserved strong_long (NEWGEN, PETRONET, BLS). Average divergence: 33.7 points.

### v3.1: Filling the gaps

**Problem 1: Promoter pledge not caught**. AFCONS (53.5% pledged) and GPTINFRA (50.8%) passed the existing >50% pledge disqualifier because the flat snapshot field `promoterPledge` was null — Screener.in stores pledge data in the cons text, not a structured field.

**Fix**: Parse pledge percentage from the cons text using regex: `consText.match(/[Pp]romoters?\s+have\s+pledged\s+(\d+\.?\d*)%/)`. Added as a new hard gate.

**Problem 2: Cash flow disconnects**. SHAKTIPUMP reported 329 Cr profit but only 20 Cr operating cash flow. The OCF/profit gate used a 3-year average, which masked the latest-year problem.

**Fix (partial)**: Added OCF/profit ratio < 0.2 as a disqualifier. Catches chronic liars but not single-year collapses (3Y average smooths them out).

**Problem 3: Other income inflation**. ASHOKA showed 80%+ of profit from asset sales, not operations. The quant model didn't distinguish operating from non-operating income.

**Fix**: Added `otherIncomeToProfit` metric (computed as `(netProfit - operatingProfit) / netProfit`) and tiered quality penalties. Applied as soft penalty, not hard gate.

**Result**: 6 strong_longs confirmed (doubled). AFCONS/GPTINFRA/SOLARWORLD now caught. Average divergence: 31.3 points.

### v3.2: Tuning the penalties

Three issues survived v3.1:

**Problem 1: Acute OCF collapse slips through**. SHAKTIPUMP's latest-year OCF is 5% of profit, but 3Y average is 0.68 (prior good years inflate the average). The gate rule required `latest < 0.1 AND 3Y < 0.4` — too lenient.

**Fix**: Changed to disqualify if latest year OCF/profit < 0.1, regardless of 3Y average.

**Problem 2: Other income penalty too weak for extreme cases**. ASHOKA (82% other income) only got a -3 quality point penalty. A 20% penalty on a score of 76 rounds to just 15 → capped at 3 after rounding.

**Fix**: Moved extreme other income (> 60%) from a quality penalty to a hard gate disqualifier.

**Problem 3: Cyclical peaks undetectable via margin ratios**. COALINDIA, HINDALCO, NMDC have consistently high margins across the 5Y window because the commodity supercycle lasted longer than 5 years. The `opmAvg5YToCurrentRatio` is ~1.0, so no penalty triggers.

**Fix**: Cross-reference with cyclical sector list + Piotroski score. A company in a cyclical sector with Piotroski <= 4 (declining fundamentals) gets a quality penalty even if margins look stable — the Piotroski score catches the underlying deterioration that margins haven't reflected yet.

### Key insight

The quant model's job is to be a filter, not a standalone signal. Measuring its quality by cross-validating against Claude's AG1-AG4 analysis creates a tight feedback loop: score → analyze top 100 → find divergences → fix → repeat. Each iteration closes specific gaps. The agreement rate moved from 6% to 6% (flat by the tight 10-point metric), but strong_long confirmations doubled from 3 to 6, and the model stopped sending the worst offenders (pledge fraud, cash flow liars, other income inflation) to the LLM.

---

## 2026-03-20: 41% of companies have empty snapshots — consolidated vs standalone URL bug

### The discovery

While investigating why the quant model only scored ~3,485 of 5,868 companies, we found that 2,383 snapshots (41%) are completely empty — no ratios, no financial tables, nothing. The scraper successfully fetched these pages but got back empty data.

### Root cause

The scraper always fetches `/company/{CODE}/consolidated/`. On Screener.in, the `/consolidated/` page only has data for companies that file consolidated financial statements. Companies that only file standalone financials (roughly half of all listed companies) have an empty `/consolidated/` page — the key ratios and financial tables are blank.

The same companies have full data at `/company/{CODE}/` (the standalone URL). Ujjivan SFB, Shanthi Gears, and Interarch Building Solutions all showed empty at `/consolidated/` but had complete data at the standalone URL.

### The breakdown

- 2,061 empty snapshots are real companies (have a sector assigned) — these almost certainly have standalone data
- 322 have no sector — a mix of ETFs/indices (NAQVLV30PE = "Nifty Alpha Quality Value Low-Volatility 30"), defunct entities, and shell companies with no data anywhere on Screener.in
- Only 5 out of 2,383 had partial data (some JSONB tables but no ratios)

### The scraper's assumption

The scraper was built with the assumption that all companies on Screener.in have consolidated financials at `/consolidated/`. There's no fallback logic, no retry with the standalone URL, and no flag in the database tracking which URL the data came from. The validation function warns about missing tables but saves the empty snapshot anyway.

### Fix design

**Pre-classification (zero extra HTTP requests)**: The search API already returns the correct URL — `/company/UJJIVAN/consolidated/` for companies with consolidated data, `/company/UJJIVANSFB/` for standalone-only. The scraper currently ignores this URL and hardcodes `/consolidated/` for everything. Fix: use the URL from the search API directly.

**Entity type detection**: Indices/ETFs (like "Nifty 50", "Nifty Alpha Quality Value Low-Volatility 30") come from the search API with no distinguishing field. Detect by: name pattern matching (contains "Nifty", "ETF", "Index", "Sensex"), or after scraping if the page has no sector and no financial data. Store as an `entity_type` column ('company' | 'index' | 'etf' | 'unknown') on the companies table.

**No entities are skipped** — indices and ETFs are still scraped and analyzed. The entity flag lets downstream code filter them if needed, but they're valid investment targets (if Nifty 50 is cheap, buy the index).

---

## 2026-03-22: Quant-only re-runs overwrite LLM data

### The problem

Run 9 had 198 AG4-classified companies and 599 with LLM analysis from a successful Qwen pipeline run. Then run 11 (a quant-only analysis on the same data) saved results with `llmAnalysis: null` for all companies. The upsert on `(company_id, scrape_run_id)` blindly overwrote all fields including LLM data with nulls. The dashboard then picked run 11 (higher ID, no LLM) over run 9 (lower ID, has LLM).

### Root cause

The `save-analysis.ts` upsert does `set: { ...values }` which replaces every column. When the LLM is skipped or fails, LLM fields are null in the values object, so the upsert nulls out whatever LLM data was there from a prior analysis on the same scrape run.

### The fix

Two changes:

1. **Selective upsert**: LLM fields (`llmAnalysis`, `llmAdjustment`, `classificationSource`) only overwrite existing data if the new values are non-null. A quant-only run preserves existing LLM results instead of erasing them.

2. **Dashboard run selection**: `getLatestRunId()` now prefers runs with AG4 data, falling back to the latest run with any analysis. This prevents a quant-only run from shadowing a prior LLM-enriched run.

### Key insight

The pipeline treats each save as a full replacement, but in practice runs are incremental — quant scores update frequently, LLM runs happen less often. The save logic needs to be additive for LLM fields, not replacement.

---

## 2026-03-20: Beacon rebrand

Renamed from "Screener Automation" to "Beacon — Autonomous Value Research". Required updating: package.json name, GitHub repo name (dewanggogte/screener-automation → dewanggogte/beacon), GHCR container image tag, all K8s manifests (namespace, service names, ingress, sealed secrets), ArgoCD app, deploy workflow, all documentation, memory files.

The sealed secrets had to be re-sealed for the new namespace because kubeseal encrypts against the namespace. Re-sealing requires: extract plaintext from cluster → create new secret manifest targeting new namespace → seal with kubeseal → deploy.

---

## 2026-03-20: VXLAN overlay breakage between homelab nodes

Public access to beacon.nikamma.in returned 504 because the flannel VXLAN overlay between the two K3s nodes (`nikamma` local and `nikamma-linode` remote) was broken. UDP traffic between nodes wasn't getting through, preventing pod-to-pod communication across nodes.

Diagnosis: `kubectl exec` from the public Traefik pod (on Linode) couldn't even DNS-resolve services on the local node. wget to the service ClusterIP returned "bad address". The Linode node's K3s agent needed to be restarted to re-establish the VXLAN tunnel.

---

## 2026-03-17: LLM_PROVIDER empty string crash

The homelab dashboard threw a 500 error because the Zod config validation rejected `LLM_PROVIDER=""` (empty string from the sealed secret). Zod's `.default('anthropic')` only kicks in for `undefined`, not empty string.

Fix: `z.preprocess((v) => (v === '' ? undefined : v), z.enum(['anthropic', 'local']).default('anthropic'))` — converts empty string to undefined before the enum check.

---

## 2026-03-17: Docker COPY gotcha

`COPY ... || true` doesn't work in Dockerfiles — COPY is a Docker instruction, not a shell command. Use `RUN cp ... || true` instead. Also, don't COPY directories that might not exist (e.g., `public/`). Buildx fails even if local Docker doesn't.
