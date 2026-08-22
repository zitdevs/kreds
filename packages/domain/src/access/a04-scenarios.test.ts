import { describe, expect, it } from "vitest";

import { currentPolicy } from "@kreds/policy";

import { claimsToExpire, ExpiryNotConfiguredError, type Receivable } from "../claims/claims.js";
import { evaluateEligibility } from "../economy/eligibility.js";
import { derivePosition } from "../economy/position.js";
import { due, hasSettled, lockedInTheDark, settlementWindow } from "../economy/settlement.js";
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
import { capUnobserved, unobservedCaps, NOBODY_OBSERVED } from "./observation.js";
import { NO_SHARED_FUNDING, routeLiability, type ChargeContext } from "./consent.js";
import { assertForwardOnly, isWithinBinding, RetroactiveScopeError } from "./binding.js";
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
    const alone = NOBODY_OBSERVED;
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
      observerGitHubUserId: 9001,
      observerIsDistinct: true,
      observerIsEligibleHuman: true,
      observerIsNotControlledAlternate: true,
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
  const stranger: ChargeContext = {
    hasBoundOrganization: false,
    contributorHasConnected: false,
    scope: "PERSONAL",
  };

  it("leaves a receivable rather than debt", () => {
    expect(routeLiability(stranger, NO_SHARED_FUNDING)).toMatchObject({
      authority: "NONE",
      route: "RECEIVABLE",
    });
  });

  /**
   * 23, as amended: "In a personal position the waterfall collapses to
   * `author -> receivable`." A Review Fund and a Credit Facility are things an
   * organization has, and there is no organization here.
   */
  it("reaches no shared funding, because none of it exists in a personal scope", () => {
    expect(routeLiability(stranger, { reviewFund: true, creditFacility: true })).toMatchObject({
      authority: "NONE",
      route: "RECEIVABLE",
    });
  });

  /** In every case, the reviewer earned it and gets it. */
  it("pays the reviewer either way", () => {
    expect(routeLiability(stranger, NO_SHARED_FUNDING).reviewerStillEarns).toBe(true);
    expect(
      routeLiability(stranger, { reviewFund: true, creditFacility: true }).reviewerStillEarns,
    ).toBe(true);
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
    expect(
      routeLiability(
        { ...stranger, hasBoundOrganization: true, scope: "ORGANIZATION" },
        NO_SHARED_FUNDING,
      ),
    ).toMatchObject({
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

describe("A04's audit round: going dark is legitimate, settling in the dark is not", () => {
  /**
   * The breach the audit found, and the reason this is the most serious of the
   * six. The earlier text said settlement "does not require further provider
   * access", which made revocation a laundering step:
   *
   * > "merge eligible work, revoke, revert everything, and let rewards settle on
   * > evidence that was quietly invalidated."
   */
  const pending = credit(120, { createdAt: MERGED });
  const day = settlementWindow(currentPolicy().settlement.normalWindowHours);
  const wellAfter = timestamp(MERGED + 48 * 60 * 60 * 1000);

  it("settles value whose context Kreds can still re-check", () => {
    expect(due([pending], day, wellAfter, () => "OBSERVABLE")).toEqual([pending]);
  });

  it("refuses to settle value whose context went dark", () => {
    expect(due([pending], day, wellAfter, () => "DARK")).toEqual([]);
  });

  /**
   * Locked, not cancelled. 26 has it settle "when the context becomes observable
   * again, or resolves under versioned expiry policy", so the entry stays
   * `PENDING` rather than being discarded.
   */
  it("locks it rather than losing it, and reports it as stuck", () => {
    const stuck = lockedInTheDark([pending], day, wellAfter, () => "DARK");
    expect(stuck).toEqual([pending]);
    expect(stuck[0]?.status).toBe("PENDING");
  });

  it("releases it once the context is observable again", () => {
    let visible = false;
    const look = () => (visible ? ("OBSERVABLE" as const) : ("DARK" as const));

    expect(due([pending], day, wellAfter, look)).toEqual([]);
    visible = true;
    expect(due([pending], day, wellAfter, look)).toEqual([pending]);
  });

  /**
   * The window still has to have run. Observability is a third condition, not a
   * replacement for the first two.
   */
  it("does not settle observable value early", () => {
    expect(due([pending], day, timestamp(MERGED + 60_000), () => "OBSERVABLE")).toEqual([]);
  });
});

describe("A04's audit round: a claim expires by policy, never by silence", () => {
  const claim = (over: Partial<Receivable> = {}): Receivable => ({
    id: "rcv_old" as never,
    claimantAccountId: accountId("acct_reviewer"),
    obligorAccountId: accountId("acct_stranger"),
    grossValue: fromKred(30),
    settledValue: ZERO_KREDBITS,
    status: "AWAITING_FUNDING",
    rulesVersion: rulesVersion("v0.5"),
    createdAt: MERGED,
    ...over,
  });

  const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
  const policy = { afterMs: NINETY_DAYS, rulesVersion: rulesVersion("v0.5") };
  const later = timestamp(MERGED + NINETY_DAYS + 1);

  /**
   * 23: "expiry is a **versioned** `RECEIVABLE_CANCELLED` adjustment, announced
   * like any policy and never silent."
   */
  it("carries the version that decided it, so the cancellation stays explainable", () => {
    const [expiring] = claimsToExpire([claim()], policy, later);
    expect(expiring?.rulesVersion).toBe("v0.5");
    expect(expiring?.claim.id).toBe("rcv_old");
  });

  it("refuses to expire anything without a policy that says when", () => {
    expect(() => claimsToExpire([claim()], null, later)).toThrow(ExpiryNotConfiguredError);
  });

  it("refuses an expiry that would cancel work the moment it was recorded", () => {
    expect(() =>
      claimsToExpire([claim()], { afterMs: 0, rulesVersion: rulesVersion("v0.5") }, later),
    ).toThrow(RangeError);
  });

  it("leaves a claim alone until its time has actually come", () => {
    expect(claimsToExpire([claim()], policy, timestamp(MERGED + NINETY_DAYS - 1))).toEqual([]);
  });

  /** Re-cancelling a closed claim would write a second history for one fact. */
  it("never reopens a claim that is already settled or cancelled", () => {
    expect(claimsToExpire([claim({ status: "SETTLED" })], policy, later)).toEqual([]);
    expect(claimsToExpire([claim({ status: "CANCELLED" })], policy, later)).toEqual([]);
  });
});

describe("A04's audit round: binding is forward-only", () => {
  const grant = {
    gitHubOrganizationId: 42,
    grantedByGitHubUserId: 9,
    grantedAt: Date.parse("2026-06-01T00:00:00Z"),
    verifiedAt: Date.parse("2026-08-22T00:00:00Z"),
  };

  /**
   * 26: "Activity that landed in personal positions before a Kreds Team existed
   * stays where it settled; the organization's economy begins at the binding, in
   * the spirit of Law XIII."
   *
   * Law XIII: "Joining Kreds Network gives an existing local economy a reserve
   * relationship; it does not erase its previous balances or ledger."
   */
  it("takes activity from the moment the organization consented onward", () => {
    expect(isWithinBinding(grant, Date.parse("2026-07-01T00:00:00Z"))).toBe(true);
    expect(isWithinBinding(grant, grant.grantedAt)).toBe(true);
  });

  it("leaves earlier activity in the personal position it already landed in", () => {
    const before = Date.parse("2026-05-01T00:00:00Z");
    expect(isWithinBinding(grant, before)).toBe(false);
    expect(() => assertForwardOnly(grant, before)).toThrow(RetroactiveScopeError);
  });

  /**
   * Measured from when the organization consented, not from the last
   * re-verification. A re-verification confirms the authority still holds; it
   * does not move the moment the economy began.
   */
  it("measures from the grant, so re-verifying does not sweep history in", () => {
    const between = Date.parse("2026-07-01T00:00:00Z");
    expect(isWithinBinding(grant, between)).toBe(true);
    expect(isWithinBinding({ ...grant, verifiedAt: Date.now() }, between)).toBe(true);
  });

  /**
   * Delegated query makes backfill ordinary, which is exactly why this is a
   * guard rather than a convention: a sweep of last year's merges must not walk
   * somebody's earlier earnings into an organization's books.
   */
  it("stops a backfill from re-scoping settled history", () => {
    const backfilled = [
      Date.parse("2026-01-01T00:00:00Z"),
      Date.parse("2026-03-01T00:00:00Z"),
      Date.parse("2026-05-31T23:59:59Z"),
    ];
    for (const occurredAt of backfilled) {
      expect(() => assertForwardOnly(grant, occurredAt), String(occurredAt)).toThrow(
        RetroactiveScopeError,
      );
    }
  });
});
