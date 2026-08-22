import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Encryption for delegated authorization tokens.
 *
 * A04 turns a GitHub token into something Kreds keeps rather than something it
 * uses once and forgets, because 26 has Kreds asking the provider for activity
 * on a schedule: "Kreds asks the provider (server-side query with delegated
 * authorization)".
 *
 * A stored token is a standing grant to read someone's private repositories, so
 * the database is not where it may sit in the clear. The requirements this
 * module exists to satisfy are, in the amendment's terms, that tokens are
 * encrypted at rest, never logged, never in ledger metadata, and never returned
 * to any client.
 *
 * AES-256-GCM rather than CBC or a raw stream, because the tag makes a modified
 * ciphertext fail loudly. A token that decrypts to the wrong bytes would be sent
 * to GitHub, and a token sent to GitHub is a token that can leave in a log line
 * on the way.
 *
 * The class holds no plaintext beyond a call. There is deliberately no cache, no
 * `lastToken`, and no `toString`.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export class TokenKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenKeyError";
  }
}

export class TokenDecryptionError extends Error {
  constructor() {
    // No detail, on purpose. Distinguishing "wrong key" from "tampered
    // ciphertext" tells a caller which half to work on, and one of the possible
    // callers is whoever tampered with it.
    super("a stored authorization could not be read.");
    this.name = "TokenDecryptionError";
  }
}

/** A stored token: ciphertext, its nonce, and its authentication tag. */
export interface SealedToken {
  readonly ciphertext: string;
  readonly nonce: string;
  readonly tag: string;
}

export class TokenCipher {
  private readonly key: Buffer;

  /**
   * @param keyMaterial 32 bytes, base64. Supplied by the operator, never
   * generated here: a key this process invented would be a key that changes on
   * restart, silently orphaning every stored authorization.
   */
  constructor(keyMaterial: string) {
    let key: Buffer;
    try {
      key = Buffer.from(keyMaterial, "base64");
    } catch {
      throw new TokenKeyError("the token encryption key is not valid base64.");
    }
    if (key.length !== KEY_BYTES) {
      throw new TokenKeyError(
        `the token encryption key must be ${KEY_BYTES} bytes of base64, received ${key.length}.`,
      );
    }
    this.key = key;
  }

  /** Encrypt a token for storage. A fresh nonce every time, never reused. */
  seal(token: string): SealedToken {
    if (!token) throw new RangeError("there is no empty token worth storing.");
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, nonce);
    const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    return Object.freeze({
      ciphertext: ciphertext.toString("base64"),
      nonce: nonce.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
    });
  }

  /**
   * Read a stored token back.
   *
   * @throws {TokenDecryptionError} if the ciphertext, nonce or tag was altered,
   * or the key is wrong. Never returns a best effort: a partially correct token
   * is a token that gets sent somewhere.
   */
  open(sealed: SealedToken): string {
    const tag = Buffer.from(sealed.tag, "base64");
    if (tag.length !== TAG_BYTES) throw new TokenDecryptionError();
    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(sealed.nonce, "base64"));
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(Buffer.from(sealed.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new TokenDecryptionError();
    }
  }

  /**
   * Whether two sealed tokens hold the same secret.
   *
   * Constant time over the plaintext, so a comparison does not leak how much of
   * a token was right. Used for rotation checks, never for authentication.
   */
  holdsSame(a: SealedToken, b: SealedToken): boolean {
    const left = Buffer.from(this.open(a), "utf8");
    const right = Buffer.from(this.open(b), "utf8");
    return left.length === right.length && timingSafeEqual(left, right);
  }
}

/**
 * A redaction that is safe to log.
 *
 * Not the first characters of the token, which is the usual shape and is wrong:
 * GitHub tokens carry a fixed prefix, so the "safe" leading characters identify
 * the token type and the rest is what is left to guess. This returns nothing
 * derived from the secret at all.
 */
export function redacted(): string {
  return "[redacted authorization]";
}
