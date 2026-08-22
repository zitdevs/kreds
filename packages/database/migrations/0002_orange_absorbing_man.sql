CREATE TYPE "public"."domain_event_type" AS ENUM('PULL_REQUEST_MERGED', 'PULL_REQUEST_CLOSED', 'REVIEW_SUBMITTED', 'REPOSITORY_CONNECTED', 'REPOSITORY_DISCONNECTED');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('RECEIVED', 'QUEUED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "domain_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"type" "domain_event_type" NOT NULL,
	"github_event_id" uuid,
	"repository_id" uuid,
	"github_installation_id" bigint,
	"data" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_events_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "github_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_delivery_id" text NOT NULL,
	"github_installation_id" bigint,
	"event_type" text NOT NULL,
	"action" text,
	"payload" jsonb NOT NULL,
	"status" "event_status" DEFAULT 'RECEIVED' NOT NULL,
	"processed_at" timestamp with time zone,
	"failure_reason" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_events_github_delivery_id_unique" UNIQUE("github_delivery_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_github_event_id_github_events_id_fk" FOREIGN KEY ("github_event_id") REFERENCES "public"."github_events"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "domain_events_repository_idx" ON "domain_events" USING btree ("repository_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "domain_events_type_idx" ON "domain_events" USING btree ("type","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_events_status_idx" ON "github_events" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_events_installation_idx" ON "github_events" USING btree ("github_installation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_events_type_idx" ON "github_events" USING btree ("event_type");