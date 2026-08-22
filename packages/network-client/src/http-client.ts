import {
  PROTOCOL_VERSION,
  type EconomicCandidate,
  type EconomicDecision,
  type KredsNetworkClient,
  type NetworkIdentity,
  type OfficialPosition,
} from "./protocol.js";

export interface HttpNetworkClientOptions {
  /** Origin of the Network API. No trailing slash. */
  readonly baseUrl: string;
  /** Issued to this instance by the Network. */
  readonly token: string;
  /** Milliseconds. The Network answering slowly must not hold a webhook open. */
  readonly timeoutMs?: number;
}

/**
 * Thrown when the Network could not be reached or refused the call.
 *
 * Distinct from a decision. A `DECLINED` decision is the Network answering; this
 * is the Network not answering, and the two must never be collapsed: treating
 * an outage as a decline would silently deny people work they had earned, and
 * treating it as an issuance would be worse.
 */
export class NetworkUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkUnavailableError";
  }
}

/**
 * Core's HTTP implementation of the Network protocol.
 *
 * The only path from Core to Official KRED, and it is one-directional by
 * construction: Core submits evidence and reads projections. There is no method
 * here that writes an Official balance, because Core has no authority to
 * (Law XXIII), and a client that offered the call would make the boundary a
 * convention rather than a fact.
 *
 * Deliberately thin. No retries and no queue: retrying inside a webhook handler
 * is how a ten second GitHub timeout becomes a thirty second one. Retries
 * belong to the caller, which has the idempotency key that makes them safe.
 */
export class HttpNetworkClient implements KredsNetworkClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor({ baseUrl, token, timeoutMs = 5_000 }: HttpNetworkClientOptions) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  private async call<T>(path: string, init: RequestInit): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          // The version travels on every request. A Network that has moved on
          // can refuse an old Core explicitly rather than misreading it.
          "X-Kreds-Protocol-Version": PROTOCOL_VERSION,
        },
      });

      // A projection that does not exist is an answer, not a failure.
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new NetworkUnavailableError(`The Kreds Network answered ${response.status}.`);
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof NetworkUnavailableError) throw error;
      // An abort and a DNS failure are the same thing to a caller: no answer.
      throw new NetworkUnavailableError(`The Kreds Network is unreachable: ${String(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async submitEconomicCandidate(candidate: EconomicCandidate): Promise<EconomicDecision> {
    const decision = await this.call<EconomicDecision>("/v1/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candidate),
    });
    // Unlike the projections, a missing decision is not a valid answer: every
    // submitted candidate is decided, even if the decision is to decline.
    if (!decision) {
      throw new NetworkUnavailableError("The Kreds Network returned no decision.");
    }
    return decision;
  }

  async getOfficialPosition(gitHubUserId: number): Promise<OfficialPosition | null> {
    return this.call<OfficialPosition>(`/v1/positions/${gitHubUserId}`, { method: "GET" });
  }

  async getNetworkIdentity(gitHubUserId: number): Promise<NetworkIdentity | null> {
    return this.call<NetworkIdentity>(`/v1/identities/${gitHubUserId}`, { method: "GET" });
  }
}
