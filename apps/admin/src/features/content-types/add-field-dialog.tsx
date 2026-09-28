import type { FieldType } from '@blixis/sdk'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog.tsx'
import { FIELD_TYPE_UI, fallbackIcon } from './ui-registry.ts'

/** Picks the type of a new field: built-in types first, then those from plugins. */
export function AddFieldDialog({
  open,
  onOpenChange,
  fieldTypes,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  fieldTypes: readonly FieldType[]
  onPick: (type: FieldType) => void
}) {
  const sorted = [...fieldTypes].sort((a, b) => Number(b.builtIn) - Number(a.builtIn))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add a field</DialogTitle>
          <DialogDescription>Choose the type of value editors will enter.</DialogDescription>
        </DialogHeader>
        <ul
          className="grid max-h-[65vh] gap-2 overflow-y-auto sm:grid-cols-2"
          aria-label="Field types"
        >
          {sorted.map((type) => {
            const Icon = FIELD_TYPE_UI[type.id]?.icon ?? fallbackIcon
            return (
              <li key={type.id}>
                <button
                  type="button"
                  aria-labelledby={`field-type-${type.id}-name`}
                  aria-describedby={`field-type-${type.id}`}
                  onClick={() => onPick(type)}
                  className="flex h-full w-full items-start gap-3 rounded-md border border-border p-3 text-left hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span className="grid gap-1">
                    <span className="font-medium">
                      <span id={`field-type-${type.id}-name`}>{type.name}</span>
                      {type.builtIn ? null : (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {type.id}
                        </span>
                      )}
                    </span>
                    <span id={`field-type-${type.id}`} className="text-xs text-muted-foreground">
                      {type.description}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
