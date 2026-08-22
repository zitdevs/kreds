CREATE TYPE "public"."installation_account_type" AS ENUM('ORGANIZATION', 'USER');--> statement-breakpoint
CREATE TYPE "public"."installation_status" AS ENUM('ACTIVE', 'SUSPENDED', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."repository_trust_tier" AS ENUM('UNTRUSTED', 'ESTABLISHED', 'RELEVANT', 'HIGH_TRUST');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "installations" (
	"github_installation_id" bigint PRIMARY KEY NOT NULL,
	"account_type" "installation_account_type" NOT NULL,
	"account_login" text NOT NULL,
	"account_github_id" bigint NOT NULL,
	"organization_id" uuid,
	"status" "installation_status" DEFAULT 'ACTIVE' NOT NULL,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"suspended_at" timestamp with time zone,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_organization_id" bigint NOT NULL,
	"login" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_github_organization_id_unique" UNIQUE("github_organization_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_repository_id" bigint NOT NULL,
	"github_installation_id" bigint,
	"organization_id" uuid,
	"name_with_owner" text NOT NULL,
	"is_private" boolean NOT NULL,
	"is_personally_owned" boolean NOT NULL,
	"trust_tier" "repository_trust_tier" DEFAULT 'UNTRUSTED' NOT NULL,
	"primary_branch" text DEFAULT 'main' NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "repositories_github_repository_id_unique" UNIQUE("github_repository_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "installations" ADD CONSTRAINT "installations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "repositories" ADD CONSTRAINT "repositories_github_installation_id_installations_github_installation_id_fk" FOREIGN KEY ("github_installation_id") REFERENCES "public"."installations"("github_installation_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "repositories" ADD CONSTRAINT "repositories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "installations_organization_id_idx" ON "installations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_login_idx" ON "organizations" USING btree ("login");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repositories_installation_id_idx" ON "repositories" USING btree ("github_installation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repositories_organization_id_idx" ON "repositories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repositories_name_with_owner_idx" ON "repositories" USING btree ("name_with_owner");