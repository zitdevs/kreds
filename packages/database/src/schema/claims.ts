import { relations } from "drizzle-orm";
import { bigint, check, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { accounts } from "./ledger";

/**
 * Obligations and claims. **Neither of these tables holds money.**
 *
 * 19: Invariants is explicit that they are outside the supply equation:
 *
 * > "Debt is what someone owes. Receivables are what someone is owed. Neither
 * > is money, and adding either to the equation would double-count the KRED
 * > that funds them."
 *
 * That is why they live in their own file and their own tables rather than as
 * columns on `accounts`. Amendment A01 exists because the original model
 * recorded debt as a negative balance, which let a reviewer be paid in KRED
 * that never came from the five million. A liability sitting in a separate
 * table cannot be summed into a balance by accident.
 */

/** Mirrors `DebtScope`. 23: Review Funding, Debt and Credit, Who owes the debt. */
export const debtScope = pgEnum("debt_scope", ["USER", "ORGANIZATION", "PROJECT"]);

/** Mirrors `ReceivableStatus`. */
export const receivableStatus = pgEnum("receivable_status", [
  "AWAITING_FUNDING",
  "PARTIALLY_SETTLED",
  "SETTLED",
  "CANCELLED",
]);

/**
 * What a position owes.
 *
 * Law XXI, No Monetary Creation Through Debt: "A negative economic position may
 * represent a liability, but it may never create spendable Official KRED."
 *
 * `principal` and `outstanding` are separate columns because repayment reduces
 * what is still owed and must not touch what was originally financed. 23 puts
 * the author's debt at "the full gross review value", so the principal is the
 * number that has to survive.
 */
export const debts = pgTable(
  "debts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: debtScope("scope").notNull(),
    /** The account that owes. */
    obligorAccountId: uuid("obligor_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    /**
     * Where the KRED came from, and where repayment returns it.
     *
     * 23: "Debt repayment is a `TRANSFER` back to the lending account, never a
     * `BURN`." Without this column the repayment has nowhere to go, and KRED
     * that should return to the facility would have to be destroyed or
     * invented.
     */
    lendingAccountId: uuid("lending_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    /** The full gross value originally financed. Never edited. */
    principal: bigint("principal", { mode: "bigint" }).notNull(),
    /** What is still owed. Repayment reduces this. */
    outstanding: bigint("outstanding", { mode: "bigint" }).notNull(),
    /** Law XV: a past obligation stays explainable under the rules that made it. */
    rulesVersion: text("rules_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Deriving a position: every obligation this account carries.
    index("debts_obligor_idx").on(table.obligorAccountId),
    index("debts_lender_idx").on(table.lendingAccountId),
    // Constraints rather than conventions. Phase 7A removed the balance column
    // so a balance could not be stored; the same reasoning applies here, a
    // liability that cannot hold a nonsense value cannot be read as one.
    check("debts_principal_positive", sql`${table.principal} > 0`),
    check("debts_outstanding_non_negative", sql`${table.outstanding} >= 0`),
    // Repayment reduces what is owed and never raises it above what was
    // financed. Without this, a repayment recorded with the wrong sign would
    // deepen the debt and nothing would notice.
    check("debts_outstanding_within_principal", sql`${table.outstanding} <= ${table.principal}`),
  ],
);

/**
 * Work done, recognised, and not yet funded.
 *
 * Law XXIV, Unfunded Work Is a Claim, Not Currency: receivables "do not count
 * toward KRED supply and cannot be transferred, spent, or withdrawn until
 * funded."
 *
 * There is deliberately no `holderAccountId` that could be reassigned. A claim
 * that could change hands would be a transferable instrument, which is a second
 * money supply with none of the first one's controls.
 */
export const receivables = pgTable(
  "receivables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The reviewer who is owed. Fixed at creation. */
    claimantAccountId: uuid("claimant_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    /** Whose future earnings settle this first (Law VIII). */
    obligorAccountId: uuid("obligor_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    /**
     * Full gross review value.
     *
     * Gross, because 23's A03 interpretation has a receivable settle "exactly
     * like the payment it deferred": storing it net would quietly hand
     * colluding accounts the fee arbitrage that decision closed.
     */
    grossValue: bigint("gross_value", { mode: "bigint" }).notNull(),
    /** How much has been funded so far. A claim may settle partially. */
    settledValue: bigint("settled_value", { mode: "bigint" }).notNull(),
    status: receivableStatus("status").notNull().default("AWAITING_FUNDING"),
    rulesVersion: text("rules_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Deriving a position: every claim this account holds.
    index("receivables_claimant_idx").on(table.claimantAccountId, table.status),
    // Settling: oldest eligible first, for one obligor (23, Payment ordering).
    index("receivables_obligor_idx").on(table.obligorAccountId, table.status, table.createdAt),
    check("receivables_gross_positive", sql`${table.grossValue} > 0`),
    check("receivables_settled_non_negative", sql`${table.settledValue} >= 0`),
    // A claim settled beyond its value would leave a negative amount
    // outstanding, and a negative claim is a claim that owes its holder money.
    check("receivables_settled_within_gross", sql`${table.settledValue} <= ${table.grossValue}`),
    // A claimant cannot be their own obligor: that is a claim against oneself,
    // which settles by paying yourself. Law XXXIV forbids the version of this
    // that uses a second account; this forbids the version that uses none.
    check(
      "receivables_claimant_is_not_obligor",
      sql`${table.claimantAccountId} <> ${table.obligorAccountId}`,
    ),
  ],
);

export const debtRelations = relations(debts, ({ one }) => ({
  obligor: one(accounts, {
    fields: [debts.obligorAccountId],
    references: [accounts.id],
    relationName: "debtObligor",
  }),
  lender: one(accounts, {
    fields: [debts.lendingAccountId],
    references: [accounts.id],
    relationName: "debtLender",
  }),
}));

export const receivableRelations = relations(receivables, ({ one }) => ({
  claimant: one(accounts, {
    fields: [receivables.claimantAccountId],
    references: [accounts.id],
    relationName: "receivableClaimant",
  }),
  obligor: one(accounts, {
    fields: [receivables.obligorAccountId],
    references: [accounts.id],
    relationName: "receivableObligor",
  }),
}));
