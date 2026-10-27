# Flowly / oh-my-workbench

A workflow automation workspace built with Vite, React 19, TypeScript, Tailwind CSS 4 and ReUI, with a Hono Node.js API. The repository uses pnpm workspaces.

The personal workbench includes a Dashboard, Todo lists, QQ/Gmail inboxes, S3-compatible file assets and a React Flow resource overview. This iteration uses frontend sample data: metadata persists in localStorage and uploaded file bytes in IndexedDB. Mail and storage connections do not contact real services or collect credentials. Clearing browser storage removes these records and files.

The existing workflow/agent editors remain available. The personal sign-in page at `/login` has email/password, Google and GitHub entries; these currently preserve the frontend-only navigation flow and do not authenticate accounts. The user menu’s `退出登录` action returns to `/login` without deleting workbench data. Personal settings and notification read receipts share the workbench's local persistence. Settings include general preferences, profile, notifications and account security. Mail accounts and storage connections stay in the mailbox and assets pages. Account security forms use the `/api/account/security` client contract; the authentication backend is not implemented. Login passwords are not persisted by the frontend.

## Requirements

- Node.js matching `.nvmrc` (22.23.4) and `engines.node` in the root package.
- pnpm 12.6.0, pinned by `packageManager`.

```sh
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:3000. `/` redirects to `/dashboard`.

`pnpm dev` runs Vite on port 3000 and Hono on port 8787. Vite proxies `/api` to Hono, so browser requests use the same origin. Both processes stop with Ctrl+C. The frontend needs no runtime environment variables or API keys.

## Layout

```text
apps/
  web/
    src/
      main.tsx            React entry and browser router initialization
      app/                Application composition
        router/
          routes.tsx      Explicit routes with lazy page modules
          routes.test.tsx Routing and cross-page state contract tests
        layouts/
          app-layout.tsx  WorkspaceProvider and persistent AppShell
        providers/
          app-providers.tsx Theme, motion preferences, toaster and progress bar
        styles/
          globals.css     Design tokens and local Inter font
      pages/
        dashboard/index.tsx
        todos/index.tsx
        mail/index.tsx
        assets/index.tsx
        workflows/index.tsx
        workflow-editor/index.tsx
        agents/index.tsx
        agent-builder/index.tsx
        settings/index.tsx
        login/index.tsx
        not-found/index.tsx
        error/index.tsx
      components/
        app-shell/        Persistent shell, sidebars and header slots
        navigation/       Page progress bar and its tests
        theme/            Theme provider, toggle and its tests
        workspace/        Cross-page workspace state and URL record requests
        shared/           Reusable application components
        ui/               CLI-owned shadcn/Base UI primitives
        reui/             CLI-owned ReUI components
      features/           Business components, schemas and rules
      hooks/
      lib/workspace/      Workflow, agent and team seed data
    public/
    test/                 Vitest setup
    components.json       ReUI/shadcn CLI configuration
    vite.config.ts
    vitest.config.ts
    tsconfig.json
    package.json
  api/
    src/
      app.ts              Hono app factory, API routes and SPA hosting
      app.test.ts         HTTP and static hosting contract tests
      index.ts            Node server entry and shutdown
    tsconfig.json
    package.json
package.json              Workspace commands and shared lint/format tools
pnpm-workspace.yaml
pnpm-lock.yaml
eslint.config.mjs
tsconfig.base.json
```

`pages/<page>/index.tsx` is the route entry; feature components and business rules stay in `features`. The shared shell and workspace store mount once, so records and sidebar state survive navigation. No shared package is needed until multiple applications actually use the same code.

Keep new code with the module that owns it: application wiring in `app`, route entries in `pages`, business UI and rules in `features/<feature>`, and cross-page components in the appropriate `components` group. Feature-specific hooks and helpers stay with their feature; root `hooks` and `lib` hold shared utilities. Keep tests beside the code they verify and import concrete files directly. `main.tsx` initializes the router and renders the app; route configuration belongs in `app/router`.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start Vite and Hono together |
| `pnpm build` | Build `apps/web/dist` and `apps/api/dist` |
| `pnpm start` | Serve the production frontend and API through Hono on port 3000 |
| `pnpm typecheck` | Check both applications |
| `pnpm lint` | Shared ESLint checks |
| `pnpm test` | Run frontend and API Vitest suites |
| `pnpm test:watch` | Watch both test suites |
| `pnpm format` | Format application TypeScript and CSS |
| `pnpm format:check` | Check application formatting |
| `pnpm --filter @workbench/web dev` | Start only the frontend |
| `pnpm --filter @workbench/api dev` | Start only the API |

## Production

```sh
pnpm build
pnpm start
```

Hono serves the frontend build and `/api` on the same port. Frontend asset paths are resolved relative to the server module, so they do not depend on the shell's working directory. Build both applications together before starting. `PORT` overrides the production port; production listens on all network interfaces, while the development API binds to loopback.

```sh
PORT=8080 pnpm start
```

Direct GET requests to `/settings/general`, `/workflow-editor` and other page paths return `index.html`; React Router resolves the page. Unknown UI routes display the 404 page after client rendering, with HTTP 200 for the SPA shell. Missing assets and unknown API routes return HTTP 404. Deployment therefore requires the built frontend alongside the API; `vite preview` alone does not provide the backend.

## Routes and API

The primary pages are `/dashboard`, `/todos`, `/mail`, `/assets` and `/workflows` (the resource overview). Todo accepts `?list=<id>`, `?task=<id>` and `?view=myday|today|overdue|upcoming|important|completed`; Mail accepts `?account=<id>`, `?message=<id>` and `?view=accounts`; Assets accepts `?connection=<id>` and `?view=connections`.

Todo includes Inbox, smart views, quick capture, due dates, daily planning, priorities, tags, editable steps, task details and a completed-task view. Lists can be renamed or removed; removing a list moves its tasks to Inbox. Mail can create a linked task and return to the original message. Existing v1 records receive default task metadata without being reset. Recurring tasks, background reminders and external synchronization are not implemented.

Existing editor and settings URLs are preserved: `/workflow-editor`, `/agents`, `/agent-builder`, `/settings/:section` and `/login`. `/settings` redirects to `/settings/general`; unsupported settings sections display the 404 page. Editor record parameters continue to work. Route titles use React 19's document metadata support.

```sh
curl http://127.0.0.1:3000/api/health
# {"ok":true}
```

The API currently provides only the health check. Unknown `/api` routes return `404 {"error":"Not found"}`. Hono handles unexpected errors with a generic JSON 500 response and logs the error server-side. No database, authentication or server-side workflow execution is included.

## Design system and local fonts

The original ReUI on Base UI / shadcn design system is retained. `components/ui` and `components/reui` are CLI-owned and remain excluded from lint. Inter's Latin variable font is bundled locally from `@fontsource-variable/inter` with `font-display: optional`; no runtime font request goes to Google. `next-themes` supports ordinary React and remains the theme provider; the Next.js framework is no longer a dependency.

Run component installation from `apps/web`, where `components.json` and its aliases are configured:

```sh
cd apps/web
pnpm exec shadcn add button
```

The root `.env.example` documents the optional `REUI_LICENSE_KEY` needed to install premium ReUI components. Copy it to `apps/web/.env.local` only when installing those components, or supply the key through your shell. Existing root `.env.local` is preserved and ignored. Vite does not expose this key to the browser; never use a `VITE_` prefix for secrets. API runtime environment is managed separately by the Node process.

See `AGENTS.md` and `.agents/skills/reui/SKILL.md` for the project rules, and `LICENSE.md` for the template license.
