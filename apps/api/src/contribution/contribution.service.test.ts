import { describe, expect, it, vi } from "vitest";

import { ContributionService } from "./contribution.service.js";

function harness() {
  const ledger = {
    award: vi.fn(async () => ({ id: "entry-1", idempotencyKey: "k", isNew: true })),
  };
  const identities = {
    observe: vi.fn(async () => ({})),
    classify: vi.fn(async () => true),
  };
  const installations = {
    findRepository: vi.fn(async () => ({ id: "repo-uuid", organizationId: "org-uuid" })),
  };
  const service = new ContributionService(
    ledger as never,
    identities as never,
    installations as never,
  );
  return { service, ledger, identities, installations };
}

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
    const { service, ledger } = harness();
    const result = await service.recognise(merge());

    expect(result.recognised).toBe(true);
    const [award] = ledger.award.mock.calls[0] as unknown as [
      { points: number; qualityScore: number; rulesVersion: string; kind: string },
    ];
    expect(award.kind).toBe("PULL_REQUEST_MERGED");
    expect(award.points).toBeGreaterThan(0);
    // Law XV: the version that decided travels with the decision.
    expect(award.rulesVersion).toBe("v0.4");
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
    const { service, ledger } = harness();
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
    const { service, ledger } = harness();
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
