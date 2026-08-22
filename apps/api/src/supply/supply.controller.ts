import { Controller, Get, NotFoundException } from "@nestjs/common";

import { OfflineNetworkClient, type KredsNetworkClient } from "@kreds/network-client";

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
   * The offline client by default, which is what most instances run.
   *
   * A self-hosted Kreds is not part of the Official Network and has no Official
   * supply to report, which is a different fact from a supply of zero.
   */
  private readonly network: KredsNetworkClient = new OfflineNetworkClient();

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
