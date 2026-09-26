import { describe, expect, it } from 'vitest'
import { detectType, imageDimensions, signatureMismatch } from '../src/domain/sniff.ts'
import {
  contentDisposition,
  filenameFromDisposition,
  sha256FromContentDigest,
} from '../src/rest/http.ts'

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)),
  )
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const le16 = (n: number) => [n & 255, (n >> 8) & 255]
const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255]

export const png = (w: number, h: number) =>
  bytes(
    [0x89],
    'PNG',
    [0x0d, 0x0a, 0x1a, 0x0a],
    be32(13),
    'IHDR',
    be32(w),
    be32(h),
    [8, 6, 0, 0, 0],
  )
const gif = (w: number, h: number) => bytes('GIF89a', le16(w), le16(h), [0, 0, 0])
const jpeg = (w: number, h: number) =>
  bytes(
    [0xff, 0xd8],
    [0xff, 0xe0, 0, 16],
    'JFIF',
    [0, 1, 1, 0, 0, 1, 0, 1, 0, 0],
    [0xff, 0xc0, 0, 17, 8],
    [(h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255],
    [3, 1, 0x22, 0],
    new Array(12).fill(0),
  )
const webpVp8x = (w: number, h: number) =>
  bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8X', [10, 0, 0, 0], [0, 0, 0, 0], le24(w - 1), le24(h - 1))

describe('file signatures', () => {
  it('detects common formats', () => {
    expect(detectType(png(1, 1))).toBe('image/png')
    expect(detectType(gif(1, 1))).toBe('image/gif')
    expect(detectType(jpeg(1, 1))).toBe('image/jpeg')
    expect(detectType(webpVp8x(1, 1))).toBe('image/webp')
    expect(detectType(bytes(be32(28), 'ftyp', 'mif1', [0, 0, 0, 0], 'mif1avifmiaf'))).toBe(
      'image/avif',
    )
    expect(detectType(bytes('%PDF-1.7\n'))).toBe('application/pdf')
    expect(detectType(bytes('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeUndefined()
  })

  it('flags content that contradicts the declared type, and ignores unchecked types', () => {
    expect(signatureMismatch('image/png', bytes('<script>alert(1)</script>'))).toBe(true)
    expect(signatureMismatch('image/png', jpeg(1, 1))).toBe(true)
    expect(signatureMismatch('image/png', png(1, 1))).toBe(false)
    expect(signatureMismatch('text/plain', bytes('anything'))).toBe(false)
  })

  it('reads image dimensions from headers', () => {
    expect(imageDimensions('image/png', png(640, 480))).toEqual({ width: 640, height: 480 })
    expect(imageDimensions('image/gif', gif(32, 16))).toEqual({ width: 32, height: 16 })
    expect(imageDimensions('image/jpeg', jpeg(1920, 1080))).toEqual({ width: 1920, height: 1080 })
    expect(imageDimensions('image/webp', webpVp8x(300, 200))).toEqual({ width: 300, height: 200 })
    expect(imageDimensions('application/pdf', bytes('%PDF-'))).toBeUndefined()
    expect(imageDimensions('image/jpeg', bytes([0xff, 0xd8, 0x00]))).toBeUndefined()
  })
})

describe('upload headers', () => {
  it('parses Content-Disposition names (RFC 6266) and writes safe ones', () => {
    expect(filenameFromDisposition(`attachment; filename*=UTF-8''caf%C3%A9.png`)).toBe('café.png')
    expect(filenameFromDisposition('inline; filename="a \\"b\\".pdf"')).toBe('a "b".pdf')
    expect(filenameFromDisposition('attachment; filename=plain.txt')).toBe('plain.txt')
    expect(filenameFromDisposition(undefined)).toBeUndefined()
    expect(contentDisposition('attachment', 'café "x".pdf')).toBe(
      `attachment; filename="caf_ _x_.pdf"; filename*=UTF-8''caf%C3%A9%20%22x%22.pdf`,
    )
  })

  it('reads SHA-256 from Content-Digest (RFC 9530)', () => {
    const hex = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    const b64 = btoa(String.fromCharCode(...(hex.match(/../g) ?? []).map((h) => parseInt(h, 16))))
    expect(sha256FromContentDigest(`sha-512=:AAAA:, sha-256=:${b64}:`)).toBe(hex)
    expect(sha256FromContentDigest(undefined)).toBeUndefined()
    expect(() => sha256FromContentDigest('sha-256=:AAAA:')).toThrow('Invalid Content-Digest')
  })
})
