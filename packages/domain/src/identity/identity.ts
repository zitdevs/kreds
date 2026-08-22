import type { GitHubLogin, GitHubUserId, UserId } from "../primitives/ids.js";
import type { Timestamp } from "../primitives/time.js";

/**
 * How a GitHub identity is classified.
 *
 * Law XVI, Bots Are Not Developers:
 *
 * > "Bots, GitHub Apps, and AI agents do not receive human economic rewards."
 *
 * 03: Pull Requests keeps a global registry for Dependabot, Renovate, GitHub
 * Apps, Claude Code, Copilot agents and other automation. They may appear in
 * history at `0 KRED`; what they may not do is earn.
 */
export const ACTOR_TYPES = ["HUMAN", "BOT", "AI_AGENT", "UNKNOWN"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

/**
 * 09: Identity and Unclaimed Accounts.
 *
 * - `UNCLAIMED`: observed by Kreds, never signed in. Passive (Law XVIII).
 * - `CLAIMED`: linked to a signed-in Kreds account.
 * - `RESTRICTED`: barred from economic participation.
 */
export const IDENTITY_STATUSES = ["CLAIMED", "UNCLAIMED", "RESTRICTED"] as const;
export type IdentityStatus = (typeof IDENTITY_STATUSES)[number];

/**
 * A GitHub identity, which exists whether or not the human behind it has ever
 * heard of Kreds.
 *
 * Keyed on `gitHubUserId`, never on `login`: logins are renameable and
 * reusable, and keying on a mutable handle would let an attacker inherit
 * someone else's economic history by claiming a freed username
 * (09: Identity, Kreds identity).
 */
export interface GitHubIdentity {
  readonly gitHubUserId: GitHubUserId;
  /** Display only. Never a key. */
  readonly login: GitHubLogin;
  readonly actorType: ActorType;
  readonly status: IdentityStatus;
  /** The Kreds account this identity was claimed by, if any. */
  readonly userId?: UserId;
  readonly claimedAt: Timestamp | null;
  /** When Kreds first observed this identity through verified activity. */
  readonly observedAt: Timestamp;
}

/**
 * A claimed Kreds account.
 *
 * Law IX, Global KRED Belongs to the Holder: one human, one global wallet,
 * regardless of how many organizations they belong to.
 */
export interface User {
  readonly id: UserId;
  readonly gitHubUserId: GitHubUserId;
  readonly displayName: string;
  readonly createdAt: Timestamp;
}

/**
 * Law XVI. Only `HUMAN` earns.
 *
 * `UNKNOWN` fails closed: an unclassified actor that turns out to be a bot has
 * minted KRED that cannot be un-minted cleanly, while an unclassified actor
 * that turns out to be human can be credited retroactively. The asymmetry has
 * one correct default.
 */
export function earnsEconomicRewards(actorType: ActorType): boolean {
  return actorType === "HUMAN";
}

/**
 * Whether this identity may receive value that GitHub verified it earned.
 *
 * Law XVII: an unclaimed identity may hold earned value waiting for it. What
 * it may not do is be a bot (Law XVI) or be restricted.
 */
export function canReceiveVerifiedEarnings(identity: GitHubIdentity): boolean {
  return earnsEconomicRewards(identity.actorType) && identity.status !== "RESTRICTED";
}

/**
 * Whether this identity may initiate a voluntary economic action: sending,
 * donating, exchanging, withdrawing, or creating an economy.
 *
 * Law XVIII, Unclaimed Accounts Are Passive. Every action available to an
 * unclaimed identity is one GitHub verified on their behalf.
 */
export function canPerformVoluntaryEconomicAction(identity: GitHubIdentity): boolean {
  return identity.status === "CLAIMED" && earnsEconomicRewards(identity.actorType);
}

/**
 * Whether this identity may be the *recipient* of a voluntary transfer.
 *
 * 09: Identity, No voluntary transfers to unclaimed users. The distinction from
 * `canReceiveVerifiedEarnings` is the whole anti-farming point: an unclaimed
 * identity can receive value only as the verified consequence of work it
 * actually did on GitHub, never as a gift. Otherwise an attacker could spray
 * value into fabricated identities and claim them later.
 */
export function canReceiveVoluntaryTransfer(identity: GitHubIdentity): boolean {
  return canPerformVoluntaryEconomicAction(identity);
}
