/**
 * Where an event lands.
 *
 * Law IV as amended by A04, Organization Boundary:
 *
 * > "GitHub-derived economic activity first belongs to a scoped economic
 * > position: the connected GitHub Organization's economy where a Kreds Team
 * > exists, otherwise the contributor's personal position. It never lands
 * > directly in a global wallet."
 *
 * The last sentence is the one to keep in view. Before A04 the boundary needed
 * an organization, so work with no Team behind it had nowhere to go; the
 * tempting fix is to credit the wallet directly, and 11 lists the six
 * protections that removes at once: settlement, pending balances, locked
 * balances, credit limits, separate withdrawable balances, and organization
 * positions themselves.
 *
 * 26 is explicit that the personal position is not a consolation prize: "This
 * is not a lighter tier. It is the same accounting with a different boundary,
 * because Law VII does not care whether an organization happens to be
 * involved."
 */

/** The two places value may land. There is no third, and no global wallet here. */
export const POSITION_SCOPES = ["PERSONAL", "ORGANIZATION"] as const;
export type PositionScope = (typeof POSITION_SCOPES)[number];

/** What Kreds knows about where an event happened. */
export interface EventContext {
  /** The GitHub organization that owns the repository, if any. */
  readonly gitHubOrganizationId: number | null;
  /** Whether a Kreds Team is bound to that organization *right now*. */
  readonly hasBoundTeam: boolean;
  /** The contributor the value is for. */
  readonly contributorGitHubUserId: number;
}

/** A resolved landing place. Always a position, never a wallet. */
export type Landing =
  | { readonly scope: "ORGANIZATION"; readonly gitHubOrganizationId: number }
  | { readonly scope: "PERSONAL"; readonly contributorGitHubUserId: number };

/**
 * Resolve where this event's value belongs.
 *
 * Note that an organization landing requires a **bound Team**, not merely an
 * organization. A repository owned by an organization that never adopted Kreds
 * produces a personal landing: there is no organization economy to land in, and
 * Law XXXVI says nobody may conjure one on that organization's behalf.
 */
export function landingFor(context: EventContext): Landing {
  if (context.gitHubOrganizationId !== null && context.hasBoundTeam) {
    return Object.freeze({
      scope: "ORGANIZATION" as const,
      gitHubOrganizationId: context.gitHubOrganizationId,
    });
  }
  return Object.freeze({
    scope: "PERSONAL" as const,
    contributorGitHubUserId: context.contributorGitHubUserId,
  });
}

/**
 * Everything an organization's adoption unlocks.
 *
 * 26 names what the right-hand column has in common, and it is worth stating
 * because it is what keeps this from being an arbitrary paywall: "The
 * right-hand column is everything involving **money that is not the
 * individual's**. That is exactly the set that needs an organization's
 * consent."
 */
export const ORGANIZATION_ONLY_FEATURES = [
  "TREASURY",
  "REVIEW_FUND",
  "LOCAL_CURRENCY",
  "RESERVE_BACKING",
  "REVIEW_CREDIT_FACILITY",
  "ORGANIZATION_POSITION",
  "ORGANIZATION_MONETARY_POLICY",
  "ORG_SCOPED_CHALLENGES",
] as const;

/** What a developer gets with their own authorization and nothing else. */
export const PERSONAL_FEATURES = [
  "CONTRIBUTION_POINTS",
  "MERGE_REWARDS",
  "CODE_REVIEW_TRANSFERS",
  "RECEIVABLES",
  "PERSONAL_POSITION",
  "SETTLEMENT",
  "GLOBAL_WALLET",
  "LEADERBOARDS",
] as const;

export type OrganizationOnlyFeature = (typeof ORGANIZATION_ONLY_FEATURES)[number];
export type PersonalFeature = (typeof PERSONAL_FEATURES)[number];
export type Feature = OrganizationOnlyFeature | PersonalFeature;

/**
 * Whether a feature is reachable from this scope.
 *
 * A personal scope reaches everything that is the individual's own money and
 * nothing that is shared. An organization scope reaches both: an org member
 * still has a personal position and a global wallet.
 */
export function isAvailable(feature: Feature, scope: PositionScope): boolean {
  if ((PERSONAL_FEATURES as readonly string[]).includes(feature)) return true;
  return scope === "ORGANIZATION";
}

/**
 * Refuse a feature the scope does not reach, with a reason.
 *
 * 26 frames the gate the way it should be reported: adoption is for shared
 * money, not for permission to play. A refusal that read "upgrade required"
 * would be describing a paywall, which this is not.
 */
export class FeatureRequiresOrganizationError extends Error {
  constructor(readonly feature: Feature) {
    super(
      `${feature} involves money that is not the individual's, so it exists only behind an organization's own consent (Law XXXVI).`,
    );
    this.name = "FeatureRequiresOrganizationError";
  }
}

export function requireFeature(feature: Feature, scope: PositionScope): void {
  if (!isAvailable(feature, scope)) throw new FeatureRequiresOrganizationError(feature);
}
