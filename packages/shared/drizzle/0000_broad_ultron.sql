CREATE TABLE "analysis_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"scrape_run_id" integer NOT NULL,
	"analyzed_at" timestamp with time zone DEFAULT now(),
	"valuation_score" numeric,
	"quality_score" numeric,
	"governance_score" numeric,
	"safety_score" numeric,
	"momentum_score" numeric,
	"composite_score" numeric,
	"disqualified" boolean DEFAULT false,
	"disqualification_reasons" jsonb,
	"metric_details" jsonb,
	"llm_analysis" jsonb,
	"llm_adjustment" numeric,
	"final_score" numeric,
	"classification" varchar(20),
	"rank_overall" integer,
	"rank_in_sector" integer,
	"score_change" numeric,
	"classification_change" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"screener_code" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"bse_code" varchar(20),
	"nse_code" varchar(20),
	"sector" varchar(100),
	"industry" varchar(100),
	"website" varchar(500),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "companies_screener_code_unique" UNIQUE("screener_code")
);
--> statement-breakpoint
CREATE TABLE "company_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"scrape_run_id" integer NOT NULL,
	"scraped_at" timestamp with time zone DEFAULT now(),
	"market_cap" numeric,
	"current_price" numeric,
	"high_52w" numeric,
	"low_52w" numeric,
	"stock_pe" numeric,
	"book_value" numeric,
	"dividend_yield" numeric,
	"roce" numeric,
	"roe" numeric,
	"face_value" numeric,
	"pros" jsonb,
	"cons" jsonb,
	"quarterly_results" jsonb,
	"annual_pl" jsonb,
	"balance_sheet" jsonb,
	"cash_flow" jsonb,
	"ratios" jsonb,
	"shareholding" jsonb,
	"peer_comparison" jsonb
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"total_companies" integer,
	"successful" integer DEFAULT 0,
	"failed" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'running'
);
--> statement-breakpoint
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_scrape_run_id_scrape_runs_id_fk" FOREIGN KEY ("scrape_run_id") REFERENCES "public"."scrape_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_snapshots" ADD CONSTRAINT "company_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_snapshots" ADD CONSTRAINT "company_snapshots_scrape_run_id_scrape_runs_id_fk" FOREIGN KEY ("scrape_run_id") REFERENCES "public"."scrape_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_analysis_company_run" ON "analysis_results" USING btree ("company_id","scrape_run_id");--> statement-breakpoint
CREATE INDEX "idx_analysis_classification" ON "analysis_results" USING btree ("classification");--> statement-breakpoint
CREATE INDEX "idx_analysis_score" ON "analysis_results" USING btree ("final_score");--> statement-breakpoint
CREATE INDEX "idx_analysis_run" ON "analysis_results" USING btree ("scrape_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_snapshot_company_run" ON "company_snapshots" USING btree ("company_id","scrape_run_id");--> statement-breakpoint
CREATE INDEX "idx_snapshots_company" ON "company_snapshots" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_snapshots_run" ON "company_snapshots" USING btree ("scrape_run_id");--> statement-breakpoint
CREATE INDEX "idx_snapshots_market_cap" ON "company_snapshots" USING btree ("market_cap");