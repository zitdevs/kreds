import { describe, expect, it } from "vitest";

import { gitHubLogin, gitHubUserId } from "../primitives/ids.js";
import { fromIso } from "../primitives/time.js";
import {
  ACTOR_TYPES,
  IDENTITY_STATUSES,
  canPerformVoluntaryEconomicAction,
  canReceiveVerifiedEarnings,
  canReceiveVoluntaryTransfer,
  earnsEconomicRewards,
  type GitHubIdentity,
} from "./identity.js";

const identity = (over: Partial<GitHubIdentity> = {}): GitHubIdentity => ({
  gitHubUserId: gitHubUserId(4242),
  login: gitHubLogin("maria"),
  actorType: "HUMAN",
  status: "UNCLAIMED",
  claimedAt: null,
  observedAt: fromIso("2026-08-01T00:00:00Z"),
  ...over,
});

/**
 * Law XVI, Bots Are Not Developers.
 *
 * "Bots, GitHub Apps, and AI agents do not receive human economic rewards."
 */
describe("only eligible humans earn", () => {
  it("classifies every GitHub identity into the four actor types", () => {
    expect([...ACTOR_TYPES]).toEqual(["HUMAN", "BOT", "AI_AGENT", "UNKNOWN"]);
  });

  it("rewards humans and nobody else", () => {
    expect(earnsEconomicRewards("HUMAN")).toBe(true);
    expect(earnsEconomicRewards("BOT")).toBe(false);
    expect(earnsEconomicRewards("AI_AGENT")).toBe(false);
  });

  /**
   * 03: Pull Requests, Actor types:
   *
   * "UNKNOWN should fail closed toward restriction, not toward reward. An
   *  unclassified actor that turns out to be a bot has minted KRED that cannot
   *  be un-minted cleanly; an unclassified actor that turns out to be human can
   *  be credited retroactively."
   */
  it("fails closed on an unclassified actor", () => {
    expect(earnsEconomicRewards("UNKNOWN")).toBe(false);
  });
});

/**
 * Law XVII, Unclaimed Identity Can Have History.
 *
 * "A GitHub identity may earn verified KRED before claiming a Kreds account."
 */
describe("an unclaimed identity has history before it has an account", () => {
  it("lists the three identity statuses", () => {
    expect([...IDENTITY_STATUSES]).toEqual(["CLAIMED", "UNCLAIMED", "RESTRICTED"]);
  });

  it("lets an unclaimed human receive value it verifiably earned", () => {
    expect(canReceiveVerifiedEarnings(identity())).toBe(true);
  });

  it("still refuses a bot, claimed or not", () => {
    expect(canReceiveVerifiedEarnings(identity({ actorType: "BOT", status: "CLAIMED" }))).toBe(
      false,
    );
  });

  it("refuses a restricted identity", () => {
    expect(canReceiveVerifiedEarnings(identity({ status: "RESTRICTED" }))).toBe(false);
  });
});

/**
 * Law XVIII, Unclaimed Accounts Are Passive.
 *
 * "An unclaimed identity can *receive* verified GitHub-derived value. It cannot
 *  send, donate, exchange, withdraw, or create economies. Voluntary transfers
 *  *to* unclaimed identities are also blocked."
 */
describe("an unclaimed identity is passive in both directions", () => {
  it("cannot act voluntarily", () => {
    expect(canPerformVoluntaryEconomicAction(identity())).toBe(false);
  });

  it("can act once claimed", () => {
    const claimed = identity({ status: "CLAIMED", claimedAt: fromIso("2026-08-20T00:00:00Z") });
    expect(canPerformVoluntaryEconomicAction(claimed)).toBe(true);
  });

  /**
   * 09: Identity, No voluntary transfers to unclaimed users. Without this an
   * attacker could spray value into fabricated identities and claim them later.
   */
  it("cannot be sent a voluntary transfer while unclaimed", () => {
    expect(canReceiveVoluntaryTransfer(identity())).toBe(false);
  });

  it("can be sent one once claimed", () => {
    const claimed = identity({ status: "CLAIMED", claimedAt: fromIso("2026-08-20T00:00:00Z") });
    expect(canReceiveVoluntaryTransfer(claimed)).toBe(true);
  });

  it("separates receiving earnings from receiving a gift", () => {
    const unclaimed = identity();
    expect(canReceiveVerifiedEarnings(unclaimed)).toBe(true);
    expect(canReceiveVoluntaryTransfer(unclaimed)).toBe(false);
  });
});
