import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller.js";
import { GitHubOAuthService } from "./github-oauth.service.js";
import { SessionService } from "./session.service.js";

@Module({
  controllers: [AuthController],
  providers: [GitHubOAuthService, SessionService],
  exports: [SessionService],
})
export class AuthModule {}
