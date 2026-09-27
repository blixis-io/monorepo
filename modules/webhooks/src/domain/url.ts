/**
 * Endpoint URL policy (plan 015.001, §29): webhooks are fetched by the Worker, so their URLs are
 * an SSRF surface. Deployed environments accept only `https:` URLs on public host names or public
 * IP addresses. Workers can't reach private networks anyway; this blocks the obvious targets and
 * makes intent explicit. Checked on save and again before every delivery.
 */

/** Longest accepted URL. */
export const MAX_URL_LENGTH = 2048

const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal', 'metadata'])
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.lan', '.corp']

/** IPv4 ranges that are not publicly routable (RFC 6890 and friends), as [network, prefix]. */
const PRIVATE_V4: readonly [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]

const v4ToInt = (address: string) =>
  address.split('.').reduce((n, part) => (n << 8) + Number(part), 0) >>> 0

export function isPrivateIPv4(address: string): boolean {
  const value = v4ToInt(address)
  return PRIVATE_V4.some(([network, prefix]) => {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
    return (value & mask) === (v4ToInt(network) & mask)
  })
}

/** Expands an IPv6 literal (without brackets) to eight 16-bit groups. */
function ipv6Groups(address: string): number[] | undefined {
  let text = address.toLowerCase()
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)
  if (v4?.[1] !== undefined) {
    const n = v4ToInt(v4[1])
    text = `${text.slice(0, -v4[1].length)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`
  }
  const [head = '', tail] = text.split('::')
  const parse = (part: string) =>
    part === '' ? [] : part.split(':').map((h) => Number.parseInt(h, 16))
  const front = parse(head)
  const back = tail === undefined ? [] : parse(tail)
  const groups =
    tail === undefined
      ? front
      : [...front, ...new Array(8 - front.length - back.length).fill(0), ...back]
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff)
    ? groups
    : undefined
}

/**
 * Only global unicast IPv6 (`2000::/3`) outside documentation space is public. IPv4-mapped and
 * NAT64 addresses are judged by their IPv4 part.
 */
export function isPrivateIPv6(address: string): boolean {
  const g = ipv6Groups(address)
  if (g === undefined) return true
  const embedded = (hi: number, lo: number) => `${hi >>> 8}.${hi & 0xff}.${lo >>> 8}.${lo & 0xff}`
  const [a = 0, b = 0, , , , f = 0, hi = 0, lo = 0] = g
  // ::ffff:a.b.c.d (mapped) and 64:ff9b::a.b.c.d (NAT64)
  if (g.slice(0, 5).every((x) => x === 0) && f === 0xffff) return isPrivateIPv4(embedded(hi, lo))
  if (a === 0x64 && b === 0xff9b && g.slice(2, 6).every((x) => x === 0))
    return isPrivateIPv4(embedded(hi, lo))
  if (a < 0x2000 || a > 0x3fff) return true
  return a === 0x2001 && b === 0x0db8
}

/** Why `raw` can't be a webhook URL, or the normalized URL. */
export function checkWebhookUrl(
  raw: string,
  options: { allowPrivate: boolean },
): { ok: true; url: string } | { ok: false; reason: string } {
  const fail = (reason: string) => ({ ok: false as const, reason })
  if (raw.length > MAX_URL_LENGTH) return fail(`Use at most ${MAX_URL_LENGTH} characters`)
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return fail('Use an absolute URL, e.g. https://example.com/hooks/blixis')
  }
  if (url.username !== '' || url.password !== '')
    return fail('Put credentials in the secret, not the URL')
  const secure = url.protocol === 'https:'
  if (!secure && !(options.allowPrivate && url.protocol === 'http:'))
    return fail('Use an https:// URL')
  url.hash = ''
  if (options.allowPrivate) return { ok: true, url: url.href }

  const host = url.hostname.toLowerCase()
  if (host.startsWith('[')) {
    if (isPrivateIPv6(host.slice(1, -1))) return fail('Use a public address')
  } else if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isPrivateIPv4(host)) return fail('Use a public address')
  } else if (
    BLOCKED_HOSTS.has(host) ||
    BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix)) ||
    !host.includes('.')
  ) {
    return fail('Use a public host name')
  }
  return { ok: true, url: url.href }
}
