import { describe, expect, it } from "vitest";

import { normalize } from "./normalizer.js";

const repository = { id: 77_001, full_name: "zitdevs/kreds", default_branch: "main" };
const installation = { id: 48_291_037 };

function mergedPullRequest(over: Record<string, unknown> = {}) {
  return {
    action: "closed",
    repository,
    installation,
    pull_request: {
      number: 412,
      merged: true,
      merged_at: "2026-08-22T10:00:00Z",
      closed_at: "2026-08-22T10:00:00Z",
      base: { ref: "main" },
      user: { id: 4242, login: "isaac" },
      merged_by: { id: 9001, login: "reviewer" },
      ...over,
    },
  };
}

describe("a merged pull request", () => {
  it("becomes the fact, not the payload", () => {
    const event = normalize("pull_request", mergedPullRequest());

    expect(event?.type).toBe("PULL_REQUEST_MERGED");
    expect(event).toMatchObject({
      pullRequestNumber: 412,
      authorGitHubUserId: 4242,
      mergedToPrimaryBranch: true,
      mergedByGitHubUserId: 9001,
    });
  });

  /**
   * The key identifies the merge, so pressing Redeliver in the App settings,
   * or running a backfill, lands on the same key and records nothing new.
   */
  it("keys on the merge itself, so a replay lands on the same key", () => {
    const first = normalize("pull_request", mergedPullRequest());
    const replayed = normalize("pull_request", mergedPullRequest());
    expect(first?.idempotencyKey).toBe(replayed?.idempotencyKey);
    expect(first?.idempotencyKey).toBe("PULL_REQUEST_MERGED:77001:412");
  });

  it("separates a merge from a close on the same pull request", () => {
    const merged = normalize("pull_request", mergedPullRequest());
    const closed = normalize("pull_request", mergedPullRequest({ merged: false, merged_at: null }));

    expect(closed?.type).toBe("PULL_REQUEST_CLOSED");
    expect(closed?.idempotencyKey).not.toBe(merged?.idempotencyKey);
  });

  /**
   * A merge into a side branch is not the same economic event as one into the
   * trunk, and when GitHub does not say what the trunk is, withholding is the
   * safe direction: 25 gates issuance on it.
   */
  it("does not claim the primary branch when it cannot tell", () => {
    const noDefault = normalize("pull_request", {
      ...mergedPullRequest(),
      repository: { id: 77_001, full_name: "zitdevs/kreds" },
    });
    expect(noDefault).toMatchObject({ mergedToPrimaryBranch: false });

    const sideBranch = normalize("pull_request", mergedPullRequest({ base: { ref: "develop" } }));
    expect(sideBranch).toMatchObject({ mergedToPrimaryBranch: false });
  });

  /**
   * Co-authors are not in the webhook payload; they live in commit trailers.
   * The field is present and empty so nothing downstream can read "not looked
   * up yet" as "there were none".
   */
  it("reports no co-authors rather than inventing them", () => {
    const event = normalize("pull_request", mergedPullRequest());
    expect(event).toMatchObject({ coAuthorGitHubUserIds: [] });
  });

  it("ignores a pull request that was only opened or synchronised", () => {
    expect(normalize("pull_request", { ...mergedPullRequest(), action: "opened" })).toBeNull();
    expect(normalize("pull_request", { ...mergedPullRequest(), action: "synchronize" })).toBeNull();
  });
});

describe("a review", () => {
  function review(over: Record<string, unknown> = {}, prOver: Record<string, unknown> = {}) {
    return {
      action: "submitted",
      repository,
      installation,
      review: {
        id: 55_001,
        state: "approved",
        submitted_at: "2026-08-22T09:00:00Z",
        user: { id: 9001, login: "reviewer" },
        ...over,
      },
      pull_request: {
        number: 412,
        merged_at: null,
        user: { id: 4242, login: "isaac" },
        ...prOver,
      },
    };
  }

  it("records who reviewed whose work, and in what state", () => {
    const event = normalize("pull_request_review", review());
    expect(event).toMatchObject({
      type: "REVIEW_SUBMITTED",
      reviewerGitHubUserId: 9001,
      authorGitHubUserId: 4242,
      state: "APPROVED",
      afterMerge: false,
    });
  });

  /**
   * Keyed on GitHub's review id. Keying on reviewer plus pull request would
   * collapse a reviewer's second, substantive review into their first drive-by
   * comment, and only one of the two would ever count.
   */
  it("gives a reviewer's second review its own key", () => {
    const first = normalize("pull_request_review", review({ id: 55_001 }));
    const second = normalize("pull_request_review", review({ id: 55_002 }));
    expect(first?.idempotencyKey).not.toBe(second?.idempotencyKey);
  });

  /** A03: a post-merge review does not retroactively create eligibility. */
  it("marks a review that landed after the merge", () => {
    const event = normalize(
      "pull_request_review",
      review({ submitted_at: "2026-08-22T11:00:00Z" }, { merged_at: "2026-08-22T10:00:00Z" }),
    );
    expect(event).toMatchObject({ afterMerge: true });
  });

  it("does not mark a review that landed before the merge", () => {
    const event = normalize(
      "pull_request_review",
      review({ submitted_at: "2026-08-22T09:00:00Z" }, { merged_at: "2026-08-22T10:00:00Z" }),
    );
    expect(event).toMatchObject({ afterMerge: false });
  });

  /**
   * An unrecognised state becomes the one that carries no economic weight.
   * Guessing upward would hand someone an approval they never gave.
   */
  it("reads an unknown state as a comment, never as an approval", () => {
    const event = normalize("pull_request_review", review({ state: "some_new_state" }));
    expect(event).toMatchObject({ state: "COMMENTED" });
  });

  it("ignores an edited or dismissed review event", () => {
    expect(normalize("pull_request_review", { ...review(), action: "edited" })).toBeNull();
  });
});

describe("everything else", () => {
  it("returns nothing for events Kreds does not read", () => {
    expect(normalize("push", { ref: "refs/heads/main" })).toBeNull();
    expect(normalize("issues", { action: "opened" })).toBeNull();
    expect(normalize("installation", { action: "created" })).toBeNull();
  });

  it("returns nothing rather than throwing on a payload it cannot parse", () => {
    expect(normalize("pull_request", { nonsense: true })).toBeNull();
    expect(normalize("pull_request", null)).toBeNull();
    expect(normalize("pull_request_review", { action: "submitted" })).toBeNull();
  });
});
