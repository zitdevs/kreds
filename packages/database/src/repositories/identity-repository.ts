import { eq } from "drizzle-orm";
import {
  fromDate,
  gitHubLogin,
  gitHubUserId,
  userId as toUserId,
  type ActorType,
  type GitHubIdentity,
  type GitHubUserId,
  type IdentityStatus,
  type User,
} from "@kreds/domain";

import type { Database } from "../client.js";
import { gitHubIdentities, users } from "../schema/index.js";

interface IdentityRow {
  gitHubUserId: number;
  login: string;
  avatarUrl: string | null;
  actorType: ActorType;
  status: IdentityStatus;
  userId: string | null;
  claimedAt: Date | null;
  observedAt: Date;
}

/** Rows in, domain types out. Nothing above this layer sees a database row. */
function toDomain(row: IdentityRow): GitHubIdentity {
  return {
    gitHubUserId: gitHubUserId(row.gitHubUserId),
    login: gitHubLogin(row.login),
    actorType: row.actorType,
    status: row.status,
    ...(row.userId ? { userId: toUserId(row.userId) } : {}),
    claimedAt: row.claimedAt ? fromDate(row.claimedAt) : null,
    observedAt: fromDate(row.observedAt),
  };
}

/** What GitHub tells us about a person, either from OAuth or from a webhook payload. */
export interface GitHubProfile {
  readonly gitHubUserId: GitHubUserId;
  readonly login: string;
  readonly avatarUrl?: string | null;
  readonly displayName?: string | null;
  readonly email?: string | null;
}

export interface ClaimResult {
  readonly user: User;
  readonly identity: GitHubIdentity;
  /**
   * True when this sign-in attached an identity that already existed.
   *
   * 09: Identity: "Your Kreds history starts before your Kreds account does."
   * The product shows a different first screen in this case, because the person
   * arrives to a balance they earned rather than one they were handed.
   */
  readonly hadPriorHistory: boolean;
}

export class IdentityRepository {
  constructor(private readonly db: Database) {}

  async findByGitHubUserId(id: GitHubUserId): Promise<GitHubIdentity | null> {
    const [row] = await this.db
      .select()
      .from(gitHubIdentities)
      .where(eq(gitHubIdentities.gitHubUserId, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  /**
   * Record an identity Kreds has seen acting on GitHub, without claiming it.
   *
   * Law XVII, Unclaimed Identity Can Have History: a GitHub identity may earn
   * before it has a Kreds account, so observing one is a normal write rather
   * than a special case. Law XVIII keeps it passive until someone signs in.
   *
   * The login is refreshed on every observation because GitHub handles change,
   * and a stale one in the interface is confusing. The row is still keyed on
   * the numeric id, so refreshing the display name changes nothing that
   * matters.
   *
   * Note what this does **not** do: it never sets `actorType`. Classification
   * comes from the registry described in 03: Pull Requests, which is not built
   * yet, so an observed identity stays `UNKNOWN` and therefore earns nothing.
   * That is the correct failure direction, and it is Law XVI's own reasoning:
   * crediting a bot cannot be cleanly undone, while crediting a human late can.
   */
  async observe(profile: GitHubProfile): Promise<GitHubIdentity> {
    const [row] = await this.db
      .insert(gitHubIdentities)
      .values({
        gitHubUserId: profile.gitHubUserId,
        login: profile.login,
        avatarUrl: profile.avatarUrl ?? null,
      })
      .onConflictDoUpdate({
        target: gitHubIdentities.gitHubUserId,
        set: { login: profile.login, avatarUrl: profile.avatarUrl ?? null },
      })
      .returning();

    if (!row) throw new Error(`failed to observe GitHub identity ${profile.gitHubUserId}.`);
    return toDomain(row);
  }

  /**
   * Attach a Kreds account to a GitHub identity, creating the account if this
   * is the first sign-in.
   *
   * Three cases, and the middle one is the point of the whole design:
   *
   * 1. Already claimed. Return the existing account. Signing in again is not an
   *    event.
   * 2. Observed but unclaimed. Create the account and attach it. Whatever the
   *    identity earned while unclaimed is already attached to this row, so it
   *    comes along without being moved (Law XVII).
   * 3. Never seen. Create both.
   *
   * The whole thing runs in one transaction. A half-applied claim would leave
   * an account with no identity or an identity pointing at nothing, and the
   * second is indistinguishable from an unclaimed identity that has quietly
   * lost its history.
   */
  async claim(profile: GitHubProfile): Promise<ClaimResult> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(gitHubIdentities)
        .where(eq(gitHubIdentities.gitHubUserId, profile.gitHubUserId))
        .limit(1);

      if (existing?.status === "CLAIMED" && existing.userId) {
        const [account] = await tx
          .select()
          .from(users)
          .where(eq(users.id, existing.userId))
          .limit(1);
        if (account) {
          return {
            user: {
              id: toUserId(account.id),
              gitHubUserId: gitHubUserId(existing.gitHubUserId),
              displayName: account.displayName,
              createdAt: fromDate(account.createdAt),
            },
            identity: toDomain(existing),
            hadPriorHistory: false,
          };
        }
      }

      const [account] = await tx
        .insert(users)
        .values({
          displayName: profile.displayName?.trim() || profile.login,
          email: profile.email ?? null,
        })
        .returning();
      if (!account) throw new Error(`failed to create a Kreds account for ${profile.login}.`);

      const [identity] = await tx
        .insert(gitHubIdentities)
        .values({
          gitHubUserId: profile.gitHubUserId,
          login: profile.login,
          avatarUrl: profile.avatarUrl ?? null,
          status: "CLAIMED",
          userId: account.id,
          claimedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: gitHubIdentities.gitHubUserId,
          set: {
            login: profile.login,
            avatarUrl: profile.avatarUrl ?? null,
            status: "CLAIMED",
            userId: account.id,
            claimedAt: new Date(),
          },
        })
        .returning();
      if (!identity) throw new Error(`failed to claim GitHub identity ${profile.gitHubUserId}.`);

      return {
        user: {
          id: toUserId(account.id),
          gitHubUserId: gitHubUserId(identity.gitHubUserId),
          displayName: account.displayName,
          createdAt: fromDate(account.createdAt),
        },
        identity: toDomain(identity),
        hadPriorHistory: existing !== undefined && existing.status !== "CLAIMED",
      };
    });
  }
}
