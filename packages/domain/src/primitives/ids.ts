import type { Brand } from "./brand.js";

/**
 * Identifiers are branded so that one kind cannot be passed where another is
 * expected. They are all strings underneath, which without nominal typing makes
 * every identifier in the system mutually assignable, and an account id landing
 * in a repository field is the sort of mistake that only shows up in the ledger.
 */
export type EconomyId = Brand<string, "EconomyId">;
export type CurrencyId = Brand<string, "CurrencyId">;
export type OrganizationId = Brand<string, "OrganizationId">;
export type RepositoryId = Brand<string, "RepositoryId">;
export type UserId = Brand<string, "UserId">;
export type AccountId = Brand<string, "AccountId">;
export type TransactionId = Brand<string, "TransactionId">;
export type LedgerEntryId = Brand<string, "LedgerEntryId">;
export type PullRequestId = Brand<string, "PullRequestId">;
export type ReviewId = Brand<string, "ReviewId">;
export type ContributionId = Brand<string, "ContributionId">;
export type DebtId = Brand<string, "DebtId">;
export type ReceivableId = Brand<string, "ReceivableId">;
export type TreasuryId = Brand<string, "TreasuryId">;
export type ReviewFundId = Brand<string, "ReviewFundId">;
export type SeasonId = Brand<string, "SeasonId">;

/**
 * A GitHub numeric user id.
 *
 * 09: Identity and Unclaimed Accounts:
 *
 * > "Identity is keyed on `githubUserId`, not `login`. Logins are renameable
 * >  and reusable; the numeric ID is not. Keying on a mutable handle would let
 * >  an attacker inherit someone else's economic history by claiming a freed
 * >  username."
 *
 * The type exists so that a `login` cannot be used as a key by accident.
 */
export type GitHubUserId = Brand<number, "GitHubUserId">;

/** A GitHub login. Display only, never a key. See `GitHubUserId`. */
export type GitHubLogin = Brand<string, "GitHubLogin">;

/**
 * The stable key that makes a GitHub-derived economic event idempotent.
 *
 * 06: Ledger, Idempotency: GitHub delivers webhooks *at least once*, so a
 * duplicate delivery must never duplicate a reward.
 */
export type IdempotencyKey = Brand<string, "IdempotencyKey">;

/**
 * The policy version in force when an entry was created.
 *
 * Law XV, Rules May Change, History May Not: every transaction stores the
 * version that produced it, which is what keeps a past balance defensible.
 */
export type RulesVersion = Brand<string, "RulesVersion">;

const requireNonEmpty = (kind: string, value: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${kind} must be a non-empty string.`);
  }
  return value;
};

export const economyId = (value: string): EconomyId =>
  requireNonEmpty("EconomyId", value) as EconomyId;
export const currencyId = (value: string): CurrencyId =>
  requireNonEmpty("CurrencyId", value) as CurrencyId;
export const organizationId = (value: string): OrganizationId =>
  requireNonEmpty("OrganizationId", value) as OrganizationId;
export const repositoryId = (value: string): RepositoryId =>
  requireNonEmpty("RepositoryId", value) as RepositoryId;
export const userId = (value: string): UserId => requireNonEmpty("UserId", value) as UserId;
export const accountId = (value: string): AccountId =>
  requireNonEmpty("AccountId", value) as AccountId;
export const transactionId = (value: string): TransactionId =>
  requireNonEmpty("TransactionId", value) as TransactionId;
export const ledgerEntryId = (value: string): LedgerEntryId =>
  requireNonEmpty("LedgerEntryId", value) as LedgerEntryId;
export const pullRequestId = (value: string): PullRequestId =>
  requireNonEmpty("PullRequestId", value) as PullRequestId;
export const reviewId = (value: string): ReviewId => requireNonEmpty("ReviewId", value) as ReviewId;
export const contributionId = (value: string): ContributionId =>
  requireNonEmpty("ContributionId", value) as ContributionId;
export const debtId = (value: string): DebtId => requireNonEmpty("DebtId", value) as DebtId;
export const receivableId = (value: string): ReceivableId =>
  requireNonEmpty("ReceivableId", value) as ReceivableId;
export const treasuryId = (value: string): TreasuryId =>
  requireNonEmpty("TreasuryId", value) as TreasuryId;
export const reviewFundId = (value: string): ReviewFundId =>
  requireNonEmpty("ReviewFundId", value) as ReviewFundId;
export const seasonId = (value: string): SeasonId => requireNonEmpty("SeasonId", value) as SeasonId;
export const idempotencyKey = (value: string): IdempotencyKey =>
  requireNonEmpty("IdempotencyKey", value) as IdempotencyKey;
export const rulesVersion = (value: string): RulesVersion =>
  requireNonEmpty("RulesVersion", value) as RulesVersion;
export const gitHubLogin = (value: string): GitHubLogin =>
  requireNonEmpty("GitHubLogin", value) as GitHubLogin;

export function gitHubUserId(value: number): GitHubUserId {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`GitHubUserId must be a positive integer, received ${value}.`);
  }
  return value as GitHubUserId;
}
