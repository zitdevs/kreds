CREATE TYPE "public"."network_candidate_kind" AS ENUM('PULL_REQUEST_MERGED', 'REVIEW_SUBMITTED');--> statement-breakpoint
CREATE TYPE "public"."network_decision_outcome" AS ENUM('ISSUED', 'DECLINED', 'DEFERRED');--> statement-breakpoint
CREATE TYPE "public"."network_decision_reason" AS ENUM('ISSUED', 'NOT_ELIGIBLE', 'ACTOR_CANNOT_EARN', 'REPOSITORY_NOT_ELIGIBLE', 'REQUIRES_INDEPENDENT_REVIEW', 'ALREADY_DECIDED', 'UNDER_REVIEW', 'DECLINED');--> statement-breakpoint
CREATE TYPE "public"."network_submission_status" AS ENUM('UNSUBMITTED', 'SUBMITTED');--> statement-breakpoint
CREATE TABLE "network_candidates" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"kind" "network_candidate_kind" NOT NULL,
	"candidate" jsonb NOT NULL,
	"status" "network_submission_status" DEFAULT 'UNSUBMITTED' NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempted_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "network_candidates_attempts_non_negative" CHECK ("network_candidates"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "network_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"outcome" "network_decision_outcome" NOT NULL,
	"reason" "network_decision_reason" NOT NULL,
	"rules_version" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "network_decisions" ADD CONSTRAINT "network_decisions_idempotency_key_network_candidates_idempotency_key_fk" FOREIGN KEY ("idempotency_key") REFERENCES "public"."network_candidates"("idempotency_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "network_candidates_retry_idx" ON "network_candidates" USING btree ("status","last_attempted_at");--> statement-breakpoint
CREATE INDEX "network_decisions_candidate_idx" ON "network_decisions" USING btree ("idempotency_key","received_at");--> statement-breakpoint
-- Hand-written below this line: drizzle-kit does not model triggers.
-- A candidate is the evidence Core offered, and it is never rewritten or
-- removed. Only its delivery bookkeeping moves, and its status only forward:
-- once the Network has answered, nothing makes that answer unsaid.
CREATE FUNCTION "network_candidates_evidence_is_fixed"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'network candidates are history and are never deleted';
	END IF;
	IF NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
		OR NEW.kind IS DISTINCT FROM OLD.kind
		OR NEW.candidate IS DISTINCT FROM OLD.candidate
		OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at THEN
		RAISE EXCEPTION 'a network candidate is the evidence offered and is never rewritten';
	END IF;
	IF OLD.status = 'SUBMITTED' AND NEW.status = 'UNSUBMITTED' THEN
		RAISE EXCEPTION 'a network candidate the Network answered cannot become unsubmitted';
	END IF;
	IF NEW.attempts < OLD.attempts THEN
		RAISE EXCEPTION 'network submission attempts only increase';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "network_candidates_evidence_is_fixed" BEFORE UPDATE OR DELETE ON "network_candidates" FOR EACH ROW EXECUTE FUNCTION "network_candidates_evidence_is_fixed"();--> statement-breakpoint
-- What the Network answered is history. A later answer is a new row; an
-- earlier one is never edited or removed.
CREATE FUNCTION "network_decisions_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'network decisions are append only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "network_decisions_append_only" BEFORE UPDATE OR DELETE ON "network_decisions" FOR EACH ROW EXECUTE FUNCTION "network_decisions_append_only"();
