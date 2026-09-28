import type { ContentType, Field } from '@blixis-io/sdk'
import type { ReactNode } from 'react'

/** What every field widget gets. Values are in API shape for one locale. */
export interface WidgetProps {
  readonly id: string
  readonly field: Field
  readonly value: unknown
  readonly onChange: (value: unknown) => void
  readonly invalid: boolean
  /** Ids of the hint and error elements. */
  readonly describedBy: string | undefined
  readonly context: WidgetContext
}

export interface WidgetContext {
  readonly spaceId: string
  /** Every content type and component of the space (for pickers and blocks). */
  readonly contentTypes: readonly ContentType[]
  /** The locale being edited, and the space's default. */
  readonly locale: string
  readonly defaultLocale: string
  /** Renders a component's fields inside a block (the fields form, passed in to avoid a cycle). */
  readonly renderFields: (props: {
    type: Pick<ContentType, 'fields' | 'groups'>
    fields: Readonly<Record<string, unknown>>
    onChange: (next: Readonly<Record<string, unknown>>) => void
  }) => ReactNode
}

export const settingsOf = <T extends Record<string, unknown>>(field: Field) =>
  field.settings as Partial<T>
