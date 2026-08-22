import { describe, expect, it } from "vitest";

import { currentPolicy } from "@kreds/policy";

import { evaluateEligibility } from "../economy/eligibility.js";
import { derivePosition } from "../economy/position.js";
import { settlementWindow, hasSettled } from "../economy/settlement.js";
import { entry, type LedgerEntry } from "../ledger/ledger.js";
import {
  accountId,
  economyId,
  idempotencyKey,
  ledgerEntryId,
  organizationId,
  rulesVersion,
} from "../primitives/ids.js";
import { fromKred, ZERO_KREDBITS } from "../primitives/money.js";
import { points } from "../primitives/points.js";
import { fromIso, timestamp } from "../primitives/time.js";
import { capUnobserved, unobservedCaps } from "./observation.js";
import { routeLiability } from "./consent.js";
import { landingFor } from "./scope.js";
import { isAvailable } from "./scope.js";

/**
 * Amendment A04's definition of done, walked end to end.
 *
 * Each of these is one of the outcomes the amendment promises, composed from
 * the pieces rather than asserted about a single function. A rule that holds in
 * its own unit test and breaks when three of them meet is the failure this file
 * exists to catch.
 */

const MERGED = fromIso("2026-08-22T09:00:00Z");
const MATRIX = currentPolicy().mergeEligibility.matrix;

let sequence = 0;
const credit = (kred: number, over: Partial<LedgerEntry> = {}): LedgerEntry => {
  sequence += 1;
  return entry({
    id: ledgerEntryId(`e_${sequence}`),
    economyId: economyId("kreds-network"),
    organizationId: null,
    accountId: accountId("acct_newcomer_personal"),
    direction: "CREDIT",
    amount: fromKred(kred),
    type: "DISTRIBUTION",
    sourceType: "PULL_REQUEST_MERGED",
    sourceId: String(sequence),
    counterpartyAccountId: accountId("acct_reserve"),
    rulesVersion: rulesVersion("v0.5"),
    idempotencyKey: idempotencyKey(`k_${sequence}`),
    status: "PENDING",
    settledAt: null,
    createdAt: MERGED,
    metadata: {},
    ...over,
  });
};

describe("a fresh account with no organization participates fully", () => {
  /**
   * The outcome A04 exists for. 26: "A developer authorizes Kreds for their own
   * account and starts participating immediately. Organizations adopt when they
   * want shared money, not to let their people play."
   */
  it("lands their public work in a personal position, not nowhere and not a wallet", () => {
    const landing = landingFor({
      gitHubOrganizationId: null,
      hasBoundTeam: false,
      contributorGitHubUserId: 999,
    });
    expect(landing).toEqual({ scope: "PERSONAL", contributorGitHubUserId: 999 });
  });

  it("gives them Contribution Points, rewards, reviews, settlement and a wallet", () => {
    for (const feature of [
      "CONTRIBUTION_POINTS",
      "MERGE_REWARDS",
      "CODE_REVIEW_TRANSFERS",
      "RECEIVABLES",
      "PERSONAL_POSITION",
      "SETTLEMENT",
      "GLOBAL_WALLET",
      "LEADERBOARDS",
    ] as const) {
      expect(isAvailable(feature, "PERSONAL"), feature).toBe(true);
    }
  });

  /**
   * Law XXXIII, and 26's note that "the frictionless path is the open path": a
   * maintainer of a trusted public project participates fully with no
   * organization involvement whatsoever, including with no review on the PR.
   */
  it("prices a merge in their trusted public repository with no organization anywhere", () => {
    const result = evaluateEligibility(
      {
        // `PERSONAL_PUBLIC` is the row that matters here. Before A04 it was an
        // edge case; after it, a solo maintainer with no organization is the
        // ordinary shape, and the published matrix already covered it.
        context: "PERSONAL_PUBLIC",
        hasEligibleReview: false,
        trustTier: "HIGH_TRUST",
        actorCanEarn: true,
        isPrivate: false,
      },
      MATRIX,
    );
    expect(result.status).not.toBe("INELIGIBLE");
  });

  /**
   * The personal position is "the same accounting with a different boundary",
   * so the settlement window governs it exactly as it governs an organization
   * position. Value earned is held, then released.
   */
  it("holds their earnings for the window, then releases them, with no organization involved", () => {
    const held = credit(150);
    const day = settlementWindow(currentPolicy().settlement.normalWindowHours);

    expect(hasSettled(held, day, timestamp(MERGED + 60_000))).toBe(false);

    const inWindow = derivePosition({
      accountId: accountId("acct_newcomer_personal"),
      economyId: economyId("kreds-network"),
      entries: [held],
      debts: [],
      receivables: [],
      locked: ZERO_KREDBITS,
    });
    expect(inWindow.balance).toBe(fromKred(150));
    expect(inWindow.withdrawable).toBe(ZERO_KREDBITS);

    const settled = derivePosition({
      accountId: accountId("acct_newcomer_personal"),
      economyId: economyId("kreds-network"),
      entries: [credit(150, { status: "SETTLED", settledAt: MERGED })],
      debts: [],
      receivables: [],
      locked: ZERO_KREDBITS,
    });
    expect(settled.withdrawable).toBe(fromKred(150));
  });

  /** And none of the shared-money features, until an organization consents. */
  it("gives them no treasury, no review fund and no credit facility", () => {
    for (const feature of ["TREASURY", "REVIEW_FUND", "REVIEW_CREDIT_FACILITY"] as const) {
      expect(isAvailable(feature, "PERSONAL"), feature).toBe(false);
    }
  });
});

