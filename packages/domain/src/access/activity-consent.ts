/**
 * What a person agrees to when they let Kreds read their GitHub activity.
 *
 * Not to be confused with `consent.ts`, which decides who may be *charged*
 * (Law XXXVII). This module is the other half of the same idea: the record
 * that a contributor connected, which 26 makes the contributor's own consent,
 * "through their own authorization". Kreds records it explicitly, with the
 * exact words the person was shown.
 *
 * 26 keeps reading public and private work as "two different decisions with
 * two different grants", so there are two kinds of consent, each with its own
 * text and version.
 *
 * Why the text lives here, in the domain package: the API decides which
 * version a person is agreeing to and records it, and the app has to show the
 * words that version stands for. Both import this one module, so the version
 * the API seals into its OAuth state and the text the app draws above the
 * button cannot drift apart. Nothing here does I/O, which is what lets the app
 * import it at all.
 *
 * A published version's text never changes. A record keeps only the version,
 * so editing the words in place would rewrite what everybody already agreed
 * to. New words mean a new version, added to `PUBLISHED` and made current.
 */

export const ACTIVITY_CONSENT_KINDS = ["PUBLIC_ACTIVITY", "PRIVATE_ACTIVITY"] as const;

export type ActivityConsentKind = (typeof ACTIVITY_CONSENT_KINDS)[number];

export interface ActivityConsentTerms {
  readonly kind: ActivityConsentKind;
  /** What a consent record stores, and the only way back to these words. */
  readonly version: string;
  /** The exact clickwrap text, in English, shown directly above the action. */
  readonly text: string;
}

/** Shown on the sign-in page, above "Continue with GitHub". */
export const PUBLIC_ACTIVITY_CONSENT: ActivityConsentTerms = Object.freeze({
  kind: "PUBLIC_ACTIVITY",
  version: "public-activity-v1",
  text: "By continuing, you let Kreds read your public GitHub activity: your pull requests and code reviews. Never your code. You can revoke this at any time from your dashboard.",
});

/**
 * Shown above "Connect private work".
 *
 * Says plainly that GitHub's `repo` permission reaches code, because there is
 * no narrower one (see the API's `scopes.ts`), and that Kreds does not use
 * that part of it. Law XXIX is restated because it is the first question a
 * person asks before granting it.
 */
export const PRIVATE_ACTIVITY_CONSENT: ActivityConsentTerms = Object.freeze({
  kind: "PRIVATE_ACTIVITY",
  version: "private-activity-v1",
  text: "By continuing, you also let Kreds read your pull requests and code reviews in private repositories. GitHub's permission for this reaches code too; Kreds never reads it. Private work earns points, never KRED. You can revoke this at any time from your dashboard.",
});

/** What a person is asked to agree to today, by kind. */
export const CURRENT_ACTIVITY_CONSENT: Readonly<Record<ActivityConsentKind, ActivityConsentTerms>> =
  Object.freeze({
    PUBLIC_ACTIVITY: PUBLIC_ACTIVITY_CONSENT,
    PRIVATE_ACTIVITY: PRIVATE_ACTIVITY_CONSENT,
  });

/** Every version ever shown to anybody. Append only. */
const PUBLISHED: readonly ActivityConsentTerms[] = Object.freeze([
  PUBLIC_ACTIVITY_CONSENT,
  PRIVATE_ACTIVITY_CONSENT,
]);

/** The words a recorded version stands for, or `null` for one never published. */
export function publishedActivityConsent(version: string): ActivityConsentTerms | null {
  return PUBLISHED.find((terms) => terms.version === version) ?? null;
}
