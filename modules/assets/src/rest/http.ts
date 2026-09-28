import { ValidationError } from '@blixis-io/contracts'

/**
 * The file name from `Content-Disposition` (`filename*=UTF-8''…` preferred, then `filename="…"`,
 * RFC 6266), or `undefined`.
 */
export function filenameFromDisposition(header: string | undefined): string | undefined {
  if (header === undefined) return undefined
  const extended = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header)
  if (extended?.[1] !== undefined) {
    try {
      return decodeURIComponent(extended[1].trim())
    } catch {
      return undefined
    }
  }
  const plain = /filename\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;\s]+))/.exec(header)
  const value = plain?.[1] ?? plain?.[2]
  return value?.replace(/\\(.)/g, '$1')
}

/** `Content-Disposition` for a download: ASCII fallback plus UTF-8 `filename*` (RFC 6266). */
export function contentDisposition(kind: 'inline' | 'attachment', filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, '_')
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

/** SHA-256 hex from `Content-Digest: sha-256=:<base64>:` (RFC 9530), or `undefined`. */
export function sha256FromContentDigest(header: string | undefined): string | undefined {
  if (header === undefined) return undefined
  const match = /(?:^|,)\s*sha-256\s*=\s*:([A-Za-z0-9+/=]+):/i.exec(header)
  if (match?.[1] === undefined) return undefined
  let binary: string
  try {
    binary = atob(match[1])
  } catch {
    binary = ''
  }
  if (binary.length !== 32)
    throw new ValidationError('Invalid Content-Digest', [
      { path: ['Content-Digest'], message: 'Use sha-256=:<base64 of the 32-byte digest>:' },
    ])
  return [...binary].map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('')
}

/** The exact body length from `Content-Length`; uploads must declare it (no chunked bodies). */
export function contentLength(header: string | undefined): number {
  const value = header === undefined || header.trim() === '' ? Number.NaN : Number(header)
  if (!Number.isSafeInteger(value) || value < 0)
    throw new ValidationError('Missing Content-Length', [
      { path: ['Content-Length'], message: 'Send the exact size of the file' },
    ])
  return value
}
