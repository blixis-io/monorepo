import { useQuery } from '@tanstack/react-query'
import { mergeAttributes, Node } from '@tiptap/core'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import {
  EditorContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
  type Editor as TiptapEditor,
  useEditor,
  useEditorState,
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  Code,
  FileCode,
  Image,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Share2,
  Strikethrough,
  Table as TableIcon,
  Underline,
} from 'lucide-react'
import { createContext, type ReactNode, useContext, useState } from 'react'
import { Button } from '../../../components/ui/button.tsx'
import { Input } from '../../../components/ui/input.tsx'
import { NativeSelect } from '../../../components/ui/native-select.tsx'
import { useClient } from '../../../lib/session.tsx'
import { cn } from '../../../lib/utils.ts'
import { AssetPickerDialog, AssetPreview } from '../../assets/asset-picker.tsx'
import { EntryPickerDialog } from '../entry-picker-dialog.tsx'
import { entryQuery } from '../queries.ts'
import { entryTitle } from '../values.ts'
import { settingsOf, type WidgetContext, type WidgetProps } from './types.ts'

/**
 * The rich-text editor (ADR 0010 §5, decided in 019.004): Tiptap 3, whose ProseMirror JSON uses the
 * same node and mark names as the stored format. The editor is configured from the field's
 * settings, so it can only produce allowed nodes, marks, and heading levels (pasting included).
 */
