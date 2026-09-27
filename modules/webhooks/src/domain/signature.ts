/**
 * Webhook signatures (plan 015.003): `Blixis-Signature: t=<unix seconds>,v1=<hex>` where `v1` is
 * HMAC-SHA256 over `<t>.<raw body>` with the webhook's secret (the whole `whsec_…` string, UTF-8).
 * Signing the timestamp lets receivers reject replays of old deliveries.
 */

const encoder = new TextEncoder()
const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
}

/** The `Blixis-Signature` header value for `body` at `timestamp` (unix seconds). */
export async function signWebhook(
  secret: string,
  body: string,
  timestamp: number,
): Promise<string> {
  return `t=${timestamp},v1=${await hmac(secret, `${timestamp}.${body}`)}`
}

/** Constant-time comparison of two hex strings. */
function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Verifies a delivery as a receiver should (the reference for `docs/api/webhooks.md`): a `v1`
 * signature must match, and `t` must be within `toleranceSeconds` of now (default 5 minutes).
 * Pass the **raw** request body, before any JSON parsing.
 */
export async function verifyWebhookSignature(options: {
  readonly secret: string
  readonly header: string | null | undefined
  readonly body: string
  readonly toleranceSeconds?: number
  readonly now?: number
}): Promise<boolean> {
  const parts = new Map<string, string[]>()
  for (const item of (options.header ?? '').split(',')) {
    const [key, value] = item.trim().split('=')
    if (key !== undefined && value !== undefined) parts.set(key, [...(parts.get(key) ?? []), value])
  }
  const timestamp = Number(parts.get('t')?.[0])
  if (!Number.isInteger(timestamp)) return false
  const now = options.now ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > (options.toleranceSeconds ?? 300)) return false
  const expected = await hmac(options.secret, `${timestamp}.${options.body}`)
  return (parts.get('v1') ?? []).some((candidate) => equal(candidate, expected))
}
