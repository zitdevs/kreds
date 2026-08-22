import type {
  GitHubInstallationId,
  GitHubLogin,
  OrganizationId,
  RepositoryId,
} from "../primitives/ids.js";
import type { Timestamp } from "../primitives/time.js";

/**
 * What kind of GitHub account the App is installed on.
 *
 * 02: GitHub Organizations and Economic Boundaries requires a real
 * organization to create a Kreds Team: "Creating a Kreds Team requires
 * connecting a real GitHub Organization."
 *
 * A personal account is therefore a legitimate installation that creates no
 * Team and no organization economy. Its repositories participate on their own.
 * This is why the two cases are a type rather than a boolean: they lead to
 * different economic structures, not to a flag on one structure.
 */
export type InstallationAccountType = "ORGANIZATION" | "USER";

/**
 * Whether an installation may currently produce economic activity.
 *
 * `SUSPENDED` is GitHub's own state, set when an owner suspends the App
 * without uninstalling it. It is kept distinct from `REMOVED` because the
 * installation and its history still exist and can come back, while a removed
 * installation has to be created again.
 */
export type InstallationStatus = "ACTIVE" | "SUSPENDED" | "REMOVED";

/**
 * One installation of the Kreds GitHub App.
 *
 * This is the connection described in 02, step 2: "Connect/install the Kreds
 * GitHub App." It is the only channel through which Kreds learns what happened
 * in a repository, which is why its lifecycle is recorded rather than inferred.
 *
 * Note what is absent: no access token. Installation tokens last an hour and
 * are minted on demand from the App's private key, so storing one buys nothing
 * and creates a credential that can leak.
 */
export interface Installation {
  readonly gitHubInstallationId: GitHubInstallationId;
  readonly accountType: InstallationAccountType;
  /** The org or user the App is installed on. Display only, and renameable. */
  readonly accountLogin: GitHubLogin;
  /** The numeric account id. Stable across renames, unlike the login. */
  readonly accountGitHubId: number;
  /**
   * The Kreds organization this installation created, when the account is an
   * organization. Null for a personal account, which forms no Team (02).
   */
  readonly organizationId: OrganizationId | null;
  readonly status: InstallationStatus;
  readonly installedAt: Timestamp;
}

/**
 * Whether Kreds should act on activity arriving through this installation.
 *
 * A suspended or removed installation still has rows and history; what it does
 * not have is permission to keep producing new activity. Callers ask this
 * rather than comparing the status themselves, so that a fourth status added
 * later cannot silently start counting.
 */
export function isProducingActivity(installation: Pick<Installation, "status">): boolean {
  return installation.status === "ACTIVE";
}

/** Repositories an installation currently covers. */
export interface InstallationScope {
  readonly gitHubInstallationId: GitHubInstallationId;
  readonly repositoryIds: readonly RepositoryId[];
}
