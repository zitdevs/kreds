import { and, eq, inArray, sql } from "drizzle-orm";
import {
  kredbits,
  transaction as validateTransaction,
  type Kredbits,
  type Transaction,
} from "@kreds/domain";

import type { Database } from "../client.js";
import { accounts, ledgerEntries, ledgerTransactions } from "../schema/index.js";

/**
 * Either the pool or an open transaction.
 *
 * The balance check has to run *inside* the transaction that wrote the entries,
 * or it would read a state the rest of the world can already see and the whole
 * lock would be decorative.
 */
type Queryable = Pick<Database, "select">;

/**
 * Thrown when a movement would take an account below zero.
 *
 * Law XXI, No Monetary Creation Through Debt: "A negative economic position may
 * represent a liability, but it may never create spendable Official KRED." Debt
 * is a separate field, never a negative balance, and 06 is explicit that "an
 * implementation that can produce a negative balance can mint currency."
 *
 * Its own error type rather than a generic one, because a caller has to be able
 * to tell an overdraft from a database failure: the first is a decision the
 * economy made and the second is an outage.
 */
export class InsufficientBalanceError extends Error {
  constructor(
    readonly accountId: string,
    readonly shortfall: Kredbits,
  ) {
    super(`account ${accountId} would go negative by ${shortfall} subunits.`);
    this.name = "InsufficientBalanceError";
  }
}

export interface PostedTransaction {
  readonly id: string;
  readonly idempotencyKey: string;
  /** False when this movement had already been posted. */
  readonly isNew: boolean;
}

/**
 * The ledger.
 *
 * 06 calls ledger-first "the single most consequential engineering decision in
 * the system, and the one most likely to be compromised for convenience", so
 * the shortcuts it warns about are made unavailable rather than discouraged:
 *
 * - There is no balance column, so a balance cannot be stored.
 * - There is no method that writes a single entry, so nothing can post one side
 *   of a movement.
 * - There is no update or delete, so history cannot be repaired in place.
 *
 * What remains is `post`, which writes a balanced transaction or writes nothing.
 */
export class Ledger {
  constructor(private readonly db: Database) {}

  /**
   * Post a balanced transaction, atomically.
   *
   * Three things have to hold, and all three are checked before anything is
   * visible to anybody:
   *
   * 1. **The entries balance.** Validated by `@kreds/domain`, which enforces it
   *    per economy so that only an `EXCHANGE` may span two (Law X).
   * 2. **No account goes negative.** Checked after the entries are written and
   *    inside the same database transaction, with the affected accounts locked
   *    first so a concurrent debit cannot slip between the check and the write.
   * 3. **The same movement posts once.** The idempotency key is unique, and a
   *    repeat returns the original rather than raising.
   *
   * @throws InsufficientBalanceError when the movement would overdraw an
   * account. The database transaction rolls back, so nothing is written.
   */
  async post(candidate: Transaction): Promise<PostedTransaction> {
    // Balance and economy rules first, before touching the database. A
    // malformed transaction should never reach a connection.
    const validated = validateTransaction(candidate);

    const existing = await this.findByIdempotencyKey(validated.idempotencyKey);
    if (existing) return { ...existing, isNew: false };

    return this.db.transaction(async (tx) => {
      const affected = [...new Set(validated.entries.map((entry) => entry.accountId))];

      // Lock every affected account for the rest of this transaction. Without
      // this, two concurrent debits can each read a sufficient balance, each
      // pass the check, and together overdraw the account, which is the exact
      // path 06 says can mint currency.
      await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(inArray(accounts.id, affected))
        .for("update");

      const [posted] = await tx
        .insert(ledgerTransactions)
        .values({
          economyId: validated.economyId,
          type: validated.type,
          idempotencyKey: validated.idempotencyKey,
          rulesVersion: validated.rulesVersion,
          metadata: null,
        })
        .onConflictDoNothing({ target: ledgerTransactions.idempotencyKey })
        .returning();

      if (!posted) {
        // Another connection posted the same movement between the check above
        // and this insert. That is the idempotency working, not a failure.
        const raced = await this.findByIdempotencyKey(validated.idempotencyKey);
        if (!raced) throw new Error(`transaction ${validated.idempotencyKey} vanished mid-post.`);
        return { ...raced, isNew: false };
      }

      await tx.insert(ledgerEntries).values(
        validated.entries.map((entry) => ({
          transactionId: posted.id,
          economyId: entry.economyId,
          organizationId: entry.organizationId,
          accountId: entry.accountId,
          direction: entry.direction,
          amount: entry.amount,
          type: entry.type,
          sourceType: entry.sourceType,
          sourceId: entry.sourceId,
          counterpartyAccountId: entry.counterpartyAccountId,
          rulesVersion: entry.rulesVersion,
          idempotencyKey: entry.idempotencyKey,
          status: entry.status,
          settledAt: entry.settledAt === null ? null : new Date(entry.settledAt),
          metadata: entry.metadata,
        })),
      );

      // Law XXI, checked on every account this moved rather than only the ones
      // it debited. A transaction type that credits somewhere it should not is
      // still caught, and checking all of them costs one query.
      for (const accountId of affected) {
        // Read as a plain bigint, not as Kredbits. `kredbits()` refuses a
        // negative value, which is the invariant working, and branding before
        // the check would raise a RangeError instead of the overdraft this
        // needs to report. The type cannot hold the thing being detected.
        const balance = await this.rawBalance(tx, accountId);
        if (balance < 0n) {
          throw new InsufficientBalanceError(accountId, kredbits(-balance));
        }
      }

      return { id: posted.id, idempotencyKey: posted.idempotencyKey, isNew: true };
    });
  }

