/** Minimal file fixtures for signature and dimension tests. */
export const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)),
  )
export const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
export const le16 = (n: number) => [n & 255, (n >> 8) & 255]
export const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255]

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
