import type { CurrencyId, EconomyId, OrganizationId } from "../primitives/ids.js";
import type { BackingRatio } from "../primitives/money.js";
import type { Timestamp } from "../primitives/time.js";

/**
 * Which economy a balance belongs to.
 *
 * Glossary, Network modes, and 15: Self-Hosted Economies:
 *
 * - `KREDS_NETWORK`: the official economy. Single issuer, shared reserve,
 *   verified settlement (Law I).
 * - `SOVEREIGN_NETWORK`: a network-connected team that issued its own local
 *   currency, KRED-backed (Law XIV: backing is a ratio, never a cash price).
 * - `INDEPENDENT`: a self-hosted instance with no network connection and no
 *   official KRED at all (Law XI, Law XII).
 */
export type EconomyType = "KREDS_NETWORK" | "SOVEREIGN_NETWORK" | "INDEPENDENT";

/**
 * Law X, Local Currency Stays Local, and Law XI.
 *
 * `LOCAL` currency never travels and never implies a claim on the reserve.
 * Holding 4,000 ZIT never means holding KRED.
 */
export type CurrencyType = "KRED" | "LOCAL";

export interface Currency {
  readonly id: CurrencyId;
  readonly type: CurrencyType;
  /** `KRED` for the official currency, an org-chosen ticker such as `ZIT` for a local one. */
  readonly code: string;
  readonly name: string;
  /**
   * How much KRED reserve stands behind this currency, as an exact integer
   * ratio. `null` for official KRED and for independent currencies.
   *
   * Law XIV, Reserve Backing Is Not Fiat Value: publish `1 ZIT = 0.025 KRED`,
   * never `1 KRED = $0.12`. This field is a ratio against KRED and there is
   * deliberately nowhere in the type to put a cash price.
   *
   * A rational pair rather than a `number` because 14's own published figures,
   * `0.025` and `0.05`, are both inexact in binary, and 06: Ledger forbids
   * floating point anywhere in the monetary pipeline.
   */
  readonly backingRatioToKred: BackingRatio | null;
}

/**
 * An accounting universe.
 *
 * Law IV, Organization Boundary: GitHub-derived activity belongs to the economy
 * of the connected organization before it is anything else, even when that
 * organization uses official KRED 1:1 (Law V).
 */
export interface Economy {
  readonly id: EconomyId;
  readonly type: EconomyType;
  /** `null` for the network economy itself. */
  readonly organizationId: OrganizationId | null;
  readonly currencyId: CurrencyId;
  readonly createdAt: Timestamp;
}

/**
 * Whether this economy may hold official KRED.
 *
 * 15: Self-Hosted Economies: "Official KRED does not exist inside an
 * independent economy." An independent instance may print as much of its own
 * currency as it likes; what it cannot do is mint or impersonate official KRED
 * (Law XI).
 */
export function holdsOfficialKred(economy: Economy): boolean {
  return economy.type !== "INDEPENDENT";
}

/**
 * Whether official KRED may be issued into this economy.
 *
 * Law I, Official Issuance: "Official KREDS can only be issued by the Kreds
 * Network." A sovereign economy is network-connected and settles in KRED, but
 * issuance itself has a single choke point, and it is not the organization.
 */
export function mayIssueOfficialKred(economy: Economy): boolean {
  return economy.type === "KREDS_NETWORK" && economy.organizationId === null;
}
