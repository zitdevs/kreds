CREATE TYPE "public"."debt_scope" AS ENUM('USER', 'ORGANIZATION', 'PROJECT');--> statement-breakpoint
CREATE TYPE "public"."receivable_status" AS ENUM('AWAITING_FUNDING', 'PARTIALLY_SETTLED', 'SETTLED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "debt_scope" NOT NULL,
	"obligor_account_id" uuid NOT NULL,
	"lending_account_id" uuid NOT NULL,
	"principal" bigint NOT NULL,
	"outstanding" bigint NOT NULL,
	"rules_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debts_principal_positive" CHECK ("debts"."principal" > 0),
	CONSTRAINT "debts_outstanding_non_negative" CHECK ("debts"."outstanding" >= 0),
	CONSTRAINT "debts_outstanding_within_principal" CHECK ("debts"."outstanding" <= "debts"."principal")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "receivables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claimant_account_id" uuid NOT NULL,
	"obligor_account_id" uuid NOT NULL,
	"gross_value" bigint NOT NULL,
	"settled_value" bigint NOT NULL,
	"status" "receivable_status" DEFAULT 'AWAITING_FUNDING' NOT NULL,
	"rules_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receivables_gross_positive" CHECK ("receivables"."gross_value" > 0),
	CONSTRAINT "receivables_settled_non_negative" CHECK ("receivables"."settled_value" >= 0),
	CONSTRAINT "receivables_settled_within_gross" CHECK ("receivables"."settled_value" <= "receivables"."gross_value"),
	CONSTRAINT "receivables_claimant_is_not_obligor" CHECK ("receivables"."claimant_account_id" <> "receivables"."obligor_account_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "debts" ADD CONSTRAINT "debts_obligor_account_id_accounts_id_fk" FOREIGN KEY ("obligor_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "debts" ADD CONSTRAINT "debts_lending_account_id_accounts_id_fk" FOREIGN KEY ("lending_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "receivables" ADD CONSTRAINT "receivables_claimant_account_id_accounts_id_fk" FOREIGN KEY ("claimant_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "receivables" ADD CONSTRAINT "receivables_obligor_account_id_accounts_id_fk" FOREIGN KEY ("obligor_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debts_obligor_idx" ON "debts" USING btree ("obligor_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debts_lender_idx" ON "debts" USING btree ("lending_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receivables_claimant_idx" ON "receivables" USING btree ("claimant_account_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receivables_obligor_idx" ON "receivables" USING btree ("obligor_account_id","status","created_at");