import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** Plain TypeScript, no framework preset: this app is NestJS rather than Next. */
const eslintConfig = [
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // NestJS providers are classes whose constructor parameters are the API.
      "@typescript-eslint/no-extraneous-class": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];

export default eslintConfig;
