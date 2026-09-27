import { describeError, type ErrorDescription } from '../lib/errors.ts'
import { Alert } from './ui/alert.tsx'
import { Button } from './ui/button.tsx'

/** The request id, for support ("quote it when you report a problem"). */
export function RequestId({ id }: { id: string | undefined }) {
  if (id === undefined) return null
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      Request ID: <code className="select-all font-mono">{id}</code>
    </p>
  )
}

/** An inline error with its request id. */
export function ErrorAlert({ error }: { error: ErrorDescription }) {
  return (
    <Alert variant="destructive">
      <p className="font-medium">{error.title}</p>
      <p>{error.message}</p>
      <RequestId id={error.requestId} />
    </Alert>
  )
}

/** A page-level error (route error boundary) with a retry. */
export function ErrorView({ error, reset }: { error: unknown; reset?: () => void }) {
  return (
    <div className="grid max-w-lg gap-4">
      <ErrorAlert error={describeError(error)} />
      {reset === undefined ? null : (
        <div>
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
        </div>
      )}
    </div>
  )
}
