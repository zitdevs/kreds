import { describe, expect, it } from "vitest";

import {
  ACTIVITY_CONSENT_KINDS,
  CURRENT_ACTIVITY_CONSENT,
  PRIVATE_ACTIVITY_CONSENT,
  PUBLIC_ACTIVITY_CONSENT,
  publishedActivityConsent,
} from "./activity-consent.js";

/**
 * What a person agreed to is the text they were shown, and the version is the
 * only thing a consent record keeps of it. So a published version's text is
 * pinned here word for word: editing it without minting a new version would
 * silently change what every existing record means.
 */
describe("published activity consent", () => {
  it("pins the public-activity text shown at sign-in", () => {
    expect(publishedActivityConsent("public-activity-v1")).toEqual({
      kind: "PUBLIC_ACTIVITY",
      version: "public-activity-v1",
      text: "By continuing, you let Kreds read your public GitHub activity: your pull requests and code reviews. Never your code. You can revoke this at any time from your dashboard.",
    });
  });

  it("pins the private-activity text shown before the private grant", () => {
    expect(publishedActivityConsent("private-activity-v1")).toEqual({
      kind: "PRIVATE_ACTIVITY",
      version: "private-activity-v1",
      text: "By continuing, you also let Kreds read your pull requests and code reviews in private repositories. GitHub's permission for this reaches code too; Kreds never reads it. Private work earns points, never KRED. You can revoke this at any time from your dashboard.",
    });
  });

  it("offers the current terms of each kind, and those are published", () => {
    expect(CURRENT_ACTIVITY_CONSENT.PUBLIC_ACTIVITY).toBe(PUBLIC_ACTIVITY_CONSENT);
    expect(CURRENT_ACTIVITY_CONSENT.PRIVATE_ACTIVITY).toBe(PRIVATE_ACTIVITY_CONSENT);
    for (const kind of ACTIVITY_CONSENT_KINDS) {
      const current = CURRENT_ACTIVITY_CONSENT[kind];
      expect(current.kind).toBe(kind);
      expect(publishedActivityConsent(current.version)).toBe(current);
    }
  });

  /** A version nobody was shown is not something anybody agreed to. */
  it("knows no version it never published", () => {
    expect(publishedActivityConsent("public-activity-v0")).toBeNull();
    expect(publishedActivityConsent("")).toBeNull();
  });

  it("cannot be edited at runtime", () => {
    expect(Object.isFrozen(PUBLIC_ACTIVITY_CONSENT)).toBe(true);
    expect(Object.isFrozen(CURRENT_ACTIVITY_CONSENT)).toBe(true);
  });
});
