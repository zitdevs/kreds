import { z } from "zod";

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

  /** The OAuth App. Identifies the person signing in, and never touches code. */
  AUTH_GITHUB_ID: z.string().min(1),
  AUTH_GITHUB_SECRET: z.string().min(1),
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
