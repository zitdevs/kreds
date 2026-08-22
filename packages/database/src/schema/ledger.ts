import { relations } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations } from "./github";

/** Mirrors `EconomyType` in `@kreds/domain`. See 14 to 16 on sovereign economies. */
export const economyType = pgEnum("economy_type", [
  "KREDS_NETWORK",
  "SOVEREIGN_NETWORK",
  "INDEPENDENT",
]);

/** Mirrors `CurrencyType`. Law X: official KRED and a local currency are not the same thing. */
export const currencyType = pgEnum("currency_type", ["KRED", "LOCAL"]);

/** Mirrors `AccountType`. */
export const accountType = pgEnum("account_type", [
  "CENTRAL_BANK_RESERVE",
  "GLOBAL_WALLET",
  "ORGANIZATION_POSITION",
  "TREASURY",
  "REVIEW_FUND",
  "PENDING",
  "NETWORK_RESERVE",
  "PROTOCOL",
  "BURNED",
]);

/** Mirrors `TransactionType`. 06: Ledger, Transaction types. */
export const transactionType = pgEnum("transaction_type", [
  "DISTRIBUTION",
  "TRANSFER",
  "FEE",
  "REFUND",
  "REVERSAL",
  "TREASURY_CONTRIBUTION",
  "TREASURY_DISTRIBUTION",
  "BURN",
  "ADJUSTMENT",
  "RESERVE_ALLOCATION",
  "EXCHANGE",
  "SETTLEMENT",
  "REVIEW_FUND_CONTRIBUTION",
  "REVIEW_FUND_PAYMENT",
  "CREDIT_DRAW",
  "DEBT_REPAYMENT",
  "RECEIVABLE_CREATED",
  "RECEIVABLE_SETTLED",
  "RECEIVABLE_CANCELLED",
]);

/**
 * Mirrors `EntryDirection`.
 *
 * `MEMO` exists for the two entry types that move no KRED at all,
 * `RECEIVABLE_CREATED` and `RECEIVABLE_CANCELLED`. 06 keeps them in the ledger
 * rather than in a side table on purpose: "a claim that is invisible to the
 * ledger is a claim nobody can audit."
 */
export const entryDirection = pgEnum("entry_direction", ["DEBIT", "CREDIT", "MEMO"]);

/** Mirrors `EntrySourceType`. Traces every entry back to what caused it. */
export const entrySourceType = pgEnum("entry_source_type", [
  "PULL_REQUEST_MERGED",
  "PULL_REQUEST_CLOSED",
  "REVIEW_SUBMITTED",
  "SETTLEMENT_RUN",
  "TREASURY_OPERATION",
  "CREDIT_OPERATION",
  "NETWORK_OPERATION",
  "MANUAL_ADJUSTMENT",
]);

/** Mirrors `EntryStatus`. Law VII: earned is not the same as withdrawable. */
export const entryStatus = pgEnum("entry_status", ["PENDING", "SETTLED"]);

/**
 * An economy: the boundary a currency and its accounts live inside.
 *
 * Law IV makes a GitHub organization the default economic boundary, and Law X
 * keeps official KRED separate from local currencies. Both are enforced by
 * every account and entry naming the economy it belongs to.
 */
export const economies = pgTable(
  "economies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: economyType("type").notNull(),
    /** Null for a network-level economy that belongs to no single organization. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("economies_organization_idx").on(table.organizationId)],
);

/**
 * A currency.
 *
 * `subunitsPerUnit` is stored rather than assumed. 06 says the subunit name may
 * change but the integer requirement may not, and a local economy is free to
 * choose its own scale. Nothing reads a hard-coded 100.
 */
export const currencies = pgTable(
  "currencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    economyId: uuid("economy_id")
      .notNull()
      .references(() => economies.id, { onDelete: "restrict" }),
    type: currencyType("type").notNull(),
    /** `KRED`, `ZIT`. Display only. */
    code: text("code").notNull(),
    name: text("name").notNull(),
    subunitsPerUnit: integer("subunits_per_unit").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("currencies_economy_idx").on(table.economyId)],
);

