import { Navigate, type RouteObject } from "react-router"

import { Skeleton } from "@/components/ui/skeleton"
import { SETTINGS_ITEMS } from "@/features/settings/components/data"
import ErrorPage from "@/pages/error"
import NotFound from "@/pages/not-found"

import { AppLayout } from "../layouts/app-layout"
import { AppProviders } from "../providers/app-providers"

function PageLoading() {
  return (
    <main
      className="flex min-h-svh flex-col gap-4 p-6"
      role="status"
      aria-label="Loading page"
    >
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </main>
  )
}

export const routes: RouteObject[] = [
  {
    Component: AppProviders,
    ErrorBoundary: ErrorPage,
    HydrateFallback: PageLoading,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      {
        path: "login",
        lazy: async () => ({
          Component: (await import("@/pages/login")).default,
        }),
      },
      {
        Component: AppLayout,
        children: [
          {
            path: "notes",
            lazy: async () => ({
              Component: (await import("@/pages/notes")).default,
            }),
          },
          {
            path: "todos",
            lazy: async () => ({
              Component: (await import("@/pages/todos")).default,
            }),
          },
          {
            path: "mail",
            lazy: async () => ({
              Component: (await import("@/pages/mail")).default,
            }),
          },
          {
            path: "assets",
            lazy: async () => ({
              Component: (await import("@/pages/assets")).default,
            }),
          },
          {
            path: "dashboard",
            lazy: async () => ({
              Component: (await import("@/pages/dashboard")).default,
            }),
          },
          {
            path: "workflows",
            lazy: async () => ({
              Component: (await import("@/pages/workflows")).default,
            }),
          },
          {
            path: "workflow-editor",
            lazy: async () => ({
              Component: (await import("@/pages/workflow-editor")).default,
            }),
          },
          {
            path: "agents",
            lazy: async () => ({
              Component: (await import("@/pages/agents")).default,
            }),
          },
          {
            path: "agent-builder",
            lazy: async () => ({
              Component: (await import("@/pages/agent-builder")).default,
            }),
          },
          {
            path: "settings",
            element: (
              <Navigate to={`/settings/${SETTINGS_ITEMS[0].value}`} replace />
            ),
          },
          {
            path: "settings/:section",
            lazy: async () => ({
              Component: (await import("@/pages/settings")).default,
            }),
          },
        ],
      },
      { path: "*", Component: NotFound },
    ],
  },
]
