import { describe, expect, it } from "vitest";

import { currentPolicy, policyFor } from "./index.js";
import { policySchema } from "./schema.js";
import snapshot from "./snapshots/kreds-rules-public-v0.5.json";

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

describe("Amendment A04, pinned so it cannot be flipped for a demo", () => {
  /**
   * The sections are optional in the schema, because `v0.4` predates them and
   * Law XV keeps older snapshots readable. Optional means a typo in the schema
   * would silently yield `undefined` instead of failing, so this asserts they
   * are actually parsed before anything else asserts what they say.
   */
  it("parses every A04 section out of the current policy", () => {
    const policy = currentPolicy();
    expect(policy.access).toBeDefined();
    expect(policy.economicScope).toBeDefined();
    expect(policy.organizationBinding).toBeDefined();
    expect(policy.consent).toBeDefined();
  });

  /**
   * Law XXXV, Evidence Comes From the Provider: "No client, browser extension,
   * local agent, or self-hosted node may originate an economic claim."
   */
  it("refuses a policy that permits client-originated evidence", () => {
    expect(
      policySchema.safeParse(policyWith("access", "clientOriginatedEvidencePermitted", true))
        .success,
    ).toBe(false);
  });

  it("refuses a client role that is anything other than display", () => {
    expect(
      policySchema.safeParse(policyWith("access", "clientRoles", ["SUBMIT_EVENTS"])).success,
    ).toBe(false);
  });

  it("names exactly the two ways evidence may arrive", () => {
    expect(currentPolicy().access?.ingestionModes).toEqual([
      "PROVIDER_WEBHOOK",
      "SERVER_SIDE_DELEGATED_QUERY",
    ]);
  });

  /**
   * Law IV as amended: activity "never lands directly in a global wallet."
   * 11 lists the six protections the boundary carries, and a direct pipe
   * removes all of them at once.
   */
  it("refuses a policy that lets an event land straight in a global wallet", () => {
    expect(
      policySchema.safeParse(policyWith("economicScope", "directToGlobalWalletPermitted", true))
        .success,
    ).toBe(false);
  });

  /**
   * 26: "This is not a lighter tier. It is the same accounting with a different
   * boundary, because Law VII does not care whether an organization happens to
   * be involved."
   */
  it("refuses a personal position that is a lighter tier", () => {
    for (const field of ["personalPositionUsesSameStates", "personalPositionUsesSameSettlement"]) {
      expect(policySchema.safeParse(policyWith("economicScope", field, false)).success, field).toBe(
        false,
      );
    }
  });

  /**
   * Law XXXVI. 26 lists what never confers authority: "being a member, being
   * first to connect, having write access to a repository, or contributing to
   * one of its public repositories."
   */
  it("refuses a policy where membership, first connection or repo access would bind", () => {
    for (const field of [
      "membershipSufficient",
      "firstConnectionSufficient",
      "repositoryAccessSufficient",
    ]) {
      expect(
        policySchema.safeParse(policyWith("organizationBinding", field, true)).success,
        field,
      ).toBe(false);
    }
  });

  it("refuses a policy that would trust a binding without re-verifying it", () => {
    expect(
      policySchema.safeParse(
        policyWith("organizationBinding", "reverifyBeforeTreasuryActions", false),
      ).success,
    ).toBe(false);
  });

  /**
   * Law XXXVII: "An identity may earn without having consented, but may only be
   * charged within a context whose authority consented."
   */
  it("keeps earning free of consent and charging bound by it", () => {
    expect(
      policySchema.safeParse(policyWith("consent", "earningRequiresConsent", true)).success,
    ).toBe(false);
    expect(
      policySchema.safeParse(policyWith("consent", "chargingRequiresConsentingContext", false))
        .success,
    ).toBe(false);
  });

  /**
   * The fallback is a funded source or a receivable. Never the author: that is
   * the whole point, and an enum keeps a third option from being added by
   * someone who needed the books to balance in a hurry.
   */
  it("refuses a fallback that charges somebody who never consented", () => {
    expect(
      policySchema.safeParse(
        policyWith("consent", "fallbackWhenNoConsentingContext", ["AUTHOR_DEBT"]),
      ).success,
    ).toBe(false);
  });

  /**
   * 24: caps in an unobserved context "are operational policy and are not
   * published". Typed as the literal so no code can read the absence of a
   * number as permission to award without a bound.
   */
  it("withholds the unobserved-context caps rather than defaulting them", () => {
    expect(currentPolicy().contributionPoints.unobservedContextCaps).toBe("NOT_PUBLISHED");
    expect(currentPolicy().contributionPoints.unobservedContextAwarded).toBe(true);
  });
});

describe("older policy versions stay readable", () => {
  /**
   * Law XV, Rules May Change, History May Not. A result produced under `v0.4`
   * has to stay explainable, which means that snapshot has to keep loading
   * after A04 added four sections it never had.
   */
  it("still loads v0.4, which predates every A04 section", () => {
    const v04 = policyFor("v0.4");
    expect(v04.rulesVersion).toBe("v0.4");
    expect(v04.access).toBeUndefined();
    expect(v04.consent).toBeUndefined();
  });
});
