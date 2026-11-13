import { asc, eq, sql } from "drizzle-orm";

import type { Database } from "../client.js";
import { networkCandidates, networkDecisions } from "../schema/index.js";

/** Mirrors `CandidateKind` in `@kreds/network-client`. */
export type NetworkCandidateKind = (typeof networkCandidates.$inferSelect)["kind"];
export type NetworkSubmissionStatus = (typeof networkCandidates.$inferSelect)["status"];

/**
 * What the Network answered, as Core keeps it.
 *
 * The protocol's `EconomicDecision` minus two things on purpose. No `amount`:
 * nothing in Core acts on an issuance yet, and a stored figure is an invitation
 * to read it into a balance. And no `idempotencyKey`, because the row already
 * belongs to its candidate and the caller checked the two agree.
 */
export interface NetworkDecisionRecord {
  readonly outcome: (typeof networkDecisions.$inferSelect)["outcome"];
  readonly reason: (typeof networkDecisions.$inferSelect)["reason"];
  readonly rulesVersion: string;
}

export interface NetworkCandidateInput {
  readonly idempotencyKey: string;
  readonly kind: NetworkCandidateKind;
  /** The `EconomicCandidate` exactly as it goes on the wire. */
  readonly candidate: unknown;
  readonly at: Date;
}

export interface NetworkSubmission {
  readonly idempotencyKey: string;
  readonly kind: NetworkCandidateKind;
  readonly candidate: unknown;
  readonly status: NetworkSubmissionStatus;
  readonly attempts: number;
  readonly lastAttemptedAt: Date | null;
  /** Every distinct answer, oldest first. */
  readonly decisions: readonly (NetworkDecisionRecord & { readonly receivedAt: Date })[];
}

export interface DueSubmission {
  readonly idempotencyKey: string;
  readonly candidate: unknown;
}

/**
 * Core's memory of what it offered the Kreds Network and what came back.
 *
 * "Core submits evidence. Network decides money." This class can record both
 * halves of that sentence and do nothing else: it writes to two tables no
 * balance, ledger entry or Contribution Point is derived from, and it never
 * holds an amount. Law I: "Official KREDS can only be issued by the Kreds
 * Network."
 *
 * Appending is the only way an answer is recorded. The tables' triggers refuse
 * the rest, so this class could not rewrite a decision even by mistake.
 */
export class NetworkSubmissions {
  constructor(private readonly db: Database) {}

  /**
   * Record a candidate as unsubmitted, or recognise one already on file.
   *
   * The first evidence offered for a fact is the evidence kept. Ingestion runs
   * again on every redelivery, and a retry must resubmit what was first
   * offered, not whatever Core would assemble on a later day.
   */
  async record(input: NetworkCandidateInput): Promise<{ isNew: boolean }> {
    const inserted = await this.db
      .insert(networkCandidates)
      .values({
        idempotencyKey: input.idempotencyKey,
        kind: input.kind,
        candidate: input.candidate,
        recordedAt: input.at,
      })
      .onConflictDoNothing({ target: networkCandidates.idempotencyKey })
      .returning({ idempotencyKey: networkCandidates.idempotencyKey });
    return { isNew: inserted.length > 0 };
  }

