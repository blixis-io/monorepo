import { z } from 'zod'
import { defineFieldType } from '../define.ts'
import { cardinality, cardinalitySettings, minMaxOrdered, uuidSchema } from './shared.ts'

/** A link to an entry, stored and returned as `{ type: 'entry', id }`. */
export const entryLinkSchema = z.object({ type: z.literal('entry'), id: uuidSchema }).strict()
/** A link to an asset, stored and returned as `{ type: 'asset', id }` (assets: plan 014). */
export const assetLinkSchema = z.object({ type: z.literal('asset'), id: uuidSchema }).strict()

/** Links to other entries. Targets are checked when publishing (ADR 0010 §7). */
export const referenceField = defineFieldType({
  id: 'reference',
  name: 'Reference',
  description:
    'Links to one or more entries, optionally limited to some content types. Drafts may link to entries that do not exist yet; publishing checks them.',
  settings: z
    .object({
      /** Allowed target content type ids; empty allows every entry type. */
      contentTypeIds: z.array(uuidSchema).max(50).default([]),
      ...cardinalitySettings,
    })
    .strict()
    .refine(minMaxOrdered, { message: 'min must not exceed max' }),
  value: (settings, context) => cardinality(entryLinkSchema, settings, context),
  graphql: (settings) => ({ type: 'Entry', list: settings.multiple }),
})

const MIME_PATTERN = /^[a-z]+\/(\*|[a-z0-9.+-]+)$/

/** Links to assets (files in R2, plan 014). */
export const assetField = defineFieldType({
  id: 'asset',
  name: 'Asset',
  description:
    'Links to one or more assets (images, documents), optionally limited by MIME type such as image/* or application/pdf.',
  settings: z
    .object({
      mimeTypes: z
        .array(z.string().regex(MIME_PATTERN, 'Use type/subtype or type/*'))
        .max(20)
        .default([]),
      ...cardinalitySettings,
    })
    .strict()
    .refine(minMaxOrdered, { message: 'min must not exceed max' }),
  value: (settings, context) => cardinality(assetLinkSchema, settings, context),
  graphql: (settings) => ({ type: 'Asset', list: settings.multiple }),
})

export const LINK_KINDS = ['entry', 'url', 'email', 'phone'] as const
const PHONE = /^\+?[0-9][0-9 ().-]{2,30}$/

/** A navigation link: to an entry, a URL, an email address, or a phone number. */
export const linkField = defineFieldType({
  id: 'link',
  name: 'Link',
  description:
    'A link for buttons and navigation: an internal entry, an external URL, an email address, or a phone number, with optional text, title, and new-tab flag.',
  settings: z
    .object({
      kinds: z
        .array(z.enum(LINK_KINDS))
        .min(1)
        .default(['entry', 'url'])
        .refine((k) => new Set(k).size === k.length, { message: 'Kinds must be unique' }),
      /** Allowed entry types for `entry` links; empty allows every entry type. */
      contentTypeIds: z.array(uuidSchema).max(50).default([]),
      /** Whether the link carries its own text. */
      text: z.enum(['none', 'optional', 'required']).default('optional'),
      allowNewTab: z.boolean().default(true),
    })
    .strict(),
  value(settings) {
    const extras = {
      text: z.string().max(200).optional(),
      title: z.string().max(200).optional(),
      newTab: z.boolean().optional(),
    }
    const targets = {
      entry: z.object({ kind: z.literal('entry'), id: uuidSchema, ...extras }).strict(),
      url: z
        .object({ kind: z.literal('url'), url: z.url({ protocol: /^https?$/ }), ...extras })
        .strict(),
      email: z.object({ kind: z.literal('email'), email: z.email(), ...extras }).strict(),
      phone: z
        .object({ kind: z.literal('phone'), phone: z.string().regex(PHONE), ...extras })
        .strict(),
    }
    const allowed = settings.kinds.map((kind) => targets[kind])
    return z
      .discriminatedUnion(
        'kind',
        allowed as [(typeof allowed)[number], ...(typeof allowed)[number][]],
      )
      .superRefine((link, ctx) => {
        if (settings.text === 'none' && link.text !== undefined)
          ctx.addIssue({ code: 'custom', path: ['text'], message: 'This link has no text' })
        if (settings.text === 'required' && (link.text ?? '').trim() === '')
          ctx.addIssue({ code: 'custom', path: ['text'], message: 'Link text is required' })
        if (!settings.allowNewTab && link.newTab === true)
          ctx.addIssue({
            code: 'custom',
            path: ['newTab'],
            message: 'Opening in a new tab is not allowed',
          })
      })
  },
  graphql: () => ({ type: 'Link', list: false }),
})
