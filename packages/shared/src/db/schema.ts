import {
  pgTable,
  serial,
  varchar,
  numeric,
  boolean,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
  date,
} from 'drizzle-orm/pg-core';

// ── companies ──────────────────────────────────
export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  screenerCode: varchar('screener_code', { length: 100 }).unique().notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  bseCode: varchar('bse_code', { length: 20 }),
  nseCode: varchar('nse_code', { length: 20 }),
  sector: varchar('sector', { length: 100 }),
  industry: varchar('industry', { length: 100 }),
  website: varchar('website', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── scrape_runs ────────────────────────────────
export const scrapeRuns = pgTable('scrape_runs', {
  id: serial('id').primaryKey(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  totalCompanies: integer('total_companies'),
  successful: integer('successful').default(0),
  failed: integer('failed').default(0),
  status: varchar('status', { length: 20 }).default('running'),
});

// ── company_snapshots ──────────────────────────
export const companySnapshots = pgTable(
  'company_snapshots',
  {
    id: serial('id').primaryKey(),
    companyId: integer('company_id')
      .references(() => companies.id)
      .notNull(),
    scrapeRunId: integer('scrape_run_id')
      .references(() => scrapeRuns.id)
      .notNull(),
    scrapedAt: timestamp('scraped_at', { withTimezone: true }).defaultNow(),

    // Flattened key metrics for fast querying
    marketCap: numeric('market_cap'),
    currentPrice: numeric('current_price'),
    high52w: numeric('high_52w'),
    low52w: numeric('low_52w'),
    stockPe: numeric('stock_pe'),
    bookValue: numeric('book_value'),
    dividendYield: numeric('dividend_yield'),
    roce: numeric('roce'),
    roe: numeric('roe'),
    faceValue: numeric('face_value'),

    // JSONB for structured/variable-length data
    pros: jsonb('pros'),
    cons: jsonb('cons'),
    quarterlyResults: jsonb('quarterly_results'),
    annualPl: jsonb('annual_pl'),
    balanceSheet: jsonb('balance_sheet'),
    cashFlow: jsonb('cash_flow'),
    ratios: jsonb('ratios'),
    shareholding: jsonb('shareholding'),
    peerComparison: jsonb('peer_comparison'),
  },
  (table) => [
    uniqueIndex('uq_snapshot_company_run').on(table.companyId, table.scrapeRunId),
    index('idx_snapshots_company').on(table.companyId),
    index('idx_snapshots_run').on(table.scrapeRunId),
    index('idx_snapshots_market_cap').on(table.marketCap),
  ],
);

// ── analysis_results ───────────────────────────
export const analysisResults = pgTable(
  'analysis_results',
  {
    id: serial('id').primaryKey(),
    companyId: integer('company_id')
      .references(() => companies.id)
      .notNull(),
    scrapeRunId: integer('scrape_run_id')
      .references(() => scrapeRuns.id)
      .notNull(),
    analyzedAt: timestamp('analyzed_at', { withTimezone: true }).defaultNow(),

    // Layer 1 scores
    valuationScore: numeric('valuation_score'),
    qualityScore: numeric('quality_score'),
    governanceScore: numeric('governance_score'),
    safetyScore: numeric('safety_score'),
    momentumScore: numeric('momentum_score'),
    compositeScore: numeric('composite_score'),
    disqualified: boolean('disqualified').default(false),
    disqualificationReasons: jsonb('disqualification_reasons'),
    metricDetails: jsonb('metric_details'),

    // Layer 2 LLM (legacy single-shot)
    llmAnalysis: jsonb('llm_analysis'),
    llmAdjustment: numeric('llm_adjustment'),

    // Layer 2 Multi-agent LLM
    llmFundamentals: jsonb('llm_fundamentals'),
    llmGovernance: jsonb('llm_governance'),
    llmRisk: jsonb('llm_risk'),
    llmSynthesis: jsonb('llm_synthesis'),

    // Final
    finalScore: numeric('final_score'),
    classification: varchar('classification', { length: 20 }),
    rankOverall: integer('rank_overall'),
    rankInSector: integer('rank_in_sector'),

    // Framework scores (Phase 2)
    buffettScore: numeric('buffett_score'),
    grahamScore: numeric('graham_score'),
    pabraiRiskScore: numeric('pabrai_risk_score'),
    lynchCategoryScore: numeric('lynch_category_score'),
    lynchClassification: varchar('lynch_classification', { length: 20 }),
    frameworkDetails: jsonb('framework_details'),
    convictionLevel: varchar('conviction_level', { length: 10 }),
    convictionReasons: jsonb('conviction_reasons'),

    // Dual evaluation: quant originals + attribution (v2.2)
    quantClassification: varchar('quant_classification', { length: 20 }),
    quantConvictionLevel: varchar('quant_conviction_level', { length: 10 }),
    classificationSource: varchar('classification_source', { length: 10 }),

    // v3 financial health scores
    piotroskiFScore: integer('piotroski_f_score'),
    altmanZScore: numeric('altman_z_score'),
    beneishMScore: numeric('beneish_m_score'),
    gateResults: jsonb('gate_results'),

    // Week-over-week
    scoreChange: numeric('score_change'),
    classificationChange: varchar('classification_change', { length: 50 }),
  },
  (table) => [
    uniqueIndex('uq_analysis_company_run').on(table.companyId, table.scrapeRunId),
    index('idx_analysis_classification').on(table.classification),
    index('idx_analysis_score').on(table.finalScore),
    index('idx_analysis_run').on(table.scrapeRunId),
  ],
);

// ── price_history ─────────────────────────────
export const priceHistory = pgTable(
  'price_history',
  {
    id: serial('id').primaryKey(),
    companyId: integer('company_id')
      .references(() => companies.id)
      .notNull(),
    priceDate: date('price_date').notNull(),
    closePrice: numeric('close_price').notNull(),
    source: varchar('source', { length: 20 }).default('yfinance'),
  },
  (table) => [
    uniqueIndex('uq_price_company_date').on(table.companyId, table.priceDate),
    index('idx_price_company').on(table.companyId),
    index('idx_price_date').on(table.priceDate),
  ],
);

// ── backtest_runs ─────────────────────────────
export const backtestRuns = pgTable(
  'backtest_runs',
  {
    id: serial('id').primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    analysisDate: date('analysis_date').notNull(),
    scrapeRunId: integer('scrape_run_id')
      .references(() => scrapeRuns.id)
      .notNull(),
    evaluationDate: date('evaluation_date').notNull(),
    holdingPeriodDays: integer('holding_period_days').notNull(),
    config: jsonb('config'),
    picks: jsonb('picks'),
    performance: jsonb('performance'),
    status: varchar('status', { length: 20 }).default('pending'),
  },
  (table) => [
    index('idx_backtest_run').on(table.scrapeRunId),
    index('idx_backtest_status').on(table.status),
  ],
);

// ── macro_snapshots ───────────────────────────
export const macroSnapshots = pgTable(
  'macro_snapshots',
  {
    id: serial('id').primaryKey(),
    snapshotDate: date('snapshot_date').notNull().unique(),
    repoRate: numeric('repo_rate'),
    cpi: numeric('cpi'),
    gdpGrowth: numeric('gdp_growth'),
    niftyPe: numeric('nifty_pe'),
    indiaVix: numeric('india_vix'),
    usdInr: numeric('usd_inr'),
    bondYield10y: numeric('bond_yield_10y'),
    regime: varchar('regime', { length: 30 }),
    notes: varchar('notes', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_macro_date').on(table.snapshotDate),
  ],
);
