declare const BRAND: unique symbol;

/**
 * A nominal type. Two `Brand`s over the same underlying representation are not
 * assignable to each other, which is how this package turns several of the
 * economic laws into compile errors rather than runtime checks.
 *
 * The clearest case is Law XXVI, Contribution Is Not Currency: points and
 * kredbits are both integers, and nothing but a nominal type stops one being
 * passed where the other is expected.
 */
export type Brand<T, B extends string> = T & { readonly [BRAND]: B };
