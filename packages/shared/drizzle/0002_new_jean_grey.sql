ALTER TABLE "analysis_results" ADD COLUMN "quant_classification" varchar(20);--> statement-breakpoint
ALTER TABLE "analysis_results" ADD COLUMN "quant_conviction_level" varchar(10);--> statement-breakpoint
ALTER TABLE "analysis_results" ADD COLUMN "classification_source" varchar(10);