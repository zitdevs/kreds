import { Module } from "@nestjs/common";

import { SessionService } from "./session.service.js";

/**
 * Sessions on their own, so a module can check who is signed in without
 * importing everything `AuthModule` brings.
 *
 * `AccessModule` needs this to let a user manage only their own authorization,
 * and `AuthModule` imports `AccessModule` for the private-ingestion grant.
 * Taking sessions from `AuthModule` there would close a cycle.
 */
@Module({
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
