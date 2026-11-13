import { describe, expect, it } from "vitest";

import { points } from "../primitives/points.js";
import {
  capUnobserved,
  NOBODY_OBSERVED,
  OBSERVED_BY_REPOSITORY_HISTORY,
  unobservedCaps,
  wasObserved,
} from "./observation.js";

/**
 * kreds-laws v0.7, chapter 24: "The repository's public history is the
 * independent observer." No person is involved, so it is its own value rather
 * than a person with every field faked.
 */
describe("a repository's public history as the observer", () => {
  it("counts as observed", () => {
    expect(wasObserved(OBSERVED_BY_REPOSITORY_HISTORY)).toBe(true);
  });

  it("names no person", () => {
    expect(OBSERVED_BY_REPOSITORY_HISTORY.observerGitHubUserId).toBeNull();
  });

  it("lifts the cap even when the allowance is spent", () => {
    const caps = unobservedCaps({ perUserPerDay: 1, perUserPerMonth: 1 });
    const spent = { today: points(1), thisMonth: points(1) };

    expect(capUnobserved(points(40), OBSERVED_BY_REPOSITORY_HISTORY, spent, caps).awarded).toBe(40);
    expect(capUnobserved(points(40), NOBODY_OBSERVED, spent, caps).awarded).toBe(0);
  });
});
