CREATE TYPE "public"."account_type" AS ENUM('CENTRAL_BANK_RESERVE', 'GLOBAL_WALLET', 'ORGANIZATION_POSITION', 'TREASURY', 'REVIEW_FUND', 'PENDING', 'NETWORK_RESERVE', 'PROTOCOL', 'BURNED');--> statement-breakpoint
CREATE TYPE "public"."currency_type" AS ENUM('KRED', 'LOCAL');--> statement-breakpoint
CREATE TYPE "public"."economy_type" AS ENUM('KREDS_NETWORK', 'SOVEREIGN_NETWORK', 'INDEPENDENT');--> statement-breakpoint
CREATE TYPE "public"."entry_direction" AS ENUM('DEBIT', 'CREDIT', 'MEMO');--> statement-breakpoint
CREATE TYPE "public"."entry_source_type" AS ENUM('PULL_REQUEST_MERGED', 'PULL_REQUEST_CLOSED', 'REVIEW_SUBMITTED', 'SETTLEMENT_RUN', 'TREASURY_OPERATION', 'CREDIT_OPERATION', 'NETWORK_OPERATION', 'MANUAL_ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."entry_status" AS ENUM('PENDING', 'SETTLED');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('DISTRIBUTION', 'TRANSFER', 'FEE', 'REFUND', 'REVERSAL', 'TREASURY_CONTRIBUTION', 'TREASURY_DISTRIBUTION', 'BURN', 'ADJUSTMENT', 'RESERVE_ALLOCATION', 'EXCHANGE', 'SETTLEMENT', 'REVIEW_FUND_CONTRIBUTION', 'REVIEW_FUND_PAYMENT', 'CREDIT_DRAW', 'DEBT_REPAYMENT', 'RECEIVABLE_CREATED', 'RECEIVABLE_SETTLED', 'RECEIVABLE_CANCELLED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"economy_id" uuid NOT NULL,
	"type" "account_type" NOT NULL,
	"owner_github_user_id" bigint,
	"organization_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "currencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"economy_id" uuid NOT NULL,
	"type" "currency_type" NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"subunits_per_unit" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "economies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "economy_type" NOT NULL,
	"organization_id" uuid,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"economy_id" uuid NOT NULL,
	"organization_id" uuid,
	"account_id" uuid NOT NULL,
	"direction" "entry_direction" NOT NULL,
	"amount" bigint NOT NULL,
	"type" "transaction_type" NOT NULL,
	"source_type" "entry_source_type" NOT NULL,
	"source_id" text NOT NULL,
	"counterparty_account_id" uuid,
	"rules_version" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "entry_status" DEFAULT 'PENDING' NOT NULL,
	"settled_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"economy_id" uuid NOT NULL,
	"type" "transaction_type" NOT NULL,
	"idempotency_key" text NOT NULL,
	"rules_version" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_transactions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_economy_id_economies_id_fk" FOREIGN KEY ("economy_id") REFERENCES "public"."economies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "currencies" ADD CONSTRAINT "currencies_economy_id_economies_id_fk" FOREIGN KEY ("economy_id") REFERENCES "public"."economies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "economies" ADD CONSTRAINT "economies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_economy_id_economies_id_fk" FOREIGN KEY ("economy_id") REFERENCES "public"."economies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_counterparty_account_id_accounts_id_fk" FOREIGN KEY ("counterparty_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_economy_id_economies_id_fk" FOREIGN KEY ("economy_id") REFERENCES "public"."economies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_economy_owner_idx" ON "accounts" USING btree ("economy_id","owner_github_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_economy_type_idx" ON "accounts" USING btree ("economy_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_organization_idx" ON "accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "currencies_economy_idx" ON "currencies" USING btree ("economy_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "economies_organization_idx" ON "economies" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_transaction_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_economy_idx" ON "ledger_entries" USING btree ("economy_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_source_idx" ON "ledger_entries" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_transactions_economy_idx" ON "ledger_transactions" USING btree ("economy_id","created_at");