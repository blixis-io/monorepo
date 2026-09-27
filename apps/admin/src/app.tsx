import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type RouterHistory, RouterProvider } from '@tanstack/react-router'
import { useState } from 'react'
import { createAdminRouter } from './routes/router.tsx'

/** The admin application: server state (TanStack Query) and routes (TanStack Router). */
export function App({ history }: { history?: RouterHistory }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  )
  const [router] = useState(() => createAdminRouter(queryClient, history))
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
