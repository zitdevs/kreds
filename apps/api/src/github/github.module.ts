import { Module } from "@nestjs/common";

import { ContributionModule } from "../contribution/contribution.module.js";
import { EligibilityModule } from "../eligibility/eligibility.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { GitHubAppService } from "./github-app.service.js";
import { GitHubWebhookController } from "./github-webhook.controller.js";
import { IngestionService } from "./ingestion.service.js";
import { InstallationService } from "./installation.service.js";

/**
 * Phase 2: what is happening in your repositories.
 *
 * Separate from `AuthModule` because they answer different questions with
 * different credentials. OAuth identifies a person and holds a client secret;
 * the App reads repositories and holds a private key. Sharing a module would
 * mean one set of secrets guarding two unrelated grants.
 */
@Module({
  imports: [DatabaseModule, ContributionModule, EligibilityModule],
  controllers: [GitHubWebhookController],
  providers: [GitHubAppService, InstallationService, IngestionService],
  // `IngestionService` is exported because A04 added a second lawful channel:
  // `AccessModule` feeds delegated-query evidence through the same service the
  // webhook uses, which is what keeps the two channels from building two
  // different idempotency keys for one merge.
  exports: [GitHubAppService, IngestionService],
})
export class GitHubModule {}