/**
 * An account.
 *
 * **There is deliberately no balance column.**
 *
 * 06: Ledger is blunt about why, and it is worth keeping the reason next to the
 * absence: "A stored balance is faster to read and vastly simpler to write. It
 * is also unauditable, unreversible, and impossible to reconcile, and the
 * moment it drifts from reality by one kredbit, there is no way to find out
 * why."
 *
 * Balances are derived from entries. Every time. The absence of the column is
 * what makes that true rather than aspirational.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    economyId: uuid("economy_id")
      .notNull()
      .references(() => economies.id, { onDelete: "restrict" }),
    type: accountType("type").notNull(),
    /**
     * The GitHub identity this account belongs to, when it belongs to a person.
     *
     * Keyed on the identity rather than the Kreds account, for the same reason
     * contributions are: Law XVII lets an identity earn before it has an
     * account, so keying on the account would leave that value belonging to
     * nobody.
     */
    ownerGitHubUserId: bigint("owner_github_user_id", { mode: "number" }),
    /** Enforces the organization boundary (Law IV). Null for network-level accounts. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("accounts_economy_owner_idx").on(table.economyId, table.ownerGitHubUserId),
    index("accounts_economy_type_idx").on(table.economyId, table.type),
    index("accounts_organization_idx").on(table.organizationId),
  ],
);

/**
 * A grouped, balanced set of entries.
 *
 * Nothing reaches the ledger except through one of these, which is what makes
 * the balance invariant checkable: entries are written together or not at all,
 * and a transaction whose entries do not sum to zero is rejected before any of
 * it lands.
 */
export const ledgerTransactions = pgTable(
  "ledger_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    economyId: uuid("economy_id")
      .notNull()
      .references(() => economies.id, { onDelete: "restrict" }),
    type: transactionType("type").notNull(),
    /**
     * Makes a duplicate webhook harmless.
     *
     * 06: "GitHub explicitly delivers webhooks *at least once*: retries after
     * timeouts, redeliveries, and duplicate events under load are normal
     * operation, not failure."
     */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    /** Law XV: makes history immune to policy changes. */
    rulesVersion: text("rules_version").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ledger_transactions_economy_idx").on(table.economyId, table.createdAt)],
);

/**
 * One side of a movement.
 *
 * `amount` is a non-negative integer count of subunits and `direction` carries
 * the sign. Two columns rather than one signed number, because a query that
 * forgot the sign would silently compute the wrong balance, and a reader
 * scanning rows can see what each one did.
 *
 * `bigint` in `bigint` mode, so values round-trip as BigInt and never touch a
 * JavaScript number. 06: "Floating point silently loses value. `0.1 + 0.2 !==
 * 0.3` is a curiosity in a tutorial and a supply-conservation violation here."
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: "restrict" }),
    economyId: uuid("economy_id")
      .notNull()
      .references(() => economies.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    direction: entryDirection("direction").notNull(),
    /** Non-negative subunits. The sign lives in `direction`. */
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    type: transactionType("type").notNull(),
    sourceType: entrySourceType("source_type").notNull(),
    /** What caused this, traceable back to the GitHub event. */
    sourceId: text("source_id").notNull(),
    /** Makes every transfer two-sided and reconcilable. */
    counterpartyAccountId: uuid("counterparty_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    rulesVersion: text("rules_version").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: entryStatus("status").notNull().default("PENDING"),
    /** Law VII: separates earned from withdrawable. */
    settledAt: timestamp("settled_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Deriving a balance: every entry for one account.
    index("ledger_entries_account_idx").on(table.accountId, table.status),
    index("ledger_entries_transaction_idx").on(table.transactionId),
    index("ledger_entries_economy_idx").on(table.economyId, table.createdAt),
    // Tracing an entry back to what caused it.
    index("ledger_entries_source_idx").on(table.sourceType, table.sourceId),
  ],
);

export const economyRelations = relations(economies, ({ many, one }) => ({
  currencies: many(currencies),
  accounts: many(accounts),
  organization: one(organizations, {
    fields: [economies.organizationId],
    references: [organizations.id],
  }),
}));

export const accountRelations = relations(accounts, ({ one, many }) => ({
  economy: one(economies, { fields: [accounts.economyId], references: [economies.id] }),
  entries: many(ledgerEntries),
}));

export const ledgerTransactionRelations = relations(ledgerTransactions, ({ many, one }) => ({
  entries: many(ledgerEntries),
  economy: one(economies, {
    fields: [ledgerTransactions.economyId],
    references: [economies.id],
  }),
}));

export const ledgerEntryRelations = relations(ledgerEntries, ({ one }) => ({
  transaction: one(ledgerTransactions, {
    fields: [ledgerEntries.transactionId],
    references: [ledgerTransactions.id],
  }),
  account: one(accounts, { fields: [ledgerEntries.accountId], references: [accounts.id] }),
}));
