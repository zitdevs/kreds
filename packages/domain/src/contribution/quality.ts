/**
 * The quality score, `0` to `100`.
 *
 * 03: Pull Requests explains what it is measuring, and it is worth repeating
 * here because it is easy to implement the wrong thing:
 *
 * > "The score is not measuring how impressive the change is, Kreds cannot
 * >  judge that. It measures whether the author did the work that makes someone
 * >  else's review possible."
 *
 * Every weight comes from versioned policy. Nothing in this file names a
 * number, because Law XV makes the numbers data and a hard-coded weight is a
 * rule that no policy version can ever change.
 */

/**
 * A signal Kreds could not observe.
 *
 * Distinct from `false` on purpose. Several signals need data the GitHub App
 * does not currently collect: check runs need a permission Kreds does not ask
 * for, and unresolved review threads need an event it does not subscribe to.
 *
 * An unobserved signal scores as not met, which under-credits. That is the safe
 * direction, and the alternative is worse in both possible ways: assuming a
 * signal was met invents evidence, and normalising the score over only the
 * observed weights would give a small pull request with no CI a perfect score.
 *
 * What the type prevents is the gap being *silent*. `score()` reports which
 * signals it could not see, so a low score can be read as "the work was thin"
 * or "Kreds is half blind here" rather than being ambiguous between them.
 */
export const UNOBSERVED = "UNOBSERVED" as const;
export type Unobserved = typeof UNOBSERVED;

export type Signal = boolean | Unobserved;

export interface QualityResult {
  /** `0` to `100`. */
  readonly score: number;
  /** Signals that were observed and met. */
  readonly met: readonly string[];
  /** Signals Kreds could not evaluate. They scored as not met. */
  readonly unobserved: readonly string[];
  /**
   * How much of the total weight Kreds could actually see, `0` to `100`.
   *
   * Not used in the score. It exists so that coverage can be reported and
   * improved: a score of 40 out of a possible 55 is a different fact from a
   * score of 40 out of 100, and the difference is a permission Kreds has not
   * asked for rather than anything the author did.
   */
  readonly observableWeight: number;
}

/**
 * Score a set of signals against a set of weights.
 *
 * Weights come from policy, keyed by signal name. A signal present in the
 * weights but absent from the input counts as unobserved, so adding a criterion
 * upstream never silently awards it.
 */
export function score(
  signals: Readonly<Record<string, Signal | undefined>>,
  weights: Readonly<Record<string, number>>,
): QualityResult {
  let total = 0;
  let observable = 0;
  const met: string[] = [];
  const unobserved: string[] = [];

  for (const [name, weight] of Object.entries(weights)) {
    const signal = signals[name] ?? UNOBSERVED;
    if (signal === UNOBSERVED) {
      unobserved.push(name);
      continue;
    }
    observable += weight;
    if (signal) {
      total += weight;
      met.push(name);
    }
  }

  return {
    // Clamped rather than trusted. A policy whose weights sum past 100 would
    // otherwise produce a score no reward curve has a band for.
    score: Math.max(0, Math.min(100, total)),
    met,
    unobserved,
    observableWeight: observable,
  };
}

/** The published size boundaries, in changed lines. */
export interface SizeBands {
  readonly smallMaxLines: number;
  readonly idealMaxLines: number;
  readonly acceptableMaxLines: number;
  readonly reducedMaxLines: number;
  readonly noBonusAboveLines: number;
}

/**
 * Whether a pull request is a size somebody can actually review.
 *
 * 03: "A 4,000-line PR is not four times as valuable as a 1,000-line PR. It is
 * substantially *less* valuable, because nobody is going to review it properly."
 *
 * The published bands name five sizes and describe the fourth as a "reduced
 * size score", but **no multiplier for that reduction is published**. So this
 * does not invent one. The signal is met at or below the acceptable boundary
 * and not met above it, which under-credits a pull request in the reduced band
 * rather than crediting it by a fraction that exists nowhere.
 *
 * When policy publishes the multiplier, this becomes a partial signal and the
 * `Signal` type already allows it.
 */
export function isHealthySize(changedLines: number, bands: SizeBands): boolean {
  return changedLines <= bands.acceptableMaxLines;
}

/**
 * Turn a quality score into points, within the range policy allows.
 *
 * Both ends come from policy. The shape between them does not: the published
 * rules give a range for points and a banded curve for KRED, and 24 is explicit
 * that the two evolve independently, so borrowing the monetary bands here would
 * couple exactly what the amendment separated.
 *
 * A proportional map is therefore the implementation's choice, not a published
 * rule, and it is the least-assuming one available: monotonic, hitting both
 * ends, inventing no interior band. If policy later publishes a points curve,
 * this is the single place that changes.
 */
export function pointsFor(qualityScore: number, range: readonly [number, number]): number {
  const [min, max] = range;
  if (max < min) {
    throw new RangeError(`points range is inverted: [${min}, ${max}].`);
  }
  const clamped = Math.max(0, Math.min(100, qualityScore));
  return Math.round(min + ((max - min) * clamped) / 100);
}
