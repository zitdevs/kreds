/**
 * The API origin is read at build time and baked into the client bundle, which
 * is why it carries the NEXT_PUBLIC_ prefix. It is not a secret: it is the
 * address the browser has to send the person to.
 */
const apiUrl = process.env["NEXT_PUBLIC_KREDS_API_URL"] ?? "http://localhost:4000";

export const site = {
  name: "Kreds",
  tagline: "The leaderboard for your engineering team.",
  marketing: "https://kreds.sh",
  docs: "https://docs.kreds.sh",
  github: "https://github.com/zitdevs/kreds",
} as const;

export const api = {
  url: apiUrl,
  /** Where the sign-in button sends the browser. The API owns the whole flow. */
  signIn: `${apiUrl}/auth/github`,
  session: `${apiUrl}/auth/session`,
  signOut: `${apiUrl}/auth/signout`,
} as const;
