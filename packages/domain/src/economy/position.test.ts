import { describe, expect, it } from "vitest";

import { inSettlementOrder, type Debt, type Receivable } from "../claims/claims.js";
import {
  accountId,
  debtId,
  economyId,
  idempotencyKey,
  ledgerEntryId,
  organizationId,
  receivableId,
  rulesVersion,
} from "../primitives/ids.js";
import { ZERO_KREDBITS, formatKred, fromKred } from "../primitives/money.js";
import { fromIso } from "../primitives/time.js";
import { entry, type LedgerEntry } from "../ledger/ledger.js";
import { derivePosition, netPosition } from "./position.js";

const ACCOUNT = accountId("acct_isaac");
const ECONOMY = economyId("kreds-network");
const V4 = rulesVersion("v0.4");
const AT = fromIso("2026-08-22T00:00:00Z");

let sequence = 0;
const line = (
  direction: LedgerEntry["direction"],
  kred: number,
  over: Partial<LedgerEntry> = {},
): LedgerEntry => {
  sequence += 1;
  return entry({
    id: ledgerEntryId(`entry_${sequence}`),
    economyId: ECONOMY,
    organizationId: organizationId("org_zitdevs"),
    accountId: ACCOUNT,
    direction,
    amount: fromKred(kred),
    type: "TRANSFER",
    sourceType: "REVIEW_SUBMITTED",
    sourceId: String(sequence),
    counterpartyAccountId: accountId("acct_other"),
    rulesVersion: V4,
    idempotencyKey: idempotencyKey(`key_${sequence}`),
    status: "SETTLED",
    settledAt: AT,
    createdAt: AT,
    metadata: {},
    ...over,
  });
};

const sources = (over: Partial<Parameters<typeof derivePosition>[0]> = {}) => ({
  accountId: ACCOUNT,
  economyId: ECONOMY,
  entries: [],
  debts: [],
  receivables: [],
  locked: ZERO_KREDBITS,
  ...over,
});

const debt = (kred: number): Debt => ({
  id: debtId("debt_1"),
  scope: "USER",
  obligorAccountId: ACCOUNT,
  lendingAccountId: accountId("acct_credit_facility"),
  principal: fromKred(kred),
  outstanding: fromKred(kred),
  rulesVersion: V4,
  createdAt: fromIso("2026-08-10T00:00:00Z"),
});

const claim = (kred: number, over: Partial<Receivable> = {}): Receivable => ({
  id: receivableId("rcv_1"),
  claimantAccountId: ACCOUNT,
  obligorAccountId: accountId("acct_author"),
  grossValue: fromKred(kred),
  settledValue: ZERO_KREDBITS,
  status: "AWAITING_FUNDING",
  rulesVersion: V4,
  createdAt: fromIso("2026-08-11T00:00:00Z"),
  ...over,
});

/**
 * Law II, Auditable Movement.
 *
 * "balances are *derived*, never stored-and-mutated. `user.balance += 30` is a
 *  bug, not an optimisation."
 */
describe("a balance is derived from entries and nothing else", () => {
  it("sums credits against debits", () => {
    const position = derivePosition(sources({ entries: [line("CREDIT", 35), line("DEBIT", 10)] }));
    expect(formatKred(position.balance)).toBe("25.00");
  });

  it("starts every account at zero, with no signup grant", () => {
    // 01: Network and Supply, No signup grant. "New users begin with 0 KRED."
    expect(derivePosition(sources()).balance).toBe(ZERO_KREDBITS);
  });

  it("ignores memo entries, which move no KRED", () => {
    const position = derivePosition(
      sources({
        entries: [
          line("CREDIT", 35),
          line("MEMO", 30, { type: "RECEIVABLE_CREATED", sourceType: "NETWORK_OPERATION" }),
        ],
      }),
    );
    expect(formatKred(position.balance)).toBe("35.00");
  });

  /**
   * Law XXI. A derivation that lands below zero means something upstream
   * already minted, so this fails loudly rather than storing the result.
   */
  it("refuses to derive a negative balance", () => {
    expect(() =>
      derivePosition(sources({ entries: [line("CREDIT", 5), line("DEBIT", 30)] })),
    ).toThrow(/negative/i);
  });

  /**
   * Matching on the word "negative" alone would not prove this check ran.
   * `kredbits` refuses a negative value too, and says the same word, so the
   * test passed with this guard deleted: two guards, one message, one of them
   * untested. The assertion names the sentence only this one produces.
   */
  it("says the entries are what implied it, so the report names the ledger", () => {
    expect(() =>
      derivePosition(sources({ entries: [line("CREDIT", 5), line("DEBIT", 30)] })),
    ).toThrow(/entries imply a balance of -2500/);
  });
});

/**
 * Laws IV, V and X. A position is one account inside one accounting context.
 * Folding anything else produces a number that looks like a balance and is not.
 */
