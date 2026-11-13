/**
 * Every call the app makes to the API goes through here.
 *
 * Two reasons it is one function rather than `fetch` at each call site. The
 * session cookie lives on the API's origin, so every request needs
 * `credentials: "include"`, and forgetting it once fails silently as "signed
 * out". And it is the one seam where development fixtures can stand in for the
 * API without any component knowing.
 */

/**
 * Development fixtures, for designing states the API cannot easily be made to
 * produce. `NODE_ENV` is inlined at build time, so in a production build this
 * is the constant `false`, and the dynamic import below is dropped with the
 * branch: the fixture module is never shipped.
 */
const fixturesEnabled =
  process.env.NODE_ENV === "development" && process.env["NEXT_PUBLIC_KREDS_FIXTURES"] === "1";

/** A response the API answered with something other than success. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** True when the API says there is nobody signed in. */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

async function send(url: string, init: RequestInit): Promise<Response> {
  if (fixturesEnabled) {
    const { fixtureResponse } = await import("./dev-fixtures");
    return fixtureResponse(url, init);
  }
  return fetch(url, {
    ...init,
    credentials: "include",
    headers: { Accept: "application/json", ...init.headers },
  });
}

/**
 * Call the API and read its JSON, or throw an `ApiError`.
 *
 * A network failure (the API is down, or CORS refused) is reported as status 0,
 * so callers can tell "you are signed out" from "we could not ask".
 */
export async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await send(url, init);
  } catch {
    throw new ApiError(0, "Kreds could not be reached.");
  }
  if (!response.ok) {
    throw new ApiError(response.status, await messageOf(response));
  }
  // Sign-out answers 204 with no body; there is nothing to parse.
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Nest answers errors as `{ message }`; anything else falls back to the status text. */
async function messageOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string") return body.message;
  } catch {
    // Not JSON. The status text is the best there is.
  }
  return response.statusText || `Request failed with ${response.status}.`;
}

/**
 * What to tell a person about a failed request. The API's own message is
 * written for developers, so it is not shown as is.
 */
export function describeFailure(error: unknown): string {
  if (error instanceof ApiError && error.status === 0) {
    return "Kreds could not be reached. Check your connection and try again.";
  }
  if (isUnauthorized(error)) return "Your session has ended. Sign in again to continue.";
  return "Something went wrong on our side. Try again in a moment.";
}
