import { Module } from "@nestjs/common";

import { ContributionController } from "./contribution.controller.js";
import { ContributionService } from "./contribution.service.js";

/**
 * Phase 4: what have you contributed.
 *
 * Separate from the GitHub module because it answers a different question with
 * different rules. The App reports what happened; this decides what that is
 * worth in recognition, under Amendment A02's split between recognising work
 * and monetising it.
 */
@Module({
  controllers: [ContributionController],
  providers: [ContributionService],
  exports: [ContributionService],
})
export class ContributionModule {}
