import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NO_UNOBSERVED_ALLOWANCE } from "@kreds/domain";

import type { Env } from "../config/env.js";
import { readUnobservedCaps } from "./unobserved-caps.provider.js";

function config(values: Partial<Record<keyof Env, number>>): ConfigService<Env, true> {
  return { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>;
}

function captureWarnings() {
  return vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * An unconfigured allowance fails closed, to zero unobserved points. That is
 * the right direction to fail, and it must still be loud: a cap that stopped
 * working silently is the defect this provider was written to fix.
 */
describe("reading the unobserved allowance", () => {
  it("warns, naming both variables, when neither is set", () => {
    const warn = captureWarnings();

    expect(readUnobservedCaps(config({}))).toBe(NO_UNOBSERVED_ALLOWANCE);

    expect(warn).toHaveBeenCalledOnce();
    const [message] = warn.mock.calls[0] as [string];
    expect(message).toContain("UNOBSERVED_POINTS_PER_DAY");
    expect(message).toContain("UNOBSERVED_POINTS_PER_MONTH");
  });

  /**
   * Half a configuration is the easier one to miss: the operator set
   * something and reasonably assumes it took effect.
   */
  it("warns, naming the missing one, when only one is set", () => {
    const warn = captureWarnings();

    expect(readUnobservedCaps(config({ UNOBSERVED_POINTS_PER_DAY: 7319 }))).toBe(
      NO_UNOBSERVED_ALLOWANCE,
    );

    const [message] = warn.mock.calls[0] as [string];
    expect(message).toContain("UNOBSERVED_POINTS_PER_MONTH");
    expect(message).not.toContain("UNOBSERVED_POINTS_PER_DAY is not set");
  });

  /** 24: "Caps are operational policy and are not published." Logs included. */
  it("never logs a configured value", () => {
    const warn = captureWarnings();

    readUnobservedCaps(config({ UNOBSERVED_POINTS_PER_DAY: 7319 }));

    const [message] = warn.mock.calls[0] as [string];
    expect(message).not.toContain("7319");
  });

  it("stays quiet when both are set", () => {
    const warn = captureWarnings();

    const caps = readUnobservedCaps(
      config({ UNOBSERVED_POINTS_PER_DAY: 7319, UNOBSERVED_POINTS_PER_MONTH: 8461 }),
    );

    expect(caps).not.toBe(NO_UNOBSERVED_ALLOWANCE);
    expect(warn).not.toHaveBeenCalled();
  });
});
