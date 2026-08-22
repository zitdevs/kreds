import type { ActorType } from "./identity.js";

/**
 * What GitHub itself says about an account.
 *
 * `type` is GitHub's own field: `"User"`, `"Bot"`, `"Organization"`. It is a
 * fact stated by the platform, not something Kreds inferred.
 */
export interface GitHubActor {
  readonly login: string;
  readonly type?: string | undefined;
}

/** GitHub's own naming convention for App accounts. */
const BOT_SUFFIX = "[bot]";

/**
 * Classify an actor from what GitHub states, and nothing else.
 *
 * 03: Actor types says a global registry is maintained for Dependabot,
 * Renovate, GitHub Apps, Claude Code, Copilot agents and other automation. That
 * registry, and every heuristic beyond it, is operational and lives with the
 * Risk Engine. **None of it belongs in this repository**, which is public: a
 * published detection rule is a published way around it.
 *
 * What is left here is the part that needs no heuristic at all. GitHub marks
 * App and bot accounts as `Bot` and suffixes their logins with `[bot]`, and
 * every automation the chapter names is one of those. So Core reads GitHub's
 * own answer and stops:
 *
 * - GitHub says `Bot`, or the login carries the suffix, so the actor is a bot.
 * - GitHub says `User`, and nothing above matched, so the actor is human.
 * - Anything else, including a missing `type`, stays `UNKNOWN`.
 *
 * That last case is the one to be careful about. 03 is explicit about the
 * direction:
 *
 * > "`UNKNOWN` should fail closed toward restriction, not toward reward. An
 * >  unclassified actor that turns out to be a bot has minted KRED that cannot
 * >  be un-minted cleanly; an unclassified actor that turns out to be human can
 * >  be credited retroactively."
 *
 * So an absent `type` is never read as human. It is read as not yet known, and
 * an actor who is not yet known earns nothing until they are.
 *
 * This deliberately cannot produce `AI_AGENT`. An AI agent operating a human
 * account is invisible to every signal GitHub publishes, so claiming to detect
 * one here would be a claim Core cannot support. That classification comes from
 * the Network, and when it arrives it reclassifies the identity, which 24 lists
 * as a trigger that removes points already awarded.
 */
export function classifyActor(actor: GitHubActor): ActorType {
  const type = actor.type?.trim().toUpperCase();

  if (type === "BOT" || actor.login.toLowerCase().endsWith(BOT_SUFFIX)) return "BOT";
  if (type === "USER") return "HUMAN";

  return "UNKNOWN";
}
