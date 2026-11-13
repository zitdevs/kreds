import { Module } from "@nestjs/common";

import { AccessModule } from "../access/access.module.js";
import { AuthController } from "./auth.controller.js";
import { GitHubOAuthService } from "./github-oauth.service.js";
import { PrivateIngestionController } from "./private-ingestion.controller.js";
import { SessionModule } from "./session.module.js";

@Module({
  // `AccessModule` for `Authorizations`, which is where the private-ingestion
  // grant is stored. It is `null` there when no encryption key is configured.
  imports: [AccessModule, SessionModule],
  controllers: [AuthController, PrivateIngestionController],
  providers: [GitHubOAuthService],
  exports: [SessionModule],
})
export class AuthModule {}
