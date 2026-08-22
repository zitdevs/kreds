import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { isSignatureValid } from "./webhook-signature.js";

const SECRET = "a-webhook-secret";
const body = Buffer.from(JSON.stringify({ action: "created", installation: { id: 1 } }));

function sign(payload: Buffer, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

describe("only GitHub gets through", () => {
  it("accepts a delivery signed with the configured secret", () => {
    expect(isSignatureValid(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects one signed with a different secret", () => {
    expect(isSignatureValid(body, sign(body, "not-the-secret"), SECRET)).toBe(false);
  });

  /**
   * The attack the raw body exists to stop. These two bodies are the same JSON
   * and different bytes, so a signature over one must not validate the other.
   * If it did, an attacker could rewrite the payload as long as it parsed to
   * something equivalent.
   */
  it("rejects a body that was re-serialised after signing", () => {
    const original = Buffer.from('{"action":"created","installation":{"id":1}}');
    const reserialised = Buffer.from(JSON.stringify(JSON.parse(original.toString()), null, 2));
    expect(isSignatureValid(reserialised, sign(original), SECRET)).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const tampered = Buffer.from(JSON.stringify({ action: "created", installation: { id: 2 } }));
    expect(isSignatureValid(tampered, sign(body), SECRET)).toBe(false);
  });

  it("rejects a missing signature, a missing body and an empty header", () => {
    expect(isSignatureValid(body, undefined, SECRET)).toBe(false);
    expect(isSignatureValid(undefined, sign(body), SECRET)).toBe(false);
    expect(isSignatureValid(body, "", SECRET)).toBe(false);
  });

  /**
   * GitHub still sends the legacy `x-hub-signature` header with a sha1 digest.
   * Accepting that shape here would let a forger pick the weaker hash by
   * choosing which header to send.
   */
  it("refuses a sha1 signature outright", () => {
    const sha1 = `sha1=${createHmac("sha1", SECRET).update(body).digest("hex")}`;
    expect(isSignatureValid(body, sha1, SECRET)).toBe(false);
  });

  it("refuses a bare digest with no algorithm prefix", () => {
    const bare = createHmac("sha256", SECRET).update(body).digest("hex");
    expect(isSignatureValid(body, bare, SECRET)).toBe(false);
  });

  /**
   * A truncated signature has a different length, which is the case
   * `timingSafeEqual` throws on. It must come back as an ordinary `false`.
   */
  it("does not throw on a truncated signature", () => {
    const truncated = sign(body).slice(0, 20);
    expect(() => isSignatureValid(body, truncated, SECRET)).not.toThrow();
    expect(isSignatureValid(body, truncated, SECRET)).toBe(false);
  });

  it("signs an empty body correctly rather than short-circuiting", () => {
    const empty = Buffer.alloc(0);
    expect(isSignatureValid(empty, sign(empty), SECRET)).toBe(true);
    expect(isSignatureValid(empty, sign(body), SECRET)).toBe(false);
  });
});