describe("a self-merge in a private repository mints nothing and is bounded", () => {
  /**
   * Law XXIX, Self-Directed Private Merges Do Not Create KRED: "A merge
   * performed in a private repository without a valid eligible human review does
   * not create Official KRED."
   */
  it("yields no KRED", () => {
    const result = evaluateEligibility(
      {
        context: "PERSONAL_PRIVATE",
        hasEligibleReview: false,
        trustTier: "UNTRUSTED",
        actorCanEarn: true,
        isPrivate: true,
      },
      MATRIX,
    );
    expect(result.status).toBe("INELIGIBLE");
  });

  /**
   * And the half A04 added, because delegated query made this ingestible at
   * scale. 26: "generate pull requests in your own private repository, merge
   * them yourself, and collect Contribution Points forever."
   */
  it("awards the points, and stops awarding them once the day's bound is reached", () => {
    const alone = {
      hadIndependentHumanReview: false,
      isPublic: false,
      hasExternalContributors: false,
    };
    const caps = unobservedCaps({ perUserPerDay: 7, perUserPerMonth: 23 });

    // Under the day's allowance: awarded in full, because solo private work is
    // real work and 24 says these points are "not refused".
    const first = capUnobserved(points(4), alone, { today: points(0), thisMonth: points(0) }, caps);
    expect(first.awarded).toBe(points(4));

    const script = capUnobserved(
      points(25),
      alone,
      { today: points(7), thisMonth: points(7) },
      caps,
    );
    expect(script.awarded).toBe(points(0));
    expect(script.reason).toBe("DAILY_CAP_REACHED");
  });

  /**
   * The distinction the cap turns on, stated in 24: "GitHub attesting that a
   * merge *happened* is not the same as anyone judging that it was *worth
   * something*." The identical work with one reviewer is uncapped.
   */
  it("does not bound the same work once somebody independent has seen it", () => {
    const seen = {
      hadIndependentHumanReview: true,
      isPublic: false,
      hasExternalContributors: false,
    };
    const caps = unobservedCaps({ perUserPerDay: 7, perUserPerMonth: 23 });
    const award = capUnobserved(
      points(25),
      seen,
      { today: points(999), thisMonth: points(999) },
      caps,
    );

    expect(award.awarded).toBe(points(25));
  });
});

describe("reviewing an unconnected author's PR charges nobody", () => {
  /**
   * 26's third row: "A public repository, unbound organization, contributor not
   * connected" has no consenting authority.
   *
   * Law XXXVII: "Where no consenting context exists, the obligation falls to a
   * funded source or remains a receivable."
   */
  const stranger = {
    isContributorsOwnRepository: false,
    hasBoundOrganization: false,
    contributorHasConnected: false,
  };

  it("leaves a receivable rather than debt, when nothing funds it", () => {
    const decision = routeLiability(stranger, false);
    expect(decision).toMatchObject({ authority: "NONE", route: "RECEIVABLE" });
  });

  it("pays from a funded source when one exists, and still not from the author", () => {
    const decision = routeLiability(stranger, true);
    expect(decision).toMatchObject({ authority: "NONE", route: "FUNDED_SOURCE" });
  });

  /** In every case, the reviewer earned it and gets it. */
  it("pays the reviewer either way", () => {
    expect(routeLiability(stranger, true).reviewerStillEarns).toBe(true);
    expect(routeLiability(stranger, false).reviewerStillEarns).toBe(true);
  });

  /**
   * The claim is on the books and is not money. Law XXIV: receivables "cannot
   * be transferred, spent, or withdrawn until funded", so holding one changes
   * nothing about what the holder can take out.
   */
  it("puts the claim on the reviewer's books without making it spendable", () => {
    const withClaim = derivePosition({
      accountId: accountId("acct_reviewer"),
      economyId: economyId("kreds-network"),
      entries: [],
      debts: [],
      receivables: [
        {
          id: "rcv_1" as never,
          claimantAccountId: accountId("acct_reviewer"),
          obligorAccountId: accountId("acct_stranger"),
          grossValue: fromKred(30),
          settledValue: ZERO_KREDBITS,
          status: "AWAITING_FUNDING",
          rulesVersion: rulesVersion("v0.5"),
          createdAt: MERGED,
        },
      ],
      locked: ZERO_KREDBITS,
    });

    expect(withClaim.pendingReceivables).toBe(fromKred(30));
    expect(withClaim.balance).toBe(ZERO_KREDBITS);
    expect(withClaim.withdrawable).toBe(ZERO_KREDBITS);
  });

  /**
   * The contrast that shows the rule is doing work: the same review inside a
   * bound organization is charged to the organization, normally.
   */
  it("charges the context normally once somebody has consented", () => {
    expect(routeLiability({ ...stranger, hasBoundOrganization: true }, false)).toMatchObject({
      authority: "ORGANIZATION",
      route: "CHARGE_CONTEXT",
    });
  });
});

describe("the rules version in force is the one that priced the work", () => {
  /**
   * Law XV, Rules May Change, History May Not. Delegated query makes backfill
   * ordinary, so this stopped being theoretical with A04: a merge read today
   * may have happened under rules that have since moved.
   */
  it("keeps every prior version loadable, so an old entry stays explainable", async () => {
    const { policyFor } = await import("@kreds/policy");
    expect(policyFor("v0.4").rulesVersion).toBe("v0.4");
    expect(policyFor("v0.5").rulesVersion).toBe("v0.5");
  });

  it("records the version on the entry rather than looking it up later", () => {
    expect(credit(10).rulesVersion).toBe("v0.5");
  });
});
