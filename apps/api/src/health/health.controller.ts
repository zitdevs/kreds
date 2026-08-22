import { Controller, Get, Inject } from "@nestjs/common";
import { ping, type Database } from "@kreds/database";

import { DATABASE } from "../database/database.module.js";

@Controller("health")
export class HealthController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Reports the database too, because a process that is up but cannot reach
   * Postgres is not healthy, and a health check that only proves the process
   * started is a health check that never fails when it matters.
   */
  @Get()
  async check(): Promise<{ status: string; database: string }> {
    const reachable = await ping(this.db);
    return {
      status: reachable ? "ok" : "degraded",
      database: reachable ? "ok" : "unreachable",
    };
  }
}
