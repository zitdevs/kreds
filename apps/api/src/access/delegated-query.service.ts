import { Inject, Injectable, Logger } from "@nestjs/common";
import { z } from "zod";

import { factKey, gitHubUserId as toGitHubUserId, provenance } from "@kreds/domain";
import {
  AuthorizationRevokedError,
  Authorizations,
  IdentityRepository,
  InstallationRepository,
  RateBudgetExhaustedError,
  type PollCandidate,
  type RateBudget,
} from "@kreds/database";

import { IngestionService } from "../github/ingestion.service.js";
import { RATE_BUDGET } from "./access.tokens.js";
import { mayRead, reachOf, type IngestionReach } from "./scopes.js";

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
 * caller supplies is *whose* activity to go and read, and what they granted.
 *
 * Search is discovery and nothing more. A05: "A user activity feed is a
 * discovery surface, never authoritative economic evidence", so every hit is
 * re-read from its canonical record and the actor verified by numeric id before
 * anything is handed on.
 *
 * The payload handed on is GitHub's own objects, unchanged, and it goes through
 * the same normalizer the webhook path uses. That is deliberate rather than
 * convenient: the normalizer decides the idempotency key, so two channels that
 * built their own payloads would eventually build two different keys for one
 * merge and pay it twice.
 */

const GITHUB_API = "https://api.github.com";

/**
 * What a GitHub login may contain: letters, digits and single hyphens, at most
 * 39 characters.
 *
 * The login is interpolated into a search query, so anything else is refused
 * rather than escaped. A stored login carrying `is:private` or `repo:` would
 * otherwise widen the search into somebody else's discovery.
 */
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** Just enough of a search hit to go and read the real record. */
const searchItem = z.object({
  number: z.number().int().positive(),
  node_id: z.string().min(1),
  repository_url: z.string().url(),
  pull_request: z.object({ merged_at: z.string().nullable() }).optional(),
});

type SearchItem = z.infer<typeof searchItem>;

const searchResponse = z.object({
  total_count: z.number().int().nonnegative(),
  items: z.array(searchItem),
});

/**
 * The fields of the provider's record this service checks before handing it on.
 *
 * Only checked, never used to rebuild the payload. The object passed to the
 * normalizer is the one GitHub sent: narrowing it here would mean this file
 * deciding which of GitHub's fields matter, which is the normalizer's job and
 * is already tested there. zod strips unknown keys, which is exactly why the
 * parsed copy is never the one passed on.
 */
const pullRequest = z.object({
  node_id: z.string().min(1),
  merged: z.boolean(),
  merged_at: z.string().nullable(),
  user: z.object({ id: z.number().int().positive() }),
  base: z.object({
    repo: z.object({
      id: z.number().int().positive(),
      full_name: z.string().min(1).optional(),
      default_branch: z.string().min(1).optional(),
      private: z.boolean().optional(),
      visibility: z.string().optional(),
      owner: z.object({ type: z.string().optional() }).optional(),
    }),
  }),
});

const review = z.object({
  node_id: z.string().min(1),
  state: z.string(),
  submitted_at: z.string().nullable().optional(),
  user: z.object({ id: z.number().int().positive() }).nullable(),
});

const reviewList = z.array(z.unknown());

type Raw = Record<string, unknown>;

export interface DelegatedQueryResult {
  readonly gitHubUserId: number;
  /** Candidates discovery returned, before any was verified. */
  readonly observed: number;
  /** Verified facts the pipeline recorded as new. */
  readonly ingested: number;
  readonly outcome:
    "OK" | "REVOKED" | "RATE_BUDGET_EXHAUSTED" | "PROVIDER_UNAVAILABLE" | "UNKNOWN_IDENTITY";
}

/** Why a poll stopped early. Anything else is a candidate skipped, and the poll goes on. */
type Stop = "REVOKED" | "RATE_BUDGET_EXHAUSTED";

type Read = { body: unknown } | { outcome: Stop | "PROVIDER_UNAVAILABLE" };

