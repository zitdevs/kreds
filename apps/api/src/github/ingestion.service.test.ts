import { describe, expect, it, vi } from "vitest";

import { IngestionService } from "./ingestion.service.js";

const PR_MERGED = {
  action: "closed",
  installation: { id: 48_291_037 },
  repository: { id: 77_001, full_name: "zitdevs/kreds", default_branch: "main" },
  pull_request: {
    number: 412,
    merged: true,
    merged_at: "2026-08-22T10:00:00Z",
    closed_at: "2026-08-22T10:00:00Z",
    base: { ref: "main" },
    user: { id: 4242, login: "isaac" },
    merged_by: { id: 9001, login: "rev" },
  },
};

function harness(over: Partial<Record<string, unknown>> = {}) {
  const events = {
    record: vi.fn(async () => ({
      id: "raw-1",
      gitHubDeliveryId: "d-1",
      eventType: "pull_request",
      status: "RECEIVED" as const,
      isRedelivery: false,
    })),
    recordDomainEvent: vi.fn(async () => ({
      id: "fact-1",
      idempotencyKey: "PULL_REQUEST_MERGED:77001:412",
      isNew: true,
    })),
    markProcessed: vi.fn(async () => undefined),
    markIgnored: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
    ...over,
  };
  const installations = { findRepository: vi.fn(async () => ({ id: "repo-uuid" })) };
  const installationEvents = { handle: vi.fn(async () => "IGNORED" as const) };
  const contributions = { recognise: vi.fn(async () => ({ recognised: true })) };
  const eligibility = {
    forMerge: vi.fn(async () => ({ status: "INELIGIBLE", outcome: "NONE", reasons: [] })),
  };
  const service = new IngestionService(
    events as never,
    installations as never,
    installationEvents as never,
    contributions as never,
    eligibility as never,
  );
  return { service, events, installations, installationEvents, contributions, eligibility };
}

const delivery = { deliveryId: "d-1", eventType: "pull_request", payload: PR_MERGED };

describe("the pipeline stores before it understands", () => {
  /**
   * If normalisation ran first, a bug in it would lose the payload and the only
   * record of what happened would be a stack trace. Storing first means a
   * delivery can be replayed against a fixed normaliser.
   */
  it("records the raw delivery even when normalisation finds nothing", async () => {
    const { service, events } = harness();
    await service.ingest({ deliveryId: "d-2", eventType: "push", payload: { ref: "main" } });

    expect(events.record).toHaveBeenCalledOnce();
    expect(events.markIgnored).toHaveBeenCalledWith("raw-1");
  });

  it("records the fact when there is one", async () => {
    const { service, events } = harness();
    const result = await service.ingest(delivery);

    expect(result.outcome).toBe("PROCESSED");
    expect(result.idempotencyKey).toBe("PULL_REQUEST_MERGED:77001:412");
    expect(events.markProcessed).toHaveBeenCalledWith("raw-1");
  });

  /**
   * The repair path. A fact recorded before the recognition engine existed, or
   * while it was deploying, is scored when the delivery is replayed. The gate
   * this replaces would have made that permanently impossible: the fact was no
   * longer new, so recognition was skipped forever, and work that happened
   * stayed unrecognised because of when it happened.
   *
   * Paying twice is prevented on the ledger, which is keyed on the same
   * idempotency key, rather than here.
   */
  it("still recognises a fact that was already on file, so a replay repairs it", async () => {
    const { service, contributions } = harness({
      recordDomainEvent: vi.fn(async () => ({
        id: "fact-1",
        idempotencyKey: "PULL_REQUEST_MERGED:77001:412",
        isNew: false,
      })),
    });

    const result = await service.ingest(delivery);

    expect(result.outcome).toBe("DUPLICATE");
    expect(contributions.recognise).toHaveBeenCalledOnce();
  });

  it("reports a fact already on file as a duplicate", async () => {
    const { service } = harness({
      recordDomainEvent: vi.fn(async () => ({
        id: "fact-1",
        idempotencyKey: "PULL_REQUEST_MERGED:77001:412",
        isNew: false,
      })),
    });

    await expect(service.ingest(delivery)).resolves.toMatchObject({ outcome: "DUPLICATE" });
  });
});

describe("a failed delivery stays recoverable", () => {
  /**
   * The subtle one. GitHub retries a failure with the *same* delivery id, so if
   * every repeat were treated as a duplicate, a delivery that failed once could
   * never succeed: the retry that exists to fix it would be the thing that
   * skipped it. Only a delivery that reached a terminal state is finished.
   */
  it("reprocesses a redelivery whose first attempt failed", async () => {
    const { service, events } = harness({
      record: vi.fn(async () => ({
        id: "raw-1",
        gitHubDeliveryId: "d-1",
        eventType: "pull_request",
        status: "FAILED" as const,
        isRedelivery: true,
      })),
    });

    const result = await service.ingest(delivery);

    expect(result.outcome).toBe("PROCESSED");
    expect(events.recordDomainEvent).toHaveBeenCalledOnce();
  });

  it("reprocesses one a crash left mid-flight", async () => {
    const { service, events } = harness({
      record: vi.fn(async () => ({
        id: "raw-1",
        gitHubDeliveryId: "d-1",
        eventType: "pull_request",
        status: "PROCESSING" as const,
        isRedelivery: true,
      })),
    });

    await service.ingest(delivery);
    expect(events.recordDomainEvent).toHaveBeenCalledOnce();
  });

  it.each(["PROCESSED", "IGNORED"] as const)(
    "does no work for a redelivery already %s",
    async (status) => {
      const { service, events } = harness({
        record: vi.fn(async () => ({
          id: "raw-1",
          gitHubDeliveryId: "d-1",
          eventType: "pull_request",
          status,
          isRedelivery: true,
        })),
      });

      const result = await service.ingest(delivery);

      expect(result.outcome).toBe("DUPLICATE");
      expect(events.recordDomainEvent).not.toHaveBeenCalled();
    },
  );

  /**
   * A failure has to be recorded on the row, not just thrown, or the delivery
   * sits in RECEIVED forever and nothing can tell it apart from one that has
   * not been tried yet.
   */
  it("marks the delivery failed and says so, rather than throwing", async () => {
    const { service, events } = harness({
      recordDomainEvent: vi.fn(async () => {
        throw new Error("the database went away");
      }),
    });

    const result = await service.ingest(delivery);

    expect(result.outcome).toBe("FAILED");
    expect(events.markFailed).toHaveBeenCalledWith("raw-1", "the database went away");
  });
});
