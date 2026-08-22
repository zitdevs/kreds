/**
 * Where economic evidence came from, and the fact that it is a closed set.
 *
 * Law XXXV, Evidence Comes From the Provider:
 *
 * > "Economic evidence must reach Kreds from the source provider through a
 * > channel the beneficiary does not control. No client, browser extension,
 * > local agent, or self-hosted node may originate an economic claim."
 *
 * 26 gives the reason, and it is arithmetic rather than distrust: "Anything a
 * client is trusted to send, an attacker sends directly with curl: no
 * repository, no account history, no work. It bypasses repository eligibility
 * entirely, because there is no repository to evaluate."
 *
 * And it forecloses the clever fix in advance: "Signing does not rescue it. A
 * key held on the claimant's machine is a key the claimant can extract and forge
 * with. There is no cryptographic arrangement in which the beneficiary of a
 * claim is also its only attestor."
 *
 * So there is no `CLIENT` member of this union, and no way to add one that does
 * not also change a test that quotes the law.
 */

/** The only two channels evidence may travel through. */
export const INGESTION_MODES = ["PROVIDER_WEBHOOK", "SERVER_SIDE_DELEGATED_QUERY"] as const;

export type IngestionMode = (typeof INGESTION_MODES)[number];

/**
 * What a client may do.
 *
 * 26: "Show a balance on a pull request page, show what a review is likely to be
 * worth, nudge someone toward a teammate's waiting PR. Read-only surface, zero
 * evidentiary weight. That is a real and useful product surface. It is simply
 * not an ingestion path."
 */
export const CLIENT_ROLES = ["DISPLAY_ONLY"] as const;
export type ClientRole = (typeof CLIENT_ROLES)[number];

/**
 * How one piece of evidence arrived.
 *
 * Carried on the evidence rather than inferred later. A field that has to be
 * reconstructed from context is a field that gets reconstructed wrongly once.
 */
export interface Provenance {
  readonly mode: IngestionMode;
  /**
   * The GitHub delivery or query that produced it, for audit.
   *
   * Never a token, never anything derived from one. 26 has evidence travelling
   * "from GitHub to a Kreds server", and which server-held credential happened
   * to make the call is not part of what happened.
   */
  readonly deliveryRef: string;
  /** When the provider says the activity occurred. Not when Kreds saw it. */
  readonly occurredAt: number;
  /** When Kreds observed it. Recorded, and never used to price anything. */
  readonly observedAt: number;
}

export class ClientOriginatedEvidenceError extends Error {
  constructor(readonly presented: string) {
    super(
      `evidence presented as ${presented} did not come from the provider. Law XXXV: a user may grant access to their activity, and may never report it.`,
    );
    this.name = "ClientOriginatedEvidenceError";
  }
}

/**
 * Accept a provenance, or refuse it.
 *
 * The refusal is loud rather than a filter. Silently dropping a claim that came
 * from the wrong place would leave an attacker probing for the shape that gets
 * through, and would leave the operator with no signal that anyone tried.
 */
export function provenance(candidate: {
  mode: string;
  deliveryRef: string;
  occurredAt: number;
  observedAt: number;
}): Provenance {
  if (!(INGESTION_MODES as readonly string[]).includes(candidate.mode)) {
    throw new ClientOriginatedEvidenceError(candidate.mode);
  }
  if (!candidate.deliveryRef.trim()) {
    throw new RangeError("evidence must name the provider delivery or query that produced it.");
  }
  if (!Number.isSafeInteger(candidate.occurredAt) || !Number.isSafeInteger(candidate.observedAt)) {
    throw new RangeError("provenance timestamps are whole milliseconds since the epoch.");
  }
  return Object.freeze({ ...candidate, mode: candidate.mode as IngestionMode });
}

/**
 * The key that makes an event reward exactly once.
 *
 * Built from what GitHub says happened, never from who was holding the token
 * when Kreds asked. Under delegated query the same merge is visible to every
 * collaborator who authorized Kreds, so a key that included the observer would
 * produce one distinct key per observer and pay the same work as many times as
 * it was seen.
 *
 * That is the specific failure mode this function exists to prevent, and it did
 * not exist before A04: under org webhooks each event arrived once.
 */
export function factKey(parts: {
  kind: string;
  gitHubRepositoryId: number;
  gitHubNodeId: string;
}): string {
  const { kind, gitHubRepositoryId, gitHubNodeId } = parts;
  if (!kind.trim() || !gitHubNodeId.trim() || !Number.isSafeInteger(gitHubRepositoryId)) {
    throw new RangeError("a fact key needs a kind, a repository id and the provider's node id.");
  }
  return `${kind}:${gitHubRepositoryId}:${gitHubNodeId}`;
}
