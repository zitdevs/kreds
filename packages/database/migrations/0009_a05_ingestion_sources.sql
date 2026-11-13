ALTER TYPE "public"."ingestion_mode" ADD VALUE 'USER_ACTIVITY_POLL';--> statement-breakpoint
ALTER TYPE "public"."ingestion_mode" ADD VALUE 'GITHUB_APP_WEBHOOK';--> statement-breakpoint
ALTER TYPE "public"."ingestion_mode" ADD VALUE 'API_RECONCILIATION';