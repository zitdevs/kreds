import { describe, expect, it } from "vitest";

import {
  evaluateEligibility,
  trustBandFor,
  type EligibilityInput,
  type MatrixRow,
} from "./eligibility.js";

/** The published matrix, v0.4. */
const MATRIX: readonly MatrixRow[] = [
  { context: "PERSONAL_PRIVATE", review: false, trust: null, eligibility: "NONE" },
  { context: "PERSONAL_PRIVATE", review: true, trust: null, eligibility: "REDUCED" },
  { context: "PERSONAL_PUBLIC", review: false, trust: "LOW", eligibility: "NONE" },
  { context: "PERSONAL_PUBLIC", review: true, trust: "LOW", eligibility: "REDUCED" },
  { context: "PERSONAL_PUBLIC", review: false, trust: "MEDIUM", eligibility: "PARTIAL" },
  { context: "PERSONAL_PUBLIC", review: false, trust: "HIGH", eligibility: "FULL" },
  { context: "ORGANIZATION_PRIVATE", review: false, trust: null, eligibility: "NONE" },
  { context: "ORGANIZATION_PRIVATE", review: true, trust: null, eligibility: "FULL" },
  { context: "ORGANIZATION_PUBLIC", review: false, trust: "LOW", eligibility: "REDUCED_OR_NONE" },
  { context: "ORGANIZATION_PUBLIC", review: false, trust: "HIGH", eligibility: "FULL" },
  { context: "ORGANIZATION_PUBLIC", review: true, trust: "ELIGIBLE", eligibility: "FULL" },
];

const input = (over: Partial<EligibilityInput> = {}): EligibilityInput => ({
  context: "ORGANIZATION_PUBLIC",
  hasEligibleReview: true,
  trustTier: "UNTRUSTED",
  actorCanEarn: true,
  isPrivate: false,
  ...over,
});

const evaluate = (over: Partial<EligibilityInput> = {}) => evaluateEligibility(input(over), MATRIX);

describe("the farm this layer exists to close", () => {
  /**
   * Amendment A02's opening example:
   *
   *   Create repo → open PR → merge own PR → earn KRED → repeat
   *
   * 25: "The work is recognised. It just does not create currency, because
   * there is no independent evidence that it happened as described."
   */
  it("refuses a self-merged personal private repository", () => {
    const result = evaluate({
      context: "PERSONAL_PRIVATE",
      isPrivate: true,
      hasEligibleReview: false,
    });

    expect(result.status).toBe("INELIGIBLE");
    expect(result.reasons).toEqual(
      expect.arrayContaining(["PERSONAL_PRIVATE_REPOSITORY", "NO_ELIGIBLE_REVIEW"]),
    );
  });

  /** Law XXXII: an independent human is evidence, and it earns a reduced multiplier. */
  it("allows the same repository at reduced once a real review exists", () => {
    const result = evaluate({
      context: "PERSONAL_PRIVATE",
      isPrivate: true,
      hasEligibleReview: true,
    });

    expect(result.status).toBe("REDUCED");
    expect(result.outcome).toBe("REDUCED");
  });

  /**
   * Law XXX: "Public visibility alone is not sufficient." Anyone can create a
   * public repository in ten seconds, and the reason names that specifically so
   * the two low-trust cases are distinguishable.
   */
  it("refuses a brand new public repository with no review", () => {
    const result = evaluate({
      context: "PERSONAL_PUBLIC",
      hasEligibleReview: false,
      trustTier: "UNTRUSTED",
    });

    expect(result.status).toBe("INELIGIBLE");
    expect(result.reasons).toContain("PUBLIC_VISIBILITY_ALONE_INSUFFICIENT");
  });

  /** Law XVI. A bot's merge is not low eligibility, it is outside the economy. */
  it("refuses a bot before consulting the matrix at all", () => {
    const result = evaluate({ actorCanEarn: false, trustTier: "HIGH_TRUST" });

    expect(result.status).toBe("INELIGIBLE");
    expect(result.reasons).toEqual(["ACTOR_CANNOT_EARN"]);
  });
});

