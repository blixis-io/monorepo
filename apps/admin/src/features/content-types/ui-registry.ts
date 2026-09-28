import {
  Blocks,
  Braces,
  Calendar,
  CalendarClock,
  FileText,
  Hash,
  Image,
  Link,
  List,
  type LucideIcon,
  Pilcrow,
  Share2,
  ToggleLeft,
  Type,
} from 'lucide-react'

/** How the settings form shows one setting. The server's JSON Schema decides what is valid. */
export interface SettingUi {
  readonly label?: string
  readonly hint?: string
  /** Pick content types (`entries`) or components from the space instead of typing ids. */
  readonly widget?: 'entryTypes' | 'components'
}

export interface FieldTypeUi {
  readonly icon: LucideIcon
  readonly settings?: Readonly<Record<string, SettingUi>>
}

const cardinality: Record<string, SettingUi> = {
  multiple: { label: 'Allow several', hint: 'Store a list instead of a single value.' },
  min: { label: 'Minimum items', hint: 'Checked when publishing.' },
  max: { label: 'Maximum items' },
}

/**
 * UI hints for the built-in field types (ADR 0010 §4): icons, labels, and pickers. Types without
 * an entry (e.g. from plugins) get a form generated from their settings schema alone.
 */
export const FIELD_TYPE_UI: Readonly<Record<string, FieldTypeUi>> = {
  text: {
    icon: Type,
    settings: {
      format: { label: 'Format', hint: 'Validates the value as a slug, email address, or URL.' },
      minLength: { label: 'Minimum length' },
      maxLength: { label: 'Maximum length', hint: 'Up to 256 characters.' },
      pattern: { label: 'Pattern', hint: 'A regular expression the value must match.' },
      patternMessage: { label: 'Pattern message', hint: 'Shown when the value doesn’t match.' },
    },
  },
  longText: {
    icon: Pilcrow,
    settings: { minLength: { label: 'Minimum length' }, maxLength: { label: 'Maximum length' } },
  },
  richText: {
    icon: FileText,
    settings: {
      nodes: { label: 'Allowed blocks' },
      marks: { label: 'Allowed formatting' },
      headingLevels: { label: 'Heading levels' },
    },
  },
  number: {
    icon: Hash,
    settings: {
      integer: { label: 'Whole numbers only' },
      min: { label: 'Minimum' },
      max: { label: 'Maximum' },
    },
  },
  boolean: { icon: ToggleLeft },
  date: { icon: Calendar, settings: { min: { label: 'Earliest' }, max: { label: 'Latest' } } },
  dateTime: { icon: CalendarClock },
  select: {
    icon: List,
    settings: {
      options: { label: 'Options', hint: 'The stored value and the label editors see.' },
      ...cardinality,
    },
  },
  reference: {
    icon: Share2,
    settings: {
      contentTypeIds: {
        label: 'Allowed content types',
        hint: 'None selected: any content type.',
        widget: 'entryTypes',
      },
      ...cardinality,
    },
  },
  asset: {
    icon: Image,
    settings: {
      mimeTypes: {
        label: 'Allowed file types',
        hint: 'Comma-separated MIME types, e.g. image/*, application/pdf. Empty: any file.',
      },
      ...cardinality,
    },
  },
  link: {
    icon: Link,
    settings: {
      kinds: { label: 'Link targets' },
      contentTypeIds: {
        label: 'Allowed content types (entry links)',
        hint: 'None selected: any content type.',
        widget: 'entryTypes',
      },
      text: { label: 'Link text' },
      allowNewTab: { label: 'Allow opening in a new tab' },
    },
  },
  blocks: {
    icon: Blocks,
    settings: {
      componentIds: {
        label: 'Allowed components',
        hint: 'Choose at least one.',
        widget: 'components',
      },
      min: { label: 'Minimum blocks', hint: 'Checked when publishing.' },
      max: { label: 'Maximum blocks' },
    },
  },
  json: { icon: Braces },
}

export const fallbackIcon: LucideIcon = Braces

const ACRONYMS: Readonly<Record<string, string>> = {
  url: 'URL',
  json: 'JSON',
  id: 'ID',
  ids: 'IDs',
  mime: 'MIME',
  api: 'API',
}

/** "maxLength" → "Max length", "url" → "URL". */
export function humanize(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(' ')
    .map((word) => ACRONYMS[word] ?? word)
    .join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
