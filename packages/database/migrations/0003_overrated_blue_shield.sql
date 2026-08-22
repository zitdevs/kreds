CREATE TYPE "public"."contribution_entry_type" AS ENUM('AWARD', 'INVALIDATION');--> statement-breakpoint
CREATE TYPE "public"."contribution_kind" AS ENUM('PULL_REQUEST_MERGED', 'CODE_REVIEW', 'ISSUE_RESOLVED', 'REVIEW_FOLLOW_UP');--> statement-breakpoint
CREATE TYPE "public"."invalidation_trigger" AS ENUM('PR_REVERTED', 'CONFIRMED_FRAUD', 'CONFIRMED_FARMING', 'ACTOR_RECLASSIFIED_NON_HUMAN');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contribution_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"entry_type" "contribution_entry_type" NOT NULL,
	"kind" "contribution_kind" NOT NULL,
	"github_user_id" bigint NOT NULL,
	"repository_id" uuid,
	"organization_id" uuid,
	"points" integer NOT NULL,
	"quality_score" integer NOT NULL,
	"unobserved_signals" text,
	"trigger" "invalidation_trigger",
	"cancels_entry_id" uuid,
	"rules_version" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contribution_entries_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contribution_entries" ADD CONSTRAINT "contribution_entries_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contribution_entries" ADD CONSTRAINT "contribution_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contribution_entries_user_idx" ON "contribution_entries" USING btree ("github_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contribution_entries_org_idx" ON "contribution_entries" USING btree ("organization_id","github_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contribution_entries_repository_idx" ON "contribution_entries" USING btree ("repository_id");