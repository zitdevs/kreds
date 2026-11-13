/**
 * The API origin is read at build time and baked into the client bundle, which
 * is why it carries the NEXT_PUBLIC_ prefix. It is not a secret: it is the
 * address the browser has to send the person to.
 */
const apiUrl = process.env["NEXT_PUBLIC_KREDS_API_URL"] ?? "http://localhost:4000";

export const site = {
  name: "Kreds",
  tagline: "The currency of open-source contribution.",
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
  /**
   * The opt-in for private work. A full-page navigation, never a fetch: the API
   * sends the browser on to GitHub's consent screen and GitHub sends it back
   * here with `?grant=`.
   */
  connectPrivate: `${apiUrl}/auth/github/private-ingestion`,
  /** The global contribution leaderboard. Public: no session needed. */
  leaderboard: `${apiUrl}/contributions/leaderboard`,
  myContributions: `${apiUrl}/contributions/me`,
  mySummary: `${apiUrl}/contributions/me/summary`,
  accessStatus: (gitHubUserId: number) => `${apiUrl}/access/status/${gitHubUserId}`,
  authorization: (gitHubUserId: number) => `${apiUrl}/access/authorization/${gitHubUserId}`,
} as const;
