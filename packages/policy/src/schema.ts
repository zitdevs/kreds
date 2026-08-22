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

  /**
   * The eligibility matrix, published as data.
   *
   * This is the part of eligibility Kreds can evaluate anywhere: the context a
   * repository is in, whether a valid review exists, and which trust band it
   * sits in. The **multipliers** attached to a reduced outcome are monetary
   * policy and are withheld, which is why `economicEligibility.multipliers` is
   * `NOT_PUBLISHED` and this table carries outcomes rather than numbers.
   */
  mergeEligibility: z.object({
    privateRepoRequiresEligibleReview: z.boolean(),
    publicVisibilityAloneSufficient: z.boolean(),
    matrix: z
      .array(
        z.object({
          context: z.enum([
            "PERSONAL_PRIVATE",
            "PERSONAL_PUBLIC",
            "ORGANIZATION_PRIVATE",
            "ORGANIZATION_PUBLIC",
          ]),
          review: z.boolean(),
          /** `null` where the row applies at any trust level. */
          trust: z.enum(["LOW", "MEDIUM", "HIGH", "ELIGIBLE"]).nullable(),
          eligibility: z.enum(["NONE", "REDUCED", "PARTIAL", "FULL", "REDUCED_OR_NONE"]),
        }),
      )
      .min(1),
    /** A03: a post-merge review does not retroactively create eligibility. */
    postMergeReviewEstablishesEligibility: z.literal(false),
    draftReviewEstablishesEligibility: z.literal(false),
  }),

  economicEligibility: z.object({
    appliesBeforePricing: z.boolean(),
    outcomes: z.array(z.string().min(1)),
    /** Monetary policy, and withheld. Core never supplies one. */
    multipliers: z.union([notPublished, z.unknown()]),
    appliesToPlatformFundedReviewRewards: z.boolean(),
    appliesToAuthorFundedReviewTransfers: z.boolean(),
    appliesToCreditFacilityDraws: z.boolean(),
    appliesToProtectionPayments: z.boolean(),
  }),

  repositoryTrust: z.object({
    tiers: z.array(z.string().min(1)),
    tiersApplyTo: z.string().min(1),
    tierThresholds: z.union([notPublished, z.unknown()]),
    scoringFormula: z.union([notPublished, z.unknown()]),
    /** Law XXXI: no single popularity metric defines economic legitimacy. */
    singleMetricMayBeDecisive: z.literal(false),
    signals: z.array(z.string().min(1)),
  }),

  reviewerEconomicValidation: z.object({
    mustBeDistinctIdentity: z.literal(true),
    mustBeHuman: z.literal(true),
    mustMeetMinimumTrust: z.boolean(),
    trustThreshold: z.union([notPublished, z.unknown()]),
    mustNotBeFlaggedForCollusion: z.boolean(),
    mustBeMeaningfulReview: z.boolean(),
    /** Law XXXIV: alternate accounts cannot legitimize self-directed work. */
    alternateAccountValidationPermitted: z.literal(false),
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
    /**
     * A04. Points in a context with no independent human observer are capped.
     *
     * `NOT_PUBLISHED`, and typed as the literal so that no code can read it as
     * "absent, so award without a bound". 24: GitHub attesting that a merge
     * happened "is not the same as anyone judging it was worth something."
     */
    unobservedContextCaps: notPublished.optional(),
    /** True: "Not refused: solo work in a private repository is real work." */
    unobservedContextAwarded: z.literal(true).optional(),
  }),

  /**
   * The settlement window, and the two laws that hang off it.
   *
   * 11: Debt, Settlement and Extraction Protection: "New rewards do not become
   * immediately withdrawable." The window is what separates earned from
   * withdrawable, and it is the mechanism Law VII depends on: without it, an
   * attacker extracts before the liability lands.
   */
  settlement: z.object({
    normalWindowHours: z.number().int().positive(),
    /** Longer where risk is elevated. Operational policy, deliberately withheld. */
    riskAdjustedWindows: notPublished,
    /** Law VIII. */
    earningsRepayDebtFirst: z.literal(true),
    /**
     * Law XXI, pinned rather than read.
     *
     * A policy file that permitted negative balances would let two accounts at
     * zero mint spendable KRED by reviewing each other, which is the founding
     * accounting bug Amendment A01 closed. Kreds refuses to load such a file
     * rather than handling it downstream.
     */
    negativeBalancesPermitted: z.literal(false),
    /**
     * Law VII, via 19: Invariants: "A negative net position has
     * `Withdrawable = 0`". The chapter adds: "There is no partial exception, no
     * 'but the pending portion', no manual override."
     */
    withdrawableWhileNetPositionNegative: z.literal(0),
  }),

  /**
   * How a position is put together.
   *
   * 23: Review Funding, Debt and Credit, Economic position. Note that
   * `positionFields` does not list `available`: the published policy names six
   * recorded quantities, and available is a derived display figure that
   * 11 defines in words and no published text gives a formula for.
   */
  accounting: z.object({
    /** Law XXI again, from the other side. */
    minimumBalance: z.literal(0),
    negativeBalancesPermitted: z.literal(false),
    netPositionFormula: z.string().min(1),
    /**
     * False, and pinned.
     *
     * 23 records that Amendment A01 §54 shows an example that folds
     * receivables into the headline figure, contradicting its own §4 formula,
     * and that the repository implements §4. Folding them in would recreate,
     * in the display layer, the confusion the amendment exists to remove.
     */
    pendingReceivablesIncludedInNetPosition: z.literal(false),
    positionFields: z.array(z.string().min(1)).nonempty(),
    settlementOrdering: z.array(z.string().min(1)).nonempty(),
  }),

  /**
   * Law XXIV, Unfunded Work Is a Claim, Not Currency.
   *
   * Three of these are pinned to `false` because a receivable that became
   * transferable would be a second money supply with none of the first one's
   * controls.
   */
  receivables: z.object({
    countedInKredSupply: z.literal(false),
    transferable: z.literal(false),
    spendable: z.literal(false),
    withdrawable: z.literal(false),
    paymentOrdering: z.string().min(1),
    paidBeforeAuthorEarnings: z.literal(true),
    closedWithoutMergeRetentionRatio: z.number().min(0).max(1),
    closedWithoutMergeRemainderCancelled: z.boolean(),
    /**
     * True. 23, Interpretation decision (A03): settling receivables gross
     * "would create a fee arbitrage: colluding accounts would deliberately
     * route reviews through the unfunded state to dodge the fee."
     */
    settlementAppliesProtocolFee: z.literal(true),
  }),

  /** 23, Who owes the debt. */
  debtTypes: z.array(z.string().min(1)).nonempty(),

  /**
   * How activity reaches Kreds, and who may originate a claim.
   *
   * Amendment A04. Absent from `v0.4` and earlier, which is why every section
   * below is optional: Law XV keeps history explainable under the rules that
   * produced it, so an older snapshot has to keep loading rather than being
   * retrofitted with values it never had.
   */
  access: z
    .object({
      /** A04: organizations adopt for shared money, not to let their people play. */
      organizationAdoptionRequired: z.literal(false),
      ingestionModes: z
        .array(z.enum(["PROVIDER_WEBHOOK", "SERVER_SIDE_DELEGATED_QUERY"]))
        .nonempty(),
      /**
       * Law XXXV, pinned rather than read.
       *
       * 26: "Anything a client is trusted to send, an attacker sends directly
       * with curl: no repository, no account history, no work." A policy file
       * that permitted it would be one Kreds must refuse to load, because the
       * alternative is a flag somebody flips for a demo.
       */
      clientOriginatedEvidencePermitted: z.literal(false),
      /** What a client may do instead. Display, and nothing else. */
      clientRoles: z.array(z.literal("DISPLAY_ONLY")).nonempty(),
      ladder: z
        .array(
          z.object({
            context: z.string().min(1),
            orgActionRequired: z.enum(["NONE", "ORG_WIDE_APPROVAL"]),
          }),
        )
        .nonempty(),
    })
    .optional(),

  /**
   * Where an event lands.
   *
   * Law IV as amended by A04: "the connected GitHub Organization's economy where
   * a Kreds Team exists, otherwise the contributor's personal position. It never
   * lands directly in a global wallet."
   */
  economicScope: z
    .object({
      positions: z.array(z.enum(["PERSONAL", "ORGANIZATION"])).nonempty(),
      defaultWhenNoTeam: z.literal("PERSONAL"),
      /** Law IV. Pinned: a direct pipe to the wallet deletes every Part XI protection. */
      directToGlobalWalletPermitted: z.literal(false),
      /** 26: "This is not a lighter tier. It is the same accounting with a different boundary." */
      personalPositionUsesSameStates: z.literal(true),
      personalPositionUsesSameSettlement: z.literal(true),
      /** Everything involving money that is not the individual's. */
      orgOnlyFeatures: z.array(z.string().min(1)).nonempty(),
    })
    .optional(),

  /**
   * Law XXXVI, Only Organization Authority Binds an Organization.
   *
   * The three insufficiencies are pinned to `false` because each one is a real
   * path somebody would otherwise reach for: 26 lists "being a member, being
   * first to connect, having write access to a repository, or contributing to
   * one of its public repositories" and calls all of them never sufficient.
   */
  organizationBinding: z
    .object({
      requiresOrganizationAuthority: z.literal(true),
      membershipSufficient: z.literal(false),
      firstConnectionSufficient: z.literal(false),
      repositoryAccessSufficient: z.literal(false),
      /** "A binding valid at creation is not evidence of authority today." */
      reverifyBeforeTreasuryActions: z.literal(true),
    })
    .optional(),

  /**
   * Law XXXVII, Liability Requires a Consenting Context.
   *
   * > "Earning without consent is a gift. Owing without consent is an
   * > imposition."
   */
  consent: z
    .object({
      earningRequiresConsent: z.literal(false),
      chargingRequiresConsentingContext: z.literal(true),
      consentingAuthorities: z.object({
        OWN_REPOSITORY: z.literal("CONTRIBUTOR"),
        BOUND_ORGANIZATION: z.literal("ORGANIZATION"),
      }),
      /** Where the obligation goes when nobody consented. Never the author. */
      fallbackWhenNoConsentingContext: z.array(z.enum(["FUNDED_SOURCE", "RECEIVABLE"])).nonempty(),
    })
    .optional(),
});

export type Policy = z.infer<typeof policySchema>;
export type PointsRange = readonly [number, number];
