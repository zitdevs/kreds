import { Controller, Get, Inject, NotFoundException } from "@nestjs/common";

import type { KredsNetworkClient } from "@kreds/network-client";

import { KREDS_NETWORK_CLIENT } from "../network/network-connection.js";

/**
 * The published supply figures, read from the Network.
 *
 * Phase 8: "Core receives read models: Max Supply, Circulating Supply, Reserve.
 * Core cannot mutate Central Bank state."
 *
 * This controller has exactly one route and it is a `GET`. There is no
 * counterpart that writes, no parameter that could become an instruction, and
 * no path from here to a ledger. Core's inability to mint is not enforced here;
 * it is enforced by there being nothing here to enforce.
 */
@Controller("supply")
export class SupplyController {
  /**
   * The instance's one client, decided from the environment by `NetworkModule`.
   *
   * The offline client unless the Network issued this instance a token, which
   * is what most instances run: a self-hosted Kreds that is not part of the
   * Official Network has no Official supply to report, which is a different
   * fact from a supply of zero.
   */
  constructor(@Inject(KREDS_NETWORK_CLIENT) private readonly network: KredsNetworkClient) {}

  @Get()
  async supply() {
    const supply = await this.network.getSupply();
    if (!supply) {
      throw new NotFoundException(
        "This Kreds instance is not connected to the Official Kreds Network, so it has no Official supply to report.",
      );
    }
    return supply;
  }
}
