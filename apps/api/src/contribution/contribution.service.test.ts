import { CURRENT_RULES_VERSION } from "@kreds/policy";
import { describe, expect, it, vi } from "vitest";

import { NO_UNOBSERVED_ALLOWANCE, unobservedCaps, type UnobservedCaps } from "@kreds/domain";

import { ContributionService } from "./contribution.service.js";

/**
 * @param caps the unobserved allowance. Defaults to none, which is what an
 * unconfigured instance has and therefore the shape most worth testing.
 * @param reviews what the event store will report for the pull request. An
 * empty list is a merge nobody independent looked at.
 */
function harness(
  caps: UnobservedCaps = NO_UNOBSERVED_ALLOWANCE,
  reviews: unknown[] = [],
  alreadyUnobserved = 0,
) {
  const ledger = {
    award: vi.fn(async () => ({ id: "entry-1", idempotencyKey: "k", isNew: true })),
    unobservedPointsSince: vi.fn(async () => alreadyUnobserved),
  };
  const identities = {
    observe: vi.fn(async () => ({})),
    classify: vi.fn(async () => true),
  };
  const installations = {
    findRepository: vi.fn(async () => ({ id: "repo-uuid", organizationId: "org-uuid" })),
  };
  const events = { findReviewsFor: vi.fn(async () => reviews) };
  const service = new ContributionService(
    ledger as never,
    identities as never,
    installations as never,
    events as never,
    caps,
  );
  return { service, ledger, identities, installations, events };
}

/**
 * A review by a distinct human, which is what makes a merge observed under 24's
 * standard: "a distinct, eligible, human identity that is not a controlled
 * alternate account."
 */
const independentReview = {
  type: "REVIEW_SUBMITTED",
  reviewerGitHubUserId: 9001,
  reviewerActorType: "HUMAN",
  afterMerge: false,
  state: "APPROVED",
};

/** Enough allowance for the tests that exercise the bound rather than the wall. */
const someAllowance = unobservedCaps({ perUserPerDay: 60, perUserPerMonth: 400 });

const merge = (over: Record<string, unknown> = {}) =>
  ({
    type: "PULL_REQUEST_MERGED",
    idempotencyKey: "PULL_REQUEST_MERGED:77001:412",
    occurredAt: 1_787_392_800_000,
    repositoryId: "77001",
    gitHubInstallationId: 48_291_037,
    pullRequestNumber: 412,
    authorGitHubUserId: 4242,
    authorActorType: "HUMAN",
    authorLogin: "isaac",
    coAuthorGitHubUserIds: [],
    mergedToPrimaryBranch: true,
    mergedByGitHubUserId: 9001,
    signals: { changedLines: 120, hasDescription: true, linksIssue: true },
    ...over,
  }) as never;

const review = (over: Record<string, unknown> = {}) =>
  ({
    type: "REVIEW_SUBMITTED",
    idempotencyKey: "REVIEW_SUBMITTED:55001",
    occurredAt: 1_787_392_800_000,
    repositoryId: "77001",
    gitHubInstallationId: 48_291_037,
    pullRequestNumber: 412,
    reviewerGitHubUserId: 9001,
    reviewerActorType: "HUMAN",
    reviewerLogin: "jose",
    authorGitHubUserId: 4242,
    state: "APPROVED",
    afterMerge: false,
    signals: { hasBody: true },
    ...over,
  }) as never;

describe("recognition is not payment", () => {
  /**
   * The structural guarantee. Law XXVI keeps points and KRED independent, and
   * the way it is kept is by this service having no way to reach money at all.
   */
  it("exposes no method that touches KRED", () => {
    for (const name of Object.getOwnPropertyNames(ContributionService.prototype)) {
      expect(name).not.toMatch(/kred|balance|ledgerEntry|transfer|settle|pay/i);
    }
  });

  it("records points and a quality score for a merge", async () => {
    // Observed, because an independent human reviewed it. The unobserved path
    // is a different case and has its own tests below.
    const { service, ledger } = harness(NO_UNOBSERVED_ALLOWANCE, [independentReview]);
    const result = await service.recognise(merge());

    expect(result.recognised).toBe(true);
    const [award] = ledger.award.mock.calls[0] as unknown as [
      { points: number; qualityScore: number; rulesVersion: string; kind: string },
    ];
    expect(award.kind).toBe("PULL_REQUEST_MERGED");
    expect(award.points).toBeGreaterThan(0);
    // Law XV: the version that decided travels with the decision.
    // From the policy rather than a literal. A hard-coded version made this go
    // red on the A04 bump for the wrong reason: it was asserting the number,
    // not that the service records whatever version actually decided.
    expect(award.rulesVersion).toBe(CURRENT_RULES_VERSION);
  });

  /**
   * The gap has to be legible. A low score has two very different causes, thin
   * work or a permission Kreds never asked for, and without this they are
   * indistinguishable a month later.
   */
  it("records which signals it could not observe", async () => {
    const { service, ledger } = harness();
    await service.recognise(merge());

    const [award] = ledger.award.mock.calls[0] as unknown as [{ unobservedSignals: string[] }];
    expect(award.unobservedSignals).toEqual(
      expect.arrayContaining(["checksPassed", "noUnresolvedThreads", "requiredApprovals"]),
    );
  });
});

