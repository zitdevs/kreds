import { z } from "zod";

/**
 * An optional secret, where "not set" and "set to nothing" mean the same thing.
 *
 * `z.string().min(1).optional()` is not enough, and the difference matters. A
 * secrets manager holds a key before it holds a value: someone creates
 * `GITHUB_APP_PRIVATE_KEY`, saves, and pastes the key in a moment later. That
 * intermediate state syncs an empty string, `optional()` only forgives
 * `undefined`, and the whole API refuses to boot on a variable nobody has
 * finished filling in.
 *
 * Since these values are synced to production and a save triggers a deploy,
 * that failure would take identity down with it. An empty value means the same
 * thing as an absent one: this instance has no GitHub App yet.
 */
const optionalSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

/**
 * The environment this service needs, validated once at boot.
 *
 * Every name here already appears in the repository's `.env.example`, which is
 * published in the self-hosting guide. Inventing a second spelling for a
 * variable somebody has already put in their `.env` is how a self-hoster ends
 * up debugging a working configuration.
 *
 * Validation is strict and happens at startup rather than at first use. A
 * missing signing key should stop the process, not surface as a broken sign-in
 * an hour later.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  /** Public origin of the API itself. OAuth callbacks are built from this. */
  KREDS_API_URL: z.string().url(),
  /** The marketing site. Not where a sign-in lands. */
  KREDS_URL: z.string().url(),
  /**
   * The product. Where a finished sign-in returns to, and the one origin
   * allowed to read a session, since it is the only thing that needs one.
   */
  KREDS_APP_URL: z.string().url(),

  /**
   * Session signing key.
   *
   * Thirty-two bytes because `.env.example` tells people to generate it with
   * `openssl rand -base64 32`, and a key shorter than that quietly weakens
   * every session the instance issues.
   */
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),

  DATABASE_URL: z.string().url(),

  /**
   * The OAuth App. Identifies the person signing in, and never touches code.
   *
   * Trimmed, unlike `AUTH_SECRET`. These two are sent to GitHub and compared
   * there byte for byte, so a value pasted into a dashboard with a trailing
   * newline fails every exchange with `incorrect_client_credentials` while
   * looking correct in the interface. `AUTH_SECRET` is only ever compared
   * against itself, so whitespace in it is harmless and trimming it would
   * invalidate every session already issued under the untrimmed key.
   */
  AUTH_GITHUB_ID: z.string().trim().min(1),
  AUTH_GITHUB_SECRET: z.string().trim().min(1),

  /**
   * The GitHub App. Answers "what is happening in your repositories", which is
   * a different grant from the OAuth App above and a different set of secrets.
   *
   * All three are optional, deliberately, and this is the one place in the
   * schema where something is. An instance with no App configured is a
   * legitimate state: it is every deployment before an admin has created one,
   * including a self-hoster following the guide in order. Making these
   * required would mean the API refuses to boot the moment this code ships,
   * taking identity down with it over a feature nobody has switched on yet.
   *
   * The webhook endpoint refuses clearly when they are missing, so the failure
   * lands on the one request that needs them instead of on the whole process.
   */
  GITHUB_APP_ID: optionalSecret,
  /**
   * The App's private key, in PEM.
   *
   * Accepted in three shapes because dashboards mangle newlines differently:
   * real newlines, literal `\n` escapes, or the whole PEM base64 encoded.
   * See `readPrivateKey`.
   */
  GITHUB_APP_PRIVATE_KEY: optionalSecret,
  GITHUB_WEBHOOK_SECRET: optionalSecret,

  /**
   * The key that seals delegated authorization tokens at rest.
   *
   * 32 bytes of base64. Optional, and an instance without it simply cannot use
   * the delegated-query ingestion path: webhooks keep working, and no token is
   * stored anywhere. That is better than generating one, which would change on
   * restart and silently orphan every stored authorization.
   */
  TOKEN_ENCRYPTION_KEY: optionalSecret,

  /**
   * Contribution Point allowances for contexts with no independent observer.
   *
   * 24: those caps "are operational policy and are not published", and this
   * repository is public, so they cannot ship in it. An instance that does not
   * set them awards nothing in unobserved contexts rather than awarding without
   * a bound (Law XIX).
   */
  UNOBSERVED_POINTS_PER_DAY: z.coerce.number().int().nonnegative().optional(),
  UNOBSERVED_POINTS_PER_MONTH: z.coerce.number().int().nonnegative().optional(),

  /**
   * How much provider traffic one user may cause.
   *
   * A04 moved this decision to Kreds. Under organization webhooks GitHub
   * decided how much arrived; under delegated query one account with several
   * thousand repositories would consume the whole allowance and starve
   * everybody else.
   */
  DELEGATED_QUERY_REQUESTS_PER_WINDOW: z.coerce.number().int().positive().default(60),
  DELEGATED_QUERY_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const problems = parsed.error.issues
    .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment:\n${problems}\n\nSee .env.example for every variable.`);
}
