import { describe, expect, it } from "vitest";

import { fromKred, type Kredbits } from "./money.js";
import { ZERO_POINTS, awardPoints, invalidatePoints, points, type Points } from "./points.js";

/**
 * Law XXVI, Contribution Is Not Currency.
 *
 * "They cannot be transferred, spent, exchanged, or used as KRED, and they have
 *  no fixed or implied conversion rate into KRED in either direction."
 *
 * The enforcement here is nominal typing, not a runtime guard. A conversion is
 * not something this package refuses to do; it is something the compiler will
 * not let anyone write.
 */
describe("points and KRED do not convert, in either direction", () => {
  it("does not accept points where an amount of KRED is expected", () => {
    const earned = points(30);
    // @ts-expect-error Law XXVI: points are not currency and never convert to it
    const asMoney: Kredbits = earned;
    expect(asMoney).toBeDefined();
  });

  it("does not accept KRED where points are expected", () => {
    const balance = fromKred(30);
    // @ts-expect-error Law XXVI: the prohibition runs in both directions
    const asPoints: Points = balance;
    expect(asPoints).toBeDefined();
  });

  it("exposes no transfer, spend or exchange operation at all", async () => {
    const module = await import("./points.js");
    const forbidden = Object.keys(module).filter((name) =>
      /transfer|spend|exchange|convert|redeem|toKred|fromKred/i.test(name),
    );
    expect(forbidden).toEqual([]);
  });
});

describe("points are whole, non-negative counts", () => {
  it("accepts a whole count", () => {
    expect(points(8942)).toBe(8942);
    expect(ZERO_POINTS).toBe(points(0));
  });

  it("refuses a fractional count", () => {
    expect(() => points(11.5)).toThrow(/whole/i);
  });

  it("refuses a negative count", () => {
    expect(() => points(-1)).toThrow(/negative/i);
  });
});

/**
 * Law XXVII, Contribution Does Not Decrease.
 *
 * "Contribution Points are cumulative historical recognition and do not
 *  decrease through spending, debt, or normal economic activity."
 */
describe("points accumulate and are never reduced by economic activity", () => {
  it("adds awarded points to the running total", () => {
    expect(awardPoints(points(8420), points(30))).toBe(points(8450));
  });

  it("offers no operation that spending or debt could call", async () => {
    const module = await import("./points.js");
    // Reduction exists only behind an explicit invalidation reason.
    expect(Object.keys(module)).toContain("invalidatePoints");
    expect(Object.keys(module)).not.toContain("deductPoints");
  });
});

/**
 * 24: Contribution Points, But they are not immune to invalidation.
 *
 * "Points are immune to economic events. They are not immune to the underlying
 *  contribution being invalidated."
 */
describe("points are adjustable only when the contribution itself is invalidated", () => {
  it("reduces the total for a reverted contribution", () => {
    expect(invalidatePoints(points(8450), points(30), "CONTRIBUTION_REVERTED")).toBe(points(8420));
  });

  it("removes points for an actor reclassified as a bot", () => {
    expect(invalidatePoints(points(30), points(30), "ACTOR_RECLASSIFIED")).toBe(ZERO_POINTS);
  });

  it("never drives a score below zero", () => {
    expect(() => invalidatePoints(points(10), points(30), "CONFIRMED_FRAUD")).toThrow(/negative/i);
  });

  it("requires a stated reason, so no caller can reduce a score incidentally", () => {
    // The guarantee is nominal, not defensive: the call below does not fail at
    // runtime, it fails to compile. `tsc` proves that by resolving this
    // directive; the arity check keeps the test meaningful on its own.
    // @ts-expect-error an invalidation without a reason is not expressible
    const withoutReason = () => invalidatePoints(points(30), points(30));
    expect(withoutReason).not.toThrow();
    expect(invalidatePoints).toHaveLength(3);
  });
});
