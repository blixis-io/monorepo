import { ValidationError } from '@blixis/contracts'

/**
 * Throws `ValidationError` unless `value` survives `JSON.stringify` unchanged: plain objects,
 * arrays, strings, finite numbers, booleans, and `null` only. Rejects `undefined`, functions,
 * symbols, bigints, non-finite numbers, class instances (including `Date`), and cycles —
 * values that JSON would silently drop or alter (§15: envelopes are serialisable).
 */
export function assertJsonValue(value: unknown, path: (string | number)[] = []): void {
  const seen = new Set<object>()
  const fail = (at: (string | number)[], what: string): never => {
    throw new ValidationError('Event payload is not JSON-serialisable', [
      { path: at, message: `${what} is not allowed in event payloads` },
    ])
  }
  const visit = (current: unknown, at: (string | number)[]): void => {
    if (current === null) return
    switch (typeof current) {
      case 'string':
      case 'boolean':
        return
      case 'number':
        if (!Number.isFinite(current)) fail(at, String(current))
        return
      case 'object':
        break
      default:
        fail(at, typeof current)
    }
    const object = current as object
    if (seen.has(object)) fail(at, 'a circular reference')
    seen.add(object)
    if (Array.isArray(object)) {
      for (const [index, item] of object.entries()) visit(item, [...at, index])
    } else {
      const proto = Object.getPrototypeOf(object)
      if (proto !== Object.prototype && proto !== null) {
        fail(at, `an instance of ${object.constructor?.name ?? 'a class'}`)
      }
      for (const [name, item] of Object.entries(object)) visit(item, [...at, name])
    }
    seen.delete(object)
  }
  visit(value, path)
}
