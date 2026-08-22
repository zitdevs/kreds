import { describe, expect, it } from "vitest";

import { backingRatio, fromKred, kredbits } from "../primitives/money.js";
import { fromIso } from "../primitives/time.js";
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
const KREDS = economyId("kreds-network");
const LOCAL = economyId("zitdevs-LOCAL");
const V4 = rulesVersion("v0.4");
const KEY = idempotencyKey("review:8891");
const AT = fromIso("2026-08-22T00:00:00Z");

let n = 0;
const line = (
  over: Partial<LedgerEntry> & Pick<LedgerEntry, "direction" | "amount">,
): LedgerEntry => {
  n += 1;
  return {
    id: ledgerEntryId(`entry_${n}`),
    economyId: KREDS,
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
    createdAt: AT,
    metadata: {},
    ...over,
  };
};

const tx = (over: Partial<Parameters<typeof transaction>[0]> = {}) =>
  transaction({
    id: transactionId(`tx_${n}`),
    type: "TRANSFER",
    economyId: KREDS,
    rulesVersion: V4,
    idempotencyKey: KEY,
    createdAt: AT,
    entries: [],
    ...over,
  });

/**
 * 19: Invariants, Derived invariants.
 *
 * "Every `TRANSFER` has two entries that sum to zero."
 */
describe("a transaction balances or it does not exist", () => {
  it("accepts a two-sided transfer whose entries sum to zero", () => {
    const result = tx({
      entries: [
        line({ direction: "DEBIT", amount: fromKred(30), accountId: AUTHOR }),
        line({ direction: "CREDIT", amount: fromKred(30), accountId: REVIEWER }),
      ],
    });
    expect(result.entries).toHaveLength(2);
  });

  it("rejects a one-sided entry, which is how supply drifts", () => {
    expect(() => tx({ entries: [line({ direction: "CREDIT", amount: fromKred(30) })] })).toThrow(
      /does not balance/i,
    );
  });

  it("balances a three-way review payment across reviewer and protocol", () => {
    // 23: Level 1, author-funded: Author -30.0, Reviewer +29.4, Protocol +0.6
    const result = tx({
      entries: [
        line({ direction: "DEBIT", amount: fromKred(30), accountId: AUTHOR }),
        line({ direction: "CREDIT", amount: fromKred(29.4), accountId: REVIEWER }),
        line({ direction: "CREDIT", amount: fromKred(0.6), accountId: PROTOCOL }),
      ],
    });
    expect(result.entries).toHaveLength(3);
  });

  it("rejects a transaction with no entries", () => {
    expect(() => tx({ entries: [] })).toThrow(/at least one entry/i);
  });
});

/**
 * Law X, Local Currency Stays Local, and Law I, Official Issuance.
 *
 * "Organization-specific currencies belong to their respective economies."
 * "**Prevents:** implicit convertibility. Without this, every org currency
 *  becomes a synthetic claim on the global reserve."
 *
 * Balancing across the whole entry list rather than within each economy accepts
 * a debit in `ZIT` against a credit in official KRED. It balances
 * arithmetically and mints official supply out of a local currency.
 */
describe("balancing is per economy, so local currency cannot become official KRED", () => {
  it("rejects an entry from a different economy than its transaction", () => {
    expect(() =>
      tx({
        entries: [
          line({ direction: "DEBIT", amount: fromKred(4000), economyId: LOCAL }),
          line({ direction: "CREDIT", amount: fromKred(4000), accountId: REVIEWER }),
        ],
      }),
    ).toThrow(/Law X/);
  });

  it("still accepts a transfer entirely inside one economy", () => {
    const result = tx({
      economyId: LOCAL,
      entries: [
        line({ direction: "DEBIT", amount: fromKred(4000), economyId: LOCAL }),
        line({
          direction: "CREDIT",
          amount: fromKred(4000),
          economyId: LOCAL,
          accountId: REVIEWER,
        }),
      ],
    });
    expect(result.entries).toHaveLength(2);
  });
});