@Injectable()
export class DelegatedQueryService {
  private readonly logger = new Logger(DelegatedQueryService.name);

  constructor(
    private readonly authorizations: Authorizations,
    private readonly identities: IdentityRepository,
    private readonly installations: InstallationRepository,
    private readonly ingestion: IngestionService,
    // An interface has no runtime token, so Nest cannot resolve it by type.
    // Without this the container reports the parameter as `Object` and fails at
    // boot, which is exactly what happened the first time this shipped.
    @Inject(RATE_BUDGET) private readonly budget: RateBudget,
  ) {}

  /**
   * Read one user's merged pull requests and submitted reviews, verify each
   * against its canonical record, and hand the verified ones to ingestion.
   *
   * @param candidate who to read, and the scopes GitHub actually granted them.
   * Reach is computed from those, never from what Kreds asked for: a user can
   * narrow a grant on GitHub's own screen.
   *
   * Every request spends from the user's budget and re-checks revocation, which
   * is what makes 26's "immediate" literal: a poll over a hundred repositories
   * stops between two requests instead of finishing the batch with a token the
   * user has taken back.
   */
  async poll(candidate: PollCandidate, now: Date): Promise<DelegatedQueryResult> {
    const { gitHubUserId } = candidate;
    const reach = reachOf(candidate.scopes);

    // Search qualifiers take a login, never a numeric id: GitHub answers
    // `author:<id>` with HTTP 422. The login only finds candidates; the id is
    // what every one of them is verified against below.
    const identity = await this.identities.findByGitHubUserId(toGitHubUserId(gitHubUserId));
    const login = identity?.login;
    if (!login || !GITHUB_LOGIN.test(login)) {
      return this.result(gitHubUserId, 0, 0, "UNKNOWN_IDENTITY");
    }

    let observed = 0;
    let ingested = 0;

    const passes = [
      {
        query: `author:${login} is:pr is:merged`,
        verify: (item: SearchItem) => this.ingestMerge(gitHubUserId, reach, item, now),
      },
      {
        query: `reviewed-by:${login} is:pr`,
        verify: (item: SearchItem) => this.ingestReviews(gitHubUserId, reach, item, now),
      },
    ];

    for (const pass of passes) {
      const found = await this.read(
        gitHubUserId,
        `/search/issues?q=${encodeURIComponent(pass.query)}&sort=updated&order=desc&per_page=50`,
        now,
      );
      if ("outcome" in found) return this.result(gitHubUserId, observed, ingested, found.outcome);

      const parsed = searchResponse.safeParse(found.body);
      if (!parsed.success) {
        this.logger.warn(
          `delegated query for ${gitHubUserId} returned a shape Kreds does not read`,
        );
        return this.result(gitHubUserId, observed, ingested, "PROVIDER_UNAVAILABLE");
      }

      observed += parsed.data.items.length;
      for (const item of parsed.data.items) {
        const outcome = await pass.verify(item);
        if (typeof outcome === "string") {
          return this.result(gitHubUserId, observed, ingested, outcome);
        }
        ingested += outcome;
      }
    }

    return this.result(gitHubUserId, observed, ingested, "OK");
  }

