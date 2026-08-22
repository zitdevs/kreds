/**
 * What binds a Kreds Team to a GitHub Organization.
 *
 * Law XXXVI, Only Organization Authority Binds an Organization:
 *
 * > "A Kreds Team may be bound to a GitHub Organization only by that
 * > organization's own authority. Individual membership, first connection, or
 * > repository access never confers it."
 *
 * 26 spells out what that forecloses: "Without this, an outside contributor to a
 * single public repository could claim the organization's economy, its treasury,
 * and its monetary policy. The person who connects first gets a personal
 * position, which is theirs, and nothing else."
 *
 * The shape below follows from that. Every insufficient signal is named and
 * carried on the evidence, so refusing one is a decision this module makes
 * rather than a case somebody forgot to write.
 */

/** What Kreds observed about somebody claiming an organization. */
export interface BindingEvidence {
  readonly gitHubOrganizationId: number;
  readonly claimantGitHubUserId: number;
  /** They belong to the organization. Never sufficient. */
  readonly isMember: boolean;
  /** They got here first. Never sufficient. */
  readonly isFirstToConnect: boolean;
  /** They can write to a repository. Never sufficient. */
  readonly hasRepositoryAccess: boolean;
  /** They contributed to one of its public repositories. Never sufficient. */
  readonly hasContributedPublicly: boolean;
  /**
   * The organization itself granted this, through its own authorization.
   *
   * `null` when no such grant exists. This is the only field that can produce a
   * binding, and it is deliberately the only one that cannot be arranged by the
   * claimant.
   */
  readonly organizationGrant: OrganizationGrant | null;
}

/**
 * A grant made by the organization's own authority.
 *
 * `verifiedAt` is here because a grant is a fact about a moment. 26 requires
 * treasury-affecting actions to check authority now rather than trusting the
 * record, and a record with no timestamp cannot support that check.
 */
export interface OrganizationGrant {
  readonly gitHubOrganizationId: number;
  /** The GitHub account that held organization authority when the grant was made. */
  readonly grantedByGitHubUserId: number;
  readonly grantedAt: number;
  /** When Kreds last confirmed with GitHub that the authority still holds. */
  readonly verifiedAt: number;
}

export type BindingRefusal =
  "NO_ORGANIZATION_GRANT" | "GRANT_IS_FOR_ANOTHER_ORGANIZATION" | "GRANT_NOT_VERIFIED";

export type BindingDecision =
  | { readonly bound: true; readonly grant: OrganizationGrant }
  | { readonly bound: false; readonly refusal: BindingRefusal };

/**
 * Decide whether this evidence binds the organization.
 *
 * Reads only `organizationGrant`. The other four fields exist on the input so
 * that a caller cannot pass "well, they are an owner" as though it were an
 * argument: they are accepted, ignored, and there is a test for each one that
 * says so in the law's own words.
 */
export function decideBinding(evidence: BindingEvidence): BindingDecision {
  const grant = evidence.organizationGrant;
  if (!grant) return refuse("NO_ORGANIZATION_GRANT");
  if (grant.gitHubOrganizationId !== evidence.gitHubOrganizationId) {
    // A grant from one organization is not authority over another. Without this
    // check, authority over any organization would be authority over all of them.
    return refuse("GRANT_IS_FOR_ANOTHER_ORGANIZATION");
  }
  return Object.freeze({ bound: true as const, grant });
}

function refuse(refusal: BindingRefusal): BindingDecision {
  return Object.freeze({ bound: false as const, refusal });
}

export class BindingNotVerifiedError extends Error {
  constructor(readonly gitHubOrganizationId: number) {
    super(
      `authority over organization ${gitHubOrganizationId} has not been confirmed recently enough to move its money. A binding valid at creation is not evidence of authority today (Law XXXVI).`,
    );
    this.name = "BindingNotVerifiedError";
  }
}

/**
 * Confirm authority before touching money that belongs to the organization.
 *
 * 26 requires re-verification rather than trust in the stored binding, and the
 * reason is ordinary rather than exotic: the owner who granted it can leave,
 * lose their role, or have the authorization revoked, and none of those events
 * edits a row Kreds already wrote.
 *
 * The freshness window is an argument. How recently authority must have been
 * confirmed is operational policy, and a default here would be this file
 * choosing it.
 *
 * @throws when the grant is missing, for another organization, or stale.
 */
export function requireVerifiedAuthority(
  decision: BindingDecision,
  now: number,
  freshness: { readonly milliseconds: number },
): OrganizationGrant {
  if (!decision.bound) {
    throw new BindingNotVerifiedError(-1);
  }
  if (freshness.milliseconds <= 0) {
    throw new RangeError(
      "a freshness window of zero would accept any stored grant, which is what re-verification exists to prevent.",
    );
  }
  if (now - decision.grant.verifiedAt > freshness.milliseconds) {
    throw new BindingNotVerifiedError(decision.grant.gitHubOrganizationId);
  }
  return decision.grant;
}

/**
 * A binding starts an organization's economy; it does not reach backwards.
 *
 * 26, added by A04's audit round:
 *
 * > "**Binding is forward-only.** Activity that landed in personal positions
 * > before a Kreds Team existed stays where it settled; the organization's
 * > economy begins at the binding, in the spirit of Law XIII. No retroactive
 * > migration, no re-scoping of settled history."
 *
 * Law XIII is the one being echoed: "Joining Kreds Network gives an existing
 * local economy a reserve relationship; it does not erase its previous balances
 * or ledger." The same reasoning applies one level down. Somebody's earnings
 * are theirs, in their own position, and an organization adopting Kreds later
 * does not acquire them.
 */
export class RetroactiveScopeError extends Error {
  constructor(
    readonly boundAt: number,
    readonly occurredAt: number,
  ) {
    super(
      `this activity happened before the organization was bound, so it belongs to the personal position it already landed in. Binding is forward-only (26, Law XIII).`,
    );
    this.name = "RetroactiveScopeError";
  }
}

/**
 * Whether an event falls inside an organization's economy.
 *
 * Only events at or after the binding. Note that this compares against
 * `grantedAt` rather than `verifiedAt`: the economy began when the organization
 * consented, and a later re-verification does not move that moment.
 */
export function isWithinBinding(grant: OrganizationGrant, occurredAt: number): boolean {
  return occurredAt >= grant.grantedAt;
}

/**
 * Guard the moment history would be re-scoped.
 *
 * Called where an event is assigned to an organization position, so that a
 * backfill cannot quietly sweep somebody's earlier personal earnings into an
 * organization's books. Delegated query makes backfill ordinary, which is
 * exactly why this needs to be a guard rather than a convention.
 */
export function assertForwardOnly(grant: OrganizationGrant, occurredAt: number): void {
  if (!isWithinBinding(grant, occurredAt)) {
    throw new RetroactiveScopeError(grant.grantedAt, occurredAt);
  }
}
