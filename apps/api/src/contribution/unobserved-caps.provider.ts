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
 * missing setting, and it costs an operator nothing they will not notice: work
 * an independent human reviewed is unaffected, so a reviewed economy runs
 * complete without this ever being set.
 */
export const UNOBSERVED_CAPS = Symbol("UNOBSERVED_CAPS");

export function readUnobservedCaps(config: ConfigService<Env, true>): UnobservedCaps {
  const perUserPerDay = config.get("UNOBSERVED_POINTS_PER_DAY", { infer: true });
  const perUserPerMonth = config.get("UNOBSERVED_POINTS_PER_MONTH", { infer: true });

  if (perUserPerDay === undefined || perUserPerMonth === undefined) {
    return NO_UNOBSERVED_ALLOWANCE;
  }
  return unobservedCaps({ perUserPerDay, perUserPerMonth });
}
