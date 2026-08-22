import type { Brand } from "./brand.js";

/**
 * A point in time, as whole milliseconds since the epoch.
 *
 * The ledger uses this rather than `Date` because 06: Ledger requires history
 * to be immutable, and a `Date` is not: freezing an object does not freeze the
 * `Date` it holds, so `entry.createdAt.setFullYear(1999)` succeeds on an
 * otherwise frozen entry. A number cannot be edited in place.
 *
 * The same type is used across the rest of the model for consistency, and
 * because it removes a whole class of aliasing bug: a caller cannot keep a
 * reference to a timestamp and mutate it after the fact.
 */
export type Timestamp = Brand<number, "Timestamp">;

export function timestamp(value: number): Timestamp {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`a timestamp is whole milliseconds since the epoch, received ${value}.`);
  }
  return value as Timestamp;
}

/** Convert from a `Date` at the boundary, where dates legitimately arrive. */
export function fromDate(date: Date): Timestamp {
  const value = date.getTime();
  if (Number.isNaN(value)) {
    throw new RangeError(`cannot take a timestamp from an invalid Date.`);
  }
  return timestamp(value);
}

/** Parse an ISO 8601 instant. The form GitHub webhooks deliver. */
export function fromIso(iso: string): Timestamp {
  return fromDate(new Date(iso));
}

/** Render for display or serialisation. */
export function toIso(at: Timestamp): string {
  return new Date(at).toISOString();
}

export function isBefore(a: Timestamp, b: Timestamp): boolean {
  return a < b;
}