describe("who may earn", () => {
  /** Law XVI, Bots Are Not Developers. */
  it("recognises nothing for a bot", async () => {
    const { service, ledger } = harness();
    const result = await service.recognise(merge({ authorActorType: "BOT" }));

    expect(result).toMatchObject({ recognised: false, reason: "ACTOR_CANNOT_EARN" });
    expect(ledger.award).not.toHaveBeenCalled();
  });

  /**
   * 03: "`UNKNOWN` should fail closed toward restriction, not toward reward."
   * Crediting a bot cannot be cleanly undone; crediting a human late can.
   */
  it("recognises nothing for an unclassified actor", async () => {
    const { service, ledger } = harness();
    const result = await service.recognise(merge({ authorActorType: "UNKNOWN" }));

    expect(result).toMatchObject({ recognised: false, reason: "ACTOR_CANNOT_EARN" });
    expect(ledger.award).not.toHaveBeenCalled();
  });

  /**
   * Knowing an account is a bot is worth storing even though it earns nothing:
   * it stops the next event asking again, and it is what a later
   * reclassification updates.
   */
  it("still records the identity of an actor that cannot earn", async () => {
    const { service, identities } = harness();
    await service.recognise(merge({ authorActorType: "BOT" }));

    expect(identities.observe).toHaveBeenCalledOnce();
    expect(identities.classify).toHaveBeenCalledWith(4242, "BOT");
  });

  it("does not write a classification it does not have", async () => {
    const { service, identities } = harness();
    await service.recognise(merge({ authorActorType: "UNKNOWN" }));

    expect(identities.observe).toHaveBeenCalledOnce();
    expect(identities.classify).not.toHaveBeenCalled();
  });
});

describe("reviews", () => {
  it("recognises an independent human review", async () => {
    const { service, ledger } = harness();
    const result = await service.recognise(review());

    expect(result.recognised).toBe(true);
    const [award] = ledger.award.mock.calls[0] as unknown as [{ kind: string }];
    expect(award.kind).toBe("CODE_REVIEW");
  });

  /** A03: "A post-merge review does not retroactively create eligibility." */
  it("recognises nothing for a review that landed after the merge", async () => {
    const { service, ledger } = harness();
    const result = await service.recognise(review({ afterMerge: true }));

    expect(result).toMatchObject({ recognised: false, reason: "REVIEW_AFTER_MERGE" });
    expect(ledger.award).not.toHaveBeenCalled();
  });

  /** Reviewing your own work is not review. Law XXXIV is the general form. */
  it("recognises nothing for a self review", async () => {
    const { service, ledger } = harness();
    const result = await service.recognise(review({ reviewerGitHubUserId: 4242 }));

    expect(result).toMatchObject({ recognised: false, reason: "SELF_REVIEW" });
    expect(ledger.award).not.toHaveBeenCalled();
  });

  it("credits a review that took a position over one that did not", async () => {
    const { service, ledger } = harness();
    await service.recognise(review({ state: "APPROVED" }));
    await service.recognise(review({ state: "COMMENTED", idempotencyKey: "REVIEW_SUBMITTED:2" }));

    const calls = ledger.award.mock.calls as unknown as [{ points: number }][];
    expect(calls[0]?.[0].points).toBeGreaterThan(calls[1]?.[0].points as number);
  });
});

describe("quality changes what is earned", () => {
  it("awards more for a pull request that did the work to be reviewable", async () => {
    const { service, ledger } = harness(NO_UNOBSERVED_ALLOWANCE, [independentReview]);
    await service.recognise(merge());
    await service.recognise(
      merge({
        idempotencyKey: "PULL_REQUEST_MERGED:77001:413",
        signals: { changedLines: 5000, hasDescription: false, linksIssue: false },
      }),
    );

    const calls = ledger.award.mock.calls as unknown as [{ points: number }][];
    expect(calls[0]?.[0].points).toBeGreaterThan(calls[1]?.[0].points as number);
  });

  /**
   * 03: "the floor is +5 K, not 0. A weak-but-merged PR still shipped." The
   * points layer keeps the same shape: a thin contribution is still a
   * contribution.
   */
  it("still recognises a weak but merged pull request", async () => {
    const { service, ledger } = harness(NO_UNOBSERVED_ALLOWANCE, [independentReview]);
    await service.recognise(
      merge({ signals: { changedLines: 9000, hasDescription: false, linksIssue: false } }),
    );

    const [award] = ledger.award.mock.calls[0] as unknown as [{ points: number }];
    expect(award.points).toBeGreaterThan(0);
  });

  it("ignores an event that is not a contribution", async () => {
    const { service, ledger } = harness();
    const result = await service.recognise({ type: "PULL_REQUEST_CLOSED" } as never);

    expect(result).toMatchObject({ recognised: false, reason: "NOT_A_CONTRIBUTION" });
    expect(ledger.award).not.toHaveBeenCalled();
  });
});

