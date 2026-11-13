import { describe, expect, it } from "vitest";

import type { PullRequestMerged, ReviewSubmitted } from "@kreds/domain";

import { economicCandidateFor, type RepositoryFacts } from "./economic-candidate.js";

const MERGED_AT = Date.parse("2026-08-22T10:00:00.000Z");

const merge = {
  type: "PULL_REQUEST_MERGED",
  idempotencyKey: "PULL_REQUEST_MERGED:77001:412",
  occurredAt: MERGED_AT,
  repositoryId: "77001",
  gitHubInstallationId: 48_291_037,
  pullRequestNumber: 412,
  authorGitHubUserId: 4242,
  authorActorType: "HUMAN",
  authorLogin: "isaac",
  coAuthorGitHubUserIds: [5151],
  mergedToPrimaryBranch: true,
  mergedByGitHubUserId: 9001,
  signals: { changedLines: 120, hasDescription: true, linksIssue: true },
} as unknown as PullRequestMerged;

const review = {
  type: "REVIEW_SUBMITTED",
  idempotencyKey: "REVIEW_SUBMITTED:880001",
  occurredAt: MERGED_AT,
  repositoryId: "77001",
  gitHubInstallationId: null,
  pullRequestNumber: 412,
  reviewerGitHubUserId: 6262,
  reviewerActorType: "BOT",
  reviewerLogin: "helper[bot]",
  authorGitHubUserId: 4242,
  state: "APPROVED",
  afterMerge: false,
  signals: { hasBody: true },
} as unknown as ReviewSubmitted;

const organizationRepository: RepositoryFacts = {
  gitHubRepositoryId: 77_001,
  isPrivate: false,
  isPersonallyOwned: false,
  gitHubOrganizationId: 9_001,
};

describe("a merge, as evidence for the Network", () => {
  it("carries the fact's own key, the author, the repository and the structure", () => {
    expect(
      economicCandidateFor(merge, organizationRepository, { hasIndependentHumanReview: true }),
    ).toEqual({
      idempotencyKey: "PULL_REQUEST_MERGED:77001:412",
      kind: "PULL_REQUEST_MERGED",
      occurredAt: "2026-08-22T10:00:00.000Z",
      actor: { gitHubUserId: 4242, actorType: "HUMAN" },
      repository: { gitHubRepositoryId: 77_001, isPrivate: false, isPersonallyOwned: false },
      organization: { gitHubOrganizationId: 9_001 },
      structure: {
        mergedToPrimaryBranch: true,
        hasIndependentHumanReview: true,
        coAuthorGitHubUserIds: [5151],
      },
    });
  });

  /** 02: a personal repository forms no Team, so it names no organization. */
  it("names no organization for a personal repository", () => {
    const candidate = economicCandidateFor(
      merge,
      { ...organizationRepository, isPersonallyOwned: true, gitHubOrganizationId: null },
      { hasIndependentHumanReview: false },
    );

    expect(candidate).not.toHaveProperty("organization");
    expect(candidate.repository.isPersonallyOwned).toBe(true);
  });

  /**
   * Core cannot price work (Law XXIII, 19: "Never trust frontend clients to
   * calculate rewards"). The value Core actually builds carries nothing that
   * could be read as one.
   */
  it("carries no amount, score, multiplier or quality signal", () => {
    const serialised = JSON.stringify(
      economicCandidateFor(merge, organizationRepository, { hasIndependentHumanReview: true }),
    );

    expect(serialised).not.toMatch(/"amount"|"score"|"kredbits"|"multiplier"|"weight"/i);
    expect(serialised).not.toMatch(/changedLines|hasDescription|linksIssue|signals/);
  });
});

describe("a review, as evidence for the Network", () => {
  /**
   * The reviewer is the actor, classified as Core observed it. Law XVI is the
   * Network's to apply: a bot's review is still evidence of what happened, and
   * Core does not decide that it earns nothing by leaving it out.
   */
  it("names the reviewer as the actor, whatever GitHub classified them as", () => {
    expect(economicCandidateFor(review, organizationRepository)).toEqual({
      idempotencyKey: "REVIEW_SUBMITTED:880001",
      kind: "REVIEW_SUBMITTED",
      occurredAt: "2026-08-22T10:00:00.000Z",
      actor: { gitHubUserId: 6262, actorType: "BOT" },
      repository: { gitHubRepositoryId: 77_001, isPrivate: false, isPersonallyOwned: false },
      organization: { gitHubOrganizationId: 9_001 },
      structure: { reviewerGitHubUserId: 6262 },
    });
  });
});
