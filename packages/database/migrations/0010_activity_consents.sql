CREATE TYPE "public"."activity_consent_kind" AS ENUM('PUBLIC_ACTIVITY', 'PRIVATE_ACTIVITY');--> statement-breakpoint
CREATE TABLE "activity_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_user_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "activity_consent_kind" NOT NULL,
	"version" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "activity_consents_revoked_after_granted" CHECK ("activity_consents"."revoked_at" is null or "activity_consents"."revoked_at" >= "activity_consents"."granted_at")
);
--> statement-breakpoint
ALTER TABLE "activity_consents" ADD CONSTRAINT "activity_consents_github_user_id_github_identities_github_user_id_fk" FOREIGN KEY ("github_user_id") REFERENCES "public"."github_identities"("github_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_consents" ADD CONSTRAINT "activity_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_consents_active_idx" ON "activity_consents" USING btree ("github_user_id","kind","revoked_at");--> statement-breakpoint
-- Hand-written below this line: drizzle-kit does not model triggers.
-- A consent is history. The only change it may ever undergo is being revoked,
-- once; a delete, or an update that touches anything else, is refused.
CREATE FUNCTION "activity_consents_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'activity consents are history and are never deleted';
	END IF;
	IF OLD.revoked_at IS NOT NULL
		OR NEW.revoked_at IS NULL
		OR NEW.id IS DISTINCT FROM OLD.id
		OR NEW.github_user_id IS DISTINCT FROM OLD.github_user_id
		OR NEW.user_id IS DISTINCT FROM OLD.user_id
		OR NEW.kind IS DISTINCT FROM OLD.kind
		OR NEW.version IS DISTINCT FROM OLD.version
		OR NEW.granted_at IS DISTINCT FROM OLD.granted_at THEN
		RAISE EXCEPTION 'an activity consent may only be revoked, once';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "activity_consents_append_only" BEFORE UPDATE OR DELETE ON "activity_consents" FOR EACH ROW EXECUTE FUNCTION "activity_consents_append_only"();
