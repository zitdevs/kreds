import { describe, expect, it } from "vitest";

import {
  accountId,
  economyId,
  idempotencyKey,
  ledgerEntryId,
  organizationId,
  rulesVersion,
} from "../primitives/ids.js";
import { fromKred } from "../primitives/money.js";
import { fromIso, timestamp, type Timestamp } from "../primitives/time.js";
import { entry, type LedgerEntry } from "../ledger/ledger.js";
import { due, hasSettled, settlementWindow, settlesAt } from "./settlement.js";

const HOUR = 60 * 60 * 1000;
const CREATED = fromIso("2026-08-22T00:00:00Z");
const DAY = settlementWindow(24);

let sequence = 0;
const line = (over: Partial<LedgerEntry> = {}): LedgerEntry => {
  sequence += 1;
  return entry({
    id: ledgerEntryId(`entry_${sequence}`),
    economyId: economyId("kreds-network"),
    organizationId: organizationId("org_zitdevs"),
    accountId: accountId("acct_isaac"),
    direction: "CREDIT",
    amount: fromKred(30),
    // Issuance from the Central Bank reserve, which is what a merge reward is.
    type: "DISTRIBUTION",
    sourceType: "PULL_REQUEST_MERGED",
    sourceId: String(sequence),
    counterpartyAccountId: accountId("acct_reserve"),
    rulesVersion: rulesVersion("v0.4"),
    idempotencyKey: idempotencyKey(`key_${sequence}`),
    status: "PENDING",
    settledAt: null,
    createdAt: CREATED,
    metadata: {},
    ...over,
  });
};

const after = (hours: number): Timestamp => timestamp(CREATED + hours * HOUR);

describe("a window is a length of time, and never zero", () => {
  /**
   * 11: Debt, Settlement and Extraction Protection: "New rewards do not become
   * immediately withdrawable." A window of zero is not a short window, it is
   * the absence of one.
   */
  it("refuses a window that elapses instantly", () => {
    expect(() => settlementWindow(0)).toThrow(RangeError);
  });

  it("refuses a window that runs backwards", () => {
    expect(() => settlementWindow(-24)).toThrow(RangeError);
  });

  it("converts the published unit, which is hours", () => {
    expect(settlementWindow(24).milliseconds).toBe(24 * HOUR);
  });
});

describe("the window runs from when value was earned", () => {
  /**
   * Not from when a worker happens to look. An instance that was offline for a
   * week must not thereby extend anybody's window, and one that sweeps twice a
   * second must not shorten it.
   */
  it("is due one window after the entry was created", () => {
    expect(settlesAt(line(), DAY)).toBe(CREATED + 24 * HOUR);
  });

  it("is unaffected by when the question is asked", () => {
    const pending = line();
    expect(settlesAt(pending, DAY)).toBe(settlesAt(pending, DAY));
    expect(hasSettled(pending, DAY, after(1000))).toBe(true);
  });

  it("holds value for the whole window", () => {
    const pending = line();
    expect(hasSettled(pending, DAY, after(23))).toBe(false);
    expect(hasSettled(pending, DAY, after(23.99))).toBe(false);
  });

  /**
   * Inclusive on purpose. Excluding the boundary would make the effective
   * window "24 hours plus however long until the next sweep", which is a
   * different number from the published one.
   */
  it("releases it the moment the window is served, not a sweep later", () => {
    expect(hasSettled(line(), DAY, after(24))).toBe(true);
  });
});

describe("a sweep moves what is due and nothing else", () => {
  it("takes the entries that have served their window", () => {
    const ready = line();
    const fresh = line({ createdAt: after(20) });
    expect(due([ready, fresh], DAY, after(25))).toEqual([ready]);
  });

  /**
   * Re-stamping a settled entry would move a historical fact, and 06: Ledger
   * does not permit history to be repaired in place.
   */
  it("leaves already-settled entries alone", () => {
    const settled = line({ status: "SETTLED", settledAt: after(24) });
    expect(due([settled], DAY, after(1000))).toEqual([]);
  });

  it("takes nothing at all before any window has run", () => {
    expect(due([line(), line(), line()], DAY, after(1))).toEqual([]);
  });

  /**
   * A longer window is what 11 calls for where risk is elevated. The exact
   * lengths are operational policy and are not published, so this file only
   * proves the mechanism respects whatever length it is handed.
   */
  it("respects a longer window without knowing why it is longer", () => {
    const ready = line();
    expect(due([ready], DAY, after(30))).toEqual([ready]);
    expect(due([ready], settlementWindow(72), after(30))).toEqual([]);
  });
});