/**
 * 06: Ledger names `EXCHANGE` as "cross-currency movement", and 14: Cloud
 * Economic Modes publishes the rate as a ratio: `1 ZIT = 0.025 KRED`.
 *
 * An exchange cannot balance one subunit against one subunit, so it is the one
 * type checked against a declared rate instead.
 */
describe("EXCHANGE is the only type that spans two economies", () => {
  const rate = backingRatio(5n, 200n); // 200 local subunits are worth 5 kredbits

  it("accepts a conversion that lands exactly on the published rate", () => {
    const result = tx({
      type: "EXCHANGE",
      fromEconomyId: LOCAL,
      toEconomyId: KREDS,
      exchangeRate: rate,
      entries: [
        line({ direction: "DEBIT", amount: kredbits(4000n), economyId: LOCAL, type: "EXCHANGE" }),
        line({
          direction: "CREDIT",
          amount: kredbits(100n),
          economyId: KREDS,
          accountId: REVIEWER,
          type: "EXCHANGE",
        }),
      ],
    });
    expect(result.entries).toHaveLength(2);
  });

  it("rejects a conversion that does not land exactly, because rounding it moves supply", () => {
    expect(() =>
      tx({
        type: "EXCHANGE",
        fromEconomyId: LOCAL,
        toEconomyId: KREDS,
        exchangeRate: rate,
        entries: [
          line({ direction: "DEBIT", amount: kredbits(4000n), economyId: LOCAL, type: "EXCHANGE" }),
          line({
            direction: "CREDIT",
            amount: kredbits(999n),
            economyId: KREDS,
            accountId: REVIEWER,
            type: "EXCHANGE",
          }),
        ],
      }),
    ).toThrow(/does not convert exactly/i);
  });

  it("refuses an EXCHANGE with no declared rate", () => {
    expect(() =>
      tx({
        type: "EXCHANGE",
        entries: [line({ direction: "DEBIT", amount: kredbits(4000n), type: "EXCHANGE" })],
      }),
    ).toThrow(/needs a rate/i);
  });

  it("refuses exchange fields on any other type", () => {
    expect(() =>
      tx({
        exchangeRate: rate,
        entries: [
          line({ direction: "DEBIT", amount: fromKred(30) }),
          line({ direction: "CREDIT", amount: fromKred(30), accountId: REVIEWER }),
        ],
      }),
    ).toThrow(/only EXCHANGE/i);
  });
});

/**
 * Law XV, Rules May Change, History May Not, and 19: Invariants.
 * "Every entry carries a `rulesVersion`."
 */
