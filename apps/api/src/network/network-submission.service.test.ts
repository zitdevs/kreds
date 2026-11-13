import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PullRequestMerged, ReviewSubmitted } from "@kreds/domain";
import {
  NetworkUnavailableError,
  type EconomicCandidate,
  type EconomicDecision,
  type KredsNetworkClient,
} from "@kreds/network-client";

import type { NetworkConnection } from "./network-connection.js";
import { NetworkSubmissionService } from "./network-submission.service.js";

const KEY = "PULL_REQUEST_MERGED:77001:412";

const merge = {
  type: "PULL_REQUEST_MERGED",
  idempotencyKey: KEY,
  occurredAt: Date.parse("2026-08-22T10:00:00.000Z"),
  repositoryId: "77001",
  gitHubInstallationId: 48_291_037,
  pullRequestNumber: 412,
  authorGitHubUserId: 4242,
  authorActorType: "HUMAN",
  authorLogin: "isaac",
  coAuthorGitHubUserIds: [],
  mergedToPrimaryBranch: true,
  mergedByGitHubUserId: 9001,
  signals: { changedLines: 12, hasDescription: true, linksIssue: false },
} as unknown as PullRequestMerged;

const review = {
  type: "REVIEW_SUBMITTED",
  idempotencyKey: "REVIEW_SUBMITTED:880001",
  occurredAt: Date.parse("2026-08-22T09:00:00.000Z"),
  repositoryId: "77001",
  gitHubInstallationId: 48_291_037,
  pullRequestNumber: 412,
  reviewerGitHubUserId: 6262,
  reviewerActorType: "HUMAN",
  reviewerLogin: "rev",
  authorGitHubUserId: 4242,
  state: "APPROVED",
  afterMerge: false,
  signals: { hasBody: true },
} as unknown as ReviewSubmitted;

/**
 * What the Network answers today for essentially everything: it has no actor
 * facts and examines no reviews yet, so it defers (A06: "Failing to examine is
 * not the same finding as finding little").
 */
const UNDER_REVIEW: EconomicDecision = {
  idempotencyKey: KEY,
  outcome: "DEFERRED",
  reason: "UNDER_REVIEW",
  rulesVersion: "v0.8",
};

function harness(
  options: {
    connected?: boolean;
    submit?: (candidate: EconomicCandidate) => Promise<EconomicDecision>;
    repository?: Record<string, unknown> | null;
    isNew?: boolean;
  } = {},
) {
  const client = {
    submitEconomicCandidate: vi.fn(
      options.submit ??
        (async (candidate: EconomicCandidate) => ({
          ...UNDER_REVIEW,
          idempotencyKey: candidate.idempotencyKey,
        })),
    ),
  };
  const connection: NetworkConnection = {
    client: client as unknown as KredsNetworkClient,
    connected: options.connected ?? true,
  };
  const submissions = {
    record: vi.fn(async () => ({ isNew: options.isNew ?? true })),
    recordDecision: vi.fn(async () => ({ appended: true })),
    recordUnanswered: vi.fn(async () => undefined),
  };
  const installations = {
    findRepository: vi.fn(async () =>
      options.repository === undefined
        ? {
            id: "repo-uuid",
            gitHubRepositoryId: 77_001,
            organizationId: "org-uuid",
            isPrivate: false,
            isPersonallyOwned: false,
          }
        : options.repository,
    ),
    findGitHubOrganizationId: vi.fn(async () => 9_001),
  };
  const eligibility = { hasEligibleReview: vi.fn(async () => true) };
  const service = new NetworkSubmissionService(
    connection,
    submissions as never,
    installations as never,
    eligibility as never,
  );
  return { service, client, submissions, installations, eligibility };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, "debug").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("offering a recorded fact to the Network", () => {
  it("records the candidate, submits it, and keeps the decision as returned", async () => {
    const { service, client, submissions } = harness();

    await expect(service.offer(merge)).resolves.toBe("RECORDED");
    await service.settled();

    expect(submissions.record).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: KEY, kind: "PULL_REQUEST_MERGED" }),
    );
    const [submitted] = client.submitEconomicCandidate.mock.calls[0] as [EconomicCandidate];
    expect(submitted).toMatchObject({
      idempotencyKey: KEY,
      organization: { gitHubOrganizationId: 9_001 },
      structure: { hasIndependentHumanReview: true },
    });
    // Law XV: the rules version that decided travels with the decision.
    expect(submissions.recordDecision).toHaveBeenCalledWith(
      KEY,
      { outcome: "DEFERRED", reason: "UNDER_REVIEW", rulesVersion: "v0.8" },
      expect.any(Date),
    );
  });

  it("offers a review as well, with the reviewer as the actor", async () => {
    const { service, client } = harness();

    await service.offer(review);
    await service.settled();

    const [submitted] = client.submitEconomicCandidate.mock.calls[0] as [EconomicCandidate];
    expect(submitted).toMatchObject({ kind: "REVIEW_SUBMITTED", actor: { gitHubUserId: 6262 } });
  });

  /**
   * The ingestion path offers on every delivery. A fact already on file is
   * the sweep's to retry, so a redelivery never becomes a second request.
   */
  it("submits a candidate only the first time it is recorded", async () => {
    const { service, client } = harness({ isNew: false });

    await expect(service.offer(merge)).resolves.toBe("ALREADY_RECORDED");
    await service.settled();

    expect(client.submitEconomicCandidate).not.toHaveBeenCalled();
  });
});

