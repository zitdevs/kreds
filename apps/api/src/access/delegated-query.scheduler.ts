import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { Authorizations } from "@kreds/database";

import type { Env } from "../config/env.js";
import { DelegatedQueryService } from "./delegated-query.service.js";
import { scopesWithinConsent } from "./scopes.js";

/**
 * How many authorizations one sweep reads, least recently polled first.
 *
 * A bound on the work of a single tick, not a quota on anybody. Users beyond it
 * sort to the front of the next sweep, because `dueForPolling` orders by when
 * each was last polled, and every request a poll makes is paced by that user's
 * own rate budget regardless of this number.
 */
const SWEEP_SIZE = 100;

/**
 * What makes the delegated-query channel run: Kreds asking GitHub, on a
 * schedule, for the activity of users who agreed to it.
 *
 * 26: "Kreds asks the provider (server-side query with delegated
 * authorization)". The service knows how to ask; this decides when.
 *
 * A plain interval rather than a scheduling library. One timer, one sweep at a
 * time, and nothing to persist: the authorizations table already records who
 * was polled when, so a restart loses nothing but the tick in progress.
 */
@Injectable()
export class DelegatedQueryScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DelegatedQueryScheduler.name);
  private readonly intervalMs: number | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private sweeping = false;
  private stopped = false;

  constructor(
    private readonly query: DelegatedQueryService,
    config: ConfigService<Env, true>,
    // `null` when no `TOKEN_ENCRYPTION_KEY` is configured: no grant can have
    // been stored, so there is nobody to poll.
    @Optional() @Inject(Authorizations) private readonly authorizations: Authorizations | null,
  ) {
    this.intervalMs = config.get("DELEGATED_QUERY_POLL_INTERVAL_MS", { infer: true });
  }

  onApplicationBootstrap(): void {
    // Off is a legitimate state, and it is still announced. A poller that never
    // runs looks, from the outside, exactly like one that found nothing.
    if (this.intervalMs === undefined) {
      this.logger.warn(
        "DELEGATED_QUERY_POLL_INTERVAL_MS is not set, so Kreds never polls GitHub for users who " +
          "opted in to delegated query. Their grants are stored and unused until it is set.",
      );
      return;
    }
    if (!this.authorizations) {
      this.logger.warn(
        "TOKEN_ENCRYPTION_KEY is not set, so no delegated authorization can exist and " +
          "DELEGATED_QUERY_POLL_INTERVAL_MS has nothing to poll.",
      );
      return;
    }

    this.timer = setInterval(() => void this.sweep(), this.intervalMs);
    // A pending tick is no reason to keep a process alive that is otherwise
    // done, which matters for tests and for a clean shutdown alike.
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /**
   * Poll every authorization that is due, one user at a time.
   *
   * Never two at once: a tick that arrives while a sweep is still running is
   * skipped rather than queued, since two sweeps would read the same users and
   * spend their budgets twice for the same evidence.
   *
   * One user's failure is that user's, and the sweep moves on. An exhausted
   * budget or a revocation comes back as an outcome rather than an error, and
   * the next user is polled either way.
   */
  async sweep(): Promise<void> {
    if (this.sweeping || this.stopped || !this.authorizations) return;
    this.sweeping = true;
    try {
      const due = await this.authorizations.dueForPolling(SWEEP_SIZE);
      for (const candidate of due) {
        if (this.stopped) return;
        // The token reaches what GitHub granted; Kreds reads what the person
        // agreed to. `dueForPolling` already leaves out anybody without the
        // public consent, and this holds the line again where the reading
        // happens, narrowing a private grant the private consent does not cover.
        const scopes = scopesWithinConsent(candidate.scopes, candidate.consents);
        if (!scopes) continue;
        try {
          await this.query.poll({ ...candidate, scopes }, new Date());
        } catch {
          // Never the error itself: it may carry a request, and the request
          // was made with somebody's token.
          this.logger.warn(`delegated query sweep could not poll ${candidate.gitHubUserId}`);
        }
      }
    } catch {
      this.logger.warn("delegated query sweep could not read who is due for polling");
    } finally {
      this.sweeping = false;
    }
  }
}
