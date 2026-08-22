import { describe, expect, it } from "vitest";

import { buildIdempotencyKey, EVENT_STATUSES, type EventStatus } from "./domain-event.js";

describe("the key identifies the fact, not the delivery", () => {
  /**
   * The whole reason this function exists. GitHub retries a failed delivery
   * with the same delivery id, which a unique column catches, but a human
   * pressing Redeliver in the App settings produces a *new* delivery id for the
   * same event, and so does a backfill. Keying on the delivery would let either
   * pay someone twice.
   */
  it("derives the same key from the same fact, twice", () => {
    const once = buildIdempotencyKey("PULL_REQUEST_MERGED", 77_001, 412);
    const again = buildIdempotencyKey("PULL_REQUEST_MERGED", 77_001, 412);
    expect(once).toBe(again);
    expect(once).toBe("PULL_REQUEST_MERGED:77001:412");
  });

  it("gives different facts different keys", () => {
    expect(buildIdempotencyKey("PULL_REQUEST_MERGED", 77_001, 412)).not.toBe(
      buildIdempotencyKey("PULL_REQUEST_MERGED", 77_001, 413),
    );
    expect(buildIdempotencyKey("PULL_REQUEST_MERGED", 77_001, 412)).not.toBe(
      buildIdempotencyKey("PULL_REQUEST_CLOSED", 77_001, 412),
    );
  });

  /**
   * The collision that would be invisible. Without the separator check,
   * ("1", "23") and ("12", "3") both render as `1:23`, two unrelated events
   * deduplicate into one, and one of two people never gets paid.
   */
  it("refuses a part containing the separator, rather than colliding", () => {
    expect(() => buildIdempotencyKey("PULL_REQUEST_MERGED", "1:23")).toThrow(RangeError);
    expect(buildIdempotencyKey("PULL_REQUEST_MERGED", 1, 23)).not.toBe(
      buildIdempotencyKey("PULL_REQUEST_MERGED", 12, 3),
    );
  });

  it("refuses an empty part, which would silently shorten the key", () => {
    expect(() => buildIdempotencyKey("REVIEW_SUBMITTED", "")).toThrow(RangeError);
  });

  /**
   * No clock, no randomness. A key built during a backfill next year has to
   * match the one built when the webhook first arrived, or the backfill pays
   * everybody a second time.
   */
  it("is a pure function of its inputs", () => {
    const keys = new Set(
      Array.from({ length: 50 }, () => buildIdempotencyKey("REVIEW_SUBMITTED", 77_001, 412, 9)),
    );
    expect(keys.size).toBe(1);
  });
});

describe("event statuses", () => {
  /**
   * `IGNORED` is kept apart from `FAILED` deliberately. Most of what GitHub
   * sends is something Kreds does not read; recording that as a failure would
   * make the failure count permanently meaningless, which is the same as not
   * having one.
   */
  it("distinguishes ignoring something from failing at it", () => {
    expect(EVENT_STATUSES).toContain("IGNORED");
    expect(EVENT_STATUSES).toContain("FAILED");
  });

  it("lists every status exactly once", () => {
    expect(new Set(EVENT_STATUSES).size).toBe(EVENT_STATUSES.length);
    expect(EVENT_STATUSES).toHaveLength(6);
  });

  /**
   * The runtime list and the type must not drift: the database enum is
   * generated from this array, so a status in the type but not the array is a
   * value the column would reject at insert time.
   */
  it("covers the type completely", () => {
    const _exhaustive: readonly EventStatus[] = EVENT_STATUSES;
    type Missing = Exclude<EventStatus, (typeof EVENT_STATUSES)[number]>;
    const _noneMissing: Missing extends never ? true : Missing = true;
    expect(_exhaustive.length).toBe(6);
    expect(_noneMissing).toBe(true);
  });
});
