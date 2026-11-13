import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PollCandidate } from "@kreds/database";

import { DelegatedQueryScheduler } from "./delegated-query.scheduler.js";

const MINUTE = 60_000;
const ISAAC: PollCandidate = {
  gitHubUserId: 4242,
  scopes: ["read:user", "read:org", "repo"],
  consents: ["PUBLIC_ACTIVITY", "PRIVATE_ACTIVITY"],
};
const JOSE: PollCandidate = {
  gitHubUserId: 5555,
  scopes: ["read:user", "read:org"],
  consents: ["PUBLIC_ACTIVITY"],
};

function config(interval?: number) {
  return {
    get: (key: string) => (key === "DELEGATED_QUERY_POLL_INTERVAL_MS" ? interval : undefined),
  } as never;
}

function harness(
  options: {
    interval?: number;
    cipherConfigured?: boolean;
    due?: PollCandidate[];
    poll?: (candidate: PollCandidate) => Promise<unknown>;
  } = {},
) {
  const authorizations = {
    dueForPolling: vi.fn(async () => options.due ?? [ISAAC, JOSE]),
  };
  const query = {
    poll: vi.fn(
      options.poll ??
        (async (candidate: PollCandidate) => ({
          gitHubUserId: candidate.gitHubUserId,
          observed: 0,
          ingested: 0,
          outcome: "OK",
        })),
    ),
  };
  const scheduler = new DelegatedQueryScheduler(
    query as never,
    config(options.interval),
    options.cipherConfigured === false ? null : (authorizations as never),
  );
  return { scheduler, authorizations, query };
}

function captureWarnings() {
  return vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("an instance that has not chosen a cadence", () => {
  /**
   * Off is a legitimate state, and it must still be loud: a poller that never
   * runs looks exactly like a poller that found nothing.
   */
  it("polls nobody and says once which variable is missing", async () => {
    const warn = captureWarnings();
    const { scheduler, authorizations } = harness();

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(60 * MINUTE);

    expect(authorizations.dueForPolling).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("DELEGATED_QUERY_POLL_INTERVAL_MS");
  });

  /** No key, no stored grants, nothing to poll, and the reason named. */
  it("polls nobody when there is no key to open a grant with", async () => {
    const warn = captureWarnings();
    const { scheduler, query } = harness({ interval: MINUTE, cipherConfigured: false });

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(10 * MINUTE);

    expect(query.poll).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("TOKEN_ENCRYPTION_KEY");
  });
});

describe("a sweep", () => {
  it("polls every user with a live authorization, with what each one granted", async () => {
    const { scheduler, query } = harness({ interval: MINUTE });

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(MINUTE);

    expect(query.poll.mock.calls.map(([candidate]) => candidate)).toEqual([ISAAC, JOSE]);
    scheduler.onApplicationShutdown();
  });

  /** A slow sweep is not joined by a second one; two pollers would double every request. */
  it("never overlaps the previous sweep", async () => {
    let release: () => void = () => undefined;
    const { scheduler, authorizations } = harness({
      interval: MINUTE,
      due: [ISAAC],
      poll: () => new Promise((resolve) => (release = () => resolve({ outcome: "OK" }))),
    });

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(authorizations.dueForPolling).toHaveBeenCalledOnce();

    release();
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(authorizations.dueForPolling).toHaveBeenCalledTimes(2);
    scheduler.onApplicationShutdown();
  });

  it("carries on past a user whose poll failed", async () => {
    const warn = captureWarnings();
    const { scheduler, query } = harness({
      interval: MINUTE,
      poll: async (candidate) => {
        if (candidate.gitHubUserId === ISAAC.gitHubUserId) throw new Error("gho_leak in a message");
        return { outcome: "OK" };
      },
    });

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(MINUTE);

    expect(query.poll).toHaveBeenCalledTimes(2);
    // The failure is reported by user, never by echoing the error.
    for (const [message] of warn.mock.calls) expect(String(message)).not.toContain("gho_leak");
    scheduler.onApplicationShutdown();
  });

  /** An exhausted budget is that user's problem for this window, not everybody's. */
  it("moves on from a user whose budget is spent", async () => {
    const { scheduler, query } = harness({
      interval: MINUTE,
      poll: async (candidate) => ({
        outcome: candidate.gitHubUserId === ISAAC.gitHubUserId ? "RATE_BUDGET_EXHAUSTED" : "OK",
      }),
    });

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(MINUTE);

    expect(query.poll).toHaveBeenCalledTimes(2);
    scheduler.onApplicationShutdown();
  });

  it("stops when the application shuts down", async () => {
    const { scheduler, authorizations } = harness({ interval: MINUTE });

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(MINUTE);
    scheduler.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(10 * MINUTE);

    expect(authorizations.dueForPolling).toHaveBeenCalledOnce();
  });
});

/**
 * A token reaches what GitHub granted; Kreds reads only what the person agreed
 * to. 26 keeps public and private as two decisions, so a private grant without
 * the private consent is read as public only, and a grant without the public
 * consent is not read at all.
 */
describe("what a sweep reads is bounded by consent", () => {
  it("reads a private grant as public only without the private consent", async () => {
    const { scheduler, query } = harness({
      interval: MINUTE,
      due: [{ ...ISAAC, consents: ["PUBLIC_ACTIVITY"] }],
    });

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(MINUTE);

    expect(query.poll.mock.calls.map(([candidate]) => candidate.scopes)).toEqual([
      ["read:user", "read:org"],
    ]);
    scheduler.onApplicationShutdown();
  });

  it("reads private work for somebody who agreed to both", async () => {
    const { scheduler, query } = harness({ interval: MINUTE, due: [ISAAC] });

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(MINUTE);

    expect(query.poll.mock.calls.map(([candidate]) => candidate.scopes)).toEqual([
      ["read:user", "read:org", "repo"],
    ]);
    scheduler.onApplicationShutdown();
  });

  it("never polls a candidate without the public consent", async () => {
    const { scheduler, query } = harness({
      interval: MINUTE,
      due: [{ ...ISAAC, consents: ["PRIVATE_ACTIVITY"] }, JOSE],
    });

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(MINUTE);

    expect(query.poll.mock.calls.map(([candidate]) => candidate.gitHubUserId)).toEqual([
      JOSE.gitHubUserId,
    ]);
    scheduler.onApplicationShutdown();
  });
});
