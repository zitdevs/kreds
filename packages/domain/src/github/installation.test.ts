import { describe, expect, it } from "vitest";

import { gitHubInstallationId } from "../primitives/ids.js";
import { isProducingActivity, type Installation } from "./installation.js";

describe("installation ids are real ids", () => {
  it("rejects the values GitHub never issues", () => {
    expect(() => gitHubInstallationId(0)).toThrow(RangeError);
    expect(() => gitHubInstallationId(-1)).toThrow(RangeError);
    expect(() => gitHubInstallationId(1.5)).toThrow(RangeError);
    expect(() => gitHubInstallationId(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
  });

  it("accepts a real one", () => {
    expect(gitHubInstallationId(48_291_037)).toBe(48_291_037);
  });
});

describe("only an active installation produces activity", () => {
  const base = { status: "ACTIVE" } as Pick<Installation, "status">;

  it("counts an active installation", () => {
    expect(isProducingActivity(base)).toBe(true);
  });

  /**
   * Suspended and removed are different states for a reason, and neither may
   * keep counting. A suspended installation still owns its history and can come
   * back; that is precisely why it cannot be read as "still running".
   */
  it("counts neither a suspended nor a removed one", () => {
    expect(isProducingActivity({ status: "SUSPENDED" })).toBe(false);
    expect(isProducingActivity({ status: "REMOVED" })).toBe(false);
  });

  /**
   * The reason this predicate exists instead of `status === "ACTIVE"` at every
   * call site. If a fourth status is added, this test is where it has to be
   * decided, rather than being silently treated as active by whichever caller
   * forgot to update its comparison.
   */
  it("treats anything that is not active as not producing", () => {
    const unforeseen = { status: "PENDING_APPROVAL" } as unknown as Pick<Installation, "status">;
    expect(isProducingActivity(unforeseen)).toBe(false);
  });
});
