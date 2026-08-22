import { describe, expect, it, vi } from "vitest";

import { RelevanceService } from "./relevance.service.js";

const SIGNALS = {
  stars: 800,
  forks: 150,
  ageDays: 1200,
  contributors: 30,
  externalContributors: 0,
  mergedPullRequests: 900,
  issueActivity: 400,
  releases: 40,
  commits: 5000,
};

function harness(over: Record<string, unknown> = {}) {
  const installations = {
    findRepository: vi.fn(async () => ({ id: "r", nameWithOwner: "zitdevs/kreds" })),
    findInstallationFor: vi.fn(async () => 48_291_037),
    findRelevance: vi.fn(async () => null),
    recordRelevance: vi.fn(async () => undefined),
    ...over,
  };
  const signals = {
    fetch: vi.fn(async () => ({ signals: SIGNALS, unfetched: ["externalContributors"] })),
  };
  const service = new RelevanceService(installations as never, signals as never);
  return { service, installations, signals };
}

describe("measuring", () => {
  it("fetches, computes and stores", async () => {
    const { service, installations, signals } = harness();
    const result = await service.measure(77_001);

    expect(signals.fetch).toHaveBeenCalledOnce();
    expect(installations.recordRelevance).toHaveBeenCalledOnce();
    expect(result?.score).toBeGreaterThan(0);
  });

  /**
   * Kreds does not ask for the organization members permission, so it cannot
   * tell an external contributor from a member. Reported rather than guessed:
   * this is one of the strongest signals a repository can have, and inventing
   * it would be inventing legitimacy.
   */
  it("reports the signals it could not fetch", async () => {
    const { service } = harness();
    const result = await service.measure(77_001);
    expect(result?.unfetched).toContain("externalContributors");
  });

  /**
   * Absence rather than zero. "Kreds has not measured this" and "this
   * repository has no history" are different facts, and reporting the first as
   * the second would be a judgement Kreds has not earned.
   */
  it("returns nothing for a repository it does not cover", async () => {
    const { service } = harness({ findRepository: vi.fn(async () => null) });
    expect(await service.measure(77_001)).toBeNull();
  });

  it("returns nothing when no installation covers the repository any more", async () => {
    const { service } = harness({ findInstallationFor: vi.fn(async () => null) });
    expect(await service.measure(77_001)).toBeNull();
  });

  /** GitHub being unreachable is not evidence about the repository. */
  it("returns nothing rather than a zero score when GitHub cannot be reached", async () => {
    const { installations } = harness();
    const failing = new RelevanceService(
      installations as never,
      {
        fetch: vi.fn(async () => {
          throw new Error("unreachable");
        }),
      } as never,
    );

    expect(await failing.measure(77_001)).toBeNull();
    expect(installations.recordRelevance).not.toHaveBeenCalled();
  });
});

describe("caching", () => {
  /**
   * 25: trust must move gradually so there is no single number to buy. A
   * measurement recomputed on every read would be one somebody could watch
   * respond to what they just did.
   */
  it("serves a recent measurement without asking GitHub again", async () => {
    const { service, signals } = harness({
      findRelevance: vi.fn(async () => ({
        score: 62,
        breadth: 8,
        signals: { unfetched: [] },
        measuredAt: new Date(),
      })),
    });

    const result = await service.forRepository(77_001);
    expect(result?.score).toBe(62);
    expect(signals.fetch).not.toHaveBeenCalled();
  });

  it("re-measures when the stored value has gone stale", async () => {
    const stale = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const { service, signals } = harness({
      findRelevance: vi.fn(async () => ({
        score: 10,
        breadth: 2,
        signals: {},
        measuredAt: stale,
      })),
    });

    await service.forRepository(77_001);
    expect(signals.fetch).toHaveBeenCalledOnce();
  });
});

describe("relevance never becomes trust", () => {
  /**
   * The safeguard. Relevance is computed from public signals with open source
   * weights; the tier gates Official issuance and is decided from signals this
   * side cannot see. A service that could write one from the other would put
   * issuance behind numbers anyone can read off a GitHub page.
   */
  it("never writes a trust tier", async () => {
    const { service, installations } = harness();
    await service.measure(77_001);

    const written = JSON.stringify(installations.recordRelevance.mock.calls);
    for (const tier of ["UNTRUSTED", "ESTABLISHED", "RELEVANT", "HIGH_TRUST", "trustTier"]) {
      expect(written).not.toContain(tier);
    }
  });

  it("exposes no method that mentions trust or eligibility", () => {
    for (const name of Object.getOwnPropertyNames(RelevanceService.prototype)) {
      expect(name).not.toMatch(/trust|tier|eligib|multiplier/i);
    }
  });
});
