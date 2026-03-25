# Dashboard v3 — Full Redesign

**Date:** 2026-03-25
**Status:** Design approved
**Scope:** Full dashboard transformation — visualizations, narrative-first company pages, smart screening, dark mode, mobile, watchlist

## Context

Beacon's dashboard (v2) is functional but presents raw data without context. Metrics lack units and benchmarks, there are no charts or visualizations (Recharts is imported but unused), filtering is rigid, and the company page is a data dump rather than an analytical narrative. The target audience is broad — Indian stock investors who may not have quantitative finance backgrounds.

### User Priorities (descending)
1. **Visualizations** — Charts, heatmaps, scatter plots to surface patterns
2. **Comprehension** — Metrics with units, sector benchmarks, plain-English assessments
3. **Information density** — More at a glance, less clicking between pages
4. **Navigation** — Restructure pages to match how users think about the data
5. **Visual polish** — Dark mode, mobile nav, loading states

## Navigation & Page Structure

### v3 Navigation
**Home · Overview · Explore · Rankings · Pipeline · Watchlist**

| Current Page | v3 Action | Rationale |
|---|---|---|
| Home | Redesign | Tighter hero, LLM market commentary, "what changed", mini heatmap |
| Overview | Keep as-is | Pipeline explainer, useful for new users |
| Rankings | Enhance | Smart presets + multi-filter bar + sparklines + merged content |
| Conviction | Remove | Merge into Rankings as a "High Conviction" preset |
| Frameworks | Remove | Merge into Rankings (framework columns) and company detail |
| Backtest | Remove | Backend/analytical tooling, not needed for general audience |
| Pipeline | Keep, minor polish | Pipeline status monitoring |
| Company detail | Full redesign | Narrative-first layout |
| Explore (new) | New page | Sector heatmaps, scatter plots, time-series, smart screens |
| Watchlist (new) | New page | Compare saved companies side-by-side |

Redirects for removed pages: `/conviction` → `/rankings?preset=high-conviction`, `/frameworks` → `/rankings`, `/backtest` → `/`.

### Key files to modify
- `layout.tsx` — new nav structure (Home, Overview, Explore, Rankings, Pipeline, Watchlist), hamburger menu on mobile, dark mode toggle. One of the most heavily modified files.

---

## 1. Explore Page

Discovery-first visualization page. All sections visible on a single scrollable dashboard (not tabbed).

### 1.1 Insights Bar
Top of page. Surfaces notable changes since the previous pipeline run.
- "3 sectors improved this run"
- "12 companies newly disqualified"
- "5 classification upgrades"

**Data source:** Uses existing `scoreChange` and `classificationChange` columns on `analysis_results` (populated by `weekly-comparison.ts`). Does NOT depend on `analysis_history` — these columns already exist and are populated each run. Empty state on first run: "First analysis run — comparisons will appear after the next run."

### 1.1a Global Empty State
If no analysis data exists at all (fresh install, before first pipeline run), the entire Explore page shows a centered message: "No analysis data yet. Run the pipeline to start exploring." with a link to the Pipeline page. Same pattern as the existing home page `if (!runId)` check.

### 1.2 Sector Heatmap
- **Implementation:** Custom CSS Grid with dynamic cell sizing (proportional to company count), NOT Recharts Treemap. Recharts Treemap has limited customization for text/multi-line content. A CSS grid with `grid-template-columns` weighted by company count achieves the same visual effect with full control.
- Color = average final score (green → amber → red gradient)
- Size = proportional to number of companies in sector
- Each cell shows: sector name, avg score, company count
- Click a sector → navigates to Rankings filtered by that sector
- On mobile: 2-column grid layout (cells stack)

