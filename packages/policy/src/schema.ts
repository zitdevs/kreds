import { z } from "zod";

/**
 * The shape of the published policy, as Kreds reads it.
 *
 * Deliberately narrow: this names only what the application acts on. The
 * snapshot carries more, and leaving the rest unvalidated means a new key in
 * `kreds-laws` cannot break an instance that has no use for it yet.
 *
 * What it is strict about is the values it does read. A policy file that has
 * lost its reward curve should fail loudly at boot, not silently price every
 * merge at zero.
 */

/**
 * A value the published policy deliberately withholds.
 *
 * These govern the Official Kreds Network and are loaded there from a private
 * source. Typed as this literal rather than as an optional number so that code
 * cannot read one as "absent, so use a default": there is no safe default for a
 * threshold whose whole purpose is not being guessable.
 */
export const NOT_PUBLISHED = "NOT_PUBLISHED" as const;
export type NotPublished = typeof NOT_PUBLISHED;

const notPublished = z.literal(NOT_PUBLISHED);

/** An inclusive `[min, max]` band of points. */
const range = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]);

/**
 * How a quality score becomes a value.
 *
 * Bands rather than a formula, which is what the policy publishes. The bands
 * are inclusive at both ends and are expected to cover `0` to `100` without a
 * gap; `curveValueFor` fails rather than guessing when they do not.
 */
const band = z.object({
  scoreMin: z.number().int().min(0).max(100),
  scoreMax: z.number().int().min(0).max(100),
});

const rewardBand = band.extend({ reward: z.number().int().nonnegative() });
const valueBand = band.extend({ value: z.number().int().nonnegative() });

/**
 * What each signal is worth in a quality score.
 *
 * The weights sum to 100 in every published version, and `qualityScore` relies
 * on that rather than assuming it: a policy whose weights do not sum to 100
 * would silently produce scores that cannot reach the top band.
 */
const weights = z.record(z.string(), z.number().int().nonnegative());

export const policySchema = z.object({
  rulesVersion: z.string().min(1),

  pullRequest: z.object({
    merge: z.object({
      minReward: z.number().int().nonnegative(),
      maxReward: z.number().int().nonnegative(),
      curve: z.array(rewardBand).min(1),
      qualityWeights: weights,
    }),
    /** The published size bands, in changed lines. See 03: PR size rules. */
    size: z.object({
      smallMaxLines: z.number().int().positive(),
      idealMaxLines: z.number().int().positive(),
      acceptableMaxLines: z.number().int().positive(),
      reducedMaxLines: z.number().int().positive(),
      noBonusAboveLines: z.number().int().positive(),
      excludeGeneratedFiles: z.boolean(),
    }),
    coAuthors: z.object({
      splitStrategy: z.string().min(1),
      eligibleActorTypes: z.array(z.string().min(1)),
    }),
  }),

  codeReview: z.object({
    curve: z.array(valueBand).min(1),
    qualityWeights: weights,
    /** A review that landed after the merge is worth nothing (A03). */
    afterMergeValue: z.number().int(),
    selfReviewValue: z.number().int(),
    botReviewValue: z.number().int(),
    aiAgentReviewValue: z.number().int(),
    draftReviewMaxRatio: z.number(),
    reReviewMaxRatio: z.number(),
    timingMultipliers: z.union([notPublished, z.unknown()]),
  }),

  actorTypes: z.object({
    eligible: z.array(z.string().min(1)),
    ineligible: z.array(z.string().min(1)),
    /** Law XVI's direction: an unclassified actor earns nothing. */
    unknownFailsClosed: z.boolean(),
  }),

  contributionPoints: z.object({
    isCurrency: z.literal(false),
    transferable: z.literal(false),
    spendable: z.literal(false),
    exchangeable: z.literal(false),
    canCreateDebt: z.literal(false),
    hasSupply: z.literal(false),
    countedInKredSupply: z.literal(false),
    /**
     * Pinned to `null` and `false` in the schema, not merely read.
     *
     * Law XXVI forbids a conversion rate in either direction, ever. A policy
     * file that arrived carrying one would be a policy file Kreds must refuse
     * to load, so this fails validation rather than being handled downstream.
     */
    conversionRateToKred: z.null(),
    conversionEverPermitted: z.literal(false),
    decreasesFromEconomicActivity: z.literal(false),
    adjustableOnInvalidation: z.boolean(),
    invalidationTriggers: z.array(z.string().min(1)),
    scopes: z.array(z.string().min(1)),
    awardedWhenKredUnfunded: z.boolean(),
    ranges: z.object({
      mergedPr: range,
      codeReview: range,
      issueResolution: range,
    }),
    dailyCaps: z.union([notPublished, z.unknown()]),
    unclaimedIdentitiesEligible: z.boolean(),
  }),
});

export type Policy = z.infer<typeof policySchema>;
export type PointsRange = readonly [number, number];
