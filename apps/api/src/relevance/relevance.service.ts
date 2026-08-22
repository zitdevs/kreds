import { Injectable, Logger } from "@nestjs/common";

import { InstallationRepository } from "@kreds/database";
import { gitHubInstallationId, relevanceOf, type RepositoryRelevance } from "@kreds/domain";

import { GitHubSignalsService } from "./github-signals.service.js";

/** A day. Relevance moves slowly, and 25 says trust must move gradually. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface StoredRelevance extends RepositoryRelevance {
  readonly measuredAt: string;
  /** Signals Kreds could not fetch. They counted as absent, which under-credits. */
  readonly unfetched: readonly string[];
}

/**
 * Public repository relevance, measured and cached.
 *
 * Cached because the signals come from GitHub's API and relevance is not a
 * thing that changes minute to minute. 25 is explicit that trust must move
 * gradually so there is no single number to buy, and a measurement recomputed
 * on every read would be a measurement somebody could watch respond.
 *
 * Nothing here writes `trustTier`. That column gates Official issuance and is
 * decided from signals this service cannot see.
 */
@Injectable()
export class RelevanceService {
  private readonly logger = new Logger(RelevanceService.name);

  constructor(
    private readonly installations: InstallationRepository,
    private readonly signals: GitHubSignalsService,
  ) {}

  /**
   * @returns the stored relevance, measuring it first if there is none or it
   * has gone stale. `null` when the repository is unknown or GitHub cannot be
   * reached, which is an absence rather than a score of zero: "Kreds has not
   * measured this" and "this repository has no history" are different facts.
   */
  async forRepository(gitHubRepositoryId: number): Promise<StoredRelevance | null> {
    const stored = await this.installations.findRelevance(gitHubRepositoryId);
    if (stored && Date.now() - stored.measuredAt.getTime() < MAX_AGE_MS) {
      const signals = stored.signals as { unfetched?: string[] } | null;
      return {
        score: stored.score,
        breadth: stored.breadth,
        signals: [],
        singleSignalDominant: false,
        measuredAt: stored.measuredAt.toISOString(),
        unfetched: signals?.unfetched ?? [],
      };
    }
    return this.measure(gitHubRepositoryId);
  }

  /** Fetch the public signals and store what they add up to. */
  async measure(gitHubRepositoryId: number): Promise<StoredRelevance | null> {
    const repository = await this.installations.findRepository(gitHubRepositoryId);
    if (!repository) return null;

    const covered = await this.installations.findInstallationFor(gitHubRepositoryId);
    if (!covered) return null;

    let fetched;
    try {
      fetched = await this.signals.fetch(gitHubInstallationId(covered), repository.nameWithOwner);
    } catch (error) {
      this.logger.warn(
        `Could not measure ${repository.nameWithOwner}: ${(error as Error).message}`,
      );
      return null;
    }

    const relevance = relevanceOf(fetched.signals);
    await this.installations.recordRelevance(gitHubRepositoryId, {
      score: relevance.score,
      breadth: relevance.breadth,
      signals: { ...fetched.signals, unfetched: fetched.unfetched },
    });

    this.logger.log(
      `${repository.nameWithOwner} relevance ${relevance.score} across ${relevance.breadth} signals, ${fetched.unfetched.length} unfetched.`,
    );

    return {
      ...relevance,
      measuredAt: new Date().toISOString(),
      unfetched: fetched.unfetched,
    };
  }
}
