import { describe, expect, it } from 'vitest'
import { checkWebhookUrl, isPrivateIPv4, isPrivateIPv6 } from '../src/domain/url.ts'
import { isValidEventPattern, matchesEventType } from '../src/domain/webhook.ts'

const deployed = (url: string) => checkWebhookUrl(url, { allowPrivate: false })

describe('webhook URL policy', () => {
  it('accepts public https URLs and normalizes them', () => {
    expect(deployed('https://Example.com/hooks/blixis?x=1#frag')).toEqual({
      ok: true,
      url: 'https://example.com/hooks/blixis?x=1',
    })
    expect(deployed('https://93.184.216.34:8443/hook').ok).toBe(true)
    expect(deployed('https://[2606:4700::1111]/hook').ok).toBe(true)
  })

  it.each([
    ['http://example.com/hook', 'Use an https:// URL'],
    ['ftp://example.com', 'Use an https:// URL'],
    ['not a url', 'Use an absolute URL, e.g. https://example.com/hooks/blixis'],
    ['https://user:pass@example.com/', 'Put credentials in the secret, not the URL'],
    ['https://localhost/hook', 'Use a public host name'],
    ['https://api.localhost/hook', 'Use a public host name'],
    ['https://printer.local/', 'Use a public host name'],
    ['https://metadata.google.internal/computeMetadata', 'Use a public host name'],
    ['https://intranet/', 'Use a public host name'],
    ['https://127.0.0.1/', 'Use a public address'],
    ['https://2130706433/', 'Use a public address'], // decimal 127.0.0.1, normalized by URL
    ['https://0x7f.1/', 'Use a public address'],
    ['https://10.0.0.5/', 'Use a public address'],
    ['https://172.20.1.1/', 'Use a public address'],
    ['https://192.168.1.1/', 'Use a public address'],
    ['https://169.254.169.254/latest/meta-data', 'Use a public address'],
    ['https://100.64.0.1/', 'Use a public address'],
    ['https://[::1]/', 'Use a public address'],
    ['https://[fd00::1]/', 'Use a public address'],
    ['https://[fe80::1]/', 'Use a public address'],
    ['https://[::ffff:10.0.0.1]/', 'Use a public address'],
    ['https://[64:ff9b::a9fe:a9fe]/', 'Use a public address'],
    ['https://[2001:db8::1]/', 'Use a public address'],
  ])('rejects %s', (url, reason) => {
    expect(deployed(url)).toEqual({ ok: false, reason })
  })

  it('rejects overlong URLs, and allows local targets only when configured', () => {
    expect(deployed(`https://example.com/${'a'.repeat(2048)}`).ok).toBe(false)
    expect(checkWebhookUrl('http://localhost:4000/hook', { allowPrivate: true })).toEqual({
      ok: true,
      url: 'http://localhost:4000/hook',
    })
  })

  it('classifies address ranges', () => {
    expect(isPrivateIPv4('8.8.8.8')).toBe(false)
    expect(isPrivateIPv4('172.32.0.1')).toBe(false)
    expect(isPrivateIPv4('172.31.255.255')).toBe(true)
    expect(isPrivateIPv6('2a00:1450::200e')).toBe(false)
    expect(isPrivateIPv6('::ffff:8.8.8.8')).toBe(false)
    expect(isPrivateIPv6('garbage')).toBe(true)
  })
})

describe('event type patterns', () => {
  it('matches exact types, groups, and everything', () => {
    expect(matchesEventType('entry.published', 'entry.published')).toBe(true)
    expect(matchesEventType('entry.*', 'entry.deleted')).toBe(true)
    expect(matchesEventType('entry.*', 'asset.deleted')).toBe(false)
    expect(matchesEventType('*', 'asset.deleted')).toBe(true)
    expect(isValidEventPattern('asset.*')).toBe(true)
    expect(isValidEventPattern('user.created')).toBe(false)
    expect(isValidEventPattern('user.*')).toBe(false)
  })
})
