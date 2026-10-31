# Flowly / oh-my-workbench

A workflow automation workspace built with Vite, React 19, TypeScript, Tailwind CSS 4 and ReUI, with a Go/Gin API. The repository uses pnpm workspaces.

The personal workbench includes a Dashboard, Todo lists, QQ/Gmail inboxes, S3-compatible file assets and a React Flow resource overview. Todo, Mail and Assets use the authenticated Go API and PostgreSQL. Mail supports encrypted credentials, background IMAP synchronization and Web Push notifications while pages are closed. Assets store immutable file bytes in S3/MinIO, with resumable uploads, saved views and private Office previews. See [asset configuration and recovery](apps/api/internal/modules/assets/README.md); legacy browser files remain available through explicit import. See [API setup, mailbox tables and notification flow](apps/api/README.md#邮箱与来信通知) before connecting a real mailbox; existing browser samples are preserved and are not uploaded.

The existing workflow/agent editors remain available. On first deployment, `/login` detects an uninitialized system and opens an administrator setup dialog. After setup, sign in with that administrator's username and password. Sessions use HttpOnly cookies and Redis; refreshing restores the session, protected routes require authentication, and `退出登录` revokes the server session without deleting workbench records. Google/GitHub entries remain disabled until OAuth is implemented. Personal display preferences and workbench data retain their existing local persistence. Account-security forms still use the separate, currently unavailable `/api/account/security` contract.

## Requirements

- Node.js matching `.nvmrc` (22.23.4) and `engines.node` in the root package.
- pnpm 12.6.0, pinned by `packageManager`.
- Go 1.26.5, PostgreSQL and Redis. Copy `apps/api/.env.example` to `apps/api/.env` and configure the connections and JWT secret before starting.

```sh
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:3000. `/` redirects to `/dashboard`.

`pnpm dev` runs both applications through pnpm workspace scripts: Vite on port 3000 and Go on `localhost:11990`. `apps/api/package.json` supplies the Go development command for this workspace entry. Vite proxies `/api` to Go, so browser requests use the same origin. Both processes stop with Ctrl+C. `API_PROXY_TARGET` can override the Vite proxy target when testing a separate backend. The frontend needs no runtime API keys.

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
    cmd/server/main.go    Go entry point
    internal/app/         Startup and routes
    internal/modules/auth/ Administrator setup, password login and sessions
    internal/platform/    PostgreSQL and Redis
    internal/shared/      Password hashing, JWT, IDs and response envelope
    migrations/           Embedded Goose migrations
    go.mod
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
| `pnpm dev` | Start Vite and Go together |
| `pnpm build` | Build `apps/web/dist` and `apps/api/bin/server` |
| `pnpm start` | Start the Go API (serve the frontend separately) |
| `pnpm typecheck` | Check both applications |
| `pnpm lint` | Shared ESLint checks |
| `pnpm test` | Run Vitest and Go tests |
| `pnpm test:watch` | Watch frontend tests |
| `pnpm format` | Format application TypeScript and CSS |
| `pnpm format:check` | Check application formatting |
| `pnpm --filter @workbench/web dev` | Start only the frontend |
| `pnpm dev:api` | Start only the API |

## Production

```sh
pnpm build
pnpm start
```

Serve `apps/web/dist` with an HTTPS web server that falls back to `index.html` for client routes and proxies `/api` to the Go service. Go serves API routes only. Configure `COOKIE_SECURE=true`, a strong `JWT_SECRET`, and internal database/Redis endpoints in production. `HTTP_ADDR` overrides the API listen address; the default binds to `localhost:11990`. Preserve the public `Host` header in the reverse proxy so same-origin checks match browser requests.

For local HTTP development, set `COOKIE_SECURE=false` as shown in `apps/api/.env.example`; the default is Secure. Complete initial administrator setup before exposing a fresh deployment publicly. The first successful initialization wins, and subsequent initialization attempts return HTTP 409. Existing administrators also keep initialization closed.

## Routes and API

The primary pages are `/dashboard`, `/todos`, `/mail`, `/assets` and `/workflows` (the resource overview). Todo accepts `?list=<id>`, `?task=<id>` and `?view=myday|today|overdue|upcoming|important|completed`; Mail accepts `?account=<id>`, `?message=<id>` and `?view=accounts`; Assets accepts `?connection=<id>` and `?view=connections`.

Todo includes Inbox, smart views, quick capture, due dates, daily planning, priorities, tags, editable steps, task details and a completed-task view. Lists can be renamed or removed; removing a list moves its tasks to Inbox. Mail can create a linked task and return to the original message. Mail collection runs in the API process: IMAP IDLE detects arrivals, periodic checks and persisted cursors recover from disconnects, and a durable outbox delivers browser notifications. Recurring Todo tasks and Todo background reminders are not implemented.

Existing editor and settings URLs are preserved: `/workflow-editor`, `/agents`, `/agent-builder`, `/settings/:section` and `/login`. `/settings` redirects to `/settings/general`; unsupported settings sections display the 404 page. Editor record parameters continue to work. Route titles use React 19's document metadata support.

Authentication endpoints all use `{ code, message, data }`:

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/auth/status` | Read `{ initialized }` |
| POST | `/api/auth/initSystemAdmin` | Create the first administrator using `{ username, password }` |
| POST | `/api/auth/login` | Authenticate and set the session cookie; return `{ token, user }` |
| GET | `/api/auth/me` | Restore `{ user, expiresAt }` from a valid session |
| POST | `/api/auth/logout` | Revoke the session and clear its cookie |

Usernames contain 1–64 characters after trimming, and passwords contain 6–24 characters without trimming. Ten failed password attempts for a username temporarily limit that username for up to 60 seconds (HTTP 429). IDs are strings in JSON to preserve BIGINT precision. The API also accepts Bearer tokens for authenticated API callers. Unknown API routes return 404; authentication and infrastructure failures are never treated as successful login.

Go integration tests use `TEST_DATABASE_URL` and `TEST_REDIS_ADDR` against disposable services. They create temporary PostgreSQL schemas and use Redis database 15; do not point those variables at a shared or production Redis database.

## Design system and local fonts

The original ReUI on Base UI / shadcn design system is retained. `components/ui` and `components/reui` are CLI-owned and remain excluded from lint. Inter's Latin variable font is bundled locally from `@fontsource-variable/inter` with `font-display: optional`; no runtime font request goes to Google. `next-themes` supports ordinary React and remains the theme provider; the Next.js framework is no longer a dependency.

Run component installation from `apps/web`, where `components.json` and its aliases are configured:

```sh
cd apps/web
pnpm exec shadcn add button
```

The root `.env.example` documents the optional `REUI_LICENSE_KEY` needed to install premium ReUI components. Copy it to `apps/web/.env.local` only when installing those components, or supply the key through your shell. Existing root `.env.local` is preserved and ignored. Vite does not expose this key to the browser; never use a `VITE_` prefix for secrets. API runtime environment is managed separately by the Go process.

See `AGENTS.md` and `.agents/skills/reui/SKILL.md` for the project rules, and `LICENSE.md` for the template license.

## Go API 数据库迁移

Go API 启动时使用 Goose 执行嵌入的 SQL 迁移，并在数据库中记录版本。开发命令与迁移写法见 [apps/api/README.md](apps/api/README.md)。
