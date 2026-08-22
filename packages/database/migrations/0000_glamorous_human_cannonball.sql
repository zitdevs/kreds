CREATE TYPE "public"."actor_type" AS ENUM('HUMAN', 'BOT', 'AI_AGENT', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."identity_status" AS ENUM('CLAIMED', 'UNCLAIMED', 'RESTRICTED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "github_identities" (
	"github_user_id" bigint PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"avatar_url" text,
	"actor_type" "actor_type" DEFAULT 'UNKNOWN' NOT NULL,
	"status" "identity_status" DEFAULT 'UNCLAIMED' NOT NULL,
	"user_id" uuid,
	"claimed_at" timestamp with time zone,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "github_identities" ADD CONSTRAINT "github_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_identities_user_id_idx" ON "github_identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_identities_login_idx" ON "github_identities" USING btree ("login");