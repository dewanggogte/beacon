# Quant Model v3: Multiplicative Gates + ML Ranking

## Problem

The current quant model uses an additive weighted average to combine framework scores and dimension scores. This lets a high valuation score compensate for terrible business quality. RAMCOIND (ROCE 3.6%, ROE 4.4%) scored 81 (strong_long) because its Graham score (92) and valuation score (95) overwhelmed its quality score (49). AG4 then spent LLM tokens to correctly identify it as a value trap and downgrade it to strong_avoid.

In run 7 (March 2026), AG4 downgraded every single one of the top 100 quant-ranked companies. 88 of 127 potential_long companies were reclassified to strong_avoid. Zero companies received a positive AG4 classification. The quant model is sending the wrong companies to the LLM pipeline.

## Goal

The quant model is a filter, not a standalone signal. Its job is to minimize false positives (don't send garbage to the LLM) while not missing genuinely good companies. A good filter means AG4 agrees with or upgrades the quant classification most of the time, not downgrades it 100% of the time.

## Release strategy

**v3.0** (this release): Hard gates + geometric mean composite. Structural fix, no ML.

**v3.1** (after 2-3 LLM runs on v3.0): XGBoost ranker trained on balanced AG4 data. The current AG4 labels are almost entirely negative (100% downgrades) because the broken v2 quant model only sent bad companies to the LLM. Training ML on biased labels would teach the model "everything is bad." v3.0 must produce better quant rankings first so AG4 sees a mix of good and bad companies, generating balanced training data.

## v3.0 design: Hard gates + geometric mean

### Stage 1: Hard gates (disqualify or pass)

Binary pass/fail checks. Failure on any gate = disqualified, classified as strong_avoid, excluded from LLM pipeline.

**Existing gates (keep all 8):**
1. Promoter pledge > 50%
2. Negative net worth
3. ASM/GSM listing
4. Qualified audit opinion
5. Negative OCF 3+ consecutive years
6. D/E > 3.0 (non-financial)
7. Net losses 3+ of last 5 years
8. Promoter holding decline > 10pp/year

**New gates:**
9. **Piotroski F-Score <= 2**: Binary 9-point quality score. Scores 0-2 indicate severe fundamental weakness. All inputs available from flattenV2 (ROA, OCF, ROA change, accruals, leverage change, current ratio change, share issuance, gross margin change, asset turnover change).
10. **Altman Z-Score < 1.8**: Bankruptcy prediction. Formula: 1.2*(WC/TA) + 1.4*(RE/TA) + 3.3*(EBIT/TA) + 0.6*(MCap/TL) + 1.0*(Rev/TA). Below 1.8 = distress zone. Use modified Z''-Score for non-manufacturing.
11. **ROCE < 6% (trailing 3-year average, non-financial)**: A company earning less than a fixed deposit is not investable. 3-year average smooths cyclical dips. Skip for banks/NBFCs where ROCE is structurally different.
12. **Revenue declining 4+ of last 5 years**: Structural shrinkage. Not a cyclical dip (that's 1-2 years), but a business in secular decline.
13. **Beneish M-Score > -1.78**: Earnings manipulation flag. 8-variable model detecting aggressive accounting. Flag rather than hard disqualify (high false positive rate ~17%), but exclude from LLM pipeline.

**Implementation**: New file `packages/analyzer/src/scoring/hard-gates.ts`. Runs before any scoring. Companies failing any gate get `disqualified: true` and skip all subsequent stages. Piotroski and Altman scores are also stored as metrics for the LLM data pack.

### Stage 2: Multiplicative composite score

Replace the additive V2 composite with a geometric mean.

**Current (additive):**
```
score = buf*w1 + gra*w2 + lyn*w3 + pab*w4 + dim*w5
```

**New (multiplicative):**
```
score = (quality ^ 0.30) * (valuation ^ 0.25) * (governance ^ 0.20) * (safety ^ 0.15) * (momentum ^ 0.10)
```

The inputs are dimension scores (0-100), not framework scores. Framework scores become inputs to the future ML ranker in v3.1.

**Why dimensions instead of frameworks**: The framework scores (Buffett, Graham, Lynch, Pabrai) overlap heavily with the dimension scores. Graham rewards low PE (= valuation dimension). Buffett rewards high ROE (= quality dimension). Blending both double-counts these signals. The future ML ranker (v3.1) can learn the non-redundant value of framework scores without manual weight tuning.

**Key property**: If quality = 10 (terrible business), the geometric mean collapses the score regardless of how cheap the stock is. RAMCOIND with quality 49 would score ~56 instead of 81. With the proposed ROCE gate, it wouldn't even reach this stage.

**Normalization**: Scores of 0 break geometric mean (anything^0 = 1, 0^anything = 0). Clamp all dimension scores to [1, 100] before computing.

**Classification thresholds**: Recalibrate after implementation. The geometric mean compresses high scores (a company needs to be good across all dimensions to score 80+). Run the new formula on historical data and adjust thresholds so the distribution is reasonable (~2-5% strong_long, ~10-15% potential_long).

### v3.0 pipeline flow

```
company_snapshots
    |
    v
[Hard Gates] --- fail ---> disqualified (strong_avoid, skip LLM)
    |
    pass
    v
[Dimension Scoring] (5 dimensions, 0-100 each)
    |
    v
[Framework Scoring] (Buffett, Graham, Lynch, Pabrai — stored, not blended)
    |
    v
[Geometric Mean Composite] (multiplicative, dimensions only)
    |
    v
[Tiering] (top 100 by composite -> Tier 1, next 500 -> Tier 2)
    |
    v
[LLM Pipeline] (AG1-AG4)
```

### Value trap detection (baked into the design)

The two stages each catch value traps differently:
- **Stage 1**: ROCE floor, revenue decline gate, Piotroski score catch the worst offenders
- **Stage 2**: Geometric mean prevents high valuation from compensating low quality

### New metrics to add to flattenV2

The following need to be computed in the enrichment step:

| Metric | Formula | Used by |
|--------|---------|---------|
| piotroskiFScore | 9 binary criteria summed | Hard gate |
| altmanZScore | 5-ratio weighted sum | Hard gate |
| beneishMScore | 8-variable detection model | Hard gate |
| roceTrailing3Y | avg(ROCE[-3:]) | Hard gate |
| revenueDeclineYears | count of YoY revenue declines in last 5 | Hard gate |

### DB changes

- Add columns to `analysis_results`: `piotroski_f_score INT`, `altman_z_score NUMERIC(6,2)`, `beneish_m_score NUMERIC(6,2)`, `gate_results JSONB`
- Migration: 0003

### Dashboard changes

- Company detail page: Show Piotroski, Altman, Beneish scores
- Overview page: Update funnel numbers after hard gates reduce the scored population

### What this does NOT change

- LLM pipeline (AG1-AG4 architecture, prompts, tiering counts)
- Scraper
- Dashboard layout (minimal additions)
- Existing dimension scoring logic (metrics, thresholds, sector adjustments)
- Existing framework evaluators (Buffett, Graham, Lynch, Pabrai still run, just not blended into composite)

### Risks

- **Aggressive new gates**: Might disqualify too many companies. Run new gates on historical data first and verify the disqualification rate is reasonable (target: 15-25% of the universe).
- **Geometric mean score compression**: Scores will cluster tighter. Need to recalibrate classification thresholds. Run on historical data before deploying.

---

## v3.1 design: XGBoost ranker (deferred)

**Prerequisite**: 2-3 LLM runs on v3.0 to collect balanced AG4 labels (mix of upgrades, agreements, and downgrades instead of 100% downgrades).

### Why deferred

The current AG4 training data is biased. Run 7 produced 137 AG4 evaluations: 95 strong_avoid, 30 potential_short, 12 neutral, 0 positive. This happened because the v2 additive composite sent cheap-but-declining companies to the LLM, and AG4 correctly rejected all of them. Training an XGBoost on these labels would teach the model "everything is bad" rather than "what distinguishes good from bad."

v3.0's improved filtering (hard gates remove junk, geometric mean penalizes one-dimensional companies) should produce a quant top-100 that includes genuinely good businesses. AG4 should then produce a balanced label distribution (some strong_long, some potential_long, some downgrades) that an ML model can learn from.

### Design (unchanged from original)

Train a gradient-boosted tree model to predict AG4 classification. LambdaMART objective (learning-to-rank). ~35 features (dimension scores, framework scores, raw metrics, new scores, trend slopes). Walk-forward cross-validation. SHAP feature importance. Tiering by ML rank instead of composite score.

**Readiness criteria for v3.1**:
- At least 3 LLM runs on v3.0
- AG4 label distribution includes at least 10 potential_long or better classifications
- Walk-forward NDCG@100 > 0.7 on validation set

### Implementation (when ready)

- Python training script: extract features + labels from DB, train, export JSON
- Node.js inference: load model, compute ML rank score for each company
- Tiering uses ML rank instead of composite score
- SHAP chart on dashboard /overview page
- Retrain trigger after each LLM run

---

## Iterative improvement loop

The quant model is refined through a human-in-the-loop iteration cycle using Claude as a cross-validation layer.

### Loop structure

One command, run twice per iteration:

```bash
# First run: score + prepare + print Claude analysis batches
npx tsx scripts/quant-iterate.ts run --version=v{N} --run=7 --baseline=v{N-1}

# (run Claude AG1-AG4 analysis on the printed batches — 5 parallel agents)

# Second run: compare + report (auto-detects analysis files)
npx tsx scripts/quant-iterate.ts run --version=v{N} --baseline=v{N-1}
```

The `run` command is state-aware:
- No scores.json → runs scoring + prepare, prints batches, stops
- Scores exist but no batch files → reminds to run Claude analysis
- Both exist → runs compare + report

Individual subcommands also available: `score`, `prepare`, `compare`, `report`.

### File structure

```
claude-llm-analysis/
  v3.0/                    # First iteration (completed 2026-03-20)
    scores.json            # Quant scores for all companies
    manifest.json          # Top 100 non-disqualified
    batch-{1-5}-analysis.json  # Claude AG1-AG4 analysis (20 companies each)
    combined-analysis.json # All 100 merged
    comparison-report.json # Divergence stats
    company-{CODE}.json    # Per-company financial data
    SUMMARY.md             # Narrative report
  v3.1/                    # Second iteration
    ...
  v3.2-final/              # Third iteration
    ...
```

### Versioning

During iteration, results are saved to local JSON files (not the DB). This allows multiple model versions to coexist without migrations. Once a version is finalized:
- Results are written to the DB
- A `model_version` column is added to `analysis_results`
- Unique constraint changes from `(company_id, scrape_run_id)` to `(company_id, scrape_run_id, model_version)`

### Key metric

**AG4 agreement rate**: percentage of top 100 companies where Claude AG4 score is within 10 points of quant score. Target: >30% (v3.0 baseline: 6%).

### v3.0 findings (2026-03-20)

100 companies analyzed. 3 confirmed strong_long, 32 potential_long, 42 neutral, 16 potential_short, 7 strong_avoid. Average divergence: 33.7 points.

Top gaps identified:
1. No OCF/profit ratio check (SHAKTIPUMP: 20 Cr OCF vs 329 Cr profit)
2. No other income inflation detection (ASHOKA: 80%+ profit from asset sales)
3. Cyclical peak scoring (commodities scored on unsustainably high current earnings)
4. Pledge gate not catching edge cases (AFCONS 53.5%, GPTINFRA 50.8%)
5. No minimum data completeness gate (GAUDIUMIVF: 1 quarter of governance data)

### v3.1 changes and findings (2026-03-20)

**Changes**: 3 new gates (OCF/profit 3Y avg < 0.2, pledge from cons text > 50%, data completeness < 5/10) + quality penalties (other income > 25%, cyclical peak OPM > 1.3x avg).

**Results**: 6 strong_longs confirmed (doubled from 3). 31.3pt avg divergence (-2.4). 546 more disqualified. AFCONS/GPTINFRA now caught by pledge gate. SOLARWORLD caught by Beneish + OCF.

**Remaining gaps**:
1. SHAKTIPUMP (5% latest-year OCF) passes because 3Y avg is 0.68
2. ASHOKA (82% other income) only -3pt quality penalty — too weak
3. COALINDIA/HINDALCO/NMDC: cyclical peak not detected (consistently high margins across 5Y window)

### v3.2 changes (in progress)

**Three fixes**:
1. **Acute OCF gate**: Disqualify if latest-year OCF/profit < 0.1 regardless of 3Y average. Catches SHAKTIPUMP (5%) and POWERMECH (~0%).
2. **Other income hard gate**: Move extreme other income (> 60% of profit) from penalty to disqualifier. Catches ASHOKA (82%).
3. **Cyclical sector penalty**: For companies in cyclical sectors with Piotroski <= 4, apply 15% quality penalty. Catches deteriorating cyclicals like COALINDIA (Piotroski 3) even when margins are consistently high.
