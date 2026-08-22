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
import { entry, type LedgerEntry } from "../ledger/ledger.js";
import { derivePosition, netPosition } from "./position.js";

const ACCOUNT = accountId("acct_isaac");
const V4 = rulesVersion("v0.4");

let sequence = 0;
const line = (
  direction: LedgerEntry["direction"],
  kred: number,
  over: Partial<LedgerEntry> = {},
): LedgerEntry => {
  sequence += 1;
  return entry({
    id: ledgerEntryId(`entry_${sequence}`),
    economyId: economyId("kreds-network"),
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
    settledAt: new Date("2026-08-22T00:00:00Z"),
    createdAt: new Date("2026-08-22T00:00:00Z"),
    metadata: {},
    ...over,
  });
};

const debt = (kred: number): Debt => ({
  id: debtId("debt_1"),
  scope: "USER",
  obligorAccountId: ACCOUNT,
  lendingAccountId: accountId("acct_credit_facility"),
  principal: fromKred(kred),
  outstanding: fromKred(kred),
  rulesVersion: V4,
  createdAt: new Date("2026-08-10T00:00:00Z"),
});

const claim = (kred: number, over: Partial<Receivable> = {}): Receivable => ({
  id: receivableId("rcv_1"),
  claimantAccountId: ACCOUNT,
  obligorAccountId: accountId("acct_author"),
  grossValue: fromKred(kred),
  settledValue: ZERO_KREDBITS,
  status: "AWAITING_FUNDING",
  rulesVersion: V4,
  createdAt: new Date("2026-08-11T00:00:00Z"),
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
    const position = derivePosition({
      entries: [line("CREDIT", 35), line("DEBIT", 10)],
      debts: [],
      receivables: [],
      locked: ZERO_KREDBITS,
    });
    expect(formatKred(position.balance)).toBe("25.00");
  });

  it("starts every account at zero, with no signup grant", () => {
    // 01: Network and Supply, No signup grant. "New users begin with 0 KRED."
    const position = derivePosition({
      entries: [],
      debts: [],
      receivables: [],
      locked: ZERO_KREDBITS,
    });
    expect(position.balance).toBe(ZERO_KREDBITS);
  });

  it("ignores memo entries, which move no KRED", () => {
    const position = derivePosition({
      entries: [line("CREDIT", 35), line("MEMO", 30, { type: "RECEIVABLE_CREATED" })],
      debts: [],
      receivables: [],
      locked: ZERO_KREDBITS,
    });
    expect(formatKred(position.balance)).toBe("35.00");
  });

  /**
   * Law XXI. A derivation that lands below zero means something upstream
   * already minted, so this fails loudly rather than storing the result.
   */
  it("refuses to derive a negative balance", () => {
    expect(() =>
      derivePosition({
        entries: [line("CREDIT", 5), line("DEBIT", 30)],
        debts: [],
        receivables: [],
        locked: ZERO_KREDBITS,
      }),
    ).toThrow(/negative/i);
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
    const position = derivePosition({
      entries: [line("CREDIT", 25)],
      debts: [debt(120)],
      receivables: [],
      locked: ZERO_KREDBITS,
    });
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
    const withoutClaim = derivePosition({
      entries: [line("CREDIT", 25)],
      debts: [debt(120)],
      receivables: [],
      locked: ZERO_KREDBITS,
    });
    const withClaim = derivePosition({
      entries: [line("CREDIT", 25)],
      debts: [debt(120)],
      receivables: [claim(40)],
      locked: ZERO_KREDBITS,
    });
    expect(netPosition(withClaim)).toBe(netPosition(withoutClaim));
    expect(formatKred(withClaim.pendingReceivables)).toBe("40.00");
  });

  it("counts only claims still awaiting funding", () => {
    const position = derivePosition({
      entries: [],
      debts: [],
      receivables: [
        claim(40),
        claim(30, { id: receivableId("rcv_2"), status: "SETTLED" }),
        claim(20, { id: receivableId("rcv_3"), status: "CANCELLED" }),
      ],
      locked: ZERO_KREDBITS,
    });
    expect(formatKred(position.pendingReceivables)).toBe("40.00");
  });
});

/**
 * 19: Invariants, Derived invariants, and the Glossary:
 *
 * "`Withdrawable ⊆ Available ⊆ Balance`. Pending and Locked are the difference."
 */
describe("withdrawable is a strict subset of available, which is a subset of balance", () => {
  it("subtracts pending and locked funds from what is usable now", () => {
    const position = derivePosition({
      entries: [
        line("CREDIT", 100, { status: "SETTLED" }),
        line("CREDIT", 40, { status: "PENDING", settledAt: null }),
      ],
      debts: [],
      receivables: [],
      locked: fromKred(10),
    });
    expect(formatKred(position.balance)).toBe("140.00");
    expect(formatKred(position.pendingSettlement)).toBe("40.00");
    expect(formatKred(position.available)).toBe("90.00");
    expect(position.available <= position.balance).toBe(true);
    expect(position.withdrawable <= position.available).toBe(true);
  });

  /**
   * "A negative net position has `Withdrawable = 0`."
   *
   * Law VII, Extraction Is Not Guaranteed: this is what stops mint locally,
   * export instantly, default locally, walk away.
   */
  it("withholds every kredbit while the net position is negative", () => {
    const position = derivePosition({
      entries: [line("CREDIT", 25)],
      debts: [debt(120)],
      receivables: [],
      locked: ZERO_KREDBITS,
    });
    expect(netPosition(position) < 0n).toBe(true);
    expect(position.withdrawable).toBe(ZERO_KREDBITS);
  });

  it("releases funds once the position is back above water", () => {
    const position = derivePosition({
      entries: [line("CREDIT", 200)],
      debts: [debt(120)],
      receivables: [],
      locked: ZERO_KREDBITS,
    });
    expect(formatKred(position.withdrawable)).toBe("200.00");
  });
});

/**
 * 23: Review Funding, Debt and Credit, Payment ordering.
 * "Initial policy: oldest eligible receivable first."
 */
describe("claims settle oldest first", () => {
  it("orders by age, then by id so the order is total", () => {
    const older = claim(30, {
      id: receivableId("rcv_a"),
      createdAt: new Date("2026-08-01T00:00:00Z"),
    });
    const newer = claim(30, {
      id: receivableId("rcv_b"),
      createdAt: new Date("2026-08-09T00:00:00Z"),
    });
    expect(inSettlementOrder([newer, older]).map((c) => c.id)).toEqual(["rcv_a", "rcv_b"]);
  });
});