### 1.3 Scatter Plot (Interactive)
- Two dropdown selectors for X and Y axes
- Available metrics for axes: P/E, P/B, ROCE, ROE, Debt/Equity, Piotroski F-Score, Market Cap, Dividend Yield, Final Score, any of the 5 dimension scores
- Dots = companies. Color = classification (green for strong_long → red for strong_avoid). Size = market cap (optional toggle)
- Hover shows company name + both axis values
- Click navigates to company detail page
- "Sweet spot" dashed region in the favorable quadrant (high quality + low valuation)
- Minimum 5 companies required to render; fewer shows "Not enough data for scatter plot"
- Built with Recharts `ScatterChart`

### 1.4 Time-Series Trends
- Line chart showing aggregate trends across pipeline runs
- Default view: average score by classification bucket over time
- Toggle to: sector average scores over time, or total companies per classification over time
- Depends on `analysis_history` table. Hidden until ≥2 runs exist.
- Built with Recharts `LineChart`

### 1.5 Smart Screens
- Grid of preset screen cards, each showing: name, description, match count
- Presets (all filters use metrics available on `analysis_results` + `company_snapshots`):
  - **Value Picks** — P/E <20 + ROCE >15% + Debt/Equity <0.5
  - **Quality Compounders** — ROCE >15% + revenue growth positive (3yr) + Piotroski ≥6
  - **Low Debt Growth** — Debt/Equity <0.5 + profit growth positive (3yr) + not disqualified
  - **Turnaround Candidates** — Lynch category = turnaround + Piotroski >4
  - **Dividend Plays** — Dividend yield >2% + Piotroski ≥5 + not disqualified
  - **High Conviction** — Conviction level = high
- Click a preset → navigates to Rankings with those filters applied
- Preset filter logic is visible via tooltip/expandable ("What's in this screen?")

**Data access note:** Metrics like ROCE, P/E, D/E, dividend yield are on `company_snapshots`. Revenue/profit growth trends are in the `metricDetails` JSONB on `analysis_results` (extracted by flattenV2). The Rankings query must join `company_snapshots` to access these — see Section 3.2.

---

## 2. Company Page Redesign

Layout follows a narrative-first, progressive-disclosure pattern: "Read like a research note, not decode a spreadsheet."

### 2.1 Header
- Company name, sector, BSE/NSE codes
- Lynch badge, conviction badge
- Score cards row (4 cards): Final Score (color-coded), Overall Rank, Sector Rank, Classification

### 2.2 Narrative Verdict
- **LLM-analyzed companies only.** 2-3 sentence plain-English summary from AG4 synthesis.
- Below the narrative: clickable summary counts — "3 catalysts · 2 risks · High conviction" — that scroll to the Catalysts/Risks section.
- **Quant-only companies:** No narrative section shown. The page starts directly at the score cards → metrics strip.

### 2.3 Key Metrics Strip
Horizontal strip of 5-6 key metrics. Each metric shows:
- Label (e.g., "P/E Ratio")
- Value with unit (e.g., "24.3×")
- Contextual line with color: "Below sector median (28.1×)" in green, "Near sector median" in amber, "Above sector median" in red

Default metrics: P/E, ROCE, Debt/Equity, Piotroski F-Score, Market Cap, Dividend Yield.

Stacks vertically on mobile (2-column grid on small screens).

