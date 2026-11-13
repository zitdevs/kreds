import { CURRENT_RULES_VERSION } from "@kreds/policy";
import { describe, expect, it, vi } from "vitest";

import { EligibilityService } from "./eligibility.service.js";

function harness(
  repository: Record<string, unknown> | null = {
    id: "repo-uuid",
    isPrivate: false,
    isPersonallyOwned: false,
    trustTier: "UNTRUSTED",
  },
  reviews: readonly unknown[] = [],
) {
  const events = { findReviewsFor: vi.fn(async () => reviews) };
  const installations = { findRepository: vi.fn(async () => repository) };
  const service = new EligibilityService(events as never, installations as never);
  return { service, events, installations };
}

const merge = (over: Record<string, unknown> = {}) =>
  ({
    type: "PULL_REQUEST_MERGED",
    idempotencyKey: "PULL_REQUEST_MERGED:77001:412",
    occurredAt: 1_787_392_800_000,
    repositoryId: "77001",
    pullRequestNumber: 412,
    authorGitHubUserId: 4242,
    authorActorType: "HUMAN",
    authorLogin: "isaac",
    coAuthorGitHubUserIds: [],
    ...over,
  }) as never;

const review = (over: Record<string, unknown> = {}) => ({
  type: "REVIEW_SUBMITTED",
  reviewerGitHubUserId: 9001,
  reviewerActorType: "HUMAN",
  afterMerge: false,
  state: "APPROVED",
  ...over,
});

describe("Core may say locally eligible, and no more", () => {
  /**
   * The boundary, stated as a test. The published policy withholds the
   * multipliers, so Core has no number to give, and the field is null rather
   * than absent so that nobody reads its absence as an invitation to compute
   * one.
   */
  it("never supplies a multiplier", async () => {
    const { service } = harness();
    const result = await service.forMerge(merge());
    expect(result.multiplier).toBeNull();
  });

  it("records the version that decided", async () => {
    const { service } = harness();
    // From the policy rather than a literal. A hard-coded version made this go
    // red on the A04 bump for the wrong reason: it was asserting the number,
    // not that the service records whatever version actually decided.
    expect((await service.forMerge(merge())).rulesVersion).toBe(CURRENT_RULES_VERSION);
  });

  /** Law XV again: the reasons must carry no threshold. */
  it("gives reasons that name no number", async () => {
    const { service } = harness();
    for (const reason of (await service.forMerge(merge())).reasons) {
      expect(reason).not.toMatch(/\d/);
    }
  });
});

describe("placing a repository in its context", () => {
  it("reads a private personal repository as the strictest context", async () => {
    const { service } = harness({
      id: "r",
      isPrivate: true,
      isPersonallyOwned: true,
      trustTier: "UNTRUSTED",
    });

    const result = await service.forMerge(merge());
    expect(result.status).toBe("INELIGIBLE");
    expect(result.reasons).toContain("PERSONAL_PRIVATE_REPOSITORY");
  });

  /**
   * Law XXIX, as amended by A05: "Activity in a private repository, personal or
   * organizational, creates no Official KRED, with or without review." Review
   * is endorsement, not verification.
   */
  it("gives a reviewed private merge nothing, personal or organization", async () => {
    for (const isPersonallyOwned of [true, false]) {
      const { service } = harness(
        { id: "r", isPrivate: true, isPersonallyOwned, trustTier: "HIGH_TRUST" },
        [review()],
      );
      expect((await service.forMerge(merge())).status, String(isPersonallyOwned)).toBe(
        "INELIGIBLE",
      );
    }
  });

  /**
   * A repository Kreds has no record of cannot be placed in any context, and
   * guessing one would be guessing the answer.
   */
  it("fails closed for a repository it has never recorded", async () => {
    const { service } = harness(null);
    const result = await service.forMerge(merge());

    expect(result.status).toBe("INELIGIBLE");
    expect(result.reasons).toContain("NO_MATCHING_RULE");
  });
});

/**
 * Which reviews validate a merge (Law XXXII), tested where the review is the
 * only variable: a public repository too new to stand on its own history. No
 * review leaves it with nothing; one valid review gives it reduced eligibility.
 *
 * Previously tested in a private repository. Since A05 a private merge is
 * ineligible with or without review, so every "rejects" case there would pass
 * for the wrong reason, the repository's privacy rather than the review.
 */
const newPublicProject = {
  id: "r",
  isPrivate: false,
  isPersonallyOwned: true,
  trustTier: "UNTRUSTED",
};

describe("what counts as an eligible review", () => {
  it("leaves a new public project with nothing when nobody reviewed", async () => {
    const { service } = harness(newPublicProject, []);
    expect((await service.forMerge(merge())).status).toBe("INELIGIBLE");
  });

  it("accepts an independent human review that took a position", async () => {
    const { service } = harness(newPublicProject, [review()]);
    expect((await service.forMerge(merge())).status).toBe("REDUCED");
  });

  /** Law XXXIV: alternate accounts cannot legitimize self-directed work. */
  it("rejects the author reviewing their own pull request", async () => {
    const { service } = harness(newPublicProject, [review({ reviewerGitHubUserId: 4242 })]);
    expect((await service.forMerge(merge())).status).toBe("INELIGIBLE");
  });

  it("rejects a co-author reviewing the work they co-wrote", async () => {
    const { service } = harness(newPublicProject, [review({ reviewerGitHubUserId: 9001 })]);
    const result = await service.forMerge(merge({ coAuthorGitHubUserIds: [9001] }));
    expect(result.status).toBe("INELIGIBLE");
  });

  /** A03: "A post-merge review does not retroactively create eligibility." */
  it("rejects a review that landed after the merge", async () => {
    const { service } = harness(newPublicProject, [review({ afterMerge: true })]);
    expect((await service.forMerge(merge())).status).toBe("INELIGIBLE");
  });

  it("rejects a bot's review as validation", async () => {
    const { service } = harness(newPublicProject, [review({ reviewerActorType: "BOT" })]);
    expect((await service.forMerge(merge())).status).toBe("INELIGIBLE");
  });

  it("rejects a dismissed review, which took no position", async () => {
    const { service } = harness(newPublicProject, [review({ state: "DISMISSED" })]);
    expect((await service.forMerge(merge())).status).toBe("INELIGIBLE");
  });

  it("accepts one valid review among several invalid ones", async () => {
    const { service } = harness(newPublicProject, [
      review({ reviewerGitHubUserId: 4242 }),
      review({ afterMerge: true }),
      review(),
    ]);
    expect((await service.forMerge(merge())).status).toBe("REDUCED");
  });
});

describe("the two layers do not conflict", () => {
  /**
   * Phase 5's own done-when: a valid contribution can be worth points and worth
   * nothing economically at the same time. 25's core rule:
   *
   * > "Work can earn reputation without earning currency."
   *
   * This is the eligibility half of that sentence. The points half is awarded
   * independently, by a service this one cannot reach.
   */
  it("refuses a self-merged private repository that still earned points", async () => {
    const { service } = harness({
      id: "r",
      isPrivate: true,
      isPersonallyOwned: true,
      trustTier: "UNTRUSTED",
    });

    const result = await service.forMerge(merge());
    expect(result.status).toBe("INELIGIBLE");
    // Nothing here can even see, let alone change, what was recognised.
    expect(Object.keys(result)).not.toContain("points");
  });
});
