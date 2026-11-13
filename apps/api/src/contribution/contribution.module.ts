import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { ContributionController } from "./contribution.controller.js";
import { readUnobservedCaps, UNOBSERVED_CAPS } from "./unobserved-caps.provider.js";
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
  providers: [
    ContributionService,
    { provide: UNOBSERVED_CAPS, inject: [ConfigService], useFactory: readUnobservedCaps },
  ],
  exports: [ContributionService],
})
export class ContributionModule {}
