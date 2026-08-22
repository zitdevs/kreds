import type { EconomicEligibility, RepositoryTrustTier } from "../github/github.js";

/**
 * Layer 2 of the three-layer model.
 *
 * 25: Repository Economic Eligibility separates three questions that were once
 * one, and the separation is the anti-farming mechanism rather than an
 * accounting detail:
 *
 * ```text
 * Layer 1  Did legitimate work occur?            → Contribution Points
 * Layer 2  May this affect the economy?          → this file
 * Layer 3  How much, from where, when?           → settlement
 * ```
 *
 * > "Layer 2 asks *may this create money?* Layer 3 asks *whose money, and
 * >  when?* Collapsing them is how the original design ended up minting from
 * >  self-merges."
 *
 * Note what this file does not do. It never prices anything, and it never
 * returns an Official multiplier, because those are monetary policy and are not
 * published. It answers a question about *permission*, and the number that
 * question is worth belongs to whoever owns the economy being affected.
 */

/** The four contexts the published matrix distinguishes. */
export type RepositoryContext =
  "PERSONAL_PRIVATE" | "PERSONAL_PUBLIC" | "ORGANIZATION_PRIVATE" | "ORGANIZATION_PUBLIC";

/** The trust bands the published matrix keys on. */
export type TrustBand = "LOW" | "MEDIUM" | "HIGH" | "ELIGIBLE";

/** An outcome as the published matrix states it. */
export type MatrixOutcome = "NONE" | "REDUCED" | "PARTIAL" | "FULL" | "REDUCED_OR_NONE";

export interface MatrixRow {
  readonly context: RepositoryContext;
  readonly review: boolean;
  readonly trust: TrustBand | null;
  readonly eligibility: MatrixOutcome;
}

/**
 * Why an evaluation came out the way it did.
 *
 * A closed set, for the same reason the Network protocol's decision reasons
 * are: as free text, the first useful log line would name a threshold, and
 * thresholds here are unpublished. These say what was structurally true, never
 * how close something came.
 */
export type EligibilityReason =
  | "PERSONAL_PRIVATE_REPOSITORY"
  | "ORGANIZATION_PRIVATE_REPOSITORY"
  | "NO_ELIGIBLE_REVIEW"
  | "ELIGIBLE_REVIEW_PRESENT"
  | "REPOSITORY_TRUST_LOW"
  | "REPOSITORY_TRUST_ESTABLISHED"
  | "REPOSITORY_TRUST_HIGH"
  | "PUBLIC_VISIBILITY_ALONE_INSUFFICIENT"
  | "ACTOR_CANNOT_EARN"
  | "NO_MATCHING_RULE";

export interface EligibilityInput {
  readonly context: RepositoryContext;
  /**
   * Whether a review exists that can establish economic validation.
   *
   * Structural only. 25 lists seven requirements for an eligible reviewer and
   * three of them, minimum trust, collusion flags and organization policy,
   * belong to the Risk Engine. A caller must satisfy both halves; passing
   * `true` here means the structural half held, never that the review is
   * sufficient on its own.
   */
  readonly hasEligibleReview: boolean;
  /**
   * The repository's trust tier.
   *
   * Read, never computed. The scoring formula is explicitly not published, so
   * anything that derived a tier here would be inventing one.
   */
  readonly trustTier: RepositoryTrustTier;
  /** Law XVI: only a human's work can affect the economy. */
  readonly actorCanEarn: boolean;
  readonly isPrivate: boolean;
}

export interface EligibilityResult {
  readonly status: EconomicEligibility;
  /** The published matrix's own outcome, before it is collapsed to a status. */
  readonly outcome: MatrixOutcome;
  readonly reasons: readonly EligibilityReason[];
}

/**
 * Map a tier onto the band the matrix keys on.
 *
 * The matrix speaks in `LOW`, `MEDIUM` and `HIGH`; the tiers are named
 * `UNTRUSTED` through `HIGH_TRUST`. The correspondence is the ordering itself
 * and involves no threshold: it is a renaming, not a judgement.
 *
 * 25 scopes the ladder to public repositories, so a private one is `LOW`
 * whatever its tier says. "A private repository cannot accumulate any of them,
 * so it can never climb the tiers."
 */