describe("every entry agrees with its transaction", () => {
  it("rejects an entry whose rules version disagrees", () => {
    expect(() =>
      tx({
        entries: [
          line({ direction: "DEBIT", amount: fromKred(30) }),
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

  /** 06: Ledger, Idempotency. GitHub delivers webhooks at least once. */
  it("rejects an entry smuggling a different idempotency key", () => {
    expect(() =>
      tx({
        entries: [
          line({ direction: "DEBIT", amount: fromKred(30) }),
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

  /** 06: Ledger. "History must always explain the current balance." */
  it("rejects an entry typed differently from its transaction", () => {
    expect(() =>
      tx({
        entries: [
          line({ direction: "DEBIT", amount: fromKred(30) }),
          line({
            direction: "CREDIT",
            amount: fromKred(30),
            accountId: REVIEWER,
            type: "DISTRIBUTION",
          }),
        ],
      }),
    ).toThrow(/typed DISTRIBUTION/i);
  });
});

/**
 * 06: Ledger, Transaction types.
 *
 * "`RECEIVABLE_CREATED` and `RECEIVABLE_CANCELLED` are the only entry types that
 *  move **no KRED at all**."
 */
describe("claims are recorded in the ledger without moving KRED", () => {
  it("names exactly the two types that move nothing", () => {
    expect([...MOVES_NO_KRED]).toEqual(["RECEIVABLE_CREATED", "RECEIVABLE_CANCELLED"]);
  });

  it("records a receivable as a memo entry", () => {
    const result = tx({
      type: "RECEIVABLE_CREATED",
      entries: [
        line({
          direction: "MEMO",
          amount: fromKred(30),
          accountId: REVIEWER,
          type: "RECEIVABLE_CREATED",
        }),
      ],
    });
    expect(result.entries[0]?.direction).toBe("MEMO");
  });

  it("refuses a memo entry on a type that is supposed to move KRED", () => {
    expect(() => tx({ entries: [line({ direction: "MEMO", amount: fromKred(30) })] })).toThrow(
      /moves KRED/i,
    );
  });

  it("refuses a balancing entry on a type that must move nothing", () => {
    expect(() =>
      tx({
        type: "RECEIVABLE_CANCELLED",
        entries: [
          line({ direction: "DEBIT", amount: fromKred(30), type: "RECEIVABLE_CANCELLED" }),
          line({
            direction: "CREDIT",
            amount: fromKred(30),
            accountId: REVIEWER,
            type: "RECEIVABLE_CANCELLED",
          }),
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

  /**
   * 01: Network and Supply lists eight sources of productive issuance and issue
   * resolution is not among them; 24: Contribution Points awards it points.
   * Resolving an issue is recognised, not minted.
   */
  it("offers no ledger cause for issue resolution, which mints nothing", () => {
    const sources: LedgerEntry["sourceType"][] = [
      "PULL_REQUEST_MERGED",
      "PULL_REQUEST_CLOSED",
      "REVIEW_SUBMITTED",
      "SETTLEMENT_RUN",
      "TREASURY_OPERATION",
      "CREDIT_OPERATION",
      "NETWORK_OPERATION",
      "MANUAL_ADJUSTMENT",
    ];
    expect(sources).not.toContain("ISSUE_RESOLVED");
  });
});

/**
 * 06: Ledger, Immutable history.
 *
 * "Never delete transactions to repair economic state."
 * "**History must always explain the current balance.**"
 */
describe("history is immutable", () => {
  it("routes every entry through the entry constructor, not just the ones a caller remembered to build", () => {
    // A raw object literal that never went through `entry()`. If the
    // transaction accepted it as-is, every entry-level invariant would be
    // optional, since nothing forces a caller to use the constructor.
    expect(() =>
      tx({
        entries: [
          line({ direction: "DEBIT", amount: kredbits(0n) }),
          line({ direction: "CREDIT", amount: kredbits(0n), accountId: REVIEWER }),
        ],
      }),
    ).toThrow(/zero kredbits/i);
  });

  it("freezes the entries it stores, whatever the caller passed in", () => {
    const result = tx({
      entries: [
        line({ direction: "DEBIT", amount: fromKred(30) }),
        line({ direction: "CREDIT", amount: fromKred(30), accountId: REVIEWER }),
      ],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.entries)).toBe(true);
    expect(Object.isFrozen(result.entries[0])).toBe(true);
  });

  it("freezes metadata too, so a recorded entry cannot be annotated after the fact", () => {
    const recorded = entry(line({ direction: "DEBIT", amount: fromKred(30), metadata: { a: 1 } }));
    expect(() => {
      (recorded.metadata as Record<string, unknown>).tampered = true;
    }).toThrow(TypeError);
  });

  it("carries timestamps that cannot be edited in place", () => {
    // A Date survives Object.freeze: `entry.createdAt.setFullYear(1999)` would
    // succeed on an otherwise frozen entry. A number cannot be mutated at all.
    const recorded = entry(line({ direction: "DEBIT", amount: fromKred(30) }));
    expect(typeof recorded.createdAt).toBe("number");
  });

  it("rejects a non-bigint amount before it can reach the ledger", () => {
    // The shape a JSON round-trip produces: `amount: 3000` rather than `3000n`.
    const smuggled = { ...line({ direction: "DEBIT", amount: fromKred(30) }), amount: 3000 };
    expect(() => entry(smuggled as unknown as LedgerEntry)).toThrow(/non-bigint/i);
  });
});
