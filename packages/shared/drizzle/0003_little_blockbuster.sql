ALTER TABLE "analysis_results" ADD COLUMN "piotroski_f_score" integer;--> statement-breakpoint
ALTER TABLE "analysis_results" ADD COLUMN "altman_z_score" numeric;--> statement-breakpoint
ALTER TABLE "analysis_results" ADD COLUMN "beneish_m_score" numeric;--> statement-breakpoint
ALTER TABLE "analysis_results" ADD COLUMN "gate_results" jsonb;