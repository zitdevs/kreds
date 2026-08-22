import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AuthModule } from "./auth/auth.module.js";
import { validateEnv } from "./config/env.js";
import { ContributionModule } from "./contribution/contribution.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { EligibilityModule } from "./eligibility/eligibility.module.js";
import { RelevanceModule } from "./relevance/relevance.module.js";
import { GitHubModule } from "./github/github.module.js";
import { HealthController } from "./health/health.controller.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    DatabaseModule,
    AuthModule,
    GitHubModule,
    ContributionModule,
    EligibilityModule,
    RelevanceModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
