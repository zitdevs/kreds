import { describe, expect, it } from "vitest";

import {
  KREDBITS_PER_KRED,
  addKredbits,
  fromKred,
  kredbits,
  formatKred,
  splitKredbits,
  subtractKredbits,
  takeFee,
} from "./money.js";

/**
 * Law II, Auditable Movement, and 06: Ledger, Monetary precision.
 *
 * "Never use floating-point arithmetic. Store KRED in integer subunits:
 *  1 KRED = 100 kredbits."
 */
describe("kredbits are integer subunits", () => {
  it("holds 100 kredbits to the KRED", () => {
    expect(KREDBITS_PER_KRED).toBe(100n);
    expect(fromKred(1)).toBe(kredbits(100n));
    expect(fromKred(39.2)).toBe(kredbits(3920n));
  });

  it("refuses a KRED amount that is not a whole number of kredbits", () => {
    // 0.001 KRED is a tenth of a kredbit. There is no such thing.
    expect(() => fromKred(0.001)).toThrow(/whole kredbits/i);
  });

  it("refuses a negative amount at construction", () => {
    expect(() => kredbits(-1n)).toThrow(/negative/i);
  });

  it("refuses a non-integer bigint-shaped value", () => {
    // @ts-expect-error a number is not a bigint: floating point never enters the pipeline
    expect(() => kredbits(100)).toThrow();
  });

  it("formats for display without ever doing float arithmetic on the value", () => {
    expect(formatKred(kredbits(3920n))).toBe("39.20");
    expect(formatKred(kredbits(5n))).toBe("0.05");
    expect(formatKred(kredbits(0n))).toBe("0.00");
  });
});

/**
 * Law XXI, No Monetary Creation Through Debt.
 *
 * "balance >= 0 at all times, for every account."
 */
describe("subtraction cannot produce a negative quantity", () => {
  it("subtracts within the available amount", () => {
    expect(subtractKredbits(kredbits(3000n), kredbits(1000n))).toBe(kredbits(2000n));
  });

  it("throws rather than returning a negative balance", () => {
    expect(() => subtractKredbits(kredbits(500n), kredbits(3000n))).toThrow(/negative/i);
  });
});

/**
 * 03: Pull Requests, Co-authored pull requests.
 *
 * "the total distributed must equal the reward exactly. Remainder kredbits go
 *  somewhere deterministic, they are never dropped, because dropping them
 *  violates Law II."
 */
describe("splitting conserves every kredbit", () => {
  it("splits evenly when it divides", () => {
    const parts = splitKredbits(kredbits(3500n), 2);
    expect(parts).toEqual([kredbits(1750n), kredbits(1750n)]);
  });

  it("reproduces the three-contributor example from chapter 03", () => {
    // 35 KRED between Isaac, Jose and Maria: 11.67 / 11.67 / 11.66
    const parts = splitKredbits(fromKred(35), 3);
    expect(parts.map(formatKred)).toEqual(["11.67", "11.67", "11.66"]);
  });

  it("conserves the total for every share count", () => {
    for (let n = 1; n <= 17; n += 1) {
      const parts = splitKredbits(fromKred(35), n);
      expect(parts).toHaveLength(n);
      expect(parts.reduce(addKredbits, kredbits(0n))).toBe(fromKred(35));
    }
  });

  it("refuses a non-positive share count", () => {
    expect(() => splitKredbits(fromKred(35), 0)).toThrow(/at least one/i);
  });
});

/**
 * 23: Review Funding, Debt and Credit, Level 1: author-funded.
 *
 * A 30 K review pays the reviewer 29.4 K and the protocol 0.6 K. The fee rate
 * itself is versioned policy (Law XV), so it is an argument, never a constant
 * baked into the domain.
 */
describe("fees split a gross amount without losing a kredbit", () => {
  it("reproduces the 2% example from chapter 23", () => {
    const { net, fee } = takeFee(fromKred(30), 200);
    expect(formatKred(net)).toBe("29.40");
    expect(formatKred(fee)).toBe("0.60");
  });

  it("always reconciles net + fee back to gross", () => {
    for (let gross = 0n; gross <= 500n; gross += 7n) {
      const { net, fee } = takeFee(kredbits(gross), 200);
      expect(addKredbits(net, fee)).toBe(kredbits(gross));
    }
  });

  it("rounds the fee down so the payee is never short-changed by rounding", () => {
    // 2% of 1 kredbit is 0.02 kredbits. It cannot be charged.
    const { net, fee } = takeFee(kredbits(1n), 200);
    expect(fee).toBe(kredbits(0n));
    expect(net).toBe(kredbits(1n));
  });

  it("refuses a fee rate outside 0 to 100 percent", () => {
    expect(() => takeFee(fromKred(30), -1)).toThrow(/basis points/i);
    expect(() => takeFee(fromKred(30), 10_001)).toThrow(/basis points/i);
  });
});
