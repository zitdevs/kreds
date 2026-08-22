import type { Brand } from "./brand.js";

/**
 * An amount of official KRED, held in integer subunits.
 *
 * 06: Ledger, Monetary precision:
 *
 * > "Never use floating-point arithmetic. Store KRED in integer subunits:
 * >  1 KRED = 100 kredbits."
 *
 * The type is `bigint` and never `number`, and it is branded so that a raw
 * integer cannot drift into a monetary position by accident. Every amount in
 * this package is non-negative; owing is modelled as debt beside a balance,
 * never as a negative quantity (Law XXI).
 */
export type Kredbits = Brand<bigint, "Kredbits">;

/** 06: Ledger, Monetary precision. The subunit name may change; the integer requirement may not. */
export const KREDBITS_PER_KRED = 100n;

const KRED_DECIMAL = /^\d+(\.\d{1,2})?$/;
const BASIS_POINTS_PER_WHOLE = 10_000;

/**
 * Construct an amount from a raw subunit count.
 *
 * @throws if the value is not a non-negative `bigint`. A negative amount is
 * rejected at construction because Law XXI forbids a negative balance
 * anywhere in the system, and the cheapest place to enforce that is the type's
 * only entry point.
 */
export function kredbits(value: bigint): Kredbits {
  if (typeof value !== "bigint") {
    throw new TypeError(
      `kredbits must be a bigint, received ${typeof value}. Floating point never enters the pipeline.`,
    );
  }
  if (value < 0n) {
    throw new RangeError(
      `kredbits cannot be negative, received ${value}. Debt is tracked separately (Law XXI).`,
    );
  }
  return value as Kredbits;
}

/**
 * Construct an amount from a KRED figure, for fixtures, configuration and
 * display round-trips.
 *
 * The conversion goes through the decimal string rather than multiplying by
 * 100, because `39.2 * 100` is `3920.0000000000005` and that is precisely the
 * representation error 06: Ledger forbids.
 *
 * **Prefer the string form for anything load-bearing.** A `number` argument has
 * already lost precision before this function is reached: the literal
 * `1234567890123456.78` is not representable, so no amount of careful parsing
 * inside can recover it. The string form is exact at any magnitude.
 *
 * @throws if the figure carries more precision than one kredbit.
 */
export function fromKred(kred: number | string): Kredbits {
  const text = typeof kred === "string" ? kred : String(kred);
  if (!KRED_DECIMAL.test(text)) {
    throw new RangeError(
      `${text} is not a non-negative amount of whole kredbits. At most two decimal places are representable.`,
    );
  }
  const [whole = "0", fraction = ""] = text.split(".");
  return kredbits(BigInt(whole) * KREDBITS_PER_KRED + BigInt(fraction.padEnd(2, "0")));
}

/** Render an amount for display. Integer arithmetic only, no division by 100 in floating point. */
export function formatKred(amount: Kredbits): string {
  const whole = amount / KREDBITS_PER_KRED;
  const fraction = amount % KREDBITS_PER_KRED;
  return `${whole}.${String(fraction).padStart(2, "0")}`;
}

export function addKredbits(a: Kredbits, b: Kredbits): Kredbits {
  return kredbits(a + b);
}

/**
 * @throws if the result would be negative.
 *
 * Law XXI, No Monetary Creation Through Debt: an implementation that can
 * produce a negative balance can mint currency. A caller that expects a
 * shortfall must route it through the funding waterfall instead of subtracting
 * past zero.
 */
export function subtractKredbits(a: Kredbits, b: Kredbits): Kredbits {
  if (b > a) {
    throw new RangeError(
      `subtracting ${b} from ${a} would produce a negative amount. Route the shortfall through the funding waterfall (Law XXII).`,
    );
  }
  return kredbits(a - b);
}

/**
 * Divide an amount into `shares` parts that sum back to exactly the input.
 *
 * 03: Pull Requests, Co-authored pull requests:
 *
 * > "the total distributed must equal the reward exactly. Remainder kredbits go
 * >  somewhere deterministic, they are never dropped, because dropping them
 * >  violates Law II."
 *
 * The deterministic rule here is largest-remainder by position: the first
 * `remainder` shares each receive one extra kredbit. Chapter 03's own example,
 * 35 KRED across three contributors, comes out as 11.67 / 11.67 / 11.66.
 */
