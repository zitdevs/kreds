import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";

import type { GitHubInstallationId, RelevanceSignals } from "@kreds/domain";

import { GitHubAppService } from "../github/github-app.service.js";

const GITHUB_API = "https://api.github.com";

const repository = z.object({
  stargazers_count: z.number().int().nonnegative(),
  forks_count: z.number().int().nonnegative(),
  created_at: z.string(),
});

const searchResult = z.object({ total_count: z.number().int().nonnegative() });

export interface FetchedSignals {
  readonly signals: RelevanceSignals;
  /**
   * Signals Kreds could not fetch.
   *
   * They are reported as zero, which lowers both the score and the breadth. That
   * under-credits, which is the safe direction, and recording the list is what
   * keeps a low score legible: a repository that looks thin because it is thin
   * is a different fact from one that looks thin because a request failed.
   */
  readonly unfetched: readonly (keyof RelevanceSignals)[];
}

/**
 * Read the public signals GitHub already shows the world.
 *
 * Nothing here is secret and nothing here decides issuance. These are the same
 * numbers anybody can see on a repository page, gathered so that a contributor
 * can be shown why a project looks established and so a self-hosted instance
 * can run with no Network at all.
 *
 * Read-only throughout, using the installation's own token, which is minted per
 * call and never stored.
 */
@Injectable()
export class GitHubSignalsService {
  private readonly logger = new Logger(GitHubSignalsService.name);

  constructor(private readonly app: GitHubAppService) {}

  async fetch(
    installationId: GitHubInstallationId,
    nameWithOwner: string,
  ): Promise<FetchedSignals> {
    const token = await this.app.installationToken(installationId);
    const unfetched: (keyof RelevanceSignals)[] = [];

    const get = async <T>(path: string, schema: z.ZodType<T>): Promise<T | null> => {
      try {
        const response = await fetch(`${GITHUB_API}${path}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "kreds",
          },
        });
        if (!response.ok) {
          this.logger.warn(`GitHub answered ${response.status} for ${path}.`);
          return null;
        }
        const parsed = schema.safeParse(await response.json());
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    };

    /**
     * Count a paginated collection without downloading it.
     *
     * GitHub reports the last page in the `Link` header, so one request with a
     * page size of one gives the total. Downloading every contributor to count
     * them would burn the rate limit on a number the header already carries.
     */
    const count = async (path: string): Promise<number | null> => {
      try {
        const response = await fetch(`${GITHUB_API}${path}?per_page=1`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "kreds",
          },
        });
        if (!response.ok) return null;

        const link = response.headers.get("link");
        if (!link) {
          // No pagination means zero or one item, and the body says which.
          const body = (await response.json()) as unknown[];
          return Array.isArray(body) ? body.length : 0;
        }
        const last = /[?&]page=(\d+)>;\s*rel="last"/.exec(link);
        return last?.[1] ? Number(last[1]) : null;
      } catch {
        return null;
      }
    };

    const search = async (query: string): Promise<number | null> => {
      const result = await get(
        `/search/issues?q=${encodeURIComponent(query)}&per_page=1`,
        searchResult,
      );
      return result?.total_count ?? null;
    };

    const [repo, contributors, releases, commits, mergedPrs, issues] = await Promise.all([
      get(`/repos/${nameWithOwner}`, repository),
      count(`/repos/${nameWithOwner}/contributors`),
      count(`/repos/${nameWithOwner}/releases`),
      count(`/repos/${nameWithOwner}/commits`),
      search(`repo:${nameWithOwner} is:pr is:merged`),
      search(`repo:${nameWithOwner} is:issue`),
    ]);

    const take = <K extends keyof RelevanceSignals>(key: K, value: number | null): number => {
      if (value === null) {
        unfetched.push(key);
        return 0;
      }
      return value;
    };

    if (!repo) {
      unfetched.push("stars", "forks", "ageDays");
    }

    // Kreds does not ask for the organization members permission, so it cannot
    // tell an external contributor from a member. Reported as unfetched rather
    // than guessed: this signal is one of the strongest pieces of evidence a
    // repository can have and inventing it would be inventing legitimacy.
    unfetched.push("externalContributors");

    return {
      signals: {
        stars: repo?.stargazers_count ?? 0,
        forks: repo?.forks_count ?? 0,
        ageDays: repo ? daysSince(repo.created_at) : 0,
        contributors: take("contributors", contributors),
        externalContributors: 0,
        mergedPullRequests: take("mergedPullRequests", mergedPrs),
        issueActivity: take("issueActivity", issues),
        releases: take("releases", releases),
        commits: take("commits", commits),
      },
      unfetched,
    };
  }
}

function daysSince(iso: string): number {
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / 86_400_000));
}
