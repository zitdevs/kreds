import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DueSubmission } from "@kreds/database";

import { NetworkRetryScheduler } from "./network-retry.scheduler.js";

const MINUTE = 60_000;
const FIRST: DueSubmission = { idempotencyKey: "PULL_REQUEST_MERGED:77001:1", candidate: {} };
const SECOND: DueSubmission = { idempotencyKey: "PULL_REQUEST_MERGED:77001:2", candidate: {} };

function harness(
  options: {
    interval?: number;
    connected?: boolean;
    due?: DueSubmission[];
    submit?: (due: DueSubmission) => Promise<unknown>;
  } = {},
) {
  const submissions = { dueForSubmission: vi.fn(async () => options.due ?? [FIRST, SECOND]) };
  const network = { submit: vi.fn(options.submit ?? (async () => "DECIDED")) };
  const config = {
    get: (key: string) =>
      key === "KREDS_NETWORK_RETRY_INTERVAL_MS" ? options.interval : undefined,
  } as never;
  const scheduler = new NetworkRetryScheduler(
    network as never,
    submissions as never,
    { connected: options.connected ?? true } as never,
    config,
  );
  return { scheduler, submissions, network };
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
  /** Off is legitimate and still announced: an idle retry looks like an empty one. */
  it("retries nothing and says once which variable is missing", async () => {
    const warn = captureWarnings();
    const { scheduler, submissions } = harness();

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(60 * MINUTE);

    expect(submissions.dueForSubmission).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("KREDS_NETWORK_RETRY_INTERVAL_MS");
  });

  /**
   * No Network, nothing recorded and nothing to retry. The connection already
   * said so once at startup; a second warning about the same fact is noise.
   */
  it("stays silent and idle when there is no Network at all", async () => {
    const warn = captureWarnings();
    const { scheduler, submissions } = harness({ interval: MINUTE, connected: false });

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(10 * MINUTE);

    expect(submissions.dueForSubmission).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("a sweep", () => {
  it("resubmits every candidate that is still open", async () => {
    const { scheduler, network, submissions } = harness({ interval: MINUTE });

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(MINUTE);

    expect(submissions.dueForSubmission).toHaveBeenCalledOnce();
    expect(network.submit.mock.calls.map(([due]) => due)).toEqual([FIRST, SECOND]);
    scheduler.onApplicationShutdown();
  });

  /** Two sweeps at once would ask the Network the same question twice. */
  it("never overlaps the previous sweep", async () => {
    let release: () => void = () => undefined;
    const { scheduler, submissions } = harness({
      interval: MINUTE,
      due: [FIRST],
      submit: () => new Promise((resolve) => (release = () => resolve("DECIDED"))),
    });

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(submissions.dueForSubmission).toHaveBeenCalledOnce();

    release();
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(submissions.dueForSubmission).toHaveBeenCalledTimes(2);
    scheduler.onApplicationShutdown();
  });

  it("carries on past a candidate that could not be filed", async () => {
    captureWarnings();
    const { scheduler, network } = harness({
      interval: MINUTE,
      submit: async (due) => {
        if (due === FIRST) throw new Error("connection reset");
        return "DECIDED";
      },
    });

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(MINUTE);

    expect(network.submit).toHaveBeenCalledTimes(2);
    scheduler.onApplicationShutdown();
  });

  it("survives not being able to read what is due", async () => {
    const warn = captureWarnings();
    const { scheduler, submissions } = harness({ interval: MINUTE });
    submissions.dueForSubmission.mockRejectedValueOnce(new Error("database down"));

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(2 * MINUTE);

    expect(warn).toHaveBeenCalled();
    expect(submissions.dueForSubmission).toHaveBeenCalledTimes(2);
    scheduler.onApplicationShutdown();
  });

  it("stops when the application shuts down", async () => {
    const { scheduler, submissions } = harness({ interval: MINUTE });

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(MINUTE);
    scheduler.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(10 * MINUTE);

    expect(submissions.dueForSubmission).toHaveBeenCalledOnce();
  });
});
