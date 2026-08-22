import { describe, expect, it } from "vitest";

import { fromKred, kredbits } from "../primitives/money.js";
import {
  accountId,
  economyId,
  idempotencyKey,
  ledgerEntryId,
  organizationId,
  rulesVersion,
  transactionId,
} from "../primitives/ids.js";
import {
  MOVES_NO_KRED,
  TRANSACTION_TYPES,
  entry,
  transaction,
  type LedgerEntry,
} from "./ledger.js";

const AUTHOR = accountId("acct_author");
const REVIEWER = accountId("acct_reviewer");
const PROTOCOL = accountId("acct_protocol");
const V4 = rulesVersion("v0.4");
const KEY = idempotencyKey("review:8891");

const line = (
  over: Partial<LedgerEntry> & Pick<LedgerEntry, "direction" | "amount">,
): LedgerEntry =>
  entry({
    id: ledgerEntryId(`entry_${over.direction}_${over.amount}`),
    economyId: economyId("kreds-network"),
    organizationId: organizationId("org_zitdevs"),
    accountId: AUTHOR,
    type: "TRANSFER",
    sourceType: "REVIEW_SUBMITTED",
    sourceId: "8891",
    counterpartyAccountId: REVIEWER,
    rulesVersion: V4,
    idempotencyKey: KEY,
    status: "PENDING",
    settledAt: null,
    createdAt: new Date("2026-08-22T00:00:00Z"),
    metadata: {},
    ...over,
  });

/**
 * 19: Invariants, Derived invariants.
 *
 * "Every `TRANSFER` has two entries that sum to zero."
 */
describe("a transaction balances or it does not exist", () => {
  it("accepts a two-sided transfer whose entries sum to zero", () => {
    const tx = transaction({
      id: transactionId("tx_1"),
      type: "TRANSFER",
      economyId: economyId("kreds-network"),
      rulesVersion: V4,
      idempotencyKey: KEY,
      createdAt: new Date("2026-08-22T00:00:00Z"),
      entries: [
        line({ direction: "DEBIT", amount: fromKred(30), accountId: AUTHOR }),
        line({ direction: "CREDIT", amount: fromKred(30), accountId: REVIEWER }),
      ],
    });
    expect(tx.entries).toHaveLength(2);
  });

  it("rejects a one-sided entry, which is how supply drifts", () => {
    expect(() =>
      transaction({
        id: transactionId("tx_2"),
        type: "TRANSFER",
        economyId: economyId("kreds-network"),
        rulesVersion: V4,
        idempotencyKey: KEY,
        createdAt: new Date("2026-08-22T00:00:00Z"),
        entries: [line({ direction: "CREDIT", amount: fromKred(30), accountId: REVIEWER })],
      }),
    ).toThrow(/does not balance/i);
  });

  it("balances a three-way review payment across reviewer and protocol", () => {
    const tx = transaction({
      id: transactionId("tx_3"),
      type: "TRANSFER",
      economyId: economyId("kreds-network"),
      rulesVersion: V4,
      idempotencyKey: KEY,
      createdAt: new Date("2026-08-22T00:00:00Z"),
      entries: [
        line({ direction: "DEBIT", amount: fromKred(30), accountId: AUTHOR }),
        line({ direction: "CREDIT", amount: fromKred(29.4), accountId: REVIEWER }),
        line({ direction: "CREDIT", amount: fromKred(0.6), accountId: PROTOCOL }),
      ],
    });
    expect(tx.entries).toHaveLength(3);
  });

  it("rejects a transaction with no entries", () => {
    expect(() =>
      transaction({
        id: transactionId("tx_4"),
        type: "TRANSFER",
        economyId: economyId("kreds-network"),
        rulesVersion: V4,
        idempotencyKey: KEY,
        createdAt: new Date("2026-08-22T00:00:00Z"),
        entries: [],
      }),
    ).toThrow(/at least one entry/i);
  });
});

/**
 * Law XV, Rules May Change, History May Not, and 19: Invariants.
 *
 * "Every entry carries a `rulesVersion`."
 */
describe("every entry is priced by a named policy version", () => {
  it("rejects an entry whose rules version disagrees with its transaction", () => {
    expect(() =>
      transaction({
        id: transactionId("tx_5"),
        type: "TRANSFER",
        economyId: economyId("kreds-network"),
        rulesVersion: V4,
        idempotencyKey: KEY,
        createdAt: new Date("2026-08-22T00:00:00Z"),
        entries: [
          line({ direction: "DEBIT", amount: fromKred(30), accountId: AUTHOR }),
          line({
            direction: "CREDIT",
            amount: fromKred(30),
            accountId: REVIEWER,
            rulesVersion: rulesVersion("v0.3"),
          }),
        ],
      }),
    ).toThrow(/rules version/i);
  });
});

/**
 * 06: Ledger, Idempotency. GitHub delivers webhooks at least once, so a
 * duplicate delivery must never duplicate a reward.
 */
