import { describe, expect, it } from "vitest";

import { points } from "../primitives/points.js";
import {
  capUnobserved,
  NO_UNOBSERVED_ALLOWANCE,
  NOBODY_OBSERVED,
  unobservedCaps,
  UnobservedCapsNotConfiguredError,
  wasObserved,
} from "./observation.js";
import {
  assertMayBeCharged,
  consentingAuthorityFor,
  NO_SHARED_FUNDING,
  NoConsentingContextError,
  routeLiability,
  type ChargeContext,
} from "./consent.js";
import {
  BindingNotVerifiedError,
  decideBinding,
  requireVerifiedAuthority,
  type BindingEvidence,
  type OrganizationGrant,
} from "./binding.js";
import {
  FeatureRequiresOrganizationError,
  isAvailable,
  landingFor,
  ORGANIZATION_ONLY_FEATURES,
  PERSONAL_FEATURES,
  requireFeature,
} from "./scope.js";
import {
  ClientOriginatedEvidenceError,
  factKey,
  INGESTION_MODES,
  provenance,
} from "./provenance.js";

const NOW = Date.parse("2026-08-22T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

describe("Law XXXV, evidence comes from the provider", () => {
  /**
   * > "No client, browser extension, local agent, or self-hosted node may
   * > originate an economic claim."
   *
   * Every name the law uses, tried by name. If a future mode is added the list
   * has to be edited here too, which is the point: adding an ingestion path
   * should require touching a file that quotes the law.
   */
  it("refuses every channel the law names, one by one", () => {
    for (const mode of [
      "CLIENT",
      "BROWSER_EXTENSION",
      "LOCAL_AGENT",
      "IDE_PLUGIN",
      "SELF_HOSTED_NODE",
      "CLI",
      "SIGNED_CLIENT_CLAIM",
    ]) {
      expect(
        () => provenance({ mode, deliveryRef: "d", occurredAt: NOW, observedAt: NOW }),
        mode,
      ).toThrow(ClientOriginatedEvidenceError);
    }
  });

  it("accepts exactly two channels and no others", () => {
    expect(INGESTION_MODES).toEqual(["PROVIDER_WEBHOOK", "SERVER_SIDE_DELEGATED_QUERY"]);
    for (const mode of INGESTION_MODES) {
      expect(provenance({ mode, deliveryRef: "d", occurredAt: NOW, observedAt: NOW }).mode).toBe(
        mode,
      );
    }
  });

  /**
   * 26: evidence travels "from GitHub to a Kreds server". Which server-held
   * credential happened to make the call is not part of what happened, and
   * putting it here would be the first step toward pricing by observer.
   */
  it("records the delivery that produced it, and refuses evidence with no source", () => {
    expect(() =>
      provenance({ mode: "PROVIDER_WEBHOOK", deliveryRef: "  ", occurredAt: NOW, observedAt: NOW }),
    ).toThrow(RangeError);
  });

  /**
   * The failure A04 created and nothing before it had: under delegated query the
   * same merge is visible to every collaborator who authorized Kreds. A key
   * including the observer would pay the same work once per observer.
   */
  it("keys a fact by what happened, so several observers cannot pay it twice", () => {
    const seenByIsaac = factKey({
      kind: "PULL_REQUEST_MERGED",
      gitHubRepositoryId: 77001,
      gitHubNodeId: "PR_kwDO",
    });
    const seenByJose = factKey({
      kind: "PULL_REQUEST_MERGED",
      gitHubRepositoryId: 77001,
      gitHubNodeId: "PR_kwDO",
    });

    expect(seenByIsaac).toBe(seenByJose);
  });

  it("keys distinct facts distinctly", () => {
    const a = factKey({ kind: "PULL_REQUEST_MERGED", gitHubRepositoryId: 1, gitHubNodeId: "x" });
    const b = factKey({ kind: "PULL_REQUEST_MERGED", gitHubRepositoryId: 2, gitHubNodeId: "x" });
    const c = factKey({ kind: "REVIEW_SUBMITTED", gitHubRepositoryId: 1, gitHubNodeId: "x" });

    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe("Law IV as amended, every event lands in a scoped position", () => {
  /**
   * > "the connected GitHub Organization's economy where a Kreds Team exists,
   * > otherwise the contributor's personal position. It never lands directly in
   * > a global wallet."
   */
  it("lands in the organization where a Team is bound", () => {
    expect(
      landingFor({ gitHubOrganizationId: 42, hasBoundTeam: true, contributorGitHubUserId: 7 }),
    ).toEqual({ scope: "ORGANIZATION", gitHubOrganizationId: 42 });
  });

  /**
   * An organization that never adopted Kreds has no economy to land in, and
   * Law XXXVI forbids conjuring one on its behalf. So the value is the
   * contributor's, in their own position.
   */
  it("lands personally when the organization never adopted Kreds", () => {
    expect(
      landingFor({ gitHubOrganizationId: 42, hasBoundTeam: false, contributorGitHubUserId: 7 }),
    ).toEqual({ scope: "PERSONAL", contributorGitHubUserId: 7 });
  });

  it("lands personally when there is no organization at all", () => {
    expect(
      landingFor({ gitHubOrganizationId: null, hasBoundTeam: false, contributorGitHubUserId: 7 }),
    ).toEqual({ scope: "PERSONAL", contributorGitHubUserId: 7 });
  });

  /**
   * The one thing `landingFor` must never return. 11 lists the six protections
   * a direct pipe to the wallet would remove at once.
   */
  it("never returns a global wallet, whatever it is handed", () => {
    for (const organizationId of [null, 0, 42]) {
      for (const hasBoundTeam of [true, false]) {
        const landing = landingFor({
          gitHubOrganizationId: organizationId,
          hasBoundTeam,
          contributorGitHubUserId: 7,
        });
        expect(["PERSONAL", "ORGANIZATION"]).toContain(landing.scope);
      }
    }
  });
});

describe("what an organization's adoption unlocks", () => {
  /**
   * 26: "The right-hand column is everything involving **money that is not the
   * individual's**. That is exactly the set that needs an organization's
   * consent, and it is why the split falls where it does rather than being an
   * arbitrary paywall."
   */
  it("gives a developer with no organization their own money and every reputation surface", () => {
    for (const feature of PERSONAL_FEATURES) {
      expect(isAvailable(feature, "PERSONAL"), feature).toBe(true);
    }
  });

  it("withholds every form of shared money until an organization consents", () => {
    for (const feature of ORGANIZATION_ONLY_FEATURES) {
      expect(isAvailable(feature, "PERSONAL"), feature).toBe(false);
      expect(isAvailable(feature, "ORGANIZATION"), feature).toBe(true);
    }
  });

  it("refuses shared money from a personal scope, and says why", () => {
    expect(() => requireFeature("TREASURY", "PERSONAL")).toThrow(FeatureRequiresOrganizationError);
    expect(() => requireFeature("TREASURY", "PERSONAL")).toThrow(/not the individual's/);
  });

  it("does not take a personal position away from someone in an organization", () => {
    expect(isAvailable("PERSONAL_POSITION", "ORGANIZATION")).toBe(true);
    expect(isAvailable("GLOBAL_WALLET", "ORGANIZATION")).toBe(true);
  });
});

describe("Law XXXVI, only organization authority binds an organization", () => {
  const evidence = (over: Partial<BindingEvidence> = {}): BindingEvidence => ({
    gitHubOrganizationId: 42,
    claimantGitHubUserId: 7,
    isMember: false,
    isFirstToConnect: false,
    hasRepositoryAccess: false,
    hasContributedPublicly: false,
    organizationGrant: null,
    ...over,
  });

  const grant = (over: Partial<OrganizationGrant> = {}): OrganizationGrant => ({
    gitHubOrganizationId: 42,
    grantedByGitHubUserId: 9,
    grantedAt: NOW - DAY,
    verifiedAt: NOW - DAY,
    ...over,
  });

  /**
   * > "Individual membership, first connection, or repository access never
   * > confers it."
   *
   * 26 adds contributing to a public repository. Each one alone, then all four
   * together, because "surely all of them at once" is exactly the reasoning
   * this law exists to refuse.
   */
  it("refuses every signal the law calls insufficient, alone and combined", () => {
    for (const field of [
      "isMember",
      "isFirstToConnect",
      "hasRepositoryAccess",
      "hasContributedPublicly",
    ] as const) {
      expect(decideBinding(evidence({ [field]: true })), field).toMatchObject({
        bound: false,
        refusal: "NO_ORGANIZATION_GRANT",
      });
    }

    expect(
      decideBinding(
        evidence({
          isMember: true,
          isFirstToConnect: true,
          hasRepositoryAccess: true,
          hasContributedPublicly: true,
        }),
      ),
    ).toMatchObject({ bound: false });
  });

  it("binds only on the organization's own grant", () => {
    expect(decideBinding(evidence({ organizationGrant: grant() }))).toMatchObject({ bound: true });
  });

  /**
   * Authority over one organization is not authority over another. Without this
   * check, an owner of any organization would be an owner of all of them.
   */
  it("refuses a grant made by a different organization", () => {
    expect(
      decideBinding(evidence({ organizationGrant: grant({ gitHubOrganizationId: 99 }) })),
    ).toMatchObject({ bound: false, refusal: "GRANT_IS_FOR_ANOTHER_ORGANIZATION" });
  });

  /**
   * 26 requires re-verification before treasury-affecting actions. The owner who
   * granted it can leave, lose their role, or revoke the authorization, and none
   * of those edits a row Kreds already wrote.
   */
  it("lets fresh authority move an organization's money", () => {
    const decision = decideBinding(evidence({ organizationGrant: grant({ verifiedAt: NOW }) }));
    expect(requireVerifiedAuthority(decision, NOW, { milliseconds: DAY })).toMatchObject({
      gitHubOrganizationId: 42,
    });
  });

  it("refuses to move it on a binding nobody has confirmed lately", () => {
    const decision = decideBinding(
      evidence({ organizationGrant: grant({ verifiedAt: NOW - 30 * DAY }) }),
    );
    expect(() => requireVerifiedAuthority(decision, NOW, { milliseconds: DAY })).toThrow(
      BindingNotVerifiedError,
    );
  });

  it("refuses a freshness window of zero, which would accept anything stored", () => {
    const decision = decideBinding(evidence({ organizationGrant: grant() }));
    expect(() => requireVerifiedAuthority(decision, NOW, { milliseconds: 0 })).toThrow(RangeError);
  });

  it("refuses to move money on an unbound organization at all", () => {
    expect(() =>
      requireVerifiedAuthority(decideBinding(evidence()), NOW, { milliseconds: DAY }),
    ).toThrow(BindingNotVerifiedError);
  });
});

describe("Law XXXVII, liability requires a consenting context", () => {
  const context = (over: Partial<ChargeContext> = {}): ChargeContext => ({
    hasBoundOrganization: false,
    contributorHasConnected: false,
    scope: "PERSONAL",
    ...over,
  });

  /**
   * 26's table, row by row, in its order. "A connected contributor has consented
   * everywhere they act: authorizing Kreds is joining the game, and author-pays
   * review is the game."
   */
  it("finds a connected contributor consented, wherever they were acting", () => {
    expect(consentingAuthorityFor(context({ contributorHasConnected: true }))).toBe("CONTRIBUTOR");
    expect(
      consentingAuthorityFor(
        context({
          contributorHasConnected: true,
          hasBoundOrganization: true,
          scope: "ORGANIZATION",
        }),
      ),
    ).toBe("CONTRIBUTOR");
  });

  /**
   * The exception A04's audit round removed. 09: "an unclaimed owner never
   * connected, so they never consented to anything, including their own
   * repository becoming a place they can be charged."
   */
  it("does not treat an unconnected owner's own repository as consent", () => {
    expect(consentingAuthorityFor(context())).toBe("NONE");
  });

  /**
   * 26: a bound organization's consent "covers charging identities that never
   * connected, including unclaimed ones."
   */
  it("finds the organization consented for identities that never connected", () => {
    expect(
      consentingAuthorityFor(context({ hasBoundOrganization: true, scope: "ORGANIZATION" })),
    ).toBe("ORGANIZATION");
  });

  /**
   * The row the amendment exists for: a public repository, an unbound
   * organization, and a contributor who never heard of Kreds.
   */
  it("finds nobody consented for an unconnected author in an unbound repository", () => {
    expect(consentingAuthorityFor(context())).toBe("NONE");
  });

  /**
   * > "the review is still valid and the reviewer still earns"
   *
   * 11 on why this half cannot be dropped: punishing the reviewer "would teach
   * reviewers to check balances before helping, which is a disastrous behaviour
   * to incentivise."
   */
  it("pays the reviewer in every case, including the one nobody consented to", () => {
    for (const c of [
      context(),
      context({ hasBoundOrganization: true, scope: "ORGANIZATION" }),
      context({ contributorHasConnected: true }),
    ]) {
      for (const funding of [NO_SHARED_FUNDING, { reviewFund: true, creditFacility: true }]) {
        expect(routeLiability(c, funding).reviewerStillEarns).toBe(true);
      }
    }
  });

  /**
   * > "the obligation goes to a funded source or stays a receivable. It does
   * > **not** become debt against someone who never heard of Kreds."
   */
  it("sends an unconsented obligation in an organization to its funded sources", () => {
    const inOrg = context({ scope: "ORGANIZATION" });
    expect(routeLiability(inOrg, { reviewFund: true, creditFacility: true })).toMatchObject({
      authority: "NONE",
      route: "REVIEW_FUND",
    });
    expect(routeLiability(inOrg, { reviewFund: false, creditFacility: true })).toMatchObject({
      route: "CREDIT_FACILITY",
    });
    expect(routeLiability(inOrg, NO_SHARED_FUNDING)).toMatchObject({ route: "RECEIVABLE" });
  });

  /**
   * 23, as amended: "In a personal position the waterfall collapses to
   * `author -> receivable`. An implementation that wires credit draws for
   * personal positions has extended the reserve to a scope no authority
   * consented to."
   *
   * The funding argument is passed and ignored, which is the point: the caller
   * is the place that would eventually get this wrong.
   */
  it("reaches no Review Fund and no Credit Facility from a personal position", () => {
    const generous = { reviewFund: true, creditFacility: true };
    expect(routeLiability(context(), generous)).toMatchObject({
      authority: "NONE",
      route: "RECEIVABLE",
    });
  });

  it("never routes an unconsented obligation onto the context", () => {
    for (const funding of [NO_SHARED_FUNDING, { reviewFund: true, creditFacility: true }]) {
      expect(routeLiability(context(), funding).route).not.toBe("CHARGE_CONTEXT");
      expect(routeLiability(context({ scope: "ORGANIZATION" }), funding).route).not.toBe(
        "CHARGE_CONTEXT",
      );
    }
  });

  /**
   * The guard sits where debt is written rather than where it is decided, so a
   * future path that skipped the router still cannot charge a stranger.
   */
  it("refuses to write debt against an identity that never consented", () => {
    expect(() => assertMayBeCharged(context(), 4242)).toThrow(NoConsentingContextError);
    expect(() =>
      assertMayBeCharged(context({ hasBoundOrganization: true, scope: "ORGANIZATION" }), 4242),
    ).not.toThrow();
  });
});

describe("Contribution Points where nobody was watching", () => {
  const tally = (today = 0, thisMonth = 0) => ({
    today: points(today),
    thisMonth: points(thisMonth),
  });
  // Arbitrary fixture numbers, deliberately unlike anything an operator
  // would configure. The real caps are not published and must not appear here.
  const caps = unobservedCaps({ perUserPerDay: 7, perUserPerMonth: 23 });

  /**
   * 24: "An observer, for this purpose, is held to the same standard as a
   * validating reviewer: a distinct, eligible, human identity that is not a
   * controlled alternate account."
   *
   * A person, not a property of the repository.
   */
  const observed = {
    observerGitHubUserId: 9001,
    observerIsDistinct: true,
    observerIsEligibleHuman: true,
    observerIsNotControlledAlternate: true,
  };

  it("does not touch points once an independent human has seen the work", () => {
    expect(wasObserved(observed)).toBe(true);
    const award = capUnobserved(points(50), observed, tally(), caps);
    expect(award.awarded).toBe(points(50));
    expect(award.reason).toBe("NOT_CAPPED");
  });

  /**
   * Every clause must hold, and each failure is a real path somebody would take.
   *
   * > "Adding your own second account as a collaborator does not lift the cap;
   * > if it did, the cap would cost one API call to bypass."
   */
  it("refuses each way an observer falls short, one at a time", () => {
    for (const missing of [
      "observerIsDistinct",
      "observerIsEligibleHuman",
      "observerIsNotControlledAlternate",
    ] as const) {
      expect(wasObserved({ ...observed, [missing]: false }), missing).toBe(false);
    }
    expect(wasObserved({ ...observed, observerGitHubUserId: null })).toBe(false);
  });

  /**
   * An earlier version of this treated public visibility and the presence of
   * collaborators as observation. Both are toggles the author controls, and
   * Law XXX says the same thing about the monetary side: a toggle is not
   * evidence. There is no field for either any more, and this asserts it.
   */
  it("offers no way to lift the cap that is not a person", () => {
    expect(Object.keys(observed).sort()).toEqual([
      "observerGitHubUserId",
      "observerIsDistinct",
      "observerIsEligibleHuman",
      "observerIsNotControlledAlternate",
    ]);
  });

  const unseen = NOBODY_OBSERVED;

  /**
   * > "They are not refused: solo work in a private repository is real work."
   */
  it("still awards the first solo private merge of the day", () => {
    expect(capUnobserved(points(3), unseen, tally(), caps).awarded).toBe(points(3));
  });

  it("stops awarding once the day's allowance is spent", () => {
    const award = capUnobserved(points(30), unseen, tally(5), caps);
    expect(award.awarded).toBe(points(2));
    expect(award.reason).toBe("DAILY_CAP_REACHED");
    expect(award.earned).toBe(points(30));
  });

  /**
   * A daily cap alone is a rate limit an unattended script waits out, reaching
   * an unbounded total over a month. This is the window that actually bounds it.
   */
  it("holds the month even on a day whose own allowance is untouched", () => {
    const award = capUnobserved(points(40), unseen, tally(0, 23), caps);
    expect(award.awarded).toBe(points(0));
    expect(award.reason).toBe("MONTHLY_CAP_REACHED");
  });

  it("never awards a negative amount, whatever the tally says", () => {
    expect(capUnobserved(points(10), unseen, tally(999, 999), caps).awarded).toBe(points(0));
  });

  /**
   * The caps are operational policy and are not published, so this repository,
   * which is public, cannot ship them. An instance that has not been configured
   * cannot know the bound, and Law XIX makes the safe direction clear: award
   * nothing unobserved rather than award without a limit.
   */
  it("refuses to invent a bound it was never given", () => {
    expect(() => unobservedCaps({})).toThrow(UnobservedCapsNotConfiguredError);
    expect(() => unobservedCaps({ perUserPerDay: 10 })).toThrow(UnobservedCapsNotConfiguredError);
  });

  it("awards nothing unobserved when an instance has no configured allowance", () => {
    expect(capUnobserved(points(50), unseen, tally(), NO_UNOBSERVED_ALLOWANCE).awarded).toBe(
      points(0),
    );
  });

  /** An unconfigured instance still runs a complete reviewed economy. */
  it("leaves observed work untouched even with no allowance configured", () => {
    expect(capUnobserved(points(50), observed, tally(), NO_UNOBSERVED_ALLOWANCE).awarded).toBe(
      points(50),
    );
  });
});