describe("what a repository's own history can establish", () => {
  /**
   * Law XXXIII: "a solo maintainer of a widely used library is a completely
   * legitimate participant, and many of their PRs will never receive a formal
   * GitHub approval because there is nobody else to give one."
   */
  it("lets a high trust public repository earn fully without a review", () => {
    const result = evaluate({
      context: "PERSONAL_PUBLIC",
      hasEligibleReview: false,
      trustTier: "HIGH_TRUST",
    });

    expect(result.status).toBe("ELIGIBLE");
    expect(result.outcome).toBe("FULL");
  });

  it("gives a mid trust public repository partial eligibility without a review", () => {
    const result = evaluate({
      context: "PERSONAL_PUBLIC",
      hasEligibleReview: false,
      trustTier: "RELEVANT",
    });

    expect(result.status).toBe("REDUCED");
    expect(result.outcome).toBe("PARTIAL");
  });

  it("makes a reviewed private organization merge fully eligible", () => {
    const result = evaluate({
      context: "ORGANIZATION_PRIVATE",
      isPrivate: true,
      hasEligibleReview: true,
    });

    expect(result.status).toBe("ELIGIBLE");
  });

  /** 25: "Kreds cannot safely treat self-directed private repository activity as
   * sufficient proof... the organization may be a single person with three
   * accounts." */
  it("refuses an unreviewed private organization merge", () => {
    const result = evaluate({
      context: "ORGANIZATION_PRIVATE",
      isPrivate: true,
      hasEligibleReview: false,
    });

    expect(result.status).toBe("INELIGIBLE");
  });
});

describe("trust bands", () => {
  /**
   * 25's interpretation decision: "A private repository cannot accumulate any
   * of them, so it can never climb the tiers." A tier stored against a private
   * repository must not be readable as trust.
   */
  it("reads a private repository as low trust whatever its tier says", () => {
    expect(trustBandFor("HIGH_TRUST", true)).toBe("LOW");
    expect(trustBandFor("RELEVANT", true)).toBe("LOW");
  });

  it("maps the public tiers onto the bands the matrix speaks", () => {
    expect(trustBandFor("HIGH_TRUST", false)).toBe("HIGH");
    expect(trustBandFor("RELEVANT", false)).toBe("MEDIUM");
    expect(trustBandFor("ESTABLISHED", false)).toBe("LOW");
    expect(trustBandFor("UNTRUSTED", false)).toBe("LOW");
  });

  /**
   * The dangerous case, stated as its own test: a private repository carrying a
   * high tier must never reach full eligibility on the strength of it.
   */
  it("does not let a stored tier launder a private repository", () => {
    const result = evaluate({
      context: "ORGANIZATION_PRIVATE",
      isPrivate: true,
      hasEligibleReview: false,
      trustTier: "HIGH_TRUST",
    });

    expect(result.status).toBe("INELIGIBLE");
  });
});

describe("failing closed", () => {
  /**
   * An ineligible merge that was wrongly priced has minted money that cannot be
   * un-minted cleanly. An eligible merge wrongly refused can be credited later.
   * The asymmetry has an obvious correct default.
   */
  it("refuses when no rule matches, rather than guessing", () => {
    const result = evaluateEligibility(input(), []);

    expect(result.status).toBe("INELIGIBLE");
    expect(result.reasons).toContain("NO_MATCHING_RULE");
  });

  /**
   * The matrix leaves this row genuinely open, and which half applies depends
   * on a multiplier that is unpublished. Reporting REDUCED keeps the ambiguity
   * visible and hands it to whoever owns the multiplier; reporting INELIGIBLE
   * would resolve it silently, here, against the contributor.
   */
  it("reports REDUCED_OR_NONE as reduced, and keeps the outcome visible", () => {
    const result = evaluate({
      context: "ORGANIZATION_PUBLIC",
      hasEligibleReview: false,
      trustTier: "UNTRUSTED",
    });

    expect(result.status).toBe("REDUCED");
    expect(result.outcome).toBe("REDUCED_OR_NONE");
  });

  /** The reasons must never carry a number: thresholds here are unpublished. */
  it("gives reasons that name no threshold", () => {
    for (const over of [
      { context: "PERSONAL_PRIVATE" as const, isPrivate: true },
      { trustTier: "HIGH_TRUST" as const },
      { actorCanEarn: false },
      { hasEligibleReview: false },
    ]) {
      for (const reason of evaluate(over).reasons) {
        expect(reason).toMatch(/^[A-Z_]+$/);
        expect(reason).not.toMatch(/\d/);
      }
    }
  });
});
