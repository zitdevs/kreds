import { bigint, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * How a GitHub identity is classified.
 *
 * Mirrors `ActorType` in `@kreds/domain`. Law XVI, Bots Are Not Developers:
 * only `HUMAN` earns, and `UNKNOWN` fails closed toward restriction.
 *
 * The default is `UNKNOWN` rather than `HUMAN` for the same reason: an
 * unclassified actor that turns out to be a bot has already been credited for
 * work it did not do, while one that turns out to be human can be credited
 * retroactively.
 */
export const actorType = pgEnum("actor_type", ["HUMAN", "BOT", "AI_AGENT", "UNKNOWN"]);

/** Mirrors `IdentityStatus` in `@kreds/domain`. See 09: Identity and Unclaimed Accounts. */
export const identityStatus = pgEnum("identity_status", ["CLAIMED", "UNCLAIMED", "RESTRICTED"]);

/**
 * A Kreds account. Created when a human signs in.
 *
 * Law IX, Global KRED Belongs to the Holder: one human, one account,
 * regardless of how many organizations they belong to.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  /** Contact only. Never an identifier: GitHub lets people change and hide it. */
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A GitHub identity, which exists whether or not the human behind it has ever
 * heard of Kreds.
 *
 * 09: Identity and Unclaimed Accounts:
 *
 * > "Identity is keyed on `githubUserId`, not `login`. Logins are renameable
 * >  and reusable; the numeric ID is not. Keying on a mutable handle would let
 * >  an attacker inherit someone else's economic history by claiming a freed
 * >  username."
 *
 * So the primary key is the GitHub numeric id, and `login` is an ordinary
 * column that is expected to change. There is deliberately no unique index on
 * `login`: two rows may legitimately carry the same one over time, because
 * GitHub releases handles for reuse.
 *
 * `bigint` rather than `integer`: GitHub ids are already past the 32-bit range.
 * Read in `number` mode because the values stay inside `Number.MAX_SAFE_INTEGER`
 * for the foreseeable future and `@kreds/domain` types `GitHubUserId` as a
 * branded `number`. Money is the thing that must never be a `number`, and no
 * money lives in this table.
 */
export const gitHubIdentities = pgTable(
  "github_identities",
  {
    gitHubUserId: bigint("github_user_id", { mode: "number" }).primaryKey(),
    /** Display only, and mutable. Never a key. */
    login: text("login").notNull(),
    avatarUrl: text("avatar_url"),
    actorType: actorType("actor_type").notNull().default("UNKNOWN"),
    status: identityStatus("status").notNull().default("UNCLAIMED"),
    /**
     * The Kreds account that claimed this identity.
     *
     * Null while unclaimed, which is a legitimate long-lived state: Law XVII
     * lets an identity earn before it has an account. Deleting the user does
     * not delete the identity or its history, so this is `set null` rather
     * than `cascade`.
     */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    /** When Kreds first observed this identity through verified activity. */
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Claiming looks an identity up by account, and so does rendering a profile.
    index("github_identities_user_id_idx").on(table.userId),
    // Resolving a webhook payload that carries a login but no id.
    index("github_identities_login_idx").on(table.login),
  ],
);
