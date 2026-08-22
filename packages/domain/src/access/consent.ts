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

/** Who could consent, in this context. `NONE` is a real answer and the important one. */
export type ConsentingAuthority = "CONTRIBUTOR" | "ORGANIZATION" | "NONE";

/** Where a review happened, in the terms consent is decided in. */
export interface ChargeContext {
  /** The repository's owner is the contributor being charged. */
  readonly isContributorsOwnRepository: boolean;
  /** A Kreds Team is bound to the owning organization, by that organization's authority. */
  readonly hasBoundOrganization: boolean;
  /** The contributor authorized Kreds for their own account. */
  readonly contributorHasConnected: boolean;
}

/**
 * Who consented to liability arising here.
 *
 * 26's table, in order:
 *
 * | The contributor's own repository | The contributor |
 * | A bound organization's repository | The organization |
 * | A public repository, unbound organization, contributor not connected | **None** |
 *
 * The contributor's own repository comes first. Somebody who connected their
 * account and works in their own repository has consented to the economy that
 * runs there, whatever any organization did or did not do.
 */
export function consentingAuthorityFor(context: ChargeContext): ConsentingAuthority {
  if (context.isContributorsOwnRepository && context.contributorHasConnected) {
    return "CONTRIBUTOR";
  }
  if (context.hasBoundOrganization) return "ORGANIZATION";
  // A contributor who connected has consented to being charged for work they
  // chose to do inside the economy, wherever it happened. This is the case 26
  // does not tabulate directly: its third row is specifically the contributor
  // who has *not* connected.
  if (context.contributorHasConnected) return "CONTRIBUTOR";
  return "NONE";
}

/** Where an obligation goes. Never onto an identity that never consented. */
export type LiabilityRoute = "CHARGE_CONTEXT" | "FUNDED_SOURCE" | "RECEIVABLE";

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

/**
 * Route a review obligation.
 *
 * With a consenting authority the ordinary waterfall applies (23), and this
 * function says only that the context may be charged. With none, the obligation
 * goes to a funded source if one is available and otherwise stays a receivable,
 * which is Law XXIV's claim rather than money.
 *
 * @param fundedSourceAvailable whether a Review Fund or other funded source can
 * cover it. An argument rather than a lookup: which sources exist is an
 * organization's business and this package does not query anything.
 */
export function routeLiability(
  context: ChargeContext,
  fundedSourceAvailable: boolean,
): LiabilityDecision {
  const authority = consentingAuthorityFor(context);
  if (authority !== "NONE") {
    return Object.freeze({ authority, route: "CHARGE_CONTEXT" as const, reviewerStillEarns: true });
  }
  return Object.freeze({
    authority,
    route: fundedSourceAvailable ? ("FUNDED_SOURCE" as const) : ("RECEIVABLE" as const),
    reviewerStillEarns: true,
  });
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
