import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env.js";
import {
  KREDS_NETWORK_CLIENT,
  NETWORK_CONNECTION,
  readNetworkConnection,
  type NetworkConnection,
} from "./network-connection.js";

/**
 * Core's connection to the Kreds Network, and everything that uses it.
 *
 * The connection is decided once, here, from the environment: an
 * `HttpNetworkClient` when the Network has issued this instance a token, and
 * `OfflineNetworkClient` otherwise (Law XII). Nothing else in the API
 * constructs a client.
 *
 * Notice what this module cannot do. It can read projections. There is no provider here that writes a
 * balance or a ledger entry, because Law I puts Official issuance on the
 * Network alone.
 */
@Module({
  providers: [
    {
      provide: NETWORK_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => readNetworkConnection(config),
    },
    {
      provide: KREDS_NETWORK_CLIENT,
      inject: [NETWORK_CONNECTION],
      useFactory: (connection: NetworkConnection) => connection.client,
    },
  ],
  exports: [KREDS_NETWORK_CLIENT],
})
export class NetworkModule {}
