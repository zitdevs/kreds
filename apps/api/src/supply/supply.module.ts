import { Module } from "@nestjs/common";

import { SupplyController } from "./supply.controller.js";

/**
 * Phase 8, Core's half: three numbers, read-only.
 *
 * Everything the Central Bank does lives in the private repository. What
 * reaches here is a view of it, and there is deliberately no service behind
 * this controller, because a service is where a write would eventually be
 * added.
 */
@Module({ controllers: [SupplyController] })
export class SupplyModule {}
