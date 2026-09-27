// biome-ignore lint/correctness/noNodejsModules: reads the documentation it keeps honest (Node test)
import { readFileSync } from 'node:fs'
// biome-ignore lint/correctness/noNodejsModules: reads the documentation it keeps honest (Node test)
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { signWebhook } from '../src/index.ts'

/**
 * Runs the receiver example from docs/api/webhooks.md against a real signature, so the example
 * people copy can't silently drift from what Blixis sends.
 */
describe('documented receiver example', () => {
  it('verifies Blixis signatures and rejects tampered or stale requests', async () => {
    const doc = readFileSync(
      path.resolve(import.meta.dirname, '../../../docs/api/webhooks.md'),
      'utf8',
    )
    const block = /```ts\n([\s\S]*?)```/.exec(
      doc.slice(doc.indexOf('## Verify the signature')),
    )?.[1]
    expect(block).toBeDefined()
    const source = (block ?? '')
      .slice(0, (block ?? '').indexOf('// e.g. in a Worker'))
      .replace('export async function', 'async function')
      .replace(/: string \| null/g, '')
      .replace(/: string/g, '')
      .replace(/: Promise<boolean>/g, '')
      .replace(/<string, string\[\]>/g, '')
    // Evaluates the documented example itself (types stripped above).
    const verify = new Function(`${source}; return verifyBlixisSignature`)() as (
      secret: string,
      header: string | null,
      body: string,
    ) => Promise<boolean>
    const secret = 'whsec_example'
    const body = JSON.stringify({ id: 'e1', type: 'entry.published' })
    const now = Math.floor(Date.now() / 1000)
    const header = await signWebhook(secret, body, now)
    expect(await verify(secret, header, body)).toBe(true)
    expect(await verify(secret, header, `${body} `)).toBe(false)
    expect(await verify('whsec_other', header, body)).toBe(false)
    expect(await verify(secret, await signWebhook(secret, body, now - 3600), body)).toBe(false)
    expect(await verify(secret, null, body)).toBe(false)
  })
})
