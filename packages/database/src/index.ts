/**
 * The Kreds persistence layer.
 *
 * Rows go in, `@kreds/domain` types come out. Nothing above this package sees
 * a database row, and nothing inside it decides economic questions: the schema
 * records what the domain already established.
 */

export { createDatabase, ping, type Database, type DatabaseOptions } from "./client.js";
export {
  IdentityRepository,
  type Account,
  type ClaimResult,
  type GitHubProfile,
} from "./repositories/identity-repository.js";
export {
  InstallationRepository,
  type InstallationAccount,
  type InstallationWithRepositories,
  type RepositoryInput,
} from "./repositories/installation-repository.js";
export {
  EventStore,
  type RawDelivery,
  type RecordedDelivery,
  type RecordedDomainEvent,
} from "./repositories/event-store.js";
export { runMigrations } from "./migrate.js";
export * as schema from "./schema/index.js";
