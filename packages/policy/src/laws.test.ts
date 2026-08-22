import { describe, expect, it } from "vitest";

import { currentPolicy } from "./index.js";
import { policySchema } from "./schema.js";
import snapshot from "./snapshots/kreds-rules-public-v0.4.json";

/**
 * A policy file with one value changed.
 *
 * The point of these tests is not that the current snapshot is lawful, the
 * checksum test already proves it is the file `kreds-laws` published. It is
 * that a *future* snapshot carrying a violation would be refused at load
 * rather than obeyed, which is the only moment Kreds gets to notice.
 */
function policyWith(section: string, field: string, value: unknown): unknown {
  const base = snapshot as unknown as Record<string, Record<string, unknown>>;
  return { ...base, [section]: { ...base[section], [field]: value } };
}

describe("a policy that permits negative balances is refused", () => {
  /**
   * Law XXI, No Monetary Creation Through Debt. Under the pre-A01 model two
   * accounts at zero could review each other and produce spendable KRED that
   * never came from the five million, "indistinguishable, once it existed,
   * from legitimately issued currency".
   */
  it("refuses settlement.negativeBalancesPermitted: true", () => {
    expect(
      policySchema.safeParse(policyWith("settlement", "negativeBalancesPermitted", true)).success,
    ).toBe(false);
  });

  it("refuses accounting.negativeBalancesPermitted: true", () => {
    expect(
      policySchema.safeParse(policyWith("accounting", "negativeBalancesPermitted", true)).success,
    ).toBe(false);
  });

  it("refuses a minimum balance below zero", () => {
    expect(policySchema.safeParse(policyWith("accounting", "minimumBalance", -1)).success).toBe(
      false,
    );
  });
});

describe("a policy that lets an underwater position withdraw is refused", () => {
  /**
   * 19: Invariants, "A negative net position has `Withdrawable = 0`", and 11
   * on why the number is exactly zero: "There is no partial exception, no
   * 'but the pending portion', no manual override."
   */
  it("refuses any nonzero allowance, however small", () => {
    for (const allowance of [1, 100, -1]) {
      expect(
        policySchema.safeParse(
          policyWith("settlement", "withdrawableWhileNetPositionNegative", allowance),
        ).success,
        `allowance ${allowance}`,
      ).toBe(false);
    }
  });
});

describe("a policy that makes receivables into money is refused", () => {
  /**
   * Law XXIV, Unfunded Work Is a Claim, Not Currency: receivables "cannot be
   * transferred, spent, or withdrawn until funded". A transferable claim would
   * be a second money supply with none of the first one's controls.
   */
  it("refuses a transferable, spendable or withdrawable receivable", () => {
    for (const field of ["transferable", "spendable", "withdrawable", "countedInKredSupply"]) {
      expect(policySchema.safeParse(policyWith("receivables", field, true)).success, field).toBe(
        false,
      );
    }
  });

  /**
   * 23, Interpretation decision (A03): settling gross "would create a fee
   * arbitrage: colluding accounts would deliberately route reviews through the
   * unfunded state to dodge the fee."
   */
  it("refuses receivables that settle without the protocol fee", () => {
    expect(
      policySchema.safeParse(policyWith("receivables", "settlementAppliesProtocolFee", false))
        .success,
    ).toBe(false);
  });
});

describe("a policy that folds receivables into the headline figure is refused", () => {
  /**
   * 23 records that Amendment A01 §54 contradicts its own §4 formula, and that
   * this repository implements §4. A receivable is work someone owes you, not
   * value you hold.
   */
  it("refuses pendingReceivablesIncludedInNetPosition: true", () => {
    expect(
      policySchema.safeParse(
        policyWith("accounting", "pendingReceivablesIncludedInNetPosition", true),
      ).success,
    ).toBe(false);
  });
});

describe("what the published policy actually says", () => {
  it("publishes a settlement window in whole hours", () => {
    expect(currentPolicy().settlement.normalWindowHours).toBeGreaterThan(0);
  });

  /**
   * The risk-adjusted windows are withheld on purpose. Read as a number they
   * would be a threshold an attacker could wait out.
   */
  it("withholds the risk-adjusted windows rather than defaulting them", () => {
    expect(currentPolicy().settlement.riskAdjustedWindows).toBe("NOT_PUBLISHED");
  });

  /**
   * Worth pinning because it is easy to assume otherwise: `available` is in
   * the settlement ordering but is not a recorded position field. It is a
   * derived display figure, and no published text gives it a formula.
   */
  it("does not list available among the recorded position fields", () => {
    expect(currentPolicy().accounting.positionFields).not.toContain("available");
    expect(currentPolicy().accounting.settlementOrdering).toContain("available");
  });
});
