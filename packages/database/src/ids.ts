import { timestamp, uuid } from 'drizzle-orm/pg-core'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

let lastMs = 0
let counter = 0

/**
 * Generates a UUIDv7 (RFC 9562) with Web Crypto: 48-bit Unix milliseconds, then a 12-bit
 * counter (method 1, "fixed-length dedicated counter"), then 62 random bits (ADR 0007).
 *
 * IDs are strictly increasing within an isolate, even when the clock does not advance —
 * Workers freeze `Date.now()` during a request — or goes backwards: the counter increments
 * within a millisecond and, when it overflows, the timestamp is advanced by one.
 */
export function newId(): string {
  const now = Date.now()
  if (now > lastMs) {
    lastMs = now
    // Start low with random bits so consecutive IDs leave counter headroom.
    counter = (crypto.getRandomValues(new Uint16Array(1))[0] ?? 0) & 0x1ff
  } else if (++counter > 0xfff) {
    lastMs++
    counter = 0
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const ms = lastMs
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff
  bytes[2] = (ms >>> 24) & 0xff
  bytes[3] = (ms >>> 16) & 0xff
  bytes[4] = (ms >>> 8) & 0xff
  bytes[5] = ms & 0xff
  bytes[6] = 0x70 | (counter >>> 8) // version 7 + counter high bits
  bytes[7] = counter & 0xff
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f) // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Whether `value` is a UUID string (any version) — use to validate IDs from requests. */
export function isId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

/** Creation time encoded in a UUIDv7, or `undefined` for other UUID versions. */
export function idTimestamp(id: string): Date | undefined {
  if (!isId(id) || id[14] !== '7') return undefined
  return new Date(Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16))
}

/** Primary key column: `id uuid primary key`, filled with {@link newId} by the application. */
export const idColumn = () => uuid('id').primaryKey().$defaultFn(newId)

/**
 * `created_at` / `updated_at` (`timestamptz`, UTC). `updated_at` is refreshed by Drizzle on
 * every update issued through the query builder.
 */
export const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