**Sector medians:** Computed at query time. Add a new query `getSectorMedians(sector: string)` that calculates median P/E, ROCE, D/E, dividend yield for all companies in the same sector from `company_snapshots` for the current run. Cache per-sector per-run (these don't change until next pipeline run). For metrics where lower is better (P/E, D/E), "below median" = green. For metrics where higher is better (ROCE, Piotroski), "above median" = green.

### 2.4 Catalysts & Risks (side by side)
- Left card (green border): Catalysts / What's Working — bullet points from LLM + Screener.in pros
- Right card (red border): Risks / Watch Items — bullet points from LLM + Screener.in cons + disqualifier info
- If disqualified: prominent red banner above both cards explaining the disqualification reason(s)
- For quant-only companies: populated from Screener.in pros/cons only (no LLM content)

### 2.5 Progressive Detail Sections
Collapsed by default. Each section shows a preview in the header. "Expand all" toggle at the top of this zone. Expand/collapse state is ephemeral (not persisted) — resets on page navigation. On mobile, sections behave identically (accordion pattern).

**Framework Scores:**
- Collapsed header: "Buffett 74 · Graham 68 · Pabrai 78 · Lynch 81"
- Expanded: 4 framework cards with per-criterion pass/fail breakdown

**Agent Analysis:**
- Collapsed header: "4 agents · AG4 override applied" (or "Quant only — no agent analysis")
- Expanded: tabbed agent panels (Synthesis, Fundamentals, Governance, Risk) — existing `AgentAnalysisPanel` component, cleaned up

**All Metrics:**
- Collapsed header: "21 metrics across 5 dimensions"
- Expanded: metrics grouped by dimension (Valuation, Quality, Governance, Safety, Momentum). Each metric shows: name, value with unit, score bar (0-100), assessment word (excellent/good/acceptable/poor/red_flag), tooltip icon

**Financial Health:**
- Collapsed header: "Piotroski 7/9 · Altman 2.9 · Beneish -2.8"
- Expanded: each score with explanation of what it measures and threshold ranges (e.g., "Altman Z-Score: >2.99 = safe zone, 1.81-2.99 = grey zone, <1.81 = distress zone")

---

## 3. Rankings Page Enhancements

### 3.1 Smart Presets Bar
Row of clickable preset buttons above the filter bar:
- Value Picks, Quality Compounders, Low Debt Growth, Turnaround Candidates, Dividend Plays, High Conviction
- Clicking a preset populates the filter bar with the corresponding filters
- Active preset is highlighted; modifying any filter deactivates the preset highlight

### 3.2 Multi-Filter Bar
Below presets. Metric filter dropdowns with operator + value:
- Available metrics: ROCE, P/E, P/B, Debt/Equity, Market Cap, Piotroski, Dividend Yield, Final Score
- Operators: >, <, ≥, ≤
- Add more filters with "+" button (AND logic)
- Active filters shown as removable chips
- Existing filters (classification, Lynch, conviction, sector, source) remain alongside the new metric filters
- Zero-results state: "No companies match these filters. Try relaxing [most restrictive filter]."

**Architecture:** SSR for initial page load (consistent with existing pattern). Expand `getAllRankings()` query to JOIN `company_snapshots` and fetch all filterable metrics (P/E, ROCE, D/E, market cap, dividend yield, Piotroski) server-side. All data sent to the `CompanyTable` client component, which performs filtering client-side. This matches the existing architecture where the server loads all rankings and the client filters/sorts. For ~3,500 rows with ~30 columns, the payload is ~500KB — acceptable.

**Metric filters are client-side only** — no API routes needed. The preset buttons simply set filter state in the client component.

### 3.3 Table Enhancements
- Sparklines column: tiny inline chart of 5-quarter revenue trend. **Data source:** `quarterlyResults` JSONB on `company_snapshots` — parsed server-side and sent as a number array `[q1, q2, q3, q4, q5]` to the client. Does NOT depend on `analysis_history`.
- Sticky header + sticky first column (company name) on horizontal scroll
- `font-variant-numeric: tabular-nums` on all number columns
- Units on all metric column headers (×, %, ₹ Cr, /9)

---

## 4. Home Page Redesign

### 4.1 Hero Zone
- Summary stat cards (total analyzed, strong long, potential long, strong avoid counts)
- Delta indicators per stat: "↑ 3 from last run" or "unchanged". **Data source:** uses existing `scoreChange`/`classificationChange` columns on `analysis_results` (same as Insights Bar). Does NOT depend on `analysis_history`.
- "Analysis as of 24 Mar 2026" — last pipeline run date, prominent

### 4.2 LLM Market Commentary
- 3-5 paragraph overview of the overall market/companies analyzed
- Covers: overall market quality distribution, sector themes, notable shifts, macro context
- Generated by a dedicated post-pipeline LLM call that receives aggregate stats
- Stored in `market_commentary` text column on `scrape_runs` table
- Displayed in a bordered card below the hero stats

### 4.3 High Conviction Picks (enriched)
- Cards showing: score, classification, sector, Lynch badge, one-line narrative (first sentence of LLM synthesis), mini sparkline of score history
- "View all" expansion
- Sparkline depends on `analysis_history` table; omitted until ≥2 runs

### 4.4 Sector Snapshot
- Replace current horizontal bar chart with a compact version of the Explore page sector heatmap
- Clickable — navigates to Rankings filtered by that sector (consistent with Explore heatmap behavior)

### 4.5 "What Changed" Section
- Notable changes since previous run: classification upgrades/downgrades, newly disqualified, big score movers (±15 points)
- Each entry is a link to the company detail page
- **Data source:** Uses existing `scoreChange` and `classificationChange` columns on `analysis_results`. Does NOT depend on `analysis_history`. First-run state: "This is the first analysis run — changes will appear after the next run."

### 4.6 Removed
- Classification tabs table (redundant with Rankings)

---

## 5. Dark Mode

### Implementation
- Tailwind `dark:` variant classes throughout
- **Tailwind CSS 4 dark mode config:** Tailwind 4 uses `@media (prefers-color-scheme: dark)` by default for the `dark:` variant. To support a manual class-based toggle, add a custom variant in `globals.css`: `@variant dark (&:where(.dark, .dark *));` — this makes `dark:` classes activate when `<html class="dark">` is set, overriding the media query.
- Dark palette defined in `globals.css` under the dark variant:
  - Backgrounds: warm charcoal (#1a1a1a primary, #242424 secondary, #2a2a2a card) — not pure black
  - Text: #e8e6e3 primary, #999 secondary, #666 muted
  - Signal colors: same hues, slightly desaturated for eye comfort
  - Borders: #3a3a3a
- Toggle: sun/moon icon in nav header (desktop). On mobile (<768px), the toggle moves into the hamburger slide-out panel — not shown in the header to avoid duplication.
- Preference stored in `localStorage` key `theme` with values `light` | `dark` | `system`
- On page load, a blocking `<script>` in `layout.tsx` reads localStorage and sets `<html class="dark">` before paint to prevent flash of wrong theme
- Recharts components receive theme-aware color props (via a `useTheme()` hook or React context)

### Scope
All pages, all components. Every hardcoded color reference needs a dark variant.

---

## 6. Mobile Navigation

- Breakpoint: 768px
- Desktop: horizontal nav bar (current style)
- Mobile: hamburger icon → slide-out side panel with nav links + dark mode toggle
- Company page metrics strip stacks vertically
- Tables get horizontal scroll with sticky first column
- Scatter plot on Explore: reduced dot density, larger touch targets
- Heatmap cells stack into a 2-column grid on mobile

---

## 7. Loading Skeletons

- Shared `Skeleton` component with variants: `card`, `text`, `badge`, `chart`, `table-row`
- Applied to all pages during SSR hydration
- For interactive elements (filter changes on Rankings, axis changes on Explore scatter plot): use client-side fetching with skeleton states during load
- Keep SSR for initial page load; client-side fetch for subsequent interactions

---

## 8. Rich Tooltips

### Implementation
- CSS-only tooltip component (no library dependency)
- Trigger: hover on desktop, tap on mobile
- Content: metric full name, one-line explanation, typical good/bad ranges

### Metric Definitions (~40 entries)

| Metric | Full Name | Explanation | Good Range |
|---|---|---|---|
| P/E | Price-to-Earnings Ratio | How much investors pay per rupee of earnings. Lower = cheaper. | <20 (value), 20-30 (fair), >30 (expensive) |
| P/B | Price-to-Book Ratio | Price relative to book value. Lower may indicate undervaluation. | <2 (value), 2-4 (fair), >4 (expensive) |
| ROCE | Return on Capital Employed | Profit generated per rupee of capital used. Higher = more efficient. | >20% (excellent), 15-20% (good), 10-15% (acceptable), <10% (poor) |
| ROE | Return on Equity | Profit generated per rupee of shareholder equity. | >20% (excellent), 15-20% (good), <15% (weak) |
| D/E | Debt-to-Equity Ratio | Total debt relative to equity. Lower = less leveraged. | <0.5 (low), 0.5-1 (moderate), >1 (high) |
| Div Yield | Dividend Yield | Annual dividends as % of stock price. | >3% (high), 1-3% (moderate), <1% (low) |
| Mkt Cap | Market Capitalization | Total market value of the company (₹ Cr). | >50,000 Cr (large), 10,000-50,000 (mid), <10,000 (small) |
| Piotroski | Piotroski F-Score | 9-point financial strength test. Higher = healthier. | 7-9 (strong), 4-6 (average), 0-3 (weak) |
| Altman Z | Altman Z-Score | Bankruptcy risk predictor. Higher = safer. | >2.99 (safe), 1.81-2.99 (grey zone), <1.81 (distress) |
| Beneish M | Beneish M-Score | Earnings manipulation detector. More negative = less likely manipulated. | <-2.22 (unlikely manipulation), >-2.22 (possible manipulation) |
| ICR | Interest Coverage Ratio | How easily the company can pay interest on debt. | >3× (comfortable), 1.5-3× (adequate), <1.5× (risky) |
| OPM | Operating Profit Margin | Operating profit as % of revenue. | Sector-dependent. Higher is better. |
| NPM | Net Profit Margin | Net profit as % of revenue. | Sector-dependent. Higher is better. |
| Rev CAGR | Revenue CAGR | Compound annual growth rate of revenue. | >15% (fast growth), 10-15% (moderate), <10% (slow) |
| Profit CAGR | Profit CAGR | Compound annual growth rate of net profit. | >15% (fast growth), 10-15% (moderate), <10% (slow) |
| Promoter % | Promoter Holding | % of shares held by promoters/founders. | >50% (strong), 30-50% (moderate), <30% (low) |
| Pledge % | Promoter Pledge | % of promoter shares pledged as collateral. | 0% (ideal), <10% (acceptable), >10% (concerning) |
| FII % | FII Holding | Foreign institutional investor holding %. | Context-dependent. Rising FII = positive signal. |
| DII % | DII Holding | Domestic institutional investor holding %. | Context-dependent. |
| OCF/PAT | Operating Cash Flow / Profit | Cash flow quality. >1 means cash backs up reported profits. | >1× (good), 0.5-1× (acceptable), <0.5× (poor cash conversion) |
| EV/EBITDA | Enterprise Value / EBITDA | Valuation ratio accounting for debt. Lower = cheaper. | <10 (cheap), 10-15 (fair), >15 (expensive) |

Additional definitions needed for: framework-specific criteria (10 Buffett, 10 Graham, 6 Pabrai), dimension scores (5), and any remaining metrics. Full list to be completed during implementation.

---

## 9. Watchlist & Comparison

### Adding to Watchlist
- Bookmark/star icon on: company cards (home, Explore), table rows (Rankings), company detail page header
- Click toggles add/remove
- Visual feedback: filled star = in watchlist, outline = not

### Persistence
- `localStorage` — array of screener codes
- No authentication required
- Per-browser, per-device (no cross-device sync)
- Max 20 companies — show warning when approaching limit

### Watchlist Page Layout
- **Empty state:** Friendly explanation + link to Rankings and Explore
- **Stale companies:** If a watchlisted company has no analysis data (delisted, removed from pipeline), show it greyed out with "Data unavailable" and an option to remove. Do not silently remove — the user should see why.
- **Populated:** Comparison table
  - Companies as columns, metrics as rows
  - Metrics: Final Score, Classification, P/E, ROCE, D/E, Piotroski, Market Cap, Dividend Yield, Lynch category, Conviction level
  - Color-coded cells (green/amber/red) for visual scanning
  - One-line narrative per company at column top (LLM synthesis first sentence, if available)
  - Remove button per company, "Clear all" action
- Horizontal scroll with sticky metric labels on left when >4 companies

---

## 10. Favicon

- Simple geometric icon recognizable at 16×16px
- Stylized "B" or beacon/lighthouse silhouette in the accent terracotta color (#b85a3b)
- Formats:
  - `public/favicon.ico` (16×16 + 32×32 multi-resolution)
  - `public/favicon.svg` (scalable, modern browsers)
  - `public/apple-touch-icon.png` (180×180 for iOS)
- Referenced in root layout metadata

---

## 11. Database Changes

### New Table: `analysis_history`

```
analysis_history
├── id                        serial, PK
├── company_id                integer, FK → companies.id
├── scrape_run_id             integer, FK → scrape_runs.id
├── final_score               numeric
├── classification            text
├── conviction_level          text
├── classification_source     text ('quant' | 'ag4')
├── dimension_scores          jsonb {valuation, quality, governance, safety, momentum}
├── framework_scores          jsonb {buffett, graham, pabrai, lynch}
├── lynch_category            text
├── disqualified              boolean
├── disqualification_reasons  jsonb
├── key_metrics               jsonb {pe, roce, roe, de, market_cap, piotroski, altman, beneish, dividend_yield}
├── created_at                timestamptz, default now()
```

**Indexes:**
- `UNIQUE (company_id, scrape_run_id)` — one record per company per run
- `(scrape_run_id)` — load all results for a run
- `(company_id, created_at)` — time-series queries per company

**Population:**
- **Pipeline integration:** New function `saveAnalysisHistory(runId)` called in `runAnalysis()` (in `analysis-run.ts`) after `saveAnalysisResults` and before `generateWeeklyReport`. Copies key fields from `analysis_results` + `company_snapshots` into `analysis_history` for all companies in the run.
- **Does NOT run with `--skip-llm`** — the history snapshot should capture the full analysis state including LLM results when available.
- **Does run with `--llm-only`** — captures the updated LLM-enhanced scores.
- **Backfill limitation:** The current `analysis_results` table uses `onConflictDoUpdate`, so historical data from past runs has already been overwritten — only the current state exists. The backfill script can only seed **one initial snapshot per company** from the current data. True run-over-run history begins accumulating only after this table is deployed. This is acceptable — time-series features will become useful after a few weeks of pipeline runs.
- Backfill CLI command: `npx tsx packages/analyzer/src/index.ts backfill-history`

**Growth:** ~3,500 rows per run × ~52 runs/year = ~182K rows/year. Trivial for PostgreSQL.

### Altered Table: `scrape_runs`

New column:
- `market_commentary text` — LLM-generated market overview, populated post-pipeline

### Migration
- Drizzle schema update + `drizzle-kit generate` for the migration file
- Backfill script as a separate CLI command: `npx tsx packages/analyzer/src/index.ts backfill-history`

---

## 12. New Pipeline Step: Market Commentary

**Pipeline integration:** New function `generateMarketCommentary(runId)` called in `runAnalysis()` (in `analysis-run.ts`) after `saveAnalysisHistory` and before `generateWeeklyReport`. Requires a `scrapeRunId` to update `scrape_runs.market_commentary`.

**Does NOT run with `--skip-llm`** (requires LLM). **Does run with `--llm-only`** (useful for regenerating commentary).

Steps:
1. Gather aggregate stats: classification distribution, sector averages, top movers (from `scoreChange`/`classificationChange` columns), macro regime (from `macro_snapshots`)
2. Send to LLM (single call, Claude Haiku for cost efficiency) with a structured prompt
3. Store result in `scrape_runs.market_commentary`
4. Dashboard home page reads and displays it. If `market_commentary` is null (first run, or `--skip-llm`), hide the section entirely — no error card.

**Prompt structure:**
```
You are a market analyst writing a brief overview for Indian stock investors.

Data provided:
- Total companies analyzed: {N}
- Classification distribution: {strong_long: X, potential_long: Y, ...}
- Sector averages: {IT: 68.2, Pharma: 64.1, ...}
- Notable movers since last run: {upgrades: [...], downgrades: [...]}
- Current macro regime: {regime} (repo rate: X%, CPI: Y%)

Write 3-5 paragraphs covering:
1. Overall market quality (what % scored well/poorly)
2. Sector themes (which sectors stand out, positively or negatively)
3. Notable shifts from last analysis (if available)
4. Macro context and its implications (if macro data available)

Tone: Informative, measured, no hype. Written for investors, not traders.
```

---

## Risks & Tradeoffs

### Scope
This is a large redesign touching every page + new pages + DB changes + pipeline changes. Risk of scope creep is high. Mitigation: strict phased implementation plan with independent work streams.

### Dark mode
Doubles the styling surface area. Every color needs a dark variant. This is the single biggest polish cost. Mitigation: define dark palette variables upfront, use Tailwind dark: classes consistently.

### Time-series features
Only useful after ≥2 pipeline runs with history data. First-run experience needs graceful empty states for: What Changed, trend charts, sparklines, delta indicators.

### Smart presets are opinionated
The filter definitions encode investment philosophy. Mitigation: make preset logic visible (tooltip showing what filters are applied). Presets are editable — users can modify after applying.

### Watchlist is localStorage-only
No cross-device sync. Acceptable for v3; DB-backed watchlists require user accounts. Flagged as future upgrade path.

### Market commentary quality
Depends on LLM output quality. Using aggregate stats (not raw data) keeps the prompt focused. Haiku is cost-efficient but may produce less nuanced commentary than Sonnet. Can upgrade later if needed.

### Metric tooltip content
~40+ definitions to author. This is a content task, not a code task. Ranges are approximate and may not apply equally to all sectors (e.g., P/E for banking vs IT). Mitigation: note "sector-dependent" where applicable.

### Removed pages
Users who bookmarked `/conviction`, `/frameworks`, or `/backtest` will get 404s. Mitigation: add redirects.

---

## Tech Stack

| Component | Technology |
|---|---|
| Charts & visualizations | Recharts (already a dependency) |
| Frontend framework | Next.js 15 + React 19 (existing) |
| Styling | Tailwind CSS 4 (existing) |
| Database | PostgreSQL 17 + Drizzle ORM (existing) |
| Tooltips | Custom CSS-only component (no new dependency) |
| Skeletons | Custom component (no new dependency) |
| Mobile nav | Custom component (no new dependency) |
| Dark mode | Tailwind dark: classes + localStorage |
| Favicon | SVG + ICO + PNG (generated during implementation) |

No new runtime dependencies. Recharts is already installed.

---

## Dependency Map

Features that depend on `analysis_history` table (require ≥2 runs to be useful):
- Explore: Time-Series Trends (1.4)
- Home: High Conviction sparklines (4.3) — score history sparkline only
- Company detail: score history sparkline (future, not in v3 scope explicitly)

Features that use existing `scoreChange`/`classificationChange` columns (work immediately):
- Explore: Insights Bar (1.1)
- Home: Hero delta indicators (4.1)
- Home: "What Changed" section (4.5)

Features with NO data dependencies (pure frontend):
- Dark mode, mobile nav, loading skeletons, rich tooltips, favicon, watchlist (localStorage), expand-all toggle

Features that require query changes (JOIN `company_snapshots`):
- Rankings: multi-filter bar, sparklines, metric columns with units
- Company page: sector medians for contextual lines
- Explore: scatter plot (needs per-company metrics)
- Smart Screens: match count calculation

### Content Authoring Tasks
- ~20 core metric tooltip definitions (provided in Section 8 table)
- ~10 Buffett criteria definitions
- ~10 Graham criteria definitions
- ~6 Pabrai factor definitions
- ~5 dimension score definitions
- **Total: ~51 definitions** — significant content task, should be a dedicated implementation step
