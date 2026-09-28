import { BlixisApiError } from '@blixis-io/sdk'
import { useForm } from '@tanstack/react-form'
import { createRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { ErrorAlert } from '../components/error-view.tsx'
import { TextField } from '../components/text-field.tsx'
import { ThemeToggle } from '../components/theme-toggle.tsx'
import { Button } from '../components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader } from '../components/ui/card.tsx'
import { describeError, type ErrorDescription } from '../lib/errors.ts'
import { safeRedirect, useSession } from '../lib/session.tsx'
import { rootRoute } from './root.tsx'

const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address')
    .pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Enter your password'),
})

export const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: ({ context, search }) => {
    if (context.session.user !== null) throw redirect({ href: safeRedirect(search.redirect) })
  },
  component: SignInPage,
})

function SignInPage() {
  const session = useSession()
  const router = useRouter()
  const search = signInRoute.useSearch()
  const [error, setError] = useState<ErrorDescription | null>(null)
  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: { onSubmit: signInSchema },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        await session.signIn({ email: value.email.trim(), password: value.password })
        router.history.push(safeRedirect(search.redirect))
      } catch (e) {
        setError(
          e instanceof BlixisApiError && e.status === 401
            ? {
                title: 'Sign-in failed',
                message: 'The email address or password is incorrect.',
                requestId: e.requestId,
              }
            : describeError(e),
        )
      }
    },
  })

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="absolute top-2 right-2">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-lg font-semibold leading-none">Sign in to Blixis</h1>
          <CardDescription>Use your email address and password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void form.handleSubmit()
            }}
          >
            {error === null ? null : <ErrorAlert error={error} />}
            <form.Field name="email">
              {(field) => (
                <TextField
                  field={field}
                  label="Email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                />
              )}
            </form.Field>
            <form.Field name="password">
              {(field) => (
                <TextField
                  field={field}
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                />
              )}
            </form.Field>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(submitting) => (
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Signing in…' : 'Sign in'}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