const ALL_NODES = [
  'heading',
  'bulletList',
  'orderedList',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'hardBreak',
  'table',
  'embeddedEntry',
  'embeddedAsset',
]
const ALL_MARKS = ['bold', 'italic', 'underline', 'strike', 'code', 'link']
const HREF = /^(https?:\/\/|mailto:|tel:|\/|#)/i

const WidgetContextRef = createContext<WidgetContext | null>(null)

function EmbedView({ node, selected, deleteNode }: ReactNodeViewProps) {
  const context = useContext(WidgetContextRef)
  const client = useClient()
  const id = String(node.attrs['id'] ?? '')
  const isEntry = node.type.name === 'embeddedEntry'
  const entry = useQuery({ ...entryQuery(client, id), enabled: isEntry && id !== '', retry: false })
  const asset = useQuery({
    queryKey: ['assets', id],
    queryFn: () => client.assets.get(id),
    enabled: !isEntry && id !== '',
    retry: false,
  })
  const type = context?.contentTypes.find((t) => t.id === entry.data?.sys.contentType.id)
  const label = isEntry
    ? entry.data === undefined
      ? 'Entry'
      : entryTitle(entry.data, type, context?.locale ?? '', context?.defaultLocale ?? '')
    : (asset.data?.fields.filename ?? 'Asset')
  return (
    <NodeViewWrapper
      className={cn(
        'my-2 flex items-center gap-2 rounded-md border border-border bg-muted p-2 text-sm not-prose',
        selected && 'ring-2 ring-ring',
      )}
      data-drag-handle
    >
      {isEntry ? (
        <Share2 aria-hidden className="size-4" />
      ) : asset.data === undefined ? (
        <Image aria-hidden className="size-4" />
      ) : (
        <AssetPreview asset={asset.data} className="size-10 rounded-sm object-cover" />
      )}
      <span className="flex-1 truncate">
        {isEntry ? 'Embedded entry: ' : 'Embedded asset: '}
        {label}
      </span>
      <button type="button" className="text-xs underline" onClick={() => deleteNode()}>
        Remove
      </button>
    </NodeViewWrapper>
  )
}

const embed = (name: 'embeddedEntry' | 'embeddedAsset') =>
  Node.create({
    name,
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes: () => ({ id: { default: null } }),
    parseHTML: () => [{ tag: `div[data-${name}]` }],
    renderHTML: ({ HTMLAttributes }) => [
      'div',
      mergeAttributes(HTMLAttributes, { [`data-${name}`]: '' }),
    ],
    addNodeView: () => ReactNodeViewRenderer(EmbedView),
  })

function extensionsFor(
  nodes: readonly string[],
  marks: readonly string[],
  levels: readonly number[],
) {
  const has = (n: string) => nodes.includes(n)
  const mark = (m: string) => marks.includes(m)
  return [
    StarterKit.configure({
      heading: has('heading') ? { levels: levels as (1 | 2 | 3 | 4 | 5 | 6)[] } : false,
      bulletList: has('bulletList') ? {} : false,
      orderedList: has('orderedList') ? {} : false,
      listItem: has('bulletList') || has('orderedList') ? {} : false,
      listKeymap: has('bulletList') || has('orderedList') ? {} : false,
      blockquote: has('blockquote') ? {} : false,
      codeBlock: has('codeBlock') ? {} : false,
      horizontalRule: has('horizontalRule') ? {} : false,
      hardBreak: has('hardBreak') ? {} : false,
      bold: mark('bold') ? {} : false,
      italic: mark('italic') ? {} : false,
      underline: mark('underline') ? {} : false,
      strike: mark('strike') ? {} : false,
      code: mark('code') ? {} : false,
      link: mark('link')
        ? {
            openOnClick: false,
            autolink: true,
            isAllowedUri: (url) => HREF.test(url),
            HTMLAttributes: { target: null, rel: null, class: null },
          }
        : false,
    }),
    ...(has('table')
      ? [Table.configure({ resizable: false }), TableRow, TableHeader, TableCell]
      : []),
    ...(has('embeddedEntry') ? [embed('embeddedEntry')] : []),
    ...(has('embeddedAsset') ? [embed('embeddedAsset')] : []),
  ]
}

/** An empty document (only empty paragraphs) is stored as no value. */
function isEmptyDoc(editor: TiptapEditor) {
  return editor.isEmpty
}

export default function RichTextWidget({
  id,
  field,
  value,
  onChange,
  context,
  invalid,
  describedBy,
}: WidgetProps) {
  const settings = settingsOf<{ nodes: string[]; marks: string[]; headingLevels: number[] }>(field)
  const nodes = settings.nodes ?? ALL_NODES
  const marks = settings.marks ?? ALL_MARKS
  const levels = settings.headingLevels ?? [1, 2, 3, 4, 5, 6]
  const editor = useEditor({
    extensions: extensionsFor(nodes, marks, levels),
    content: typeof value === 'object' && value !== null ? (value as object) : '',
    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': field.name,
        ...(describedBy === undefined ? {} : { 'aria-describedby': describedBy }),
        ...(invalid ? { 'aria-invalid': 'true' } : {}),
        class:
          'rich-text min-h-32 rounded-b-md border border-t-0 border-input px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      },
    },
    onUpdate: ({ editor: e }) => onChange(isEmptyDoc(e) ? undefined : e.getJSON()),
  })

  if (editor === null) return <p role="status">Loading editor…</p>
  return (
    <WidgetContextRef.Provider value={context}>
      <div className={cn('rounded-md', invalid && 'ring-1 ring-destructive')}>
        <Toolbar
          editor={editor}
          nodes={nodes}
          marks={marks}
          levels={levels}
          context={context}
          fieldName={field.name}
        />
        <EditorContent editor={editor} />
      </div>
    </WidgetContextRef.Provider>
  )
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="icon"
      className="size-8"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

function Toolbar({
  editor,
  nodes,
  marks,
  levels,
  context,
  fieldName,
}: {
  editor: TiptapEditor
  nodes: readonly string[]
  marks: readonly string[]
  levels: readonly number[]
  context: WidgetContext
  fieldName: string
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      href: (e.getAttributes('link')['href'] as string | undefined) ?? '',
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      blockquote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock'),
      heading: levels.find((level) => e.isActive('heading', { level })) ?? 0,
    }),
  })
  const [linking, setLinking] = useState(false)
  const [href, setHref] = useState('')
  const [picking, setPicking] = useState<'entry' | 'asset' | null>(null)
  const chain = () => editor.chain().focus()
  const has = (n: string) => nodes.includes(n)
  const mark = (m: string) => marks.includes(m)

  return (
    <div
      role="toolbar"
      aria-label={`${fieldName} formatting`}
      className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-input bg-muted/40 p-1"
    >
      {has('heading') ? (
        <NativeSelect
          aria-label="Text style"
          className="h-8 w-32"
          value={String(state.heading)}
          onChange={(event) => {
            const level = Number(event.target.value)
            if (level === 0) chain().setParagraph().run()
            else
              chain()
                .setHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 })
                .run()
          }}
        >
          <option value="0">Paragraph</option>
          {levels.map((level) => (
            <option key={level} value={level}>
              Heading {level}
            </option>
          ))}
        </NativeSelect>
      ) : null}
      {mark('bold') ? (
        <ToolButton label="Bold" active={state.bold} onClick={() => chain().toggleBold().run()}>
          <Bold aria-hidden />
        </ToolButton>
      ) : null}
      {mark('italic') ? (
        <ToolButton
          label="Italic"
          active={state.italic}
          onClick={() => chain().toggleItalic().run()}
        >
          <Italic aria-hidden />
        </ToolButton>
      ) : null}
      {mark('underline') ? (
        <ToolButton
          label="Underline"
          active={state.underline}
          onClick={() => chain().toggleUnderline().run()}
        >
          <Underline aria-hidden />
        </ToolButton>
      ) : null}
      {mark('strike') ? (
        <ToolButton
          label="Strikethrough"
          active={state.strike}
          onClick={() => chain().toggleStrike().run()}
        >
          <Strikethrough aria-hidden />
        </ToolButton>
      ) : null}
      {mark('code') ? (
        <ToolButton
          label="Inline code"
          active={state.code}
          onClick={() => chain().toggleCode().run()}
        >
          <Code aria-hidden />
        </ToolButton>
      ) : null}
      {mark('link') ? (
        <ToolButton
          label="Link"
          active={state.link}
          onClick={() => {
            setHref(state.href)
            setLinking((open) => !open)
          }}
        >
          <LinkIcon aria-hidden />
        </ToolButton>
      ) : null}
      {has('bulletList') ? (
        <ToolButton
          label="Bulleted list"
          active={state.bulletList}
          onClick={() => chain().toggleBulletList().run()}
        >
          <List aria-hidden />
        </ToolButton>
      ) : null}
      {has('orderedList') ? (
        <ToolButton
          label="Numbered list"
          active={state.orderedList}
          onClick={() => chain().toggleOrderedList().run()}
        >
          <ListOrdered aria-hidden />
        </ToolButton>
      ) : null}
      {has('blockquote') ? (
        <ToolButton
          label="Quote"
          active={state.blockquote}
          onClick={() => chain().toggleBlockquote().run()}
        >
          <Quote aria-hidden />
        </ToolButton>
      ) : null}
      {has('codeBlock') ? (
        <ToolButton
          label="Code block"
          active={state.codeBlock}
          onClick={() => chain().toggleCodeBlock().run()}
        >
          <FileCode aria-hidden />
        </ToolButton>
      ) : null}
      {has('horizontalRule') ? (
        <ToolButton label="Divider" onClick={() => chain().setHorizontalRule().run()}>
          <Minus aria-hidden />
        </ToolButton>
      ) : null}
      {has('table') ? (
        <ToolButton
          label="Table"
          onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <TableIcon aria-hidden />
        </ToolButton>
      ) : null}
      {has('embeddedEntry') ? (
        <ToolButton label="Embed an entry" onClick={() => setPicking('entry')}>
          <Share2 aria-hidden />
        </ToolButton>
      ) : null}
      {has('embeddedAsset') ? (
        <ToolButton label="Embed an asset" onClick={() => setPicking('asset')}>
          <Image aria-hidden />
        </ToolButton>
      ) : null}
      {linking ? (
        <form
          className="flex w-full items-center gap-2 pt-1"
          onSubmit={(event) => {
            event.preventDefault()
            const trimmed = href.trim()
            if (trimmed === '') chain().extendMarkRange('link').unsetLink().run()
            else if (HREF.test(trimmed))
              chain().extendMarkRange('link').setLink({ href: trimmed }).run()
            else return
            setLinking(false)
          }}
        >
          <Input
            aria-label="Link address"
            placeholder="https://… , mailto:… , /path"
            value={href}
            className="h-8"
            aria-invalid={href.trim() !== '' && !HREF.test(href.trim()) ? true : undefined}
            onChange={(event) => setHref(event.target.value)}
          />
          <Button type="submit" size="sm">
            Apply
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setLinking(false)}>
            Cancel
          </Button>
        </form>
      ) : null}
      <EntryPickerDialog
        open={picking === 'entry'}
        onOpenChange={(open) => setPicking(open ? 'entry' : null)}
        context={context}
        contentTypeIds={[]}
        onPick={(entry) => {
          chain()
            .insertContent({ type: 'embeddedEntry', attrs: { id: entry.sys.id } })
            .run()
          setPicking(null)
        }}
      />
      <AssetPickerDialog
        open={picking === 'asset'}
        onOpenChange={(open) => setPicking(open ? 'asset' : null)}
        spaceId={context.spaceId}
        mimeTypes={[]}
        onPick={(asset) => {
          chain()
            .insertContent({ type: 'embeddedAsset', attrs: { id: asset.sys.id } })
            .run()
          setPicking(null)
        }}
      />
    </div>
  )
}
