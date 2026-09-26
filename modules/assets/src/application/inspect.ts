import { ValidationError } from '@blixis/contracts'
import { HEADER_BYTES, imageDimensions, signatureMismatch } from '../domain/sniff.ts'

/** What {@link inspectUpload} learned while the bytes passed through. */
export interface Inspection {
  /** Set when the file's first bytes contradict its declared type; the stream was aborted. */
  readonly rejection: () => ValidationError | undefined
  /** After the stream ended: SHA-256 hex (where the runtime can hash streams) and dimensions. */
  readonly result: () => Promise<{
    sha256: string | null
    width: number | null
    height: number | null
  }>
}

interface DigestStreamLike extends WritableStream<Uint8Array> {
  readonly digest: Promise<ArrayBuffer>
}
type DigestStreamConstructor = new (algorithm: string) => DigestStreamLike

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')

/**
 * Passes an upload through unchanged while checking its signature against `mimeType` (aborting
 * early on a mismatch), keeping the first bytes for image dimensions, and hashing it with
 * `crypto.DigestStream` where available (Workers). Nothing but the header is kept in memory.
 */
export function inspectUpload(
  body: ReadableStream<Uint8Array>,
  mimeType: string,
  options: { checkSignature?: boolean; hash?: boolean } = {},
): { stream: ReadableStream<Uint8Array>; inspection: Inspection } {
  const Digest = (crypto as unknown as { DigestStream?: DigestStreamConstructor }).DigestStream
  const digest = options.hash !== false && Digest !== undefined ? new Digest('SHA-256') : undefined
  const writer = digest?.getWriter()
  const head = new Uint8Array(HEADER_BYTES)
  let headLength = 0
  let checked = options.checkSignature === false
  let rejection: ValidationError | undefined

  const check = (controller: TransformStreamDefaultController<Uint8Array>, final: boolean) => {
    if (checked || (headLength < 32 && !final)) return
    checked = true
    if (signatureMismatch(mimeType, head.subarray(0, headLength))) {
      rejection = new ValidationError('The file does not match its declared type', [
        { path: ['mimeType'], message: `The content is not ${mimeType}` },
      ])
      controller.error(rejection)
    }
  }

  const stream = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      async transform(chunk, controller) {
        if (headLength < HEADER_BYTES) {
          const take = chunk.subarray(0, HEADER_BYTES - headLength)
          head.set(take, headLength)
          headLength += take.length
        }
        check(controller, false)
        if (rejection !== undefined) return
        await writer?.write(chunk)
        controller.enqueue(chunk)
      },
      async flush(controller) {
        check(controller, true)
        await writer?.close()
      },
    }),
  )

  return {
    stream,
    inspection: {
      rejection: () => rejection,
      async result() {
        const size = imageDimensions(mimeType, head.subarray(0, headLength))
        return {
          sha256: digest === undefined ? null : toHex(await digest.digest),
          width: size?.width ?? null,
          height: size?.height ?? null,
        }
      },
    },
  }
}