  /**
   * An account's balance, derived.
   *
   * Never stored. 06: "A stored balance is faster to read and vastly simpler to
   * write. It is also unauditable, unreversible, and impossible to reconcile,
   * and the moment it drifts from reality by one kredbit, there is no way to
   * find out why."
   */
  async balanceOf(accountId: string): Promise<Kredbits> {
    return kredbits(await this.rawBalance(this.db, accountId));
  }

  /**
   * What has settled, which is not the same as what has been earned.
   *
   * Law VII, Extraction Is Not Guaranteed. A pending entry is value that
   * happened and is still inside the settlement window, and treating the two as
   * one number is how an economy pays out money it has not finished verifying.
   */
  async settledBalanceOf(accountId: string): Promise<Kredbits> {
    const [row] = await this.db
      .select({ total: this.netAmount() })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.accountId, accountId), eq(ledgerEntries.status, "SETTLED")));
    return kredbits(BigInt(row?.total ?? 0));
  }

  /** Every entry for one account, oldest first, so history explains the balance. */
  async entriesFor(accountId: string, limit = 200) {
    return this.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.accountId, accountId))
      .orderBy(sql`${ledgerEntries.createdAt} asc`)
      .limit(limit);
  }

  /** The entries of one transaction, for auditing that it balanced. */
  async entriesOf(transactionId: string) {
    return this.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.transactionId, transactionId));
  }

  private async findByIdempotencyKey(
    key: string,
  ): Promise<{ id: string; idempotencyKey: string } | null> {
    const [row] = await this.db
      .select({ id: ledgerTransactions.id, idempotencyKey: ledgerTransactions.idempotencyKey })
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.idempotencyKey, key))
      .limit(1);
    return row ?? null;
  }

  /**
   * The unbranded sum.
   *
   * `Kredbits` cannot be negative by construction, so a balance that has gone
   * negative cannot be expressed in it. Everything that needs to *detect* one
   * reads this and brands afterwards.
   */
  private async rawBalance(db: Queryable, accountId: string): Promise<bigint> {
    const [row] = await db
      .select({ total: this.netAmount() })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.accountId, accountId));
    return BigInt(row?.total ?? 0);
  }

  /**
   * Credits minus debits, in one place.
   *
   * `MEMO` entries are excluded because they move no KRED: `RECEIVABLE_CREATED`
   * and `RECEIVABLE_CANCELLED` record a liability appearing and disappearing,
   * and counting them would make a claim look like money.
   *
   * Summed in the database as `numeric` and read back as a string, then widened
   * to `BigInt`. A `SUM` over `bigint` that came back as a JavaScript number
   * would be the floating point error 06 forbids, arriving through the one
   * place nobody looks.
   */
  private netAmount() {
    return sql<string>`coalesce(sum(
      case ${ledgerEntries.direction}
        when 'CREDIT' then ${ledgerEntries.amount}
        when 'DEBIT'  then -${ledgerEntries.amount}
        else 0
      end
    ), 0)::text`;
  }
}
