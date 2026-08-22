import { describe, expect, it } from "vitest";

import type { AccountType } from "../economy/account.js";
import { ZERO_KREDBITS, fromKred, kredbits } from "../primitives/money.js";
import { points } from "../primitives/points.js";
import { MAXIMUM_SUPPLY, SUPPLY_TERMS, reconcileSupply } from "./supply.js";

const balances = (over: Partial<Record<AccountType, ReturnType<typeof fromKred>>> = {}) => ({
  CENTRAL_BANK_RESERVE: fromKred(4_120_000),
  GLOBAL_WALLET: fromKred(780_000),
  ORGANIZATION_POSITION: ZERO_KREDBITS,
  PERSONAL_POSITION: ZERO_KREDBITS,
  TREASURY: fromKred(70_000),
  REVIEW_FUND: ZERO_KREDBITS,
  PENDING: ZERO_KREDBITS,
  NETWORK_RESERVE: fromKred(30_000),
  PROTOCOL: ZERO_KREDBITS,
  BURNED: ZERO_KREDBITS,
  ...over,
});

/**
 * 19: Economic Invariants, Official KRED conservation.
 *
 * "At all times, accounting must reconcile: Central Bank Reserve + Global User
 *  Wallets + Organization KRED Positions + Organization Treasuries +
 *  Organization Review Funds + Pending Accounts + Network Reserves + Other
 *  Official Accounts + Burned Supply = Maximum Supply"
 */
describe("official KRED conservation", () => {
  it("carries the maximum supply from chapter 01", () => {
    // "MAX KRED SUPPLY 5,000,000 KRED"
    expect(MAXIMUM_SUPPLY).toBe(fromKred(5_000_000));
  });

  it("names every term of the equation and nothing else", () => {
    expect([...SUPPLY_TERMS]).toEqual([
      "CENTRAL_BANK_RESERVE",
      "GLOBAL_WALLET",
      "ORGANIZATION_POSITION",
      "PERSONAL_POSITION",
      "TREASURY",
      "REVIEW_FUND",
      "PENDING",
      "NETWORK_RESERVE",
      "PROTOCOL",
      "BURNED",
    ]);
  });

  it("reconciles when the terms sum to the maximum supply", () => {
    const result = reconcileSupply({ balances: balances() });
    expect(result.reconciles).toBe(true);
    expect(result.delta).toBe(0n);
  });

  /**
   * "**No unexplained delta is acceptable.** ... A drift of one kredbit means
   *  one of the following is true, and all of them are serious"
   */
  it("reports a drift of a single kredbit", () => {
    const short = balances({ PROTOCOL: kredbits(1n) });
    const result = reconcileSupply({ balances: short });
    expect(result.reconciles).toBe(false);
    expect(result.delta).toBe(1n);
    expect(result.possibleCauses.length).toBeGreaterThan(0);
  });

  it("names the causes the chapter lists, so a drift arrives with somewhere to look", () => {
    const result = reconcileSupply({ balances: balances({ PROTOCOL: kredbits(1n) }) });
    expect(result.possibleCauses.join(" ")).toMatch(/outside the ledger/i);
    expect(result.possibleCauses.join(" ")).toMatch(/negative balance/i);
  });

  /**
   * "Note that `Burned Supply` is a term in the equation, not an exclusion.
   *  Burned KRED is accounted for as destroyed, it never simply disappears from
   *  the books."
   */
  it("counts burned supply as a term rather than removing it", () => {
    const burned = balances({
      GLOBAL_WALLET: fromKred(770_000),
      BURNED: fromKred(10_000),
    });
    expect(reconcileSupply({ balances: burned }).reconciles).toBe(true);
  });
});

/**
 * 19: Invariants, Liabilities are not in this equation.
 *
 * "Debt is what someone owes. Receivables are what someone is owed. Neither is
 *  money, and adding either to the equation would double-count the KRED that
 *  funds them."
 */
describe("liabilities are absent from the supply equation", () => {
  it("offers no term for debt or receivables", () => {
    expect([...SUPPLY_TERMS]).not.toContain("DEBT");
    expect([...SUPPLY_TERMS]).not.toContain("RECEIVABLE");
  });

  it("reconciles unchanged no matter how much debt exists elsewhere", () => {
    // Credit facility deployment moved reserve into wallets; the matching debt
    // sits outside the equation entirely.
    const deployed = balances({
      CENTRAL_BANK_RESERVE: fromKred(4_090_000),
      GLOBAL_WALLET: fromKred(810_000),
    });
    expect(reconcileSupply({ balances: deployed }).reconciles).toBe(true);
  });
});

/**
 * Law XXVI, Contribution Is Not Currency, and 19: Invariants.
 *
 * "There is no exchange rate at which they could enter this equation."
 */
describe("contribution points cannot enter the equation", () => {
  it("does not accept points as a supply term", () => {
    const withPoints = balances();
    // @ts-expect-error Law XXVI: points are not denominated in KRED and have no supply
    withPoints.PROTOCOL = points(8942);
    expect(withPoints).toBeDefined();
  });
});

describe("a personal position is money, not an exception to the equation", () => {
  /**
   * Law IV as amended by A04. 26: a personal position "is not a lighter tier. It
   * is the same accounting with a different boundary."
   *
   * The strongest evidence for that is arithmetic rather than prose: KRED moved
   * from an organization position to a personal one changes nothing about
   * whether the books balance, because both are terms.
   */
  it("reconciles the same whether value sits in an org position or a personal one", () => {
    const inOrg = reconcileSupply({
      balances: balances({
        GLOBAL_WALLET: fromKred(700_000),
        ORGANIZATION_POSITION: fromKred(80_000),
      }),
    });
    const inPersonal = reconcileSupply({
      balances: balances({
        GLOBAL_WALLET: fromKred(700_000),
        PERSONAL_POSITION: fromKred(80_000),
      }),
    });

    expect(inOrg.reconciles).toBe(true);
    expect(inPersonal.reconciles).toBe(true);
    expect(inPersonal.delta).toBe(inOrg.delta);
  });

  /**
   * The failure the exhaustiveness guard in `supply.ts` exists to prevent: a
   * new account type dropped from the equation, with every test still green and
   * "No unexplained delta is acceptable" quietly no longer holding.
   *
   * Adding `PERSONAL_POSITION` to `AccountType` turned that guard into a
   * compile error naming the missing term, before any test ran.
   */
  it("counts a personal position that would otherwise be an unexplained delta", () => {
    const orphaned = reconcileSupply({
      balances: balances({ PERSONAL_POSITION: fromKred(1) }),
    });
    expect(orphaned.reconciles).toBe(false);
    expect(orphaned.delta).toBe(fromKred(1));
  });
});
