/**
 * The Kreds persistence layer.
 *
 * Rows go in, `@kreds/domain` types come out. Nothing above this package sees
 * a database row, and nothing inside it decides economic questions: the schema
 * records what the domain already established.
 */

export { createDatabase, type Database, type DatabaseOptions } from "./client.js";
export {
  IdentityRepository,
  type ClaimResult,
  type GitHubProfile,
} from "./repositories/identity-repository.js";
export * as schema from "./schema/index.js";