export function splitKredbits(total: Kredbits, shares: number): Kredbits[] {
  // isSafeInteger, not isInteger: `Number.isInteger(1e21)` is true, and a share
  // count that large dies inside `Array.from` with an unhelpful error rather
  // than at the guard.
  if (!Number.isSafeInteger(shares) || shares < 1) {
    throw new RangeError(`a split needs at least one share, received ${shares}.`);
  }
  const divisor = BigInt(shares);
  const base = total / divisor;
  const remainder = Number(total % divisor);
  return Array.from({ length: shares }, (_unused, index) =>
    kredbits(index < remainder ? base + 1n : base),
  );
}

/**
 * Separate a gross amount into the part the payee receives and the protocol
 * fee, conserving every kredbit.
 *
 * The rate is an argument rather than a constant because Law XV makes rules
 * versioned data: a fee baked into the domain could not be changed without
 * rewriting history. It is expressed in basis points so the calculation stays
 * in integers.
 *
 * The fee rounds **down**, so rounding error can never take more from the payee
 * than the stated rate.
 */
export function takeFee(gross: Kredbits, basisPoints: number): { net: Kredbits; fee: Kredbits } {
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > BASIS_POINTS_PER_WHOLE) {
    throw new RangeError(
      `a fee rate is 0 to ${BASIS_POINTS_PER_WHOLE} basis points, received ${basisPoints}.`,
    );
  }
  const fee = kredbits((gross * BigInt(basisPoints)) / BigInt(BASIS_POINTS_PER_WHOLE));
  return { net: subtractKredbits(gross, fee), fee };
}

/** The zero amount, for folds and empty positions. */
export const ZERO_KREDBITS = kredbits(0n);

/**
 * An exact rate between a local currency and official KRED, as a rational pair
 * of integers.
 *
 * 14: Cloud Economic Modes publishes rates in the form `1 ZIT = 0.025 KRED`.
 * Both of that chapter's worked figures, `0.025` and `0.05`, are inexact in
 * binary, so a `number` field here would be the one floating-point value in the
 * monetary model, which 06: Ledger forbids outright. The pair follows the
 * precedent `takeFee` already sets by taking basis points: keep the arithmetic
 * in integers.
 *
 * Read it as: `localSubunits` of the local currency are worth `kredbits`
 * kredbits.
 *
 * Law XIV, Reserve Backing Is Not Fiat Value: this is a ratio against KRED and
 * there is deliberately nowhere in the type to put a cash price.
 */
export interface BackingRatio {
  readonly kredbits: bigint;
  readonly localSubunits: bigint;
}

export function backingRatio(kredbitsPart: bigint, localSubunitsPart: bigint): BackingRatio {
  if (typeof kredbitsPart !== "bigint" || typeof localSubunitsPart !== "bigint") {
    throw new TypeError(
      `a backing ratio is a pair of bigints. Floating point never enters the pipeline.`,
    );
  }
  if (kredbitsPart <= 0n || localSubunitsPart <= 0n) {
    throw new RangeError(
      `a backing ratio needs two positive terms, received ${kredbitsPart}/${localSubunitsPart}.`,
    );
  }
  return Object.freeze({ kredbits: kredbitsPart, localSubunits: localSubunitsPart });
}

/**
 * Whether `localAmount` of a local currency is worth exactly `kredAmount`
 * kredbits at this rate.
 *
 * Cross-multiplication, so no division and no remainder to lose. An exchange
 * that does not land on an exact integer on both sides is not representable and
 * must be rejected rather than rounded, because rounding an exchange is
 * creating or destroying supply.
 */
export function convertsExactly(
  rate: BackingRatio,
  localAmount: bigint,
  kredAmount: bigint,
): boolean {
  return localAmount * rate.kredbits === kredAmount * rate.localSubunits;
}
