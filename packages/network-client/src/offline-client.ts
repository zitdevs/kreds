import type {
  EconomicCandidate,
  EconomicDecision,
  KredsNetworkClient,
  NetworkIdentity,
  OfficialPosition,
} from "./protocol.js";

/**
 * The default. A Kreds instance that is not part of the Official Network.
 *
 * This exists because of a rule, not as a convenience for tests:
 *
 * > A self-hosted company must be able to run GitHub, contributions, a local
 * > economy, a local currency, a local ledger and local leaderboards without
 * > `kreds.sh`.
 *
 * Everything Kreds does locally keeps working with this client in place. What
 * stops is Official KRED, which was never Core's to issue: Law XXIII puts that
 * decision on the Network, and an instance with no Network reaches no such
 * decision.
 *
 * Note that it declines rather than throwing. An unconfigured Network is an
 * ordinary state, not a fault, and code that has to wrap every call in a
 * try/catch to support the default deployment gets that wrapping wrong
 * eventually.
 */
export class OfflineNetworkClient implements KredsNetworkClient {
  /**
   * Always `DECLINED`, and never an amount.
   *
   * The `rulesVersion` is `local`, which is honest: no published policy version
   * produced this, because no policy was consulted. Reporting a real version
   * here would make an instance look as though the Network had considered the
   * candidate and said no.
   */
  async submitEconomicCandidate(candidate: EconomicCandidate): Promise<EconomicDecision> {
    return {
      idempotencyKey: candidate.idempotencyKey,
      outcome: "DECLINED",
      reason: "DECLINED",
      rulesVersion: "local",
    };
  }

  /**
   * `null`, which callers already have to handle.
   *
   * Not a zero position. A zero balance means "the Network knows you and you
   * have nothing", which is a different fact from "there is no Network here",
   * and showing someone a confident 0 KRED they cannot act on is worse than
   * showing them nothing.
   */
  async getOfficialPosition(_gitHubUserId: number): Promise<OfficialPosition | null> {
    return null;
  }

  async getNetworkIdentity(_gitHubUserId: number): Promise<NetworkIdentity | null> {
    return null;
  }
}