  /** @returns facts newly recorded, or why the poll must stop. */
  private async ingestMerge(
    gitHubUserId: number,
    reach: IngestionReach,
    item: SearchItem,
    now: Date,
  ): Promise<number | Stop> {
    if (!item.pull_request?.merged_at) return 0;

    const canonical = await this.readPullRequest(gitHubUserId, reach, item, now);
    if (typeof canonical !== "object") return canonical;
    const { raw, pr } = canonical;

    // Discovery is not verification. The search matched a login, and logins are
    // renamed and then taken by somebody else; the numeric id on the canonical
    // record is the only thing that says whose merge this is.
    if (pr.user.id !== gitHubUserId || !pr.merged || !pr.merged_at) return 0;

    await this.register(pr);

    const where = provenance({
      mode: "USER_ACTIVITY_POLL",
      // Unique per fact, and derived from what GitHub says rather than from who
      // was holding the token. The same merge is visible to every collaborator
      // who authorized Kreds, so a reference that varied by observer would open
      // one `github_events` row per observer for one piece of work.
      deliveryRef: factKey({
        kind: "PULL_REQUEST_MERGED",
        gitHubRepositoryId: pr.base.repo.id,
        gitHubNodeId: pr.node_id,
      }),
      // Priced by when GitHub says it happened. A backfill of last month's work
      // must be worth what it was worth then: Law XV has rules change
      // forward-only, and pricing by ingestion time would reprice history at
      // whatever the rules say today.
      occurredAt: Date.parse(pr.merged_at),
      observedAt: now.getTime(),
    });

    return this.hand(where, "pull_request", {
      action: "closed",
      pull_request: raw,
      repository: (raw["base"] as Raw)["repo"],
    });
  }

  /** @returns facts newly recorded, or why the poll must stop. */
  private async ingestReviews(
    gitHubUserId: number,
    reach: IngestionReach,
    item: SearchItem,
    now: Date,
  ): Promise<number | Stop> {
    const canonical = await this.readPullRequest(gitHubUserId, reach, item, now);
    if (typeof canonical !== "object") return canonical;
    const { raw, pr, nameWithOwner } = canonical;

    const listed = await this.read(
      gitHubUserId,
      `/repos/${nameWithOwner}/pulls/${item.number}/reviews?per_page=100`,
      now,
    );
    if ("outcome" in listed) return listed.outcome === "PROVIDER_UNAVAILABLE" ? 0 : listed.outcome;

    const reviews = reviewList.safeParse(listed.body);
    if (!reviews.success) return 0;

    let ingested = 0;
    let registered = false;
    for (const rawReview of reviews.data) {
      const parsed = review.safeParse(rawReview);
      if (!parsed.success) continue;
      const { data } = parsed;

      // The list holds every reviewer's reviews. Only the authorized user's own
      // are theirs to have read, and only the numeric id says which those are.
      if (data.user?.id !== gitHubUserId) continue;
      // A pending review has not happened yet. The webhook reports a review
      // when it is submitted, and so does this.
      if (data.state.toUpperCase() === "PENDING" || !data.submitted_at) continue;

      if (!registered) {
        await this.register(pr);
        registered = true;
      }

      const where = provenance({
        mode: "USER_ACTIVITY_POLL",
        // GitHub's own ids for the review, so the poll and the webhook name the
        // same review the same way, whoever's token saw it.
        deliveryRef: factKey({
          kind: "REVIEW_SUBMITTED",
          gitHubRepositoryId: pr.base.repo.id,
          gitHubNodeId: data.node_id,
        }),
        occurredAt: Date.parse(data.submitted_at),
        observedAt: now.getTime(),
      });

      // GitHub's own objects, unchanged, in the shape its webhook sends, into
      // the same normalizer. Reviews earn Contribution Points there and nothing
      // else; this path adds no ledger movement of its own.
      ingested += await this.hand(where, "pull_request_review", {
        action: "submitted",
        review: rawReview,
        pull_request: raw,
        repository: (raw["base"] as Raw)["repo"],
      });
    }
    return ingested;
  }

