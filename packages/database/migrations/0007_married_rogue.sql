CREATE TYPE "public"."ingestion_mode" AS ENUM('PROVIDER_WEBHOOK', 'SERVER_SIDE_DELEGATED_QUERY');--> statement-breakpoint
ALTER TYPE "public"."account_type" ADD VALUE 'PERSONAL_POSITION' BEFORE 'TREASURY';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delegated_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_user_id" bigint NOT NULL,
	"sealed_token" text NOT NULL,
	"token_nonce" text NOT NULL,
	"token_tag" text NOT NULL,
	"scopes" text[] NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_polled_at" timestamp with time zone,
	"poll_budget_spent" integer DEFAULT 0 NOT NULL,
	"poll_window_started_at" timestamp with time zone,
	CONSTRAINT "delegated_authorizations_github_user_id_unique" UNIQUE("github_user_id"),
	CONSTRAINT "delegated_authorizations_budget_non_negative" CHECK ("delegated_authorizations"."poll_budget_spent" >= 0),
	CONSTRAINT "delegated_authorizations_scopes_present" CHECK (array_length("delegated_authorizations"."scopes", 1) >= 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"github_organization_id" bigint NOT NULL,
	"granted_by_github_user_id" bigint NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "organization_grants_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "organization_grants_verified_after_granted" CHECK ("organization_grants"."verified_at" >= "organization_grants"."granted_at")
);
--> statement-breakpoint
ALTER TABLE "github_events" ADD COLUMN "ingestion_mode" "ingestion_mode" DEFAULT 'PROVIDER_WEBHOOK' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delegated_authorizations" ADD CONSTRAINT "delegated_authorizations_github_user_id_github_identities_github_user_id_fk" FOREIGN KEY ("github_user_id") REFERENCES "public"."github_identities"("github_user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_grants" ADD CONSTRAINT "organization_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delegated_authorizations_poll_idx" ON "delegated_authorizations" USING btree ("revoked_at","last_polled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_grants_github_idx" ON "organization_grants" USING btree ("github_organization_id","revoked_at");