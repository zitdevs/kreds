import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { NetworkSubmissions } from "@kreds/database";

import type { Env } from "../config/env.js";
import { NETWORK_CONNECTION, type NetworkConnection } from "./network-connection.js";
import { NetworkSubmissionService } from "./network-submission.service.js";

/**
 * How many candidates one sweep offers, least recently attempted first.
 *
 * A bound on one tick's work, not on anybody: what is left sorts to the front
 * of the next sweep.
 */
const SWEEP_SIZE = 100;

/**
 * Offers the Network again whatever is still open.
 *
 * Two kinds of open question, and only these: a candidate the Network never
 * answered (it was down, slow, or answered with something that was not a
 * decision), and one it answered `DEFERRED`. A06: "Failing to examine is not
 * the same finding as finding little", so a deferral is the Network saying it
 * has not decided yet, and asking again later is how Core learns when it has.
 * A decline or an issuance is an answer and is never asked again.
 *
 * Safe to repeat because every candidate carries the protocol's idempotency
 * key: 06, "Network returns the same decision for a repeat, never a second
 * issuance".
 *
 * A plain interval, as `DelegatedQueryScheduler` uses, and nothing to persist:
 * the candidates table already records what was tried when.
 */
@Injectable()
export class NetworkRetryScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NetworkRetryScheduler.name);
  private readonly intervalMs: number | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private sweeping = false;
  private stopped = false;

  constructor(
    private readonly network: NetworkSubmissionService,
    private readonly submissions: NetworkSubmissions,
    @Inject(NETWORK_CONNECTION) private readonly connection: NetworkConnection,
    config: ConfigService<Env, true>,
  ) {
    this.intervalMs = config.get("KREDS_NETWORK_RETRY_INTERVAL_MS", { infer: true });
  }

  onApplicationBootstrap(): void {
    // No Network: nothing is ever recorded, so there is nothing to retry, and
    // the connection has already announced why. One warning, not two.
    if (!this.connection.connected) return;

    if (this.intervalMs === undefined) {
      this.logger.warn(
        "KREDS_NETWORK_RETRY_INTERVAL_MS is not set, so Core never offers the Kreds Network " +
          "again a candidate it did not answer or deferred. They stay recorded and unresolved " +
          "until it is set.",
      );
      return;
    }

    this.timer = setInterval(() => void this.sweep(), this.intervalMs);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /**
   * One pass over what is open. Never two at once: a tick that arrives while a
   * sweep is running is skipped, not queued. One candidate's failure is that
   * candidate's, and the sweep moves on.
   */
  async sweep(): Promise<void> {
    if (this.sweeping || this.stopped || !this.connection.connected) return;
    this.sweeping = true;
    try {
      const due = await this.submissions.dueForSubmission(SWEEP_SIZE);
      for (const candidate of due) {
        if (this.stopped) return;
        try {
          await this.network.submit(candidate);
        } catch {
          this.logger.warn(
            `Kreds Network retry could not file ${candidate.idempotencyKey}; it stays open.`,
          );
        }
      }
    } catch {
      this.logger.warn("Kreds Network retry could not read which candidates are open.");
    } finally {
      this.sweeping = false;
    }
  }
}
