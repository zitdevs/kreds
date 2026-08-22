/**
 * Core's half of the Kreds Network boundary.
 *
 * Core observes GitHub and runs local economies on its own. Official KRED is
 * not local and never has been: Law XXIII puts that decision on the Network,
 * and this package is the entire, one-directional path to it.
 *
 * Two implementations ship. `OfflineNetworkClient` is the default and the one
 * most instances run: everything local keeps working and Official KRED simply
 * does not exist. `HttpNetworkClient` speaks to a Network that has issued this
 * instance a token.
 *
 * There is no third implementation, and in particular nothing here can write an
 * Official balance. That is not an oversight to be filled in later. Even the
 * deployment at kreds.sh submits evidence and waits to be told.
 */

export {
  PROTOCOL_VERSION,
  type CandidateKind,
  type DecisionReason,
  type EconomicCandidate,
  type EconomicDecision,
  type KredsNetworkClient,
  type NetworkIdentity,
  type OfficialPosition,
} from "./protocol.js";

export { OfflineNetworkClient } from "./offline-client.js";
export {
  HttpNetworkClient,
  NetworkUnavailableError,
  type HttpNetworkClientOptions,
} from "./http-client.js";
