import { Module } from "@nestjs/common";

import { GitHubModule } from "../github/github.module.js";
import { GitHubSignalsService } from "./github-signals.service.js";
import { RelevanceController } from "./relevance.controller.js";
import { RelevanceService } from "./relevance.service.js";

/**
 * Phase 6A: public repository relevance.
 *
 * Separate from eligibility because they answer different questions from
 * different evidence. Relevance is public and open source; whether Official
 * KRED may trust an interaction is neither, and lives in the Network.
 */
@Module({
  imports: [GitHubModule],
  controllers: [RelevanceController],
  providers: [GitHubSignalsService, RelevanceService],
  exports: [RelevanceService],
})
export class RelevanceModule {}
