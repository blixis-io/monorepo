/**
 * File signatures and image dimensions from the first bytes of a file (ADR 0013 §4). Pure and
 * dependency-free: parses headers only, never decodes images.
 */

/** Types whose first bytes must match what the upload declares. */
export const SIGNATURE_CHECKED_TYPES: readonly string[] = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'application/pdf',
])

/** Bytes needed to read signatures and the dimensions of typical PNG, GIF, WebP, and JPEG files. */
export const HEADER_BYTES = 64 * 1024

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length))
const be16 = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0)
const le16 = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8)
const le24 = (b: Uint8Array, i: number) => le16(b, i) | ((b[i + 2] ?? 0) << 16)
const be32 = (b: Uint8Array, i: number) => ((be16(b, i) << 16) >>> 0) + be16(b, i + 2)

/** The type the first bytes show, for {@link SIGNATURE_CHECKED_TYPES}; `undefined` otherwise. */
export function detectType(head: Uint8Array): string | undefined {
  if (head.length >= 8 && be32(head, 0) === 0x89504e47 && be32(head, 4) === 0x0d0a1a0a)
    return 'image/png'
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
    return 'image/jpeg'
  if (head.length >= 6 && /^GIF8[79]a$/.test(ascii(head, 0, 6))) return 'image/gif'
  if (head.length >= 12 && ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WEBP')
    return 'image/webp'
  if (head.length >= 12 && ascii(head, 4, 4) === 'ftyp') {
    const boxSize = Math.min(be32(head, 0), head.length)
    for (let i = 8; i + 4 <= boxSize; i += 4)
      if (['avif', 'avis'].includes(ascii(head, i, 4))) return 'image/avif'
  }
  if (head.length >= 5 && ascii(head, 0, 5) === '%PDF-') return 'application/pdf'
  return undefined
}

/** Whether the first bytes contradict the declared type (types without a check never do). */
export const signatureMismatch = (declared: string, head: Uint8Array): boolean =>
  SIGNATURE_CHECKED_TYPES.includes(declared) && detectType(head) !== declared

/** Pixel dimensions of PNG, GIF, WebP, and JPEG files; `undefined` when unknown. */
export function imageDimensions(
  type: string,
  b: Uint8Array,
): { width: number; height: number } | undefined {
  const valid = (width: number, height: number) =>
    width > 0 && height > 0 ? { width, height } : undefined
  switch (type) {
    case 'image/png':
      return b.length >= 24 && ascii(b, 12, 4) === 'IHDR'
        ? valid(be32(b, 16), be32(b, 20))
        : undefined
    case 'image/gif':
      return b.length >= 10 ? valid(le16(b, 6), le16(b, 8)) : undefined
    case 'image/webp': {
      if (b.length < 30) return undefined
      const chunk = ascii(b, 12, 4)
      if (chunk === 'VP8 ') return valid(le16(b, 26) & 0x3fff, le16(b, 28) & 0x3fff)
      if (chunk === 'VP8L') {
        const [b0 = 0, b1 = 0, b2 = 0, b3 = 0] = b.subarray(21, 25)
        return valid(
          1 + (((b1 & 0x3f) << 8) | b0),
          1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
        )
      }
      if (chunk === 'VP8X') return valid(1 + le24(b, 24), 1 + le24(b, 27))
      return undefined
    }
    case 'image/jpeg': {
      let i = 2
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) return undefined
        const marker = b[i + 1] ?? 0
        if (marker === 0xff) {
          i += 1
          continue
        }
        // Start-of-frame markers (not DHT C4, JPG C8, DAC CC) carry the dimensions.
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
          return valid(be16(b, i + 7), be16(b, i + 5))
        // Markers without a length: TEM, RST0–7, SOI, EOI.
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
          i += 2
          continue
        }
        i += 2 + be16(b, i + 2)
      }
      return undefined
    }
    default:
      return undefined
  }
}