describe("a position is scoped to one account in one economy", () => {
  it("refuses an entry belonging to another account", () => {
    const other = line("CREDIT", 10, { accountId: accountId("acct_someone_else") });
    expect(() => derivePosition(sources({ entries: [other] }))).toThrow(/belongs to account/i);
  });

  it("refuses an entry denominated in another economy", () => {
    const local = line("CREDIT", 10, { economyId: economyId("zitdevs-LOCAL") });
    expect(() => derivePosition(sources({ entries: [local] }))).toThrow(/Law X/);
  });
});

/**
 * 23: Review Funding, Debt and Credit, Net position.
 *
 * "Net Position = KRED Balance − Outstanding Debt"
 */
describe("net position is a display figure and may be negative", () => {
  it("reproduces the worked example from chapter 23", () => {
    // Balance 25 K, Debt 120 K, Net Position -95 K
    const position = derivePosition(sources({ entries: [line("CREDIT", 25)], debts: [debt(120)] }));
    expect(formatKred(position.balance)).toBe("25.00");
    expect(formatKred(position.outstandingDebt)).toBe("120.00");
    expect(netPosition(position)).toBe(-9500n);
  });

  /**
   * The chapter is explicit, and flags that Amendment A01 §54 shows an example
   * contradicting its own §4 formula: "This repository implements §4."
   *
   * "Pending receivables and other pending assets are **displayed separately**
   *  and are not folded into this figure."
   */
  it("does not fold pending receivables into the figure", () => {
    const withoutClaim = derivePosition(
      sources({ entries: [line("CREDIT", 25)], debts: [debt(120)] }),
    );
    const withClaim = derivePosition(
      sources({ entries: [line("CREDIT", 25)], debts: [debt(120)], receivables: [claim(40)] }),
    );
    expect(netPosition(withClaim)).toBe(netPosition(withoutClaim));
    expect(formatKred(withClaim.pendingReceivables)).toBe("40.00");
  });

  it("counts only claims still awaiting funding", () => {
    const position = derivePosition(
      sources({
        receivables: [
          claim(40),
          claim(30, { id: receivableId("rcv_2"), status: "SETTLED" }),
          claim(20, { id: receivableId("rcv_3"), status: "CANCELLED" }),
        ],
      }),
    );
    expect(formatKred(position.pendingReceivables)).toBe("40.00");
  });
});

/**
 * 11: Debt and Settlement, Balance vs available vs withdrawable.
 *
 * "These are five distinct quantities. Conflating any two of them breaks the
 *  model."
 *
 * Pending is the gap between Balance and Available. Locked is the gap between
 * Available and Withdrawable. Getting that the wrong way round collapses two of
 * the five, which is exactly what the chapter warns about.
 */
describe("balance, available and withdrawable are three distinct quantities", () => {
  it("reproduces the worked example from chapter 11", () => {
    // Balance 320, Available 280, Withdrawable 180, Pending 40, Locked 100
    const position = derivePosition(
      sources({
        entries: [
          line("CREDIT", 280, { status: "SETTLED" }),
          line("CREDIT", 40, { status: "PENDING", settledAt: null }),
        ],
        locked: fromKred(100),
      }),
    );
    expect(formatKred(position.balance)).toBe("320.00");
    expect(formatKred(position.pendingSettlement)).toBe("40.00");
    expect(formatKred(position.available)).toBe("280.00");
    expect(formatKred(position.withdrawable)).toBe("180.00");
  });

  /**
   * 02: Organizations gives the same shape independently, which is what makes
   * the arithmetic unambiguous rather than a reading of one example.
   */
  it("reproduces the organization position from chapter 02", () => {
    // Balance 180, Pending 40, Available 140, Withdrawable 120
    const position = derivePosition(
      sources({
        entries: [
          line("CREDIT", 140, { status: "SETTLED" }),
          line("CREDIT", 40, { status: "PENDING", settledAt: null }),
        ],
        locked: fromKred(20),
      }),
    );
    expect(formatKred(position.balance)).toBe("180.00");
    expect(formatKred(position.available)).toBe("140.00");
    expect(formatKred(position.withdrawable)).toBe("120.00");
  });

  it("keeps withdrawable strictly below available whenever funds are locked", () => {
    const position = derivePosition(
      sources({ entries: [line("CREDIT", 100)], locked: fromKred(30) }),
    );
    expect(position.withdrawable < position.available).toBe(true);
    expect(position.available <= position.balance).toBe(true);
  });

  it("never lets locked funds push withdrawable below zero", () => {
    const position = derivePosition(
      sources({ entries: [line("CREDIT", 10)], locked: fromKred(50) }),
    );
    expect(position.withdrawable).toBe(ZERO_KREDBITS);
  });

  /**
   * "A negative net position has `Withdrawable = 0`." (19: Invariants)
   *
   * Law VII, Extraction Is Not Guaranteed: this is what stops mint locally,
   * export instantly, default locally, walk away.
   *
   * Note what is NOT asserted here. The published law fixes the *negative* net
   * case only. What a non-negative net position with live debt may withdraw is
   * unpublished operational policy, so this package implements the one rule the
   * constitution states and leaves the rest to the settlement engine.
   */
  it("withholds every kredbit while the net position is negative", () => {
    const position = derivePosition(sources({ entries: [line("CREDIT", 25)], debts: [debt(120)] }));
    expect(netPosition(position) < 0n).toBe(true);
    expect(position.withdrawable).toBe(ZERO_KREDBITS);
  });
});

