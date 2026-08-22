import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";

import { factKey, provenance } from "@kreds/domain";
import {
  AuthorizationRevokedError,
  Authorizations,
  RateBudgetExhaustedError,
  type RateBudget,
} from "@kreds/database";

import { IngestionService } from "../github/ingestion.service.js";

/**
 * The second lawful way evidence reaches Kreds: Kreds asks GitHub.
 *
 * 26: "Kreds learns what happened in exactly two ways: the provider pushes it,
 * or Kreds asks the provider (server-side query with delegated authorization).
 * In both cases the evidence travels **from GitHub to a Kreds server**. The
 * user's authorization grants access to their activity; it never carries a
 * claim about it."
 *
 * Everything here came out of a response from `api.github.com`. There is no
 * parameter through which a caller describes what happened; the only thing a
 * caller supplies is *whose* activity to go and read.
 *
 * The payload handed on is GitHub's own pull request object, and it goes
 * through the same normalizer the webhook path uses. That is deliberate rather
 * than convenient: the normalizer decides the idempotency key, so two channels
 * that built their own payloads would eventually build two different keys for
 * one merge and pay it twice.
 */

const GITHUB_API = "https://api.github.com";

/** Just enough of a search hit to go and read the real record. */
const searchItem = z.object({
  number: z.number().int().positive(),
  node_id: z.string().min(1),
  repository_url: z.string().url(),
  pull_request: z.object({ merged_at: z.string().nullable() }).optional(),
});

const searchResponse = z.object({
  total_count: z.number().int().nonnegative(),
  items: z.array(searchItem),
});

/**
 * The provider's own record, read straight through.
 *
 * Passed to the normalizer unchanged. Narrowing it here would mean this file
 * deciding which of GitHub's fields matter, which is the normalizer's job and
 * is already tested there.
 */
const pullRequest = z.object({
  number: z.number().int().positive(),
  merged: z.boolean(),
  merged_at: z.string().nullable(),
  base: z.object({ repo: z.object({ id: z.number().int().positive() }) }),
});

export interface DelegatedQueryResult {
  readonly gitHubUserId: number;
  readonly observed: number;
  readonly ingested: number;
  readonly outcome: "OK" | "REVOKED" | "RATE_BUDGET_EXHAUSTED" | "PROVIDER_UNAVAILABLE";
}

@Injectable()
export class DelegatedQueryService {
  private readonly logger = new Logger(DelegatedQueryService.name);

  constructor(
    private readonly authorizations: Authorizations,
    private readonly ingestion: IngestionService,
    private readonly budget: RateBudget,
  ) {}

  /**
   * Read one user's recent merged work and hand it to ingestion.
   *
   * Revocation is re-checked on every request rather than once at the top, which
   * is what makes 26's "immediate" literal: a poll over a hundred repositories
   * stops between two requests instead of finishing the batch with a token the
   * user has taken back.
   */
  async poll(gitHubUserId: number, now: Date): Promise<DelegatedQueryResult> {
    const spent = await this.trySpend(gitHubUserId, now);
    if (spent) return spent;

    const found = await this.tryRead(gitHubUserId, (token) =>
      this.get(
        `/search/issues?q=${encodeURIComponent(`author:${gitHubUserId} is:pr is:merged`)}&per_page=50`,
        token,
      ),
    );
    if ("outcome" in found) return this.result(gitHubUserId, 0, 0, found.outcome);

    const parsed = searchResponse.safeParse(found.body);
    if (!parsed.success) {
      this.logger.warn(`delegated query for ${gitHubUserId} returned a shape Kreds does not read`);
      return this.result(gitHubUserId, 0, 0, "PROVIDER_UNAVAILABLE");
    }

    let ingested = 0;
    for (const item of parsed.data.items) {
      if (!item.pull_request?.merged_at) continue;

      const outcome = await this.ingestOne(gitHubUserId, item, now);
      if (outcome === "REVOKED") {
        return this.result(gitHubUserId, parsed.data.items.length, ingested, "REVOKED");
      }
      if (outcome === "INGESTED") ingested += 1;
    }

    return this.result(gitHubUserId, parsed.data.items.length, ingested, "OK");
  }

