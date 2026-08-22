/**
 * What Kreds asks GitHub for, and why it asks for so little.
 *
 * A04 requires the narrowest scope the economy needs, and the economy needs
 * different amounts depending on what a user wants ingested. That is not a
 * detail: 26's access ladder is built on it, and "the frictionless path is the
 * open path" is only true if the open path asks for nothing extra.
 *
 * ```text
 * Public repositories                          no additional grant
 * Personal private repositories                the owner's own broader grant
 * Org private, no access restrictions          the same broader grant
 * Org private, access restrictions enabled     one org-wide approval
 * ```
 *
 * Signing in and having private work ingested are therefore two different
 * decisions with two different grants, rather than one grant sized for the
 * larger case. A user who never opts in has a token that cannot read their code
 * at all, which is what the self-hosting guide already promises them.
 */

/**
 * Sign-in. Deliberately unchanged by A04.
 *
 * Public activity is readable with this, which is the whole open-source path.
 * Widening it here would silently break an existing promise for every
 * installation, so private ingestion got its own grant instead.
 */
export const SIGN_IN_SCOPES = ["read:user", "read:org"] as const;

/**
 * The additional grant for private work, requested only when a user asks for it.
 *
 * `repo` is GitHub's coarsest read scope and there is no narrower one that
 * reaches private repository contents, which is worth stating plainly rather
 * than implying Kreds asked for something finer than it did.
 */
export const PRIVATE_INGESTION_SCOPES = ["read:user", "read:org", "repo"] as const;

export type Scope = (typeof PRIVATE_INGESTION_SCOPES)[number];

/**
 * What an authorization reaches.
 *
 * `PUBLIC_ONLY` is the default and the one most users will ever have. The
 * distinction is read from the scopes GitHub actually granted, never from what
 * Kreds asked for: a user can narrow a grant on GitHub's own screen, and
 * assuming otherwise would have Kreds attempting reads it has no right to.
 */
export type IngestionReach = "PUBLIC_ONLY" | "INCLUDES_PRIVATE";

export function reachOf(granted: readonly string[]): IngestionReach {
  return granted.includes("repo") ? "INCLUDES_PRIVATE" : "PUBLIC_ONLY";
}

/**
 * Whether Kreds may read this repository under this authorization.
 *
 * Fails closed on an unknown visibility. 25 gates issuance and the safe
 * direction is to withhold, and a repository whose visibility Kreds could not
 * determine is one it should not be reading either.
 */
export function mayRead(
  reach: IngestionReach,
  visibility: "public" | "private" | "unknown",
): boolean {
  if (visibility === "public") return true;
  if (visibility === "private") return reach === "INCLUDES_PRIVATE";
  return false;
}