export function trustBandFor(tier: RepositoryTrustTier, isPrivate: boolean): TrustBand {
  if (isPrivate) return "LOW";
  switch (tier) {
    case "HIGH_TRUST":
      return "HIGH";
    case "RELEVANT":
      return "MEDIUM";
    case "ESTABLISHED":
      return "LOW";
    case "UNTRUSTED":
      return "LOW";
  }
}

/**
 * Evaluate the published matrix.
 *
 * The matrix is passed in rather than embedded, because it is versioned policy
 * and Law XV makes versioned policy data. A row whose `trust` is `null` applies
 * at any band, which is how the private contexts are written: a private
 * repository's tier cannot matter, since it cannot climb.
 *
 * When nothing matches, the answer is `INELIGIBLE` and the reason says so.
 * Failing closed is the whole design: an ineligible merge that was wrongly
 * priced has minted money that cannot be un-minted cleanly, while an eligible
 * merge that was wrongly refused can be credited later.
 */
export function evaluateEligibility(
  input: EligibilityInput,
  matrix: readonly MatrixRow[],
): EligibilityResult {
  const reasons: EligibilityReason[] = [];

  // Law XVI comes first and is not a matrix question. A bot's merge is not a
  // low-eligibility merge, it is not a contribution to the economy at all.
  if (!input.actorCanEarn) {
    return { status: "INELIGIBLE", outcome: "NONE", reasons: ["ACTOR_CANNOT_EARN"] };
  }

  const band = trustBandFor(input.trustTier, input.isPrivate);

  if (input.context === "PERSONAL_PRIVATE") reasons.push("PERSONAL_PRIVATE_REPOSITORY");
  if (input.context === "ORGANIZATION_PRIVATE") reasons.push("ORGANIZATION_PRIVATE_REPOSITORY");
  reasons.push(input.hasEligibleReview ? "ELIGIBLE_REVIEW_PRESENT" : "NO_ELIGIBLE_REVIEW");

  if (!input.isPrivate) {
    if (band === "HIGH") reasons.push("REPOSITORY_TRUST_HIGH");
    else if (band === "MEDIUM") reasons.push("REPOSITORY_TRUST_ESTABLISHED");
    else {
      reasons.push("REPOSITORY_TRUST_LOW");
      // Law XXX: "A toggle is not evidence." Making a repository public does not
      // make its activity trustworthy, and the reason says which of the two a
      // reader is looking at.
      if (!input.hasEligibleReview) reasons.push("PUBLIC_VISIBILITY_ALONE_INSUFFICIENT");
    }
  }

  const row = matrix.find(
    (candidate) =>
      candidate.context === input.context &&
      candidate.review === input.hasEligibleReview &&
      (candidate.trust === null || candidate.trust === band || candidate.trust === "ELIGIBLE"),
  );

  if (!row) {
    return { status: "INELIGIBLE", outcome: "NONE", reasons: [...reasons, "NO_MATCHING_RULE"] };
  }

  return { status: statusFor(row.eligibility), outcome: row.eligibility, reasons };
}

/**
 * Collapse a matrix outcome onto the three states the rest of Kreds speaks.
 *
 * `REDUCED_OR_NONE` becomes `REDUCED` rather than `INELIGIBLE`, and that is the
 * one judgement here worth defending. The matrix leaves the row genuinely
 * open, and which of the two applies depends on the multiplier, which is
 * unpublished. Reporting `REDUCED` keeps the ambiguity visible and hands the
 * decision to whoever owns the multiplier; reporting `INELIGIBLE` would resolve
 * it silently, in this repository, against the contributor.
 *
 * A local economy that wants the stricter reading sets its own multiplier for
 * this outcome to zero, which is exactly the lever it should be.
 */
function statusFor(outcome: MatrixOutcome): EconomicEligibility {
  switch (outcome) {
    case "FULL":
      return "ELIGIBLE";
    case "NONE":
      return "INELIGIBLE";
    case "REDUCED":
    case "PARTIAL":
    case "REDUCED_OR_NONE":
      return "REDUCED";
  }
}
