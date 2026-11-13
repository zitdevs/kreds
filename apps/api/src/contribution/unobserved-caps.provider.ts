import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { NO_UNOBSERVED_ALLOWANCE, unobservedCaps, type UnobservedCaps } from "@kreds/domain";

import type { Env } from "../config/env.js";

/**
 * The allowance for Contribution Points where nobody independent was watching.
 *
 * 24: "Caps are operational policy and are not published." This repository is
 * public, so it cannot carry them, and there is no default here for the same
 * reason there is none in the domain: a default would be a published number.
 *
 * An instance that has not configured them awards nothing in unobserved
 * contexts rather than awarding without a bound. That is Law XIX applied to a
 * missing setting. Work an independent human reviewed is unaffected, so a
 * reviewed economy runs complete without this ever being set.
 *
 * Failing closed is the right direction; failing quietly is not. A cap that
 * stopped working without a word is the defect this provider was written to
 * fix, so a missing or half-set allowance is announced at startup. The message
 * names the missing variables and never a configured value.
 */
export const UNOBSERVED_CAPS = Symbol("UNOBSERVED_CAPS");

export function readUnobservedCaps(config: ConfigService<Env, true>): UnobservedCaps {
  const perUserPerDay = config.get("UNOBSERVED_POINTS_PER_DAY", { infer: true });
  const perUserPerMonth = config.get("UNOBSERVED_POINTS_PER_MONTH", { infer: true });

  if (perUserPerDay === undefined || perUserPerMonth === undefined) {
    const missing = [
      perUserPerDay === undefined ? "UNOBSERVED_POINTS_PER_DAY" : null,
      perUserPerMonth === undefined ? "UNOBSERVED_POINTS_PER_MONTH" : null,
    ].filter((name): name is string => name !== null);

    new Logger("UnobservedCaps").warn(
      `${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not set, so ` +
        "Contribution Points in unobserved contexts are capped at zero. Both " +
        "variables are required; setting only one has no effect.",
    );
    return NO_UNOBSERVED_ALLOWANCE;
  }
  return unobservedCaps({ perUserPerDay, perUserPerMonth });
}