  /**
   * The canonical pull request behind a search hit, if this grant may read it.
   *
   * One request per candidate. The search result does not carry the repository
   * id or the author's id, and both are what verification and the idempotency
   * key are built from, so guessing either here would let the same work pay
   * twice or the wrong person be credited.
   */
  private async readPullRequest(
    gitHubUserId: number,
    reach: IngestionReach,
    item: SearchItem,
    now: Date,
  ): Promise<{ raw: Raw; pr: z.infer<typeof pullRequest>; nameWithOwner: string } | 0 | Stop> {
    const nameWithOwner = nameWithOwnerFrom(item.repository_url);
    if (!nameWithOwner) return 0;

    const record = await this.read(
      gitHubUserId,
      `/repos/${nameWithOwner}/pulls/${item.number}`,
      now,
    );
    if ("outcome" in record) return record.outcome === "PROVIDER_UNAVAILABLE" ? 0 : record.outcome;

    const pr = pullRequest.safeParse(record.body);
    if (!pr.success) return 0;

    // A grant that does not reach private work does not get private work read
    // through it, whatever the token happened to return. Unknown visibility
    // fails closed.
    if (!mayRead(reach, visibilityOf(pr.data.base.repo))) return 0;

    return { raw: record.body as Raw, pr: pr.data, nameWithOwner };
  }

  /**
   * Give eligibility a record to read for a repository Kreds first met here.
   *
   * Without one, eligibility and the observation check fail closed for lack of
   * a repository, and A04 made the App optional, so "no record" is the ordinary
   * case for this channel. The record is built only from GitHub's canonical
   * repository object (Law XXXV), and the persistence layer refuses everything
   * a poll must not do: no installation, no organization binding (Law XXXVI),
   * no trust tier. A new repository starts at the lowest tier, as all do.
   *
   * Ownership GitHub did not state is not guessed: personal and organization
   * repositories are different contexts under 25, so the repository stays
   * unrecorded and fails closed exactly as it did before.
   */
  private async register(pr: z.infer<typeof pullRequest>): Promise<void> {
    const repo = pr.base.repo;
    const ownerType = repo.owner?.type;
    const visibility = visibilityOf(repo);
    if (!repo.full_name || visibility === "unknown") return;
    if (ownerType !== "User" && ownerType !== "Organization") return;

    await this.installations.observeRepository({
      gitHubRepositoryId: repo.id,
      nameWithOwner: repo.full_name,
      isPrivate: visibility === "private",
      isPersonallyOwned: ownerType === "User",
      primaryBranch: repo.default_branch ?? null,
    });
  }

  private async hand(
    where: ReturnType<typeof provenance>,
    eventType: string,
    payload: unknown,
  ): Promise<number> {
    const result = await this.ingestion.ingest({
      deliveryId: where.deliveryRef,
      eventType,
      ingestionMode: where.mode,
      payload,
    });
    return result.outcome === "PROCESSED" ? 1 : 0;
  }

  /**
   * One request to GitHub: spend from the budget, then re-check revocation.
   *
   * Both on every request rather than once per poll. A budget spent per poll
   * would let one user's hundred candidates cost the same as one, which is the
   * starvation A04 made Kreds responsible for preventing.
   */
  private async read(gitHubUserId: number, path: string, now: Date): Promise<Read> {
    try {
      await this.authorizations.spendBudget(gitHubUserId, this.budget, now);
    } catch (error) {
      if (error instanceof RateBudgetExhaustedError) return { outcome: "RATE_BUDGET_EXHAUSTED" };
      if (error instanceof AuthorizationRevokedError) return { outcome: "REVOKED" };
      throw error;
    }

    try {
      return { body: await this.authorizations.withToken(gitHubUserId, (t) => this.get(path, t)) };
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
        "X-GitHub-Api-Version": "2022-11-28",
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

/**
 * What GitHub says about a repository's visibility, as `mayRead` reads it.
 *
 * `internal` is an enterprise visibility that is not public, so it is private
 * for this purpose. Anything GitHub did not state is unknown, and unknown fails
 * closed in `mayRead`.
 */
function visibilityOf(repo: {
  private?: boolean | undefined;
  visibility?: string | undefined;
}): "public" | "private" | "unknown" {
  const saysPrivate =
    repo.private === true || repo.visibility === "private" || repo.visibility === "internal";
  const saysPublic = repo.private === false || repo.visibility === "public";
  if (saysPublic && !saysPrivate) return "public";
  if (saysPrivate && !saysPublic) return "private";
  // Silent, or contradicting itself. Either way Kreds cannot tell.
  return "unknown";
}
