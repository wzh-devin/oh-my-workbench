# Changelog

All notable changes to this template are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the version
numbers follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-08

Initial release.

Flowly is a workflow automation workspace on the Next.js App Router: two
visual canvases, three list pages with full sheet CRUD, a dashboard that reads
from the same data, and a ten section settings area. It runs entirely on the
front end, so there is no database, no API key and no third party service
anywhere in it.

### What is inside

- **Workflow Editor.** A canvas where steps are dragged in from a step library
  and wired together, with per step run state, an inline Ask AI panel and a
  last run summary.
- **AI Agent Builder.** A second canvas for agents, with a library of models,
  data sources, messaging and tools, branch labels on the edges, and per step
  results including token counts and cost.
- **Dashboard.** Workflow health, live agents, run and failure counters, a run
  activity chart, a Needs Attention queue and a workflow table, all reading the
  same seed as the list pages.
- **Workflows and Agents.** Tabbed list pages with a filter row, table and card
  views, per row switches, and create, edit, duplicate, delete and CSV export
  through a drawer.
- **Settings.** Ten sections across workspace, automation, developer and
  account, one route per section, all prerendered.
- **Sign in.** Social, SSO and magic link paths, each simulating its result.

### Notes

- Front end only. State lives in a workspace provider seeded from local
  modules, so edits persist while the tab is open and reset on reload. The
  places a backend attaches are marked in the source.
- Light and dark themes throughout, including both canvases.
- 27 Vitest files covering the data and interaction logic.
- TypeScript is held on 6.x and `lucide-react` is pinned, both deliberately.
  `pnpm-workspace.yaml` carries the reasons next to the pins.
