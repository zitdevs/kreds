import { requestJson } from "./http";
import { api } from "./site";

export interface SessionUser {
  readonly id: string;
  /** The person's name. */
  readonly displayName: string;
  /** Their GitHub handle. Mutable, and never an identifier. */
  readonly login: string;
  readonly avatarUrl: string | null;
  readonly gitHubUserId: number;
}

/**
 * Ask the API who the caller is.
 *
 * `requestJson` sends the cookie: the session is set on the API's origin, and a
 * cross-origin fetch drops cookies unless it is asked not to. Without that this
 * always returns null and the cause is invisible.
 */
export async function fetchSession(): Promise<SessionUser | null> {
  try {
    const body = await requestJson<{ user: SessionUser | null }>(api.session);
    return body.user;
  } catch {
    // The API being unreachable is not the same as being signed out, but from
    // here it is the same answer: there is nobody to show.
    return null;
  }
}
