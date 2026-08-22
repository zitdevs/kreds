import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Flat config, composed directly.
 *
 * eslint-config-next 16 exports flat config arrays from its subpaths, so the
 * FlatCompat wrapper this used to need is gone. Keeping it would fail anyway:
 * `@eslint/eslintrc` throws "Converting circular structure to JSON" when handed
 * the v16 config.
 */
const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default eslintConfig;
