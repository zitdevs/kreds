/**
 * The published economic policy, read at runtime.
 *
 * ```text
 * GENERATED, DO NOT EDIT
 * Source: zitdevs/kreds-laws, public/policy/
 * ```
 *
 * `kreds-laws` is the authority and is private, so the public half of the
 * policy is copied into `snapshots/` byte for byte and read from there. Nothing
 * in this package invents a number, and a value that the policy withholds is
 * exposed as `NOT_PUBLISHED` rather than defaulted, because a threshold whose
 * purpose is not being guessable has no safe default.
 *
 * Every version stays. Law XV lets rules change and does not let history change
 * with them, so a result produced under an older version has to remain
 * explainable, which means that version has to remain readable.
 */

import v04 from "./snapshots/kreds-rules-public-v0.4.json";
import v05 from "./snapshots/kreds-rules-public-v0.5.json";

import { policySchema, type Policy } from "./schema.js";

export { NOT_PUBLISHED, type NotPublished, type PointsRange, type Policy } from "./schema.js";

/** Every policy version this build can read, newest last. */
const SNAPSHOTS: readonly unknown[] = [v04, v05];

const byVersion = new Map<string, Policy>();
for (const raw of SNAPSHOTS) {
  const parsed = policySchema.safeParse(raw);
  if (!parsed.success) {
    // At module load, on purpose. A malformed policy is not something to
    // discover when the first pull request merges.
    throw new Error(`A policy snapshot failed validation: ${parsed.error.issues[0]?.message}`);
  }
  byVersion.set(parsed.data.rulesVersion, parsed.data);
}

/** The version in force for new work. */
export const CURRENT_RULES_VERSION = [...byVersion.keys()].at(-1) as string;

/**
 * Read a specific version.
 *
 * Callers scoring **new** work want `currentPolicy()`. This exists for the other
 * direction: explaining a result that was produced months ago under rules that
 * have since moved.
 */
export function policyFor(rulesVersion: string): Policy {
  const policy = byVersion.get(rulesVersion);
  if (!policy) {
    throw new Error(
      `No policy snapshot for ${rulesVersion}. Past results must stay explainable (Law XV), so the snapshot that produced them has to be present.`,
    );
  }
  return policy;
}

export function currentPolicy(): Policy {
  return policyFor(CURRENT_RULES_VERSION);
}

export function knownRulesVersions(): readonly string[] {
  return [...byVersion.keys()];
}