describe("the Network not answering never reaches ingestion", () => {
  it("leaves the candidate unsubmitted when the Network is down", async () => {
    const { service, submissions } = harness({
      submit: async () => {
        throw new NetworkUnavailableError("The Kreds Network answered 503.");
      },
    });

    await expect(service.offer(merge)).resolves.toBe("RECORDED");
    await service.settled();

    expect(submissions.recordDecision).not.toHaveBeenCalled();
    expect(submissions.recordUnanswered).toHaveBeenCalledWith(KEY, expect.any(Date));
  });

  /**
   * Not blocking is as important as not failing: a webhook held open on a slow
   * Network is a GitHub timeout, and a redelivery storm after it.
   */
  it("returns before the Network answers", async () => {
    const { service } = harness({ submit: () => new Promise(() => undefined) });

    await expect(service.offer(merge)).resolves.toBe("RECORDED");
  });

  it("never rejects, even when recording fails", async () => {
    const { service, submissions } = harness();
    submissions.record.mockRejectedValueOnce(new Error("connection reset"));

    await expect(service.offer(merge)).resolves.toBe("FAILED");
  });
});

describe("what Core does not offer", () => {
  /**
   * Law XII: an instance with no Network runs exactly as it did before Core
   * could submit. Nothing is recorded, so nothing ingested while offline is
   * later offered as though it had been waiting.
   */
  it("records and submits nothing when the Network is not configured", async () => {
    const { service, submissions, client } = harness({ connected: false });

    await expect(service.offer(merge)).resolves.toBe("OFFLINE");
    await service.settled();

    expect(submissions.record).not.toHaveBeenCalled();
    expect(client.submitEconomicCandidate).not.toHaveBeenCalled();
  });

  /**
   * Law XXIX: "Activity in a private repository, personal or organizational,
   * creates no Official KRED, with or without review." There is nothing for the
   * Network to decide, so the existence of private work does not leave Core.
   */
  it("does not send private work to the Network", async () => {
    const { service, submissions, client } = harness({
      repository: {
        id: "repo-uuid",
        gitHubRepositoryId: 77_001,
        organizationId: null,
        isPrivate: true,
        isPersonallyOwned: true,
      },
    });

    await expect(service.offer(merge)).resolves.toBe("PRIVATE");
    expect(submissions.record).not.toHaveBeenCalled();
    expect(client.submitEconomicCandidate).not.toHaveBeenCalled();
  });

  /** Core cannot describe a repository it has no record of, and does not guess. */
  it("does not invent facts about a repository it has no record of", async () => {
    const { service, submissions } = harness({ repository: null });

    await expect(service.offer(merge)).resolves.toBe("UNKNOWN_REPOSITORY");
    expect(submissions.record).not.toHaveBeenCalled();
  });
});

describe("only an answer that is the Network's answer is recorded", () => {
  it("submits the stored candidate and records what came back", async () => {
    const { service, submissions } = harness();
    const stored = { idempotencyKey: KEY, candidate: { idempotencyKey: KEY } };

    await expect(service.submit(stored)).resolves.toBe("DECIDED");
    expect(submissions.recordDecision).toHaveBeenCalledOnce();
  });

  /**
   * A decision for some other candidate, or one outside the closed set of
   * reasons, is not an answer to this question. Filing it would be Core
   * inventing what the Network said.
   */
  it("refuses a decision for another candidate or outside the protocol", async () => {
    for (const decision of [
      { ...UNDER_REVIEW, idempotencyKey: "something-else" },
      { ...UNDER_REVIEW, reason: "BELOW_THE_LIMIT" },
      { ...UNDER_REVIEW, outcome: "MAYBE" },
      { ...UNDER_REVIEW, rulesVersion: "" },
    ]) {
      const { service, submissions } = harness({
        submit: async () => decision as EconomicDecision,
      });

      await expect(
        service.submit({ idempotencyKey: KEY, candidate: { idempotencyKey: KEY } }),
      ).resolves.toBe("UNANSWERED");
      expect(submissions.recordDecision).not.toHaveBeenCalled();
      expect(submissions.recordUnanswered).toHaveBeenCalledOnce();
    }
  });

  /** The offline client's `local` decline is not a Network decision. */
  it("asks nothing and files nothing when not connected", async () => {
    const { service, submissions } = harness({ connected: false });
    // Even asked directly, an unconnected instance has no Network to ask.
    await expect(
      service.submit({ idempotencyKey: KEY, candidate: { idempotencyKey: KEY } }),
    ).resolves.toBe("OFFLINE");
    expect(submissions.recordDecision).not.toHaveBeenCalled();
  });

  it("logs which candidate went unanswered, and nothing it was sent with", async () => {
    const { service } = harness({
      submit: async () => {
        throw new NetworkUnavailableError("The Kreds Network is unreachable: Bearer abc");
      },
    });

    await service.submit({ idempotencyKey: KEY, candidate: { idempotencyKey: KEY } });

    const [message] = warn.mock.calls[0] as [string];
    expect(message).toContain(KEY);
    expect(message).not.toContain("Bearer");
  });
});