  /**
   * Record the Network's answer for a candidate.
   *
   * A different answer from the latest is appended; the same answer again is
   * the same fact, so only the attempt is counted. The sweep asks about every
   * deferral on each tick, and a row per tick would bury the one change that
   * matters.
   *
   * The candidate row is locked for the comparison, so the ingestion path and
   * the sweep answering at once cannot both append the same answer.
   *
   * @throws when no such candidate was recorded: an answer to a question Core
   * never asked is not something to file.
   */
  async recordDecision(
    idempotencyKey: string,
    decision: NetworkDecisionRecord,
    receivedAt: Date,
  ): Promise<{ appended: boolean }> {
    return this.db.transaction(async (tx) => {
      const [candidate] = await tx
        .select({ idempotencyKey: networkCandidates.idempotencyKey })
        .from(networkCandidates)
        .where(eq(networkCandidates.idempotencyKey, idempotencyKey))
        .for("update");
      if (!candidate) {
        throw new Error(`No network candidate ${idempotencyKey} was recorded.`);
      }

      const [latest] = await tx
        .select({
          outcome: networkDecisions.outcome,
          reason: networkDecisions.reason,
          rulesVersion: networkDecisions.rulesVersion,
        })
        .from(networkDecisions)
        .where(eq(networkDecisions.idempotencyKey, idempotencyKey))
        .orderBy(sql`${networkDecisions.receivedAt} desc, ${networkDecisions.id} desc`)
        .limit(1);

      const unchanged =
        latest?.outcome === decision.outcome &&
        latest.reason === decision.reason &&
        latest.rulesVersion === decision.rulesVersion;

      if (!unchanged) {
        await tx.insert(networkDecisions).values({
          idempotencyKey,
          outcome: decision.outcome,
          reason: decision.reason,
          rulesVersion: decision.rulesVersion,
          receivedAt,
        });
      }

      await tx
        .update(networkCandidates)
        .set({
          status: "SUBMITTED",
          lastAttemptedAt: receivedAt,
          attempts: sql`${networkCandidates.attempts} + 1`,
        })
        .where(eq(networkCandidates.idempotencyKey, idempotencyKey));

      return { appended: !unchanged };
    });
  }

  /**
   * Count an attempt the Network did not answer.
   *
   * Not a decision, and nothing here records one. An outage read as a decline
   * would deny people work they earned; read as anything else, worse.
   */
  async recordUnanswered(idempotencyKey: string, at: Date): Promise<void> {
    await this.db
      .update(networkCandidates)
      .set({ lastAttemptedAt: at, attempts: sql`${networkCandidates.attempts} + 1` })
      .where(eq(networkCandidates.idempotencyKey, idempotencyKey));
  }

  async find(idempotencyKey: string): Promise<NetworkSubmission | null> {
    const [row] = await this.db
      .select()
      .from(networkCandidates)
      .where(eq(networkCandidates.idempotencyKey, idempotencyKey))
      .limit(1);
    if (!row) return null;

    const decisions = await this.db
      .select({
        outcome: networkDecisions.outcome,
        reason: networkDecisions.reason,
        rulesVersion: networkDecisions.rulesVersion,
        receivedAt: networkDecisions.receivedAt,
      })
      .from(networkDecisions)
      .where(eq(networkDecisions.idempotencyKey, idempotencyKey))
      .orderBy(asc(networkDecisions.receivedAt), asc(networkDecisions.id));

    return {
      idempotencyKey: row.idempotencyKey,
      kind: row.kind,
      candidate: row.candidate,
      status: row.status,
      attempts: row.attempts,
      lastAttemptedAt: row.lastAttemptedAt,
      decisions,
    };
  }

  /**
   * Candidates whose question is still open: never answered, or answered
   * `DEFERRED` most recently.
   *
   * A decline or an issuance is an answer and is left alone. Least recently
   * attempted first, never-attempted before anything, so a bounded sweep works
   * through everyone rather than retrying the same few.
   */
  async dueForSubmission(limit: number): Promise<readonly DueSubmission[]> {
    const rows = await this.db.execute<{ idempotency_key: string; candidate: unknown }>(sql`
      select c.idempotency_key, c.candidate
      from network_candidates c
      left join lateral (
        select d.outcome
        from network_decisions d
        where d.idempotency_key = c.idempotency_key
        order by d.received_at desc, d.id desc
        limit 1
      ) latest on true
      where c.status = 'UNSUBMITTED' or latest.outcome = 'DEFERRED'
      order by c.last_attempted_at asc nulls first, c.recorded_at asc
      limit ${limit}
    `);
    return rows.map((row) => ({ idempotencyKey: row.idempotency_key, candidate: row.candidate }));
  }
}
