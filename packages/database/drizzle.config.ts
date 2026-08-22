import { defineConfig } from "drizzle-kit";

/**
 * Migrations are generated, reviewed and committed, never applied from a
 * running app on boot without being read first. 06: Ledger requires history to
 * be reconstructible, and a migration nobody reviewed is the fastest way to
 * lose that.
 */
export default defineConfig({
  dialect: "postgresql",
  // Pointed at the table files rather than the barrel: drizzle-kit loads them
  // through CJS require, which does not apply TypeScript's `.js` to `.ts`
  // extension mapping, so a barrel that re-exports `./identity.js` fails to
  // resolve here even though tsc and vitest are happy with it.
  schema: ["./src/schema/identity.ts", "./src/schema/github.ts"],
  out: "./migrations",
  dbCredentials: { url: process.env["DATABASE_URL"] ?? "" },
  strict: true,
  verbose: true,
});