describe("every entry carries the idempotency key of its cause", () => {
  it("rejects an entry smuggling a different idempotency key", () => {
    expect(() =>
      transaction({
        id: transactionId("tx_6"),
        type: "TRANSFER",
        economyId: economyId("kreds-network"),
        rulesVersion: V4,
        idempotencyKey: KEY,
        createdAt: new Date("2026-08-22T00:00:00Z"),
        entries: [
          line({ direction: "DEBIT", amount: fromKred(30), accountId: AUTHOR }),
          line({
            direction: "CREDIT",
            amount: fromKred(30),
            accountId: REVIEWER,
            idempotencyKey: idempotencyKey("review:9999"),
          }),
        ],
      }),
    ).toThrow(/idempotency/i);
  });
});

/**
 * 06: Ledger, Transaction types.
 *
 * "`RECEIVABLE_CREATED` and `RECEIVABLE_CANCELLED` are the only entry types that
 *  move **no KRED at all**. They record a liability appearing and disappearing.
 *  Keeping them in the ledger rather than in a side table is deliberate: a claim
 *  that is invisible to the ledger is a claim nobody can audit."
 */
describe("claims are recorded in the ledger without moving KRED", () => {
  it("names exactly the two types that move nothing", () => {
    expect([...MOVES_NO_KRED]).toEqual(["RECEIVABLE_CREATED", "RECEIVABLE_CANCELLED"]);
  });

  it("records a receivable as a memo entry that balances trivially", () => {
    const tx = transaction({
      id: transactionId("tx_7"),
      type: "RECEIVABLE_CREATED",
      economyId: economyId("kreds-network"),
      rulesVersion: V4,
      idempotencyKey: KEY,
      createdAt: new Date("2026-08-22T00:00:00Z"),
      entries: [
        line({
          direction: "MEMO",
          amount: fromKred(30),
          accountId: REVIEWER,
          type: "RECEIVABLE_CREATED",
        }),
      ],
    });
    expect(tx.entries[0]?.direction).toBe("MEMO");
  });

  it("refuses a memo entry on a type that is supposed to move KRED", () => {
    expect(() =>
      transaction({
        id: transactionId("tx_8"),
        type: "TRANSFER",
        economyId: economyId("kreds-network"),
        rulesVersion: V4,
        idempotencyKey: KEY,
        createdAt: new Date("2026-08-22T00:00:00Z"),
        entries: [line({ direction: "MEMO", amount: fromKred(30), accountId: REVIEWER })],
      }),
    ).toThrow(/moves KRED/i);
  });

  it("refuses a balancing entry on a type that must move nothing", () => {
    expect(() =>
      transaction({
        id: transactionId("tx_9"),
        type: "RECEIVABLE_CANCELLED",
        economyId: economyId("kreds-network"),
        rulesVersion: V4,
        idempotencyKey: KEY,
        createdAt: new Date("2026-08-22T00:00:00Z"),
        entries: [
          line({ direction: "DEBIT", amount: fromKred(30), type: "RECEIVABLE_CANCELLED" }),
          line({ direction: "CREDIT", amount: fromKred(30), type: "RECEIVABLE_CANCELLED" }),
        ],
      }),
    ).toThrow(/moves no KRED/i);
  });
});

describe("the transaction vocabulary is the one the ledger chapter defines", () => {
  it("carries the original twelve types and the seven A01 additions", () => {
    expect(TRANSACTION_TYPES).toHaveLength(19);
    expect(TRANSACTION_TYPES).toContain("DISTRIBUTION");
    expect(TRANSACTION_TYPES).toContain("CREDIT_DRAW");
    expect(TRANSACTION_TYPES).toContain("SETTLEMENT");
  });
});

/**
 * 06: Ledger, Immutable history.
 *
 * "Never delete transactions to repair economic state. Use `REVERSAL`,
 *  `ADJUSTMENT`, or `REFUND`."
 */
describe("history is immutable", () => {
  it("freezes the entry list so no caller can rewrite a recorded transaction", () => {
    const tx = transaction({
      id: transactionId("tx_10"),
      type: "TRANSFER",
      economyId: economyId("kreds-network"),
      rulesVersion: V4,
      idempotencyKey: KEY,
      createdAt: new Date("2026-08-22T00:00:00Z"),
      entries: [
        line({ direction: "DEBIT", amount: fromKred(30), accountId: AUTHOR }),
        line({ direction: "CREDIT", amount: fromKred(30), accountId: REVIEWER }),
      ],
    });
    expect(Object.isFrozen(tx.entries)).toBe(true);
    expect(Object.isFrozen(tx)).toBe(true);
  });

  it("rejects a zero-amount entry, which records nothing and explains nothing", () => {
    expect(() => line({ direction: "DEBIT", amount: kredbits(0n) })).toThrow(/zero/i);
  });
});
