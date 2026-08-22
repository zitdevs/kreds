/**
 * Injection tokens for the access module.
 *
 * In their own file rather than in `access.module.ts`, because the service that
 * needs them is a provider of that module: importing the module from the
 * service would close a cycle, and a cycle in a Nest graph fails at boot with
 * an error that names neither end of it.
 */
export const TOKEN_CIPHER = Symbol("TOKEN_CIPHER");
export const RATE_BUDGET = Symbol("RATE_BUDGET");
