import { describe, expect, it } from "vitest";

import { validateEnv } from "./env.js";

const REQUIRED = {
  KREDS_API_URL: "https://api.kreds.sh",
  KREDS_URL: "https://kreds.sh",
  KREDS_APP_URL: "https://app.kreds.sh",
  AUTH_SECRET: "a".repeat(32),
  DATABASE_URL: "postgres://kreds:kreds@localhost:5432/kreds",
  AUTH_GITHUB_ID: "Ov23liEXAMPLE",
  AUTH_GITHUB_SECRET: "shhh",
};

/** The same environment minus one or more names, without unused bindings. */
function without(...names: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(REQUIRED).filter(([key]) => !names.includes(key)));
}

describe("an instance with no GitHub App still boots", () => {
  it("accepts an environment where the App is absent entirely", () => {
    expect(() => validateEnv({ ...REQUIRED })).not.toThrow();
  });

  /**
   * The failure this guards against, and it is not hypothetical: these values
   * live in a secrets manager that syncs to production, where a save triggers a
   * deploy. A secrets manager holds a key before it holds a value, so there is
   * always a moment where `GITHUB_APP_PRIVATE_KEY` exists and is empty.
   *
   * With `.min(1).optional()`, `optional()` forgives only `undefined`, so that
   * moment would refuse to boot the whole API and take identity down with it,
   * over a variable nobody had finished filling in.
   */
  it("treats a blank App variable as absent rather than refusing to boot", () => {
    expect(() =>
      validateEnv({
        ...REQUIRED,
        GITHUB_APP_ID: "",
        GITHUB_APP_PRIVATE_KEY: "",
        GITHUB_WEBHOOK_SECRET: "",
      }),
    ).not.toThrow();
  });

  it("treats a whitespace-only value the same way", () => {
    const env = validateEnv({ ...REQUIRED, GITHUB_WEBHOOK_SECRET: "   \n  " });
    expect(env.GITHUB_WEBHOOK_SECRET).toBeUndefined();
  });

  it("still reads a real value, trimmed", () => {
    const env = validateEnv({ ...REQUIRED, GITHUB_APP_ID: "  4682577  " });
    expect(env.GITHUB_APP_ID).toBe("4682577");
  });
});

describe("the values that are not optional stay required", () => {
  /**
   * The blank-is-absent rule applies only to the App. A blank AUTH_SECRET must
   * still stop the process: an instance that boots without a signing key issues
   * sessions nobody can trust.
   */
  it("refuses a blank session signing key", () => {
    expect(() => validateEnv({ ...REQUIRED, AUTH_SECRET: "" })).toThrow(/AUTH_SECRET/);
  });

  it("refuses a missing database", () => {
    expect(() => validateEnv(without("DATABASE_URL"))).toThrow(/DATABASE_URL/);
  });

  it("names every problem at once, rather than one per restart", () => {
    expect(() => validateEnv(without("AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"))).toThrow(
      /AUTH_GITHUB_ID[\s\S]*AUTH_GITHUB_SECRET/,
    );
  });
});
