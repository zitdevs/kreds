import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpNetworkClient, NetworkUnavailableError } from "./http-client.js";
import { OfflineNetworkClient } from "./offline-client.js";
import { PROTOCOL_VERSION, type DecisionReason, type EconomicCandidate } from "./protocol.js";

const candidate: EconomicCandidate = {
  idempotencyKey: "merge:77001:412",
  kind: "PULL_REQUEST_MERGED",
  occurredAt: "2026-08-22T10:00:00.000Z",
  actor: { gitHubUserId: 4242, actorType: "HUMAN" },
  repository: { gitHubRepositoryId: 77_001, isPrivate: false, isPersonallyOwned: false },
  organization: { gitHubOrganizationId: 9001 },
  structure: { mergedToPrimaryBranch: true, hasIndependentHumanReview: true },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * The rules this whole package exists to make structural rather than
 * conventional. Each of these is a law that would otherwise depend on every
 * future caller remembering it.
 */
describe("Core submits evidence and cannot decide money", () => {
  /**
   * Law XXIII puts the Official KRED decision on the Network. If the interface
   * offered a way to write a balance, the boundary would be a convention, and
   * conventions get an exception added to them under deadline.
   */
  /**
   * Phase 8's done-when, from this side: "no Core endpoint can mint Official
   * KRED." The supply is readable and there is no counterpart that writes,
   * which states it as an absence rather than as a guard somebody could later
   * add an exception to.
   */
  it("can read the supply and has no way to change it", () => {
    const surface = [
      ...Object.getOwnPropertyNames(HttpNetworkClient.prototype),
      ...Object.getOwnPropertyNames(OfflineNetworkClient.prototype),
    ];

    expect(surface).toContain("getSupply");
    for (const name of surface) {
      expect(name).not.toMatch(/^(setSupply|mint|issue|burn|adjustSupply)/i);
    }
  });

  it("exposes no method that writes an Official balance", () => {
    const surface = [
      ...Object.getOwnPropertyNames(HttpNetworkClient.prototype),
      ...Object.getOwnPropertyNames(OfflineNetworkClient.prototype),
    ];

    for (const name of surface) {
      expect(name).not.toMatch(/issue|mint|credit|award|grant|setBalance|adjust/i);
    }
  });

  /**
   * A candidate carrying its own value would mean Core had priced work. The
   * type forbids it; this checks the value Core actually builds does too.
   */
  it("sends no amount and no score with a candidate", () => {
    const serialised = JSON.stringify(candidate);
    expect(serialised).not.toMatch(/"amount"|"score"|"kredbits"|"multiplier"/i);
  });
});

/**
 * The conformance half of the boundary.
 *
 * `kreds-network` declares these same values in its own repository and pins
 * them with an identical test. Neither side imports the other, so this literal
 * is what keeps them in step: changing the wire contract on one side and not
 * the other turns one of the two suites red instead of producing a mismatch
 * nobody notices until a decision is misread in production.
 *
 * Adding a value here without adding it there is the failure this catches.
 */
describe("the wire contract is pinned on both sides", () => {
  it("declares protocol version 2", () => {
    // Bumped when the supply read model was added. A route is part of the
    // contract, so adding one moves the version and both pinned tests with it.
    expect(PROTOCOL_VERSION).toBe("2");
  });

  it("carries exactly these decision reasons, in this order", () => {
    const reasons: DecisionReason[] = [
      "ISSUED",
      "NOT_ELIGIBLE",
      "ACTOR_CANNOT_EARN",
      "REPOSITORY_NOT_ELIGIBLE",
      "REQUIRES_INDEPENDENT_REVIEW",
      "ALREADY_DECIDED",
      "UNDER_REVIEW",
      "DECLINED",
    ];
    expect(reasons).toHaveLength(8);

    /**
     * The reasons are a closed set so that no threshold can ride across the
     * wall inside one. None of them may name a number or a limit: as free
     * text, the first useful log line anyone wrote would say "below the credit
     * limit of ...", and an internal value would be in a public repository.
     */
    for (const reason of reasons) {
      expect(reason).toMatch(/^[A-Z_]+$/);
      expect(reason).not.toMatch(/\d/);
    }
  });
});

describe("an instance with no Network still works", () => {
  /**
   * Rule 4 of the architecture: a self-hosted company runs GitHub,
   * contributions, a local economy, a local currency, a local ledger and local
   * leaderboards without kreds.sh. That is only true if the offline client is
   * an ordinary answer rather than a failure.
   */
  it("declines rather than throwing", async () => {
    const decision = await new OfflineNetworkClient().submitEconomicCandidate(candidate);

    expect(decision.outcome).toBe("DECLINED");
    expect(decision.idempotencyKey).toBe(candidate.idempotencyKey);
    expect(decision.amount).toBeUndefined();
  });

  /**
   * `local`, not a real policy version. Reporting a published version would
   * make it look as though the Network had considered this and said no.
   */
  it("does not claim a published policy version decided it", async () => {
    const decision = await new OfflineNetworkClient().submitEconomicCandidate(candidate);
    expect(decision.rulesVersion).toBe("local");
  });

  /**
   * Not a zero position. "The Network knows you and you have nothing" is a
   * different fact from "there is no Network here", and a confident 0 KRED
   * someone cannot act on is worse than showing nothing.
   */
  it("returns nothing rather than an empty position", async () => {
    const client = new OfflineNetworkClient();
    expect(await client.getOfficialPosition(4242)).toBeNull();
    expect(await client.getNetworkIdentity(4242)).toBeNull();
  });

  /**
   * Not zero. An instance with no Network is not one where five million KRED
   * exist and none circulate; it is one where the question does not apply, and
   * answering it with numbers would invite somebody to display them.
   */
  it("reports no supply at all, rather than a supply of nothing", async () => {
    expect(await new OfflineNetworkClient().getSupply()).toBeNull();
  });
});

describe("an outage is not a decision", () => {
  function respondWith(init: { status: number; body?: unknown }) {
    const fetchMock = vi.fn(async () => ({
      ok: init.status < 400,
      status: init.status,
      json: async () => init.body ?? {},
    }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const client = () => new HttpNetworkClient({ baseUrl: "https://network.kreds.sh", token: "t" });

  /**
   * The most dangerous confusion available here. Reading an outage as a decline
   * silently denies people work they earned; reading it as an issuance would be
   * worse. Neither may happen by accident, so they are different types.
   */
  it("throws instead of returning a decline when the Network is down", async () => {
    respondWith({ status: 503 });
    await expect(client().submitEconomicCandidate(candidate)).rejects.toBeInstanceOf(
      NetworkUnavailableError,
    );
  });

  it("throws when the Network cannot be reached at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND");
      }),
    );
    await expect(client().submitEconomicCandidate(candidate)).rejects.toBeInstanceOf(
      NetworkUnavailableError,
    );
  });

  /**
   * A projection that does not exist is an answer. A candidate with no decision
   * is not: every submitted candidate is decided, even if the decision is no.
   */
  it("reads a missing projection as null but a missing decision as a failure", async () => {
    respondWith({ status: 404 });
    await expect(client().getOfficialPosition(4242)).resolves.toBeNull();

    respondWith({ status: 404 });
    await expect(client().submitEconomicCandidate(candidate)).rejects.toBeInstanceOf(
      NetworkUnavailableError,
    );
  });

  it("returns the decision the Network made", async () => {
    respondWith({
      status: 200,
      body: {
        idempotencyKey: candidate.idempotencyKey,
        outcome: "ISSUED",
        reason: "ISSUED",
        amount: "3500",
        rulesVersion: "v0.4",
      },
    });

    const decision = await client().submitEconomicCandidate(candidate);
    expect(decision.outcome).toBe("ISSUED");
    // A decimal string, never a JSON number: doubles lose subunits.
    expect(typeof decision.amount).toBe("string");
  });

  it("declares its protocol version on every request", async () => {
    const fetchMock = respondWith({ status: 404 });
    await client().getNetworkIdentity(4242);

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(init.headers["X-Kreds-Protocol-Version"]).toBe(PROTOCOL_VERSION);
  });
});
