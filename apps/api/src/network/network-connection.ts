import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";

import {
  HttpNetworkClient,
  OfflineNetworkClient,
  type KredsNetworkClient,
} from "@kreds/network-client";

import type { Env } from "../config/env.js";

/**
 * The one `KredsNetworkClient` this instance holds.
 *
 * Injected wherever Core speaks to the Network, so that whether it does is a
 * deployment decision made once, here, rather than a class somebody constructs
 * in a controller.
 */
export const KREDS_NETWORK_CLIENT = Symbol("KREDS_NETWORK_CLIENT");

/** The client, and whether it reaches a real Network. */
export const NETWORK_CONNECTION = Symbol("NETWORK_CONNECTION");

export interface NetworkConnection {
  readonly client: KredsNetworkClient;
  /**
   * `false` on `OfflineNetworkClient`.
   *
   * Callers that record candidates read this rather than the class: an
   * instance with no Network keeps no submissions, exactly as before Core could
   * submit at all, so nothing ingested while offline is later offered as though
   * it had been waiting.
   */
  readonly connected: boolean;
}

/**
 * Decide, once at startup, whether this instance talks to the Network.
 *
 * Law XII: "Self-hosting does not require Kreds Network participation. Joining
 * later is permitted through a defined migration process." So both variables
 * unset is an ordinary state: Core runs on `OfflineNetworkClient`, every local
 * economy keeps working, and Official KRED does not exist here.
 *
 * Ordinary is not the same as silent. A Network that was meant to be connected
 * and is not looks, from the outside, exactly like one that declined everything,
 * so the state is announced once, naming the missing variables. Never their
 * values: the token is a credential the Network issued this instance.
 */
export function readNetworkConnection(config: ConfigService<Env, true>): NetworkConnection {
  const baseUrl = config.get("KREDS_NETWORK_URL", { infer: true });
  const token = config.get("KREDS_NETWORK_TOKEN", { infer: true });

  if (!baseUrl || !token) {
    const missing = [
      baseUrl ? null : "KREDS_NETWORK_URL",
      token ? null : "KREDS_NETWORK_TOKEN",
    ].filter((name): name is string => name !== null);

    new Logger("KredsNetwork").warn(
      `${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not set, so this ` +
        "instance is not connected to the Kreds Network: it submits no economic candidates " +
        "and has no Official KRED. Everything local keeps working. Both variables are " +
        "required; setting only one has no effect.",
    );
    return { client: new OfflineNetworkClient(), connected: false };
  }

  return { client: new HttpNetworkClient({ baseUrl, token }), connected: true };
}
