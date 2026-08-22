/**
 * Who may be charged, and who may not.
 *
 * Law XXXVII, Liability Requires a Consenting Context:
 *
 * > "An identity may earn without having consented, but may only be charged
 * > within a context whose authority consented. Where no consenting context
 * > exists, the obligation falls to a funded source or remains a receivable."
 *
 * The sentence the whole module turns on is in 09 and again in the amendment:
 *
 * > "Earning without consent is a gift. Owing without consent is an
 * > imposition."
 *
 * Before A04 an organization's installation was read as consent on behalf of
 * everyone whose work it touched. Once adoption became optional that defence
 * went with it, and 09 says so directly: "Remove the installation and that
 * defence disappears with it."
 */

import type { PositionScope } from "./scope.js";

/** Who could consent, in this context. `NONE` is a real answer and the important one. */
export type ConsentingAuthority = "CONTRIBUTOR" | "ORGANIZATION" | "NONE";

/** Where a charge would arise, in the terms consent is decided in. */
export interface ChargeContext {
  /**
   * The contributor authorized Kreds for their own account.
   *
   * 26: "A connected contributor has consented everywhere they act: authorizing
   * Kreds is joining the game, and author-pays review is the game."
   */
  readonly contributorHasConnected: boolean;
  /** A Kreds Team is bound to the owning organization, by that organization's authority. */
  readonly hasBoundOrganization: boolean;
  /** Which position this charge would land in (Law IV as amended). */
  readonly scope: PositionScope;
}

/**
 * Who consented to liability arising here.
 *
 * 26's table, in its order, and the order is the precedence:
 *
 * | The charged contributor is **connected** | The contributor, through their own authorization |
 * | The context is a **bound organization's** repository | The organization, for its context |
 * | Neither | **None** |
 *
 * The organization's consent is specifically what makes charging a
 * non-connected identity lawful: "A bound organization has consented for its
 * own context, which covers charging identities that never connected, including
 * unclaimed ones."
 *
 * Note what is *not* here. An earlier version of this file treated the
 * contributor's own repository as a consenting context on its own. A04's audit
 * round removed that, and 09 gives the reason: "an unclaimed owner never
 * connected, so they never consented to anything, including their own
 * repository becoming a place they can be charged."
 */
export function consentingAuthorityFor(context: ChargeContext): ConsentingAuthority {
  if (context.contributorHasConnected) return "CONTRIBUTOR";
  if (context.hasBoundOrganization) return "ORGANIZATION";
  return "NONE";
}

/** Where an obligation goes. Never onto an identity that never consented. */
export type LiabilityRoute = "CHARGE_CONTEXT" | "REVIEW_FUND" | "CREDIT_FACILITY" | "RECEIVABLE";

export interface LiabilityDecision {
  readonly authority: ConsentingAuthority;
  readonly route: LiabilityRoute;
  /**
   * Whether the reviewer still earns. Always true.
   *
   * Kept as a field rather than left implicit because it is the half of the
   * rule most likely to be dropped: 09 says "the review is still valid and the
   * reviewer still earns", and 11 warns that punishing a reviewer for a
   * counterparty's position "would teach reviewers to check balances before
   * helping, which is a disastrous behaviour to incentivise."
   */
  readonly reviewerStillEarns: true;
}

/** What an organization has available to cover a shortfall. */
export interface FundingAvailable {
  readonly reviewFund: boolean;
  readonly creditFacility: boolean;
}

/** A personal position has neither, by construction. */
export const NO_SHARED_FUNDING: FundingAvailable = Object.freeze({
  reviewFund: false,
  creditFacility: false,
});

/**
 * Route a review obligation.
 *
 * The waterfall is scoped, which 23 states as a rule rather than a nuance:
 *
 * > "Levels 2 and 3 exist only inside a **bound organization**: the Review Fund
 * > and the Credit Facility are organization features. In a personal position
 * > the waterfall collapses to `author -> receivable`. An implementation that
 * > wires credit draws for personal positions has extended the reserve to a
 * > scope no authority consented to."
 *
 * So a personal scope reaches neither level, whatever the caller passes: the
 * argument is ignored rather than trusted, because the caller is the place that
 * would eventually get it wrong.
 */
export function routeLiability(
  context: ChargeContext,
  funding: FundingAvailable = NO_SHARED_FUNDING,
): LiabilityDecision {
  const authority = consentingAuthorityFor(context);

  if (authority !== "NONE") {
    return decision(authority, "CHARGE_CONTEXT");
  }

  // Levels 2 and 3 are organization features. In a personal position the
  // waterfall is `author -> receivable`, and the author did not consent, so
  // what is left is the claim.
  if (context.scope !== "ORGANIZATION") return decision(authority, "RECEIVABLE");

  if (funding.reviewFund) return decision(authority, "REVIEW_FUND");
  if (funding.creditFacility) return decision(authority, "CREDIT_FACILITY");
  return decision(authority, "RECEIVABLE");
}

function decision(authority: ConsentingAuthority, route: LiabilityRoute): LiabilityDecision {
  return Object.freeze({ authority, route, reviewerStillEarns: true });
}

export class NoConsentingContextError extends Error {
  constructor(readonly contributorGitHubUserId: number) {
    super(
      `no authority consented to liability for user ${contributorGitHubUserId} in this context, so nothing here may become their debt (Law XXXVII).`,
    );
    this.name = "NoConsentingContextError";
  }
}

/**
 * Guard the moment a debt would be written against an identity.
 *
 * Called where debt is created rather than where it is decided, so that a future
 * path to debt that skipped `routeLiability` still cannot charge a stranger.
 * 26: it "does **not** become debt against someone who never heard of Kreds."
 */
export function assertMayBeCharged(context: ChargeContext, contributorGitHubUserId: number): void {
  if (consentingAuthorityFor(context) === "NONE") {
    throw new NoConsentingContextError(contributorGitHubUserId);
  }
}