  private async ingestOne(
    gitHubUserId: number,
    item: z.infer<typeof searchItem>,
    now: Date,
  ): Promise<"INGESTED" | "SKIPPED" | "REVOKED"> {
    const nameWithOwner = nameWithOwnerFrom(item.repository_url);
    if (!nameWithOwner) return "SKIPPED";

    // One request per candidate, which is what the rate budget exists to pace.
    // The search result does not carry the repository id, and the id is part of
    // the idempotency key the webhook path builds, so guessing it here would let
    // the same merge pay twice.
    const record = await this.tryRead(gitHubUserId, (token) =>
      this.get(`/repos/${nameWithOwner}/pulls/${item.number}`, token),
    );
    if ("outcome" in record) return record.outcome === "REVOKED" ? "REVOKED" : "SKIPPED";

    const pr = pullRequest.safeParse(record.body);
    if (!pr.success || !pr.data.merged || !pr.data.merged_at) return "SKIPPED";

    const where = provenance({
      mode: "SERVER_SIDE_DELEGATED_QUERY",
      // Unique per fact, and derived from what GitHub says rather than from who
      // was holding the token. The same merge is visible to every collaborator
      // who authorized Kreds, so a reference that varied by observer would open
      // one `github_events` row per observer for one piece of work.
      deliveryRef: factKey({
        kind: "PULL_REQUEST_MERGED",
        gitHubRepositoryId: pr.data.base.repo.id,
        gitHubNodeId: item.node_id,
      }),
      // Priced by when GitHub says it happened. A backfill of last month's work
      // must be worth what it was worth then: Law XV has rules change
      // forward-only, and pricing by ingestion time would reprice history at
      // whatever the rules say today.
      occurredAt: Date.parse(pr.data.merged_at),
      observedAt: now.getTime(),
    });

    const result = await this.ingestion.ingest({
      deliveryId: where.deliveryRef,
      eventType: "pull_request",
      ingestionMode: where.mode,
      // GitHub's own object, unchanged, into the same normalizer the webhook
      // path uses.
      payload: { action: "closed", pull_request: record.body, repository: pr.data.base.repo },
    });
    return result.outcome === "PROCESSED" ? "INGESTED" : "SKIPPED";
  }

  private async trySpend(gitHubUserId: number, now: Date): Promise<DelegatedQueryResult | null> {
    try {
      await this.authorizations.spendBudget(gitHubUserId, this.budget, now);
      return null;
    } catch (error) {
      if (error instanceof RateBudgetExhaustedError) {
        return this.result(gitHubUserId, 0, 0, "RATE_BUDGET_EXHAUSTED");
      }
      if (error instanceof AuthorizationRevokedError) {
        return this.result(gitHubUserId, 0, 0, "REVOKED");
      }
      throw error;
    }
  }

  private async tryRead(
    gitHubUserId: number,
    read: (token: string) => Promise<unknown>,
  ): Promise<{ body: unknown } | { outcome: "REVOKED" | "PROVIDER_UNAVAILABLE" }> {
    try {
      return { body: await this.authorizations.withToken(gitHubUserId, read) };
    } catch (error) {
      if (error instanceof AuthorizationRevokedError) return { outcome: "REVOKED" };
      // Never the error itself. A failed request carries the request that was
      // made, and the request was made with a token.
      this.logger.warn(`delegated query for ${gitHubUserId} could not reach the provider`);
      return { outcome: "PROVIDER_UNAVAILABLE" };
    }
  }

  private async get(path: string, token: string): Promise<unknown> {
    const response = await fetch(`${GITHUB_API}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "kreds",
      },
    });
    if (!response.ok) {
      // The status, never the body. A GitHub error body can echo what was sent.
      throw new Error(`github answered ${response.status}`);
    }
    return response.json();
  }

  private result(
    gitHubUserId: number,
    observed: number,
    ingested: number,
    outcome: DelegatedQueryResult["outcome"],
  ): DelegatedQueryResult {
    return Object.freeze({ gitHubUserId, observed, ingested, outcome });
  }
}

/** `https://api.github.com/repos/zitdevs/kreds` -> `zitdevs/kreds`. */
function nameWithOwnerFrom(repositoryUrl: string): string | null {
  const parts = repositoryUrl.split("/repos/");
  const tail = parts.at(1);
  return tail && tail.split("/").length === 2 ? tail : null;
}