/**
 * 23: Review Funding, Debt and Credit, Payment ordering.
 * "Initial policy: oldest eligible receivable first."
 */
describe("claims settle oldest eligible first", () => {
  it("orders by age, then by id so the order is total", () => {
    const older = claim(30, {
      id: receivableId("rcv_a"),
      createdAt: fromIso("2026-08-01T00:00:00Z"),
    });
    const newer = claim(30, {
      id: receivableId("rcv_b"),
      createdAt: fromIso("2026-08-09T00:00:00Z"),
    });
    expect(inSettlementOrder([newer, older]).map((c) => c.id)).toEqual(["rcv_a", "rcv_b"]);
  });

  it("drops claims that are not eligible for settlement at all", () => {
    const open = claim(30, { id: receivableId("rcv_open") });
    const settled = claim(30, { id: receivableId("rcv_done"), status: "SETTLED" });
    const cancelled = claim(30, { id: receivableId("rcv_void"), status: "CANCELLED" });
    expect(inSettlementOrder([settled, open, cancelled]).map((c) => c.id)).toEqual(["rcv_open"]);
  });
});

/**
 * A deterministic generator, so a failure reproduces from its seed rather than
 * disappearing on the next run.
 */
function* seeded(seed: number, count: number): Generator<number> {
  let state = seed;
  for (let i = 0; i < count; i++) {
    state = (state * 1103515245 + 12345) % 2147483648;
    yield state;
  }
}

describe("19: Invariants, Withdrawable ⊆ Available ⊆ Balance", () => {
  /**
   * The containment holds by construction today. This asserts it as the named
   * invariant it actually is, over inputs nobody chose to be convenient,
   * because "by construction" is a property of the code as written and this
   * chapter is a property of the economy.
   */
  it("holds for every combination of entries, debt and locked funds", () => {
    for (const roll of seeded(20260822, 400)) {
      // An entry for zero kredbits records no movement and the ledger refuses
      // it, so every amount here is at least one.
      const credit = (roll % 500) + 1;
      const pendingCredit = ((roll >> 4) % 500) + 1;
      const debit = ((roll >> 8) % (credit + pendingCredit)) + 1;
      const locked = (roll >> 12) % 700;
      const owed = (roll >> 16) % 700;

      const position = derivePosition(
        sources({
          entries: [
            line("CREDIT", credit),
            line("CREDIT", pendingCredit, { status: "PENDING", settledAt: null }),
            line("DEBIT", debit),
          ],
          debts: owed > 0 ? [debt(owed)] : [],
          locked: fromKred(locked),
        }),
      );

      const where = `credit ${credit} pending ${pendingCredit} debit ${debit} locked ${locked} debt ${owed}`;
      expect(position.withdrawable <= position.available, where).toBe(true);
      expect(position.available <= position.balance, where).toBe(true);
      expect(position.balance >= ZERO_KREDBITS, where).toBe(true);
      expect(position.withdrawable >= ZERO_KREDBITS, where).toBe(true);
    }
  });

  /**
   * 19: Invariants, "A negative net position has `Withdrawable = 0`", and 11
   * on how absolute that is: "There is no partial exception, no 'but the
   * pending portion', no manual override."
   */
  it("withdraws nothing whenever the net position is under water, however rich the balance", () => {
    for (const roll of seeded(19, 200)) {
      const balance = (roll % 1000) + 1;
      const owed = balance + 1 + ((roll >> 8) % 1000);

      const position = derivePosition(
        sources({ entries: [line("CREDIT", balance)], debts: [debt(owed)] }),
      );

      expect(netPosition(position) < 0n, `balance ${balance} debt ${owed}`).toBe(true);
      expect(position.withdrawable, `balance ${balance} debt ${owed}`).toBe(ZERO_KREDBITS);
    }
  });

  /**
   * Law XXIV: receivables "cannot be transferred, spent, or withdrawn until
   * funded". The check that matters is that holding a claim never raises what
   * the holder can take out, because a claim that moved withdrawable would be
   * money by another name.
   */
  it("never lets a receivable raise the balance or what can be withdrawn", () => {
    const withoutClaim = derivePosition(sources({ entries: [line("CREDIT", 100)] }));
    const withClaim = derivePosition(
      sources({ entries: [line("CREDIT", 100)], receivables: [claim(5_000)] }),
    );

    expect(withClaim.balance).toBe(withoutClaim.balance);
    expect(withClaim.available).toBe(withoutClaim.available);
    expect(withClaim.withdrawable).toBe(withoutClaim.withdrawable);
    expect(withClaim.pendingReceivables).toBe(fromKred(5_000));
  });
});
