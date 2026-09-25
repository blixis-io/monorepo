import { z } from 'zod'
import { CONTENT_LIMITS, shortIdSchema } from '../../domain/content-type.ts'
import { defineFieldType } from '../define.ts'
import { uuidSchema } from './shared.ts'

const blockShape = z.looseObject({ _id: shortIdSchema, _type: z.string().min(1) })

/**
 * An ordered list of component instances — the page-building field (ADR 0010 §1). Each item is
 * `{ _id, _type: <component apiId>, …component fields }`, validated by that component.
 */
export const blocksField = defineFieldType({
  id: 'blocks',
  name: 'Blocks',
  description:
    'An ordered list of components (such as hero, text section, image gallery) for building pages. Components are published and translated together with the entry.',
  settings: z
    .object({
      /** Component type ids allowed in this field (at least one). */
      componentIds: z.array(uuidSchema).min(1).max(100),
      /** Minimum items (checked on publish). */
      min: z.number().int().min(0).optional(),
      max: z
        .number()
        .int()
        .min(1)
        .max(CONTENT_LIMITS.blocksPerField)
        .default(CONTENT_LIMITS.blocksPerField),
    })
    .strict()
    .refine((s) => s.min === undefined || s.min <= s.max, { message: 'min must not exceed max' }),
  value(settings, context) {
    let list = z.array(blockShape).max(settings.max)
    if (context.mode === 'publish' && settings.min !== undefined) list = list.min(settings.min)
    return list.superRefine((items, ctx) => {
      if (context.depth + 1 > CONTENT_LIMITS.blockDepth) {
        ctx.addIssue({
          code: 'custom',
          message: `Blocks nest at most ${CONTENT_LIMITS.blockDepth} levels deep`,
        })
        return
      }
      const seen = new Set<string>()
      items.forEach((item, index) => {
        if (seen.has(item._id))
          ctx.addIssue({
            code: 'custom',
            path: [index, '_id'],
            message: 'Block ids must be unique',
          })
        seen.add(item._id)
        const component = context.component(item._type)
        if (component === undefined || !settings.componentIds.includes(component.id)) {
          ctx.addIssue({
            code: 'custom',
            path: [index, '_type'],
            message:
              component === undefined
                ? `Unknown component "${item._type}"`
                : `"${item._type}" is not allowed here`,
          })
          return
        }
        const { _id: _, _type: __, ...fields } = item
        const result = component.schema.safeParse(fields)
        if (!result.success)
          for (const issue of result.error.issues)
            ctx.addIssue({ code: 'custom', path: [index, ...issue.path], message: issue.message })
      })
    })
  },
  graphql: () => ({ type: 'Block', list: true }),
})
