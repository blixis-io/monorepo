/** A parsed semantic version (build metadata ignored). */
export interface SemVer {
  readonly major: number
  readonly minor: number
  readonly patch: number
  readonly prerelease: readonly (string | number)[]
}

const VERSION =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

/** Parses a strict `MAJOR.MINOR.PATCH[-pre][+build]` version, or returns `undefined`. */
export function parseVersion(input: string): SemVer | undefined {
  const m = VERSION.exec(input.trim())
  if (m === null) return undefined
  const prerelease =
    m[4] === undefined ? [] : m[4].split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p))
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), prerelease }
}

/** Compares two versions: negative if `a < b`, 0 if equal, positive if `a > b`. */
export function compareVersions(a: SemVer, b: SemVer): number {
  const core = a.major - b.major || a.minor - b.minor || a.patch - b.patch
  if (core !== 0) return core
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return b.prerelease.length - a.prerelease.length // release > prerelease
  }
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
    const x = a.prerelease[i]
    const y = b.prerelease[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    if (typeof x === 'number' && typeof y === 'number') return x - y
    if (typeof x === 'number') return -1
    if (typeof y === 'number') return 1
    return x < y ? -1 : 1
  }
  return 0
}

type Comparator = { readonly op: '>=' | '>' | '<=' | '<' | '='; readonly version: SemVer }

/** Fills missing minor/patch of a partial version (`1`, `1.2`, `1.x`) with zeros. */
function partial(input: string): { version: SemVer; parts: number } | undefined {
  const m = /^v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(-[0-9A-Za-z.-]+)?$/.exec(input)
  if (m === null) return undefined
  const nums = [m[1], m[2], m[3]]
  const parts = nums.findIndex((p) => p === undefined || /^[xX*]$/.test(p))
  const count = parts === -1 ? 3 : parts
  const [major = 0, minor = 0, patch = 0] = nums.map((p) =>
    p === undefined || /^[xX*]$/.test(p) ? 0 : Number(p),
  )
  const pre =
    m[4] === undefined
      ? []
      : m[4]
          .slice(1)
          .split('.')
          .map((p) => (/^\d+$/.test(p) ? Number(p) : p))
  return { version: { major, minor, patch, prerelease: count === 3 ? pre : [] }, parts: count }
}

const v = (major: number, minor: number, patch: number): SemVer => ({
  major,
  minor,
  patch,
  prerelease: [],
})

function comparatorsFor(token: string): Comparator[] | undefined {
  if (token === '*' || token === '' || /^[xX]$/.test(token)) return []
  const op = /^(\^|~|>=|<=|>|<|=)?(.*)$/.exec(token)
  const operator = op?.[1] ?? ''
  const p = partial(op?.[2] ?? '')
  if (p === undefined) return undefined
  const { version: lo, parts } = p
  switch (operator) {
    case '^': {
      const upper =
        lo.major > 0 || parts < 2
          ? v(lo.major + 1, 0, 0)
          : lo.minor > 0 || parts < 3
            ? v(0, lo.minor + 1, 0)
            : v(0, 0, lo.patch + 1)
      return [
        { op: '>=', version: lo },
        { op: '<', version: upper },
      ]
    }
    case '~': {
      const upper = parts < 2 ? v(lo.major + 1, 0, 0) : v(lo.major, lo.minor + 1, 0)
      return [
        { op: '>=', version: lo },
        { op: '<', version: upper },
      ]
    }
    case '>=':
    case '>':
    case '<=':
    case '<':
      return [{ op: operator, version: lo }]
    default: {
      if (parts === 3) return [{ op: '=', version: lo }]
      const upper =
        parts === 0 ? undefined : parts === 1 ? v(lo.major + 1, 0, 0) : v(lo.major, lo.minor + 1, 0)
      return upper === undefined
        ? []
        : [
            { op: '>=', version: lo },
            { op: '<', version: upper },
          ]
    }
  }
}

function test(version: SemVer, c: Comparator): boolean {
  const cmp = compareVersions(version, c.version)
  switch (c.op) {
    case '>=':
      return cmp >= 0
    case '>':
      return cmp > 0
    case '<=':
      return cmp <= 0
    case '<':
      return cmp < 0
    case '=':
      return cmp === 0
  }
}

/**
 * Whether `version` satisfies `range`. Supports `*`, exact versions, partial versions (`1.x`),
 * `^`, `~`, `>=`, `>`, `<=`, `<`, space-separated AND, and `||`. Prerelease versions only match
 * comparators on the same `major.minor.patch` that also carry a prerelease (npm semantics).
 * Returns `undefined` if the range cannot be parsed.
 */
export function satisfies(version: string, range: string): boolean | undefined {
  const parsed = parseVersion(version)
  if (parsed === undefined) return undefined
  let anyValid = false
  for (const alternative of range.split('||')) {
    const tokens = alternative
      .trim()
      .replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1')
      .split(/\s+/)
    const comparators: Comparator[] = []
    let valid = true
    for (const token of tokens) {
      const cs = comparatorsFor(token)
      if (cs === undefined) {
        valid = false
        break
      }
      comparators.push(...cs)
    }
    if (!valid) continue
    anyValid = true
    const prereleaseAllowed =
      parsed.prerelease.length === 0 ||
      comparators.some(
        (c) =>
          c.version.prerelease.length > 0 &&
          c.version.major === parsed.major &&
          c.version.minor === parsed.minor &&
          c.version.patch === parsed.patch,
      )
    if (prereleaseAllowed && comparators.every((c) => test(parsed, c))) return true
  }
  return anyValid ? false : undefined
}
