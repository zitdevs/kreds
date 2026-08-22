/**
 * The Core to Network protocol, as Core declares it.
 *
 * These shapes also exist in `kreds-network`, declared separately. That is not
 * duplication waiting to be cleaned up: importing them from there would make
 * this AGPL repository compile against a proprietary one, and would give Core a
 * build dependency on a repository most people running Core will never have.
 * The two copies are kept in step by `PROTOCOL_VERSION` and by a conformance
 * test on each side, which is what a protocol boundary is.
 *
 * The rule the shapes enforce, in both directions:
 *
 *   Core submits evidence. Network decides money.
 *
 * Nothing Core sends carries an amount, because Core cannot price work
 * (Law XXIII: the Network decides Official KRED). Nothing Network returns
 * carries a threshold, because thresholds are unpublished operational policy
 * and this repository is public.
 */

export const PROTOCOL_VERSION = "1";

export type CandidateKind = "PULL_REQUEST_MERGED" | "REVIEW_SUBMITTED";

/**
 * Structural facts about a contribution, as Core observed them.
 *
 * Every field is something Core can read out of a GitHub payload and check
 * without knowing any policy. There is deliberately no score, no multiplier and
 * no amount: a candidate carrying its own value would mean Core had priced
 * work.
 */
export interface EconomicCandidate {
  /**
   * The stable key that makes this submission idempotent.
   *
   * 06: Ledger, Idempotency. GitHub delivers at least once and Core retries, so
   * the same candidate arrives repeatedly. Network returns the same decision
   * for a repeat, never a second issuance.
   */
  readonly idempotencyKey: string;
  readonly kind: CandidateKind;
  /** ISO 8601. */
  readonly occurredAt: string;

  readonly actor: {
    readonly gitHubUserId: number;
    /** Law XVI, Bots Are Not Developers: only `HUMAN` earns. */
    readonly actorType: "HUMAN" | "BOT" | "AI_AGENT" | "UNKNOWN";
  };

  readonly repository: {
    readonly gitHubRepositoryId: number;
    readonly isPrivate: boolean;
    readonly isPersonallyOwned: boolean;
  };

  /** Absent for a personal repository, which forms no Team (02). */
  readonly organization?: {
    readonly gitHubOrganizationId: number;
  };

  /**
   * The structural half of eligibility, which Core can establish alone.
   *
   * The other half, trust and collusion, is Network's. Core asserting "this
   * reviewer is trusted" would be Core deciding the question Law XXXIV
   * reserves, so there is no field here in which to assert it.
   */
  readonly structure: {
    readonly mergedToPrimaryBranch?: boolean;
    readonly hasIndependentHumanReview?: boolean;
    readonly reviewerGitHubUserId?: number;
    readonly coAuthorGitHubUserIds?: readonly number[];
  };
}

/**
 * Why a decision went the way it did.
 *
 * A closed set, and that is the point. As free text, the first useful log line
 * anyone wrote would name a limit, and an internal threshold would cross into
 * this public repository through a field nobody thought of as sensitive. The
 * set is too blunt to reconstruct a rule from: `NOT_ELIGIBLE` does not say what
 * would have made it eligible.
 */
export type DecisionReason =
  | "ISSUED"
  | "NOT_ELIGIBLE"
  | "ACTOR_CANNOT_EARN"
  | "REPOSITORY_NOT_ELIGIBLE"
  | "REQUIRES_INDEPENDENT_REVIEW"
  | "ALREADY_DECIDED"
  | "UNDER_REVIEW"
  | "DECLINED";

export interface EconomicDecision {
  readonly idempotencyKey: string;
  readonly outcome: "ISSUED" | "DECLINED" | "DEFERRED";
  readonly reason: DecisionReason;
  /**
   * Kredbits as a decimal string, and only when `outcome` is `ISSUED`.
   *
   * A string because this crosses the wire as JSON and JSON numbers are
   * doubles. Money that round-trips through a double can be off by a subunit,
   * and the ledger is built on that never happening.
   */
  readonly amount?: string;
  /** Law XV: the version that decided travels with the decision. */
  readonly rulesVersion: string;
}

/** A projection Core may cache and show. Never a source, and never evidence. */
export interface OfficialPosition {
  readonly gitHubUserId: number;
  readonly balance: string;
  readonly withdrawable: string;
  readonly asOf: string;
}

/**
 * What Core may know about someone's standing on the Network.
 *
 * Coarse on purpose. There is no trust score here and there will not be one: a
 * numeric score in a public response is a gradient, and a gradient is something
 * an attacker climbs by trying things and watching it move.
 */
export interface NetworkIdentity {
  readonly gitHubUserId: number;
  readonly isKnown: boolean;
  readonly canReceiveOfficialKred: boolean;
}

/**
 * The whole of what Core may ask of the Network.
 *
 * Core holds an implementation of this interface and nothing behind it. There
 * is deliberately no method that writes an Official balance: Law XXIII puts
 * that decision on the Network, and an interface that offered the call would
 * make the boundary a convention instead of a fact.
 */
export interface KredsNetworkClient {
  submitEconomicCandidate(candidate: EconomicCandidate): Promise<EconomicDecision>;
  getOfficialPosition(gitHubUserId: number): Promise<OfficialPosition | null>;
  getNetworkIdentity(gitHubUserId: number): Promise<NetworkIdentity | null>;
}
