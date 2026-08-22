ALTER TABLE "repositories" ADD COLUMN "relevance_score" integer;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "relevance_breadth" integer;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "relevance_signals" jsonb;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "relevance_measured_at" timestamp with time zone;