CREATE TABLE "backtest_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"analysis_date" date NOT NULL,
	"scrape_run_id" integer NOT NULL,
	"evaluation_date" date NOT NULL,
	"holding_period_days" integer NOT NULL,
	"config" jsonb,
	"picks" jsonb,
	"performance" jsonb,
	"status" varchar(20) DEFAULT 'pending'
);
--> statement-breakpoint
CREATE TABLE "macro_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_date" date NOT NULL,
	"repo_rate" numeric,
	"cpi" numeric,
	"gdp_growth" numeric,
	"nifty_pe" numeric,
	"india_vix" numeric,
	"usd_inr" numeric,
	"bond_yield_10y" numeric,
	"regime" varchar(30),
	"notes" varchar(500),
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "macro_snapshots_snapshot_date_unique" UNIQUE("snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"price_date" date NOT NULL,
	"close_price" numeric NOT NULL,
	"source" varchar(20) DEFAULT 'yfinance'
);
--> statement-breakpoint
ALTER TABLE "analysis_results" ADD COLUMN "llm_fundamentals" jsonb;--> statement-breakpoint
ALTER TABLE "analysis_results" ADD COLUMN "llm_governance" jsonb;--> statement-breakpoint
ALTER TABLE "analysis_results" ADD COLUMN "llm_risk" jsonb;--> statement-breakpoint
ALTER TABLE "analysis_results" ADD COLUMN "llm_synthesis" jsonb;--> statement-breakpoint
ALTER TABLE "analysis_results" ADD COLUMN "buffett_score" numeric;--> statement-breakpoint
ALTER TABLE "analysis_results" ADD COLUMN "graham_score" numeric;--> statement-breakpoint
ALTER TABLE "analysis_results" ADD COLUMN "pabrai_risk_score" numeric;--> statement-breakpoint
ALTER TABLE "analysis_results" ADD COLUMN "lynch_category_score" numeric;--> statement-breakpoint
ALTER TABLE "analysis_results" ADD COLUMN "lynch_classification" varchar(20);--> statement-breakpoint
ALTER TABLE "analysis_results" ADD COLUMN "framework_details" jsonb;--> statement-breakpoint
ALTER TABLE "analysis_results" ADD COLUMN "conviction_level" varchar(10);--> statement-breakpoint
ALTER TABLE "analysis_results" ADD COLUMN "conviction_reasons" jsonb;--> statement-breakpoint
ALTER TABLE "backtest_runs" ADD CONSTRAINT "backtest_runs_scrape_run_id_scrape_runs_id_fk" FOREIGN KEY ("scrape_run_id") REFERENCES "public"."scrape_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_backtest_run" ON "backtest_runs" USING btree ("scrape_run_id");--> statement-breakpoint
CREATE INDEX "idx_backtest_status" ON "backtest_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_macro_date" ON "macro_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_price_company_date" ON "price_history" USING btree ("company_id","price_date");--> statement-breakpoint
CREATE INDEX "idx_price_company" ON "price_history" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_price_date" ON "price_history" USING btree ("price_date");