/**
 * Amendment A04, chapter 24. This is the half that was built and not wired: the
 * domain has had `capUnobserved` since A04 landed, and nothing on the path that
 * awards points ever called it, so the running system awarded without a bound.
 */
describe("Contribution Points where nobody independent was watching", () => {
  /**
   * > "An observer, for this purpose, is held to the same standard as a
   * > validating reviewer: a distinct, eligible, human identity that is not a
   * > controlled alternate account."
   */
  it("treats a merge an independent human reviewed as observed", async () => {
    const { service, ledger } = harness(someAllowance, [independentReview]);
    await service.recognise(merge());

    const [award] = ledger.award.mock.calls[0] as unknown as [{ observed: boolean }];
    expect(award.observed).toBe(true);
  });

  it("treats a merge nobody reviewed as unobserved", async () => {
    const { service, ledger } = harness(someAllowance, []);
    await service.recognise(merge());

    const [award] = ledger.award.mock.calls[0] as unknown as [{ observed: boolean }];
    expect(award.observed).toBe(false);
  });

  /**
   * > "Adding your own second account as a collaborator does not lift the cap;
   * > if it did, the cap would cost one API call to bypass."
   *
   * The structural half of that: a review by the author is not observation, and
   * neither is one by a co-author or a bot.
   */
  it("does not accept a self-review, a co-author or a bot as an observer", async () => {
    const author = { ...independentReview, reviewerGitHubUserId: 4242 };
    const bot = { ...independentReview, reviewerActorType: "BOT" };
    const afterTheFact = { ...independentReview, afterMerge: true };
    const dismissed = { ...independentReview, state: "DISMISSED" };

    for (const review of [author, bot, afterTheFact, dismissed]) {
      const { service, ledger } = harness(someAllowance, [review]);
      await service.recognise(merge());
      const [award] = ledger.award.mock.calls[0] as unknown as [{ observed: boolean }];
      expect(award.observed, JSON.stringify(review)).toBe(false);
    }
  });

  /** "Not refused: solo work in a private repository is real work." */
  it("still awards unobserved work while the allowance holds", async () => {
    const { service, ledger } = harness(someAllowance, []);
    await service.recognise(merge());

    const [award] = ledger.award.mock.calls[0] as unknown as [{ points: number }];
    expect(award.points).toBeGreaterThan(0);
  });

  /** And stops once it is spent, which is the whole point of the cap. */
  it("stops awarding once the day's allowance is gone", async () => {
    const { service, ledger } = harness(someAllowance, [], 60);
    await service.recognise(merge());

    const [award] = ledger.award.mock.calls[0] as unknown as [{ points: number }];
    expect(award.points).toBe(0);
  });

  /**
   * The consequence of an unconfigured instance, stated as a test rather than
   * left to be discovered: with no allowance, unobserved work is recorded and
   * awarded nothing. Law XIX, applied to a missing setting.
   */
  it("awards nothing unobserved when no allowance is configured", async () => {
    const { service, ledger } = harness(NO_UNOBSERVED_ALLOWANCE, []);
    await service.recognise(merge());

    const [award] = ledger.award.mock.calls[0] as unknown as [
      { points: number; observed: boolean },
    ];
    expect(award.points).toBe(0);
    expect(award.observed).toBe(false);
  });

  /**
   * A review is observation by construction: two distinct identities, already
   * checked. A reviewer's own recognition is never bounded by this cap.
   */
  it("never bounds a reviewer's own points", async () => {
    const { service, ledger } = harness(NO_UNOBSERVED_ALLOWANCE, []);
    await service.recognise({
      type: "REVIEW_SUBMITTED",
      idempotencyKey: "REVIEW_SUBMITTED:5150",
      occurredAt: 1_787_392_800_000,
      repositoryId: "77001",
      pullRequestNumber: 412,
      reviewerGitHubUserId: 9001,
      reviewerLogin: "jose",
      reviewerActorType: "HUMAN",
      authorGitHubUserId: 4242,
      afterMerge: false,
      state: "APPROVED",
      signals: { hasBody: true },
    } as never);

    const [award] = ledger.award.mock.calls[0] as unknown as [
      { points: number; observed: boolean },
    ];
    expect(award.observed).toBe(true);
    expect(award.points).toBeGreaterThan(0);
  });

  /**
   * Measured from when the work happened rather than from now, so a backfill
   * cannot spend an allowance belonging to a different day. Delegated query
   * makes backfill ordinary, which is why this matters at all.
   */
  it("counts the allowance against the day the work happened", async () => {
    const { service, ledger } = harness(someAllowance, []);
    await service.recognise(merge({ occurredAt: Date.parse("2026-03-14T15:00:00Z") }));

    const [, since] = ledger.unobservedPointsSince.mock.calls[0] as unknown as [number, Date];
    expect(since.toISOString()).toBe("2026-03-14T00:00:00.000Z");
  });
});
