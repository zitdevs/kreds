import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CURRENT_RULES_VERSION,
  currentPolicy,
  knownRulesVersions,
  NOT_PUBLISHED,
  policyFor,
} from "./index.js";

const here = dirname(new URL(import.meta.url).pathname);
const snapshots = join(here, "snapshots");

/**
 * The checksum of every snapshot, taken from the file in `kreds-laws`.
 *
 * This is what makes "GENERATED, DO NOT EDIT" more than a comment. A snapshot
 * is a copy of the authority, and the one way it can go wrong is somebody
 * editing a number here instead of there: the instance would then price work
 * under rules that exist nowhere, and nothing else in the system would notice.
 *
 * To add a version, copy the file unchanged and add its checksum. If updating a
 * checksum is ever the fix for a failing test, the file was edited and the edit
 * belongs upstream.
 */
const CHECKSUMS: Readonly<Record<string, string>> = {
  "kreds-rules-public-v0.4.json":
    "5396d073e7c3b2be95ba816a8d149caf8b046cd592bcd0633359521cc3ac211c",
  "kreds-rules-public-v0.5.json":
    "061c3d87c2f1fa2902947d98f609b55e62623b2b6f0a8b21a63ce039602b5a05",
};

describe("the snapshots are copies, not edits", () => {
  it("matches the checksum of every file, byte for byte", () => {
    for (const [file, expected] of Object.entries(CHECKSUMS)) {
      const actual = createHash("sha256")
        .update(readFileSync(join(snapshots, file)))
        .digest("hex");
      expect(actual, `${file} no longer matches kreds-laws`).toBe(expected);
    }
  });

  /**
   * Catches the other direction: a file added to the folder without a checksum
   * would otherwise be trusted without ever being pinned.
   */
  it("pins every file present, with nothing unaccounted for", () => {
    const present = readdirSync(snapshots)
      .filter((name) => name.endsWith(".json"))
      .sort();
    expect(present).toEqual(Object.keys(CHECKSUMS).sort());
  });
});

describe("what the policy publishes", () => {
  it("loads and reports its version", () => {
    expect(CURRENT_RULES_VERSION).toBe("v0.5");
    expect(currentPolicy().rulesVersion).toBe("v0.5");
  });

  /**
   * Law XV: rules may change, history may not. A result produced under an older
   * version has to stay explainable, which it cannot be if the version that
   * produced it has been deleted.
   */
  it("keeps every version readable, not only the newest", () => {
    for (const version of knownRulesVersions()) {
      expect(policyFor(version).rulesVersion).toBe(version);
    }
  });

  it("refuses a version it does not have, rather than substituting one", () => {
    expect(() => policyFor("v9.9")).toThrow(/Law XV/);
  });
});

describe("the boundary the policy keeps", () => {
  /**
   * Law XXVI forbids a conversion rate between points and KRED in either
   * direction, ever. The schema pins this rather than reading it, so a policy
   * file that arrived carrying a rate would fail to load instead of being
   * handled somewhere downstream by code written in a hurry.
   */
  it("carries no conversion rate from points to KRED", () => {
    const { contributionPoints } = currentPolicy();
    expect(contributionPoints.conversionRateToKred).toBeNull();
    expect(contributionPoints.conversionEverPermitted).toBe(false);
    expect(contributionPoints.isCurrency).toBe(false);
    expect(contributionPoints.transferable).toBe(false);
    expect(contributionPoints.spendable).toBe(false);
    expect(contributionPoints.countedInKredSupply).toBe(false);
  });

  /**
   * Values the published policy withholds stay withheld. They are typed as a
   * literal rather than as an optional number so that no caller can read one as
   * "absent, so use a default": a threshold whose purpose is not being
   * guessable has no safe default.
   */
  it("reports an unpublished value as withheld rather than as a number", () => {
    expect(currentPolicy().contributionPoints.dailyCaps).toBe(NOT_PUBLISHED);
    expect(currentPolicy().codeReview.timingMultipliers).toBe(NOT_PUBLISHED);
  });

  /** Law XVI's direction: an unclassified actor earns nothing. */
  it("says only humans earn, and that unknown fails closed", () => {
    const { actorTypes } = currentPolicy();
    expect(actorTypes.eligible).toEqual(["HUMAN"]);
    expect(actorTypes.ineligible).toEqual(expect.arrayContaining(["BOT", "AI_AGENT"]));
    expect(actorTypes.unknownFailsClosed).toBe(true);
  });

  /**
   * 24: "a review tops out at 60 while a merge tops out at 50". Reviewing
   * should be the most valuable thing you can do, and this is that asymmetry in
   * the layer with no supply constraint.
   */
  it("lets a review out-earn a merge in points", () => {
    const { ranges } = currentPolicy().contributionPoints;
    expect(ranges.codeReview[1]).toBeGreaterThan(ranges.mergedPr[1]);
  });
});
