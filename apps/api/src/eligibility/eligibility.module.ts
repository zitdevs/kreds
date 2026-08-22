import { Module } from "@nestjs/common";

import { EligibilityService } from "./eligibility.service.js";

/**
 * Phase 5A: may this work affect an economy?
 *
 * Separate from contribution because 25 makes them separate standards. A merge
 * can be worth recognition and worth nothing economically at the same time, and
 * that is the design rather than a conflict.
 */
@Module({
  providers: [EligibilityService],
  exports: [EligibilityService],
})
export class EligibilityModule {}
