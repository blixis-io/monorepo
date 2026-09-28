import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../../components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu.tsx'
import { newBlockId } from '../values.ts'
import { settingsOf, type WidgetProps } from './types.ts'

type Block = { _id: string; _type: string } & Record<string, unknown>

/**
 * A page builder: an ordered list of components (`_type` is the component's apiId). Component
 * fields are never localized; the blocks field itself may be.
 */
export function BlocksWidget({ field, value, onChange, context, describedBy }: WidgetProps) {
  const settings = settingsOf<{ componentIds: string[]; max: number }>(field)
  const allowed = context.contentTypes.filter(
    (t) => t.kind === 'component' && (settings.componentIds ?? []).includes(t.id),
  )
  const blocks = Array.isArray(value) ? (value as Block[]) : []
  const set = (next: Block[]) => onChange(next.length === 0 ? undefined : next)
  const move = (index: number, by: -1 | 1) => {
    const next = [...blocks]
    const [block] = next.splice(index, 1)
    if (block !== undefined) next.splice(index + by, 0, block)
    set(next)
  }

  return (
    <div className="grid gap-3" aria-describedby={describedBy}>
      {blocks.length > 0 ? (
        <ol className="grid gap-3" aria-label={`${field.name}: blocks`}>
          {blocks.map((block, index) => {
            const component = context.contentTypes.find(
              (t) => t.kind === 'component' && t.apiId === block._type,
            )
            const label = `${component?.name ?? block._type} ${index + 1}`
            const { _id, _type, ...values } = block
            return (
              <li
                key={block._id}
                className="rounded-lg border border-border bg-card text-card-foreground"
                aria-label={label}
              >
                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                  <span className="flex-1 text-sm font-medium">
                    {component?.name ?? `Unknown component “${block._type}”`}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${label} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${label} down`}
                    disabled={index === blocks.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${label}`}
                    onClick={() => set(blocks.filter((b) => b._id !== block._id))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                <div className="p-3">
                  {component === undefined ? (
                    <p className="text-sm text-muted-foreground">
                      This component no longer exists; remove the block.
                    </p>
                  ) : (
                    context.renderFields({
                      type: component,
                      fields: values,
                      onChange: (next) =>
                        set(blocks.map((b) => (b._id === block._id ? { _id, _type, ...next } : b))),
                    })
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      ) : null}
      {blocks.length >= (settings.max ?? 100) ? null : (
        <div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={allowed.length === 0}>
                <Plus aria-hidden />
                Add block
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {allowed.map((component) => (
                <DropdownMenuItem
                  key={component.id}
                  onSelect={() => set([...blocks, { _id: newBlockId(), _type: component.apiId }])}
                >
                  {component.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}
