import { Injectable, Logger } from "@nestjs/common";

import { InstallationRepository, type RepositoryInput } from "@kreds/database";
import { gitHubInstallationId } from "@kreds/domain";

import {
  accountTypeOf,
  installationEvent,
  installationRepositoriesEvent,
  repositoryEvent,
  type WebhookRepository,
} from "./webhook-payloads.js";

/** What handling a delivery concluded. Mirrors the event states in Phase 3. */
export type HandledOutcome = "PROCESSED" | "IGNORED";

function toInput(repository: WebhookRepository): RepositoryInput {
  return {
    gitHubRepositoryId: repository.id,
    nameWithOwner: repository.full_name,
    isPrivate: repository.private,
    primaryBranch: repository.default_branch ?? null,
  };
}

/**
 * Turns installation webhooks into the connection Kreds keeps.
 *
 * This is the whole of Phase 2's write path. It records who installed the App,
 * on what, and which repositories it may read. Nothing here scores anything or
 * touches money: the App answers "what is happening in your repositories", and
 * what that is worth is decided several phases from now.
 *
 * Every branch is idempotent, because GitHub delivers at least once and the
 * same event arrives repeatedly as a matter of course.
 */
@Injectable()
export class InstallationService {
  private readonly logger = new Logger(InstallationService.name);

  constructor(private readonly installations: InstallationRepository) {}

  /**
   * Route one verified delivery.
   *
   * Unknown event types and unknown actions return `IGNORED` rather than
   * throwing. GitHub sends every event the App is subscribed to, plus new
   * actions it adds over time, and a 500 on an event we do not read would make
   * GitHub retry it forever and eventually mark the endpoint unhealthy.
   */
  async handle(eventType: string, payload: unknown): Promise<HandledOutcome> {
    switch (eventType) {
      case "installation":
        return this.onInstallation(payload);
      case "installation_repositories":
        return this.onInstallationRepositories(payload);
      case "repository":
        return this.onRepository(payload);
      default:
        return "IGNORED";
    }
  }

  private async onInstallation(payload: unknown): Promise<HandledOutcome> {
    const parsed = installationEvent.safeParse(payload);
    if (!parsed.success) return "IGNORED";
    const { action, installation, repositories } = parsed.data;
    const id = gitHubInstallationId(installation.id);

    switch (action) {
      // `new_permissions_accepted` arrives when an owner accepts a permission
      // change on an existing installation. It carries the same payload as
      // `created` and the write is idempotent, so both land here rather than
      // in two branches that would have to be kept in step.
      case "created":
      case "new_permissions_accepted": {
        const saved = await this.installations.install(
          {
            gitHubInstallationId: id,
            accountType: accountTypeOf(installation.account.type),
            accountLogin: installation.account.login,
            accountGitHubId: installation.account.id,
          },
          (repositories ?? []).map(toInput),
        );
        this.logger.log(
          `Installed on ${saved.installation.accountLogin} covering ${saved.repositories.length} repositories.`,
        );
        return "PROCESSED";
      }

      case "deleted":
        await this.installations.setStatus(id, "REMOVED");
        this.logger.log(`Installation ${id} was removed.`);
        return "PROCESSED";

      case "suspend":
        await this.installations.setStatus(id, "SUSPENDED");
        return "PROCESSED";

      case "unsuspend":
        await this.installations.setStatus(id, "ACTIVE");
        return "PROCESSED";

      default:
        return "IGNORED";
    }
  }

  private async onInstallationRepositories(payload: unknown): Promise<HandledOutcome> {
    const parsed = installationRepositoriesEvent.safeParse(payload);
    if (!parsed.success) return "IGNORED";
    const { action, installation, repositories_added, repositories_removed } = parsed.data;
    const id = gitHubInstallationId(installation.id);

    if (action === "added") {
      await this.installations.addRepositories(id, (repositories_added ?? []).map(toInput));
      return "PROCESSED";
    }
    if (action === "removed") {
      await this.installations.removeRepositories(
        id,
        (repositories_removed ?? []).map((repository) => repository.id),
      );
      return "PROCESSED";
    }
    return "IGNORED";
  }

  /**
   * A repository was renamed, transferred, or made private or public.
   *
   * Only repositories Kreds already covers are updated. An event about a
   * repository nobody installed the App on is not ours to record, and creating
   * a row from one would let any repository in an org enter the system without
   * ever being selected.
   */
  private async onRepository(payload: unknown): Promise<HandledOutcome> {
    const parsed = repositoryEvent.safeParse(payload);
    if (!parsed.success) return "IGNORED";
    const { action, repository } = parsed.data;

    if (!["renamed", "transferred", "privatized", "publicized", "edited"].includes(action)) {
      return "IGNORED";
    }

    // A refresh, never an upsert. These events say what a repository is now
    // called, not that Kreds should start watching it: routing them through
    // the upsert would re-cover a repository its owner had deselected.
    const refreshed = await this.installations.refreshRepository(toInput(repository));
    return refreshed ? "PROCESSED" : "IGNORED";
  }
}
