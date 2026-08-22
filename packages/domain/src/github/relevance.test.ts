import { describe, expect, it } from "vitest";

import {
  RELEVANCE_SIGNALS,
  relevanceOf,
  SUGGESTED_REFERENCES,
  type RelevanceSignals,
} from "./relevance.js";
import * as relevanceModule from "./relevance.js";

const nothing: RelevanceSignals = {
  stars: 0,
  forks: 0,
  ageDays: 0,
  contributors: 0,
  externalContributors: 0,
  mergedPullRequests: 0,
  issueActivity: 0,
  releases: 0,
  commits: 0,
};

const established: RelevanceSignals = {
  stars: 800,
  forks: 150,
  ageDays: 1200,
  contributors: 30,
  externalContributors: 15,
  mergedPullRequests: 900,
  issueActivity: 400,
  releases: 40,
  commits: 5000,
};

describe("Law XXXI, made structural", () => {
  /**
   * The law:
   *
   * > "GitHub stars may influence repository trust, but no single popularity
   * >  metric defines economic legitimacy."
   *
   * And 25: "Stars must never be the only trust signal." A repository with a
   * hundred thousand purchased stars and nothing else must score in single
   * digits, whatever the references are tuned to.
   */
  it("refuses to be impressed by stars alone", () => {
    const bought = relevanceOf({ ...nothing, stars: 100_000 });

    expect(bought.score).toBeLessThan(15);
    expect(bought.breadth).toBe(1);
    expect(bought.singleSignalDominant).toBe(true);
  });

  /** The same holds for any one signal, not only the one the law names. */
  it.each(RELEVANCE_SIGNALS)("refuses to be impressed by %s alone", (signal) => {
    const inflated = relevanceOf({ ...nothing, [signal]: 1_000_000 });
    expect(inflated.score).toBeLessThan(15);
  });

  /**
   * The cap is derived from the law rather than chosen: a repository showing
   * `k` of `n` signals cannot score above `k / n` of the maximum.
   */
  it("caps the score by how many kinds of evidence exist", () => {
    const three = relevanceOf({
      ...nothing,
      stars: 100_000,
      forks: 100_000,
      commits: 100_000,
    });

    expect(three.breadth).toBe(3);
    // Three of nine signals, so a third of the maximum at most.
    expect(three.score).toBeLessThanOrEqual(Math.ceil((3 / 9) * 100));
  });

  it("rewards breadth over size", () => {
    const oneEnormous = relevanceOf({ ...nothing, stars: 1_000_000 });
    const manyModest = relevanceOf({
      stars: 50,
      forks: 10,
      ageDays: 200,
      contributors: 4,
      externalContributors: 2,
      mergedPullRequests: 60,
      issueActivity: 30,
      releases: 3,
      commits: 300,
    });

    expect(manyModest.score).toBeGreaterThan(oneEnormous.score);
  });

  /** "There is no single number to buy." */
  it("cannot be pushed to the top by any amount of one signal", () => {
    for (const signal of RELEVANCE_SIGNALS) {
      for (const value of [1e3, 1e6, 1e9, Number.MAX_SAFE_INTEGER]) {
        expect(relevanceOf({ ...nothing, [signal]: value }).score).toBeLessThan(15);
      }
    }
  });
});

describe("what the score says", () => {
  it("is zero for a repository with no history at all", () => {
    expect(relevanceOf(nothing).score).toBe(0);
    expect(relevanceOf(nothing).breadth).toBe(0);
    expect(relevanceOf(nothing).singleSignalDominant).toBe(false);
  });

  it("recognises a broadly established project", () => {
    const result = relevanceOf(established);
    expect(result.score).toBe(100);
    expect(result.breadth).toBe(9);
    expect(result.singleSignalDominant).toBe(false);
  });

  it("saturates, so a very large number is worth no more than a large one", () => {
    const large = relevanceOf({ ...established, stars: SUGGESTED_REFERENCES.stars });
    const enormous = relevanceOf({ ...established, stars: 10_000_000 });
    expect(enormous.score).toBe(large.score);
  });

  it("stays inside its range for nonsense input", () => {
    const odd = relevanceOf({ ...nothing, stars: -5, commits: Number.MAX_SAFE_INTEGER });
    expect(odd.score).toBeGreaterThanOrEqual(0);
    expect(odd.score).toBeLessThanOrEqual(100);
  });

  it("reports every signal, present or not, so a reader can see the gaps", () => {
    expect(relevanceOf(nothing).signals).toHaveLength(RELEVANCE_SIGNALS.length);
  });

  it("lets an instance supply its own scale", () => {
    const strict = relevanceOf(established, { ...SUGGESTED_REFERENCES, stars: 100_000 });
    expect(strict.score).toBeLessThan(relevanceOf(established).score);
  });
});

describe("relevance is not trust", () => {
  /**
   * The safeguard, and the reason this file exists separately at all. Relevance
   * is computed from signals anybody can read off a GitHub page with weights
   * that are open source. The scoring that gates Official issuance is
   * unpublished and belongs to the Risk Engine.
   *
   * A conversion that does not exist cannot be called by a future feature in a
   * hurry, which is the same protection the points module relies on.
   */
  it("exports no way to turn relevance into an eligibility tier", () => {
    for (const name of Object.keys(relevanceModule)) {
      expect(name).not.toMatch(/tier|trust|eligib|multiplier/i);
    }
  });

  it("returns nothing that is a trust tier", () => {
    const serialised = JSON.stringify(relevanceOf(established));
    for (const tier of ["UNTRUSTED", "ESTABLISHED", "RELEVANT", "HIGH_TRUST"]) {
      expect(serialised).not.toContain(tier);
    }
  });
});
