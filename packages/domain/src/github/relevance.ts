/**
 * Public repository relevance.
 *
 * Phase 6A. This is **not** the trust that gates Official KRED, and the
 * distinction is the whole reason the file exists rather than a caveat on it:
 *
 * ```text
 * Public   Repository relevance                              this file
 * Private  Can Official KRED trust this interaction?         the Network
 * ```
 *
 * > They are related but not identical.
 *
 * Everything here is computed from signals GitHub already shows the world, with
 * weights that are open source and therefore reconstructible by anybody. That
 * is fine, and it is fine precisely because nothing here decides issuance. The
 * scoring that does is unpublished and lives with the Risk Engine.
 *
 * What this is for: showing a contributor why a repository looks established,
 * letting a local economy set its own rules, and letting a self-hosted instance
 * function with no Network at all.
 *
 * **There is deliberately no function converting relevance into a
 * `RepositoryTrustTier`.** The absence is the safeguard, the same way the
 * points module exports no path to KRED: a conversion that does not exist
 * cannot be called by a future feature in a hurry, and a relevance score that
 * could become an eligibility tier would put issuance behind numbers anyone can
 * read off a GitHub page.
 */

/** The public signals, exactly as GitHub reports them. */
export interface RelevanceSignals {
  readonly stars: number;
  readonly forks: number;
  /** Days since the repository was created. */
  readonly ageDays: number;
  readonly contributors: number;
  /** Contributors who are not members of the owning account. */
  readonly externalContributors: number;
  readonly mergedPullRequests: number;
  readonly issueActivity: number;
  readonly releases: number;
  readonly commits: number;
}

/** The value at which a signal is considered fully expressed. */
export type RelevanceReferences = Readonly<Record<keyof RelevanceSignals, number>>;

export interface SignalContribution {
  readonly signal: keyof RelevanceSignals;
  /** `0` to `1`, saturating at the reference point. */
  readonly strength: number;
}

export interface RepositoryRelevance {
  /**
   * `0` to `100`.
   *
   * Bounded by breadth, see `relevanceOf`. A high score means many kinds of
   * evidence, never one large number.
   */
  readonly score: number;
  /** How many distinct signals are present at all. */
  readonly breadth: number;
  readonly signals: readonly SignalContribution[];
  /**
   * True when one signal alone would otherwise have carried the score.
   *
   * Surfaced rather than hidden, because it is the shape a bought repository
   * has: ten thousand stars, no contributors, no releases, no history.
   */
  readonly singleSignalDominant: boolean;
}

export const RELEVANCE_SIGNALS = [
  "stars",
  "forks",
  "ageDays",
  "contributors",
  "externalContributors",
  "mergedPullRequests",
  "issueActivity",
  "releases",
  "commits",
] as const satisfies readonly (keyof RelevanceSignals)[];

/**
 * Reference points Kreds suggests, and nothing more than a suggestion.
 *
 * These are **not** law, not the Official thresholds, and not anti-farming
 * values. They are a starting scale so that a self-hosted instance has
 * something to run with, and every one of them is meant to be tuned by whoever
 * owns the economy being measured.
 *
 * They are stated here in the open on purpose. A reference point that had to be
 * secret would be a threshold, and a threshold on a public signal is exactly
 * what Law XXXI forbids relying on.
 */
export const SUGGESTED_REFERENCES: RelevanceReferences = {
  stars: 500,
  forks: 100,
  ageDays: 730,
  contributors: 20,
  externalContributors: 10,
  mergedPullRequests: 500,
  issueActivity: 200,
  releases: 20,
  commits: 2000,
};

/** Saturating, so a very large number is worth no more than a large one. */
function strengthOf(value: number, reference: number): number {
  if (reference <= 0 || value <= 0) return 0;
  return Math.min(1, value / reference);
}

/**
 * Measure how established a repository looks.
 *
 * Law XXXI is enforced structurally rather than described:
 *
 * > "GitHub stars may influence repository trust, but no single popularity
 * >  metric defines economic legitimacy."
 *
 * The score is the mean strength across all signals, then **capped by the
 * breadth of evidence**: a repository showing `k` of `n` signals cannot score
 * above `k / n` of the maximum, whatever those `k` are worth.
 *
 * That cap is derived from the law rather than chosen. One signal out of nine
 * caps at a ninth, so a repository with a hundred thousand purchased stars and
 * nothing else scores in single digits no matter how the references are tuned.
 * There is no number to buy, which is the point 25 makes when it says trust
 * must move gradually.
 */
export function relevanceOf(
  signals: RelevanceSignals,
  references: RelevanceReferences = SUGGESTED_REFERENCES,
): RepositoryRelevance {
  const contributions = RELEVANCE_SIGNALS.map((signal) => ({
    signal,
    strength: strengthOf(signals[signal], references[signal]),
  }));

  const present = contributions.filter((contribution) => contribution.strength > 0);
  const breadth = present.length;
  const total = contributions.reduce((sum, contribution) => sum + contribution.strength, 0);

  const mean = total / RELEVANCE_SIGNALS.length;
  const breadthCap = breadth / RELEVANCE_SIGNALS.length;
  const score = Math.round(Math.min(mean, breadthCap) * 100);

  // "Stars must never be the only trust signal." Naming the shape rather than
  // silently scoring it low, so an interface can say why.
  const strongest = present.reduce((best, c) => (c.strength > best.strength ? c : best), {
    signal: "stars" as keyof RelevanceSignals,
    strength: 0,
  });
  const singleSignalDominant = breadth > 0 && strongest.strength >= total - strongest.strength;

  return { score, breadth, signals: contributions, singleSignalDominant };
}
