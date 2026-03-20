ALTER TABLE "companies" ADD COLUMN "screener_url" varchar(500);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "entity_type" varchar(10);--> statement-breakpoint
ALTER TABLE "company_snapshots" ADD COLUMN "data_source" varchar(20);