import type {
  AccountId,
  CurrencyId,
  EconomyId,
  OrganizationId,
  RepositoryId,
  ReviewFundId,
  TreasuryId,
  UserId,
} from "../primitives/ids.js";
import type { Timestamp } from "../primitives/time.js";

/**
 * Every kind of ledger-addressable holder.
 *
 * These are exactly the terms of the supply equation in 19: Invariants:
 *
 * ```text
 * Central Bank Reserve + Global User Wallets + Organization KRED Positions
 * + Organization Treasuries + Organization Review Funds + Pending Accounts
 * + Network Reserves + Other Official Accounts + Burned Supply = Maximum Supply
 * ```
 *
 * Keeping the union aligned with the equation is what lets the conservation
 * check be written as a fold over accounts rather than a hand-maintained list.
 * Note that `BURNED` is a term, not an exclusion: burned KRED is accounted for
 * as destroyed, it never simply disappears from the books.
 */
export type AccountType =
  /** The reserve official KRED is issued from and returns to (Law I). */
  | "CENTRAL_BANK_RESERVE"
  /** A user's single settled official KRED account (Law IX). */
  | "GLOBAL_WALLET"
  /** A user's org-scoped accounting context, same currency (Law IV, Law V). */
  | "ORGANIZATION_POSITION"
  /**
   * A user's own accounting context, where no Kreds Team owns the work.
   *
   * Added by A04. 26: "This is not a lighter tier. It is the same accounting
   * with a different boundary, because Law VII does not care whether an
   * organization happens to be involved." It is a term in the supply equation
   * on the same footing as an organization position, which is why it is a
   * member of this union rather than a flag on one.
   */
  | "PERSONAL_POSITION"
  /** An org-held account funding challenges, grants and reviewer support. */
  | "TREASURY"
  /** An org or repo account that finances review labour (Law XXII). */
  | "REVIEW_FUND"
  /** Value earned but still inside the settlement window. */
  | "PENDING"
  /** Reserve held at network level, including the credit facility. */
  | "NETWORK_RESERVE"
  /** Protocol fee and other official accounts. */
  | "PROTOCOL"
  /** Permanently removed from circulation, still on the books. */
  | "BURNED";

/**
 * Any ledger-addressable holder.
 *
 * There is no `balance` field. Law II makes balances derived, and the way to
 * get one is `derivePosition`, from entries. An account is an address, not a
 * bucket.
 */
export interface Account {
  readonly id: AccountId;
  readonly type: AccountType;
  readonly economyId: EconomyId;
  readonly currencyId: CurrencyId;
  /** `null` for network-level accounts. */
  readonly organizationId: OrganizationId | null;
  /** Set for wallets and organization positions. */
  readonly userId?: UserId;
  readonly createdAt: Timestamp;
}

/**
 * An organization-held account.
 *
 * 08: Treasuries. Funds challenges, achievements, season rewards, internal
 * grants and reviewer support, and acts as the org's shock absorber.
 *
 * A treasury is **not** a step in the review funding waterfall. Treasury KRED
 * must be explicitly allocated into a Review Fund first, because "an automatic
 * treasury drain would let review costs consume an organization's entire
 * balance without anyone deciding that should happen".
 */
export interface Treasury {
  readonly id: TreasuryId;
  readonly accountId: AccountId;
  readonly organizationId: OrganizationId;
  readonly createdAt: Timestamp;
}

/**
 * An account whose only purpose is financing review labour when individual
 * contributors cannot fully pay.
 *
 * 08: Treasuries, Review Fund, added by Amendment A01. It is the second step of
 * the funding waterfall, sitting between the author's own balance and the
 * network credit facility.
 *
 * A03 added that fund-to-reviewer flows are watched: a fund accepts
 * contributions at no fee and pays reviewers at the standard review fee, which
 * without controls is a transfer channel that bypasses personal-transfer
 * limits. The detection rules themselves are not published and are not
 * implemented here.
 */
export interface ReviewFund {
  readonly id: ReviewFundId;
  readonly accountId: AccountId;
  readonly organizationId: OrganizationId;
  /** Set when the fund belongs to one repository rather than the whole org. */
  readonly repositoryId?: RepositoryId;
  /** Whether the fund and its contributors are publicly visible. */
  readonly isPublic: boolean;
  readonly createdAt: Timestamp;
}

/**
 * The order in which a review is paid for.
 *
 * 23: Review Funding, Debt and Credit, The funding waterfall:
 *
 * ```text
 * 1. Author's settled organization KRED
 * 2. Project / Organization Review Fund
 * 3. Kreds Review Credit Facility
 * 4. Unsettled Review Receivable
 * ```
 *
 * Law XXII makes this list **closed**: "New funding sources may be added only
 * by constitutional amendment." The A03 audit added the two bounded Central
 * Bank programs, platform-funded review rewards and unclaimed-debt protection
 * payments, which sit outside the waterfall and carry the same eligibility
 * gates.
 */
export const FUNDING_WATERFALL = [
  "AUTHOR_BALANCE",
  "REVIEW_FUND",
  "CREDIT_FACILITY",
  "RECEIVABLE",
] as const;

export type FundingSource = (typeof FUNDING_WATERFALL)[number];

/**
 * Who an organization holds responsible for review costs.
 *
 * 23: Review Funding, Debt and Credit, Configurable review liability.
 * "Default: Author Pays, with Review Fund fallback."
 */
export type ReviewLiabilityMode = "AUTHOR_PAYS" | "TEAM_PAYS" | "HYBRID" | "PROJECT_SPONSORED";
