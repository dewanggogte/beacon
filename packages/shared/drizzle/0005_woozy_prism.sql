CREATE TABLE "analysis_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"scrape_run_id" integer NOT NULL,
	"final_score" numeric,
	"classification" varchar(20),
	"conviction_level" varchar(10),
	"classification_source" varchar(10),
	"dimension_scores" jsonb,
	"framework_scores" jsonb,
	"lynch_category" varchar(20),
	"disqualified" boolean DEFAULT false,
	"disqualification_reasons" jsonb,
	"key_metrics" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD COLUMN "market_commentary" text;--> statement-breakpoint
ALTER TABLE "analysis_history" ADD CONSTRAINT "analysis_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_history" ADD CONSTRAINT "analysis_history_scrape_run_id_scrape_runs_id_fk" FOREIGN KEY ("scrape_run_id") REFERENCES "public"."scrape_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_history_company_run_idx" ON "analysis_history" USING btree ("company_id","scrape_run_id");--> statement-breakpoint
CREATE INDEX "analysis_history_run_idx" ON "analysis_history" USING btree ("scrape_run_id");--> statement-breakpoint
CREATE INDEX "analysis_history_company_time_idx" ON "analysis_history" USING btree ("company_id","created_at");