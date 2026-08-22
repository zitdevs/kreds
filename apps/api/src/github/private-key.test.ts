import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import { readPrivateKey } from "./private-key.js";

/**
 * A real RSA key, generated once per run. Testing PEM handling against a
 * hand-written string would only prove the string matches itself; this proves
 * the result is something `node:crypto` will actually load.
 */
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

describe("a private key survives the dashboard it was pasted into", () => {
  it("passes a clean PEM through untouched", () => {
    expect(readPrivateKey(pem)).toBe(pem.trim());
  });

  /** How a `.env` file or anything shell-escaped mangles it. */
  it("restores newlines from literal backslash-n", () => {
    expect(readPrivateKey(pem.replace(/\n/g, "\\n"))).toBe(pem.trim());
  });

  /** How CI systems that refuse multi-line values carry it. */
  it("decodes a base64 encoded PEM", () => {
    expect(readPrivateKey(Buffer.from(pem).toString("base64"))).toBe(pem.trim());
  });

  it("tolerates surrounding whitespace from a careless paste", () => {
    expect(readPrivateKey(`\n  ${pem}  \n`)).toContain("-----BEGIN");
  });

  it("refuses anything that is not a key in any of those shapes", () => {
    expect(readPrivateKey("")).toBeNull();
    expect(readPrivateKey("   ")).toBeNull();
    expect(readPrivateKey("not a key")).toBeNull();
    // Valid base64, but not of a PEM.
    expect(readPrivateKey(Buffer.from("still not a key").toString("base64"))).toBeNull();
  });
});
