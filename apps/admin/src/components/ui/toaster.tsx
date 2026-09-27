import { X } from 'lucide-react'
import { Toast } from 'radix-ui'
import { dismissToast, useToasts } from '../../lib/toast.ts'
import { cn } from '../../lib/utils.ts'

/** Renders the notifications from `toast()`; errors stay until dismissed. */
export function Toaster() {
  const toasts = useToasts()
  return (
    <Toast.Provider swipeDirection="right">
      {toasts.map((t) => (
        <Toast.Root
          key={t.id}
          duration={t.variant === 'destructive' ? Number.POSITIVE_INFINITY : 5000}
          onOpenChange={(open) => {
            if (!open) dismissToast(t.id)
          }}
          className={cn(
            'relative grid gap-1 rounded-md border bg-background p-4 pr-8 shadow-lg data-[state=open]:animate-in data-[state=open]:slide-in-from-right',
            t.variant === 'destructive' ? 'border-destructive/50' : 'border-border',
          )}
        >
          <Toast.Title
            className={cn(
              'text-sm font-semibold',
              t.variant === 'destructive' && 'text-destructive',
            )}
          >
            {t.title}
          </Toast.Title>
          {t.description === undefined ? null : (
            <Toast.Description className="text-sm text-muted-foreground">
              {t.description}
            </Toast.Description>
          )}
          <Toast.Close
            aria-label="Dismiss"
            className="absolute top-2 right-2 rounded-sm opacity-70 hover:opacity-100"
          >
            <X className="size-4" aria-hidden />
          </Toast.Close>
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed right-0 bottom-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-4 outline-none" />
    </Toast.Provider>
  )
}
