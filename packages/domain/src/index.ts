/**
 * The Kreds domain model.
 *
 * Pure TypeScript: no framework, no database, no I/O, no dependencies. Every
 * type and function here can be exercised without starting a server, which is
 * the point, the economic rules are the part most worth testing and the least
 * worth coupling to a framework.
 *
 * Everything in this package is subordinate to the Kreds Economic Constitution.
 * Where a name, an invariant or a default appears below, the law that governs
 * it is cited at its definition. See `ECONOMIC_CONSTITUTION.md` at the root of
 * this repository.
 *
 * Three things are deliberately absent:
 *
 * - **Operational thresholds.** Credit limits, trust tiers, decay windows and
 *   detection heuristics are unpublished policy. They are loaded as versioned
 *   configuration, never compiled in (Law XV).
 * - **Stored balances.** There is no `balance` field on any account. Balances
 *   are derived from ledger entries (Law II).
 * - **Any path from points to KRED.** Not a guard that refuses one, no path
 *   at all (Law XXVI).
 */

export type { Brand } from "./primitives/brand.js";

export {
  KREDBITS_PER_KRED,
  ZERO_KREDBITS,
  addKredbits,
  formatKred,
  fromKred,
  kredbits,
  splitKredbits,
  subtractKredbits,
  takeFee,
  type Kredbits,
} from "./primitives/money.js";

export {
  ZERO_POINTS,
  awardPoints,
  invalidatePoints,
  points,
  type InvalidationReason,
  type Points,
} from "./primitives/points.js";

export {
  accountId,
  contributionId,
  currencyId,
  debtId,
  economyId,
  gitHubLogin,
  gitHubUserId,
  idempotencyKey,
  ledgerEntryId,
  organizationId,
  pullRequestId,
  receivableId,
  repositoryId,
  reviewFundId,
  reviewId,
  rulesVersion,
  seasonId,
  transactionId,
  treasuryId,
  userId,
  type AccountId,
  type ContributionId,
  type CurrencyId,
  type DebtId,
  type EconomyId,
  type GitHubLogin,
  type GitHubUserId,
  type IdempotencyKey,
  type LedgerEntryId,
  type OrganizationId,
  type PullRequestId,
  type ReceivableId,
  type RepositoryId,
  type ReviewFundId,
  type ReviewId,
  type RulesVersion,
  type SeasonId,
  type TransactionId,
  type TreasuryId,
  type UserId,
} from "./primitives/ids.js";

export {
  ACTOR_TYPES,
  IDENTITY_STATUSES,
  canPerformVoluntaryEconomicAction,
  canReceiveVerifiedEarnings,
  canReceiveVoluntaryTransfer,
  earnsEconomicRewards,
  type ActorType,
  type GitHubIdentity,
  type IdentityStatus,
  type User,
} from "./identity/identity.js";

export {
  isStructurallyIndependentReviewer,
  type EconomicEligibility,
  type Organization,
  type PullRequest,
  type Repository,
  type RepositoryTrustTier,
  type Review,
  type ReviewState,
} from "./github/github.js";

export {
  recognitionSurvivesUnfundedReward,
  type Contribution,
  type ContributionKind,
  type ContributionScore,
} from "./contribution/contribution.js";

export {
  holdsOfficialKred,
  mayIssueOfficialKred,
  type Currency,
  type CurrencyType,
  type Economy,
  type EconomyType,
} from "./economy/economy.js";

export {
  FUNDING_WATERFALL,
  type Account,
  type AccountType,
  type FundingSource,
  type ReviewFund,
  type ReviewLiabilityMode,
  type Treasury,
} from "./economy/account.js";

export {
  derivePosition,
  netPosition,
  type EconomicPosition,
  type NetPosition,
  type PositionSources,
} from "./economy/position.js";

export {
  MOVES_NO_KRED,
  TRANSACTION_TYPES,
  entry,
  transaction,
  type EntryDirection,
  type EntrySourceType,
  type EntryStatus,
  type LedgerEntry,
  type Transaction,
  type TransactionType,
} from "./ledger/ledger.js";

export {
  inSettlementOrder,
  isOutstanding,
  outstandingOn,
  totalDebt,
  totalOutstanding,
  type Debt,
  type DebtScope,
  type Receivable,
  type ReceivableStatus,
} from "./claims/claims.js";

export {
  isSeasonActive,
  versionInForceAt,
  type Policy,
  type PolicyVersion,
  type Season,
} from "./policy/policy.js";

export {
  MAXIMUM_SUPPLY,
  SUPPLY_TERMS,
  reconcileSupply,
  type SupplyInputs,
  type SupplyReconciliation,
} from "./invariants/supply.js";
