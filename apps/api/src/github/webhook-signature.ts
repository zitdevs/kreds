import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "x-hub-signature-256";
const PREFIX = "sha256=";

/**
 * Whether a webhook really came from GitHub.
 *
 * This is the only thing standing between the event pipeline and anyone on the
 * internet who knows the URL. A forged `pull_request.closed` is, one phase from
 * now, a forged reward: the whole economy downstream trusts that these payloads
 * are genuine, so the check has to be exact.
 *
 * Three details that are easy to get wrong and all matter:
 *
 * 1. **The raw bytes.** The HMAC covers the body exactly as sent. Parsing to
 *    JSON and re-serialising changes key order and whitespace, and the
 *    signature no longer matches, so the body must be captured before any
 *    parser touches it.
 * 2. **Constant time.** A byte-by-byte comparison that returns early leaks how
 *    much of a guess was right, which is enough to forge a signature one byte
 *    at a time.
 * 3. **The sha1 header is ignored.** GitHub still sends `x-hub-signature` for
 *    compatibility. Accepting it would let an attacker downgrade every delivery
 *    to a broken hash by choosing which header to send.
 */
export function isSignatureValid(
  rawBody: Buffer | undefined,
  header: string | undefined,
  secret: string,
): boolean {
  if (!rawBody || !header || !header.startsWith(PREFIX)) return false;

  const expected = Buffer.from(
    PREFIX + createHmac("sha256", secret).update(rawBody).digest("hex"),
    "utf8",
  );
  const actual = Buffer.from(header, "utf8");

  // timingSafeEqual throws on a length mismatch, which would itself be a
  // side channel, so the lengths are compared first and the answer is the
  // same `false` either way.
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
