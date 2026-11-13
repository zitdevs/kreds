import { Module } from "@nestjs/common";

import { NetworkModule } from "../network/network.module.js";
import { SupplyController } from "./supply.controller.js";

/**
 * Phase 8, Core's half: three numbers, read-only.
 *
 * Everything the Central Bank does lives in the private repository. What
 * reaches here is a view of it, and there is deliberately no service behind
 * this controller, because a service is where a write would eventually be
 * added.
 */
@Module({ imports: [NetworkModule], controllers: [SupplyController] })
export class SupplyModule {}
