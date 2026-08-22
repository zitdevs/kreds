import { describe, expect, it } from "vitest";

import { isHealthySize, pointsFor, score, UNOBSERVED, type SizeBands } from "./quality.js";

/** The published weights for a merged pull request, v0.4. */
const PR_WEIGHTS = {
  checksPassed: 30,
  meaningfulDescription: 20,
  requiredApprovals: 15,
  noUnresolvedThreads: 15,
  linkedIssue: 10,
  healthySize: 10,
};

const BANDS: SizeBands = {
  smallMaxLines: 50,
  idealMaxLines: 300,
  acceptableMaxLines: 600,
  reducedMaxLines: 1000,
  noBonusAboveLines: 1000,
};

describe("the quality score", () => {
  it("is the sum of the weights of the signals that were met", () => {
    const result = score(
      { checksPassed: true, meaningfulDescription: true, linkedIssue: true },
      PR_WEIGHTS,
    );
    expect(result.score).toBe(60);
    expect(result.met).toEqual(["checksPassed", "meaningfulDescription", "linkedIssue"]);
  });

  it("is zero when nothing was met", () => {
    const all = Object.fromEntries(Object.keys(PR_WEIGHTS).map((k) => [k, false]));
    expect(score(all, PR_WEIGHTS).score).toBe(0);
  });

  it("reaches 100 when everything was met", () => {
    const all = Object.fromEntries(Object.keys(PR_WEIGHTS).map((k) => [k, true]));
    expect(score(all, PR_WEIGHTS).score).toBe(100);
  });

  /**
   * The direction that matters. Kreds cannot see check runs today, and the
   * tempting alternatives are both wrong: assuming the signal was met invents
   * evidence, and normalising over only the observed weights would hand a small
   * pull request with no CI a perfect score.
   */
  it("scores an unobserved signal as not met, never as met", () => {
    const result = score({ checksPassed: UNOBSERVED, meaningfulDescription: true }, PR_WEIGHTS);
    expect(result.score).toBe(20);
    expect(result.met).toEqual(["meaningfulDescription"]);
    expect(result.unobserved).toContain("checksPassed");
  });

  it("treats a signal that was never supplied as unobserved", () => {
    const result = score({ meaningfulDescription: true }, PR_WEIGHTS);
    expect(result.score).toBe(20);
    expect(result.unobserved).toEqual(
      expect.arrayContaining(["checksPassed", "requiredApprovals", "healthySize"]),
    );
  });

  /**
   * The gap must be legible. A score of 20 out of a possible 20 is a different
   * fact from 20 out of 100, and the difference is a permission Kreds has not
   * asked for rather than anything the author did.
   */
  it("reports how much weight it could actually see", () => {
    const result = score({ meaningfulDescription: true }, PR_WEIGHTS);
    expect(result.score).toBe(20);
    expect(result.observableWeight).toBe(20);

    const full = Object.fromEntries(Object.keys(PR_WEIGHTS).map((k) => [k, false]));
    expect(score(full, PR_WEIGHTS).observableWeight).toBe(100);
  });

  /** A policy whose weights sum past 100 must not produce a score no curve has a band for. */
  it("clamps to 100 rather than trusting the weights to sum correctly", () => {
    const result = score({ a: true, b: true }, { a: 90, b: 90 });
    expect(result.score).toBe(100);
  });
});

describe("pull request size", () => {
  it("counts a small or ideal change as healthy", () => {
    expect(isHealthySize(10, BANDS)).toBe(true);
    expect(isHealthySize(250, BANDS)).toBe(true);
  });

  it("counts an acceptable change as healthy, at the boundary", () => {
    expect(isHealthySize(600, BANDS)).toBe(true);
  });

  /**
   * 03 calls 600 to 1000 a "reduced size score" but publishes no multiplier for
   * the reduction. Rather than invent a fraction, the signal is not met there,
   * which under-credits instead of crediting by a number that exists nowhere.
   */
  it("does not credit the reduced band, because its multiplier is unpublished", () => {
    expect(isHealthySize(601, BANDS)).toBe(false);
    expect(isHealthySize(999, BANDS)).toBe(false);
  });

  it("does not credit a change nobody will review properly", () => {
    expect(isHealthySize(4000, BANDS)).toBe(false);
  });
});

describe("points from quality", () => {
  const MERGED_PR = [10, 50] as const;
  const CODE_REVIEW = [10, 60] as const;

  it("awards the floor at zero quality, never nothing", () => {
    // 03: "the floor is +5 K, not 0. A weak-but-merged PR still shipped."
    expect(pointsFor(0, MERGED_PR)).toBe(10);
  });

  it("awards the ceiling at perfect quality", () => {
    expect(pointsFor(100, MERGED_PR)).toBe(50);
  });

  it("is monotonic between the two", () => {
    let previous = -1;
    for (let quality = 0; quality <= 100; quality++) {
      const awarded = pointsFor(quality, MERGED_PR);
      expect(awarded).toBeGreaterThanOrEqual(previous);
      previous = awarded;
    }
  });

  it("stays inside the range for any input, including nonsense", () => {
    for (const quality of [-50, 0, 50, 100, 500]) {
      const awarded = pointsFor(quality, MERGED_PR);
      expect(awarded).toBeGreaterThanOrEqual(MERGED_PR[0]);
      expect(awarded).toBeLessThanOrEqual(MERGED_PR[1]);
    }
  });

  /**
   * 24: "a review tops out at 60 while a merge tops out at 50". Reviewing
   * should be the most valuable thing you can do, expressed in the layer that
   * has no supply constraint at all.
   */
  it("lets an excellent review out-earn an excellent merge", () => {
    expect(pointsFor(100, CODE_REVIEW)).toBeGreaterThan(pointsFor(100, MERGED_PR));
  });

  it("refuses an inverted range rather than returning something", () => {
    expect(() => pointsFor(50, [60, 10])).toThrow(RangeError);
  });
});
