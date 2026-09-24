import { expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { type InferOutput, type StandardSchemaV1, validate, validateSync } from './index.ts'

const Config = z.object({ defaultTitle: z.string().default('Untitled'), limit: z.number() })

test('zod schemas satisfy the vendored Standard Schema interface', () => {
  expectTypeOf(Config).toExtend<StandardSchemaV1>()
})

test('validate infers the schema output', () => {
  expectTypeOf(validate(Config, {})).resolves.toEqualTypeOf<{
    defaultTitle: string
    limit: number
  }>()
  expectTypeOf(validateSync(z.string(), 'x')).toEqualTypeOf<string>()
  expectTypeOf<InferOutput<typeof Config>>().toEqualTypeOf<z.infer<typeof Config>>()
})
