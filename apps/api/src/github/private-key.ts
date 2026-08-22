const PEM_MARKER = "-----BEGIN";

/**
 * Normalise a PEM private key that has been through a dashboard.
 *
 * GitHub hands out a `.pem` file with real newlines. Getting that into an
 * environment variable is where it gets damaged, and every hosting provider
 * damages it differently:
 *
 * - Railway and most web forms keep real newlines, so the value arrives intact.
 * - `.env` files and anything shell-escaped turn them into literal `\n`, two
 *   characters, which OpenSSL rejects with a message about the wrong tag.
 * - Some CI systems refuse multi-line values outright, so the convention is to
 *   base64 the whole file.
 *
 * All three are accepted because the alternative is an operator staring at
 * `error:1E08010C:DECODER routines::unsupported` with no idea that their key is
 * correct and merely reformatted.
 *
 * @returns the key in a shape `node:crypto` accepts, or `null` if it is not a
 * PEM at all in any of those encodings.
 */
export function readPrivateKey(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  if (trimmed.includes(PEM_MARKER)) {
    // Literal backslash-n, put back as real newlines. A key that already has
    // real newlines passes through unchanged, since it contains no `\n` pairs.
    return normalise(trimmed.includes("\\n") ? trimmed.replace(/\\n/g, "\n") : trimmed);
  }

  // Not a PEM on its face. The remaining supported shape is base64 of one.
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8");
    return decoded.includes(PEM_MARKER) ? normalise(decoded) : null;
  } catch {
    return null;
  }
}

/**
 * One shape out, whichever shape came in.
 *
 * Every branch above ends here so that the same key never produces two
 * different strings depending on how it was encoded. The first version trimmed
 * on one path and not the other, which is invisible until something compares
 * two keys that are supposed to be equal.
 */
function normalise(pem: string): string {
  return pem.trim();
}
