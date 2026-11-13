import { Module } from "@nestjs/common";

import { AccessModule } from "../access/access.module.js";
import { AuthController } from "./auth.controller.js";
import { GitHubOAuthService } from "./github-oauth.service.js";
import { PrivateIngestionController } from "./private-ingestion.controller.js";
import { SessionService } from "./session.service.js";

@Module({
  // `AccessModule` for `Authorizations`, which is where the private-ingestion
  // grant is stored. It is `null` there when no encryption key is configured.
  imports: [AccessModule],
  controllers: [AuthController, PrivateIngestionController],
  providers: [GitHubOAuthService, SessionService],
  exports: [SessionService],
})
export class AuthModule {}
