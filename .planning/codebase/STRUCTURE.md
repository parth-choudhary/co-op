# Directory Structure

**Analysis Date:** 2026-04-14

## Top-level Layout

Project root: `/Users/parth/Projects/parth/co-op`

- `AGENTS.md` / `CLAUDE.md` — agent instructions (CLAUDE.md just aliases AGENTS.md). AGENTS.md warns this is Next.js 16 with breaking changes; read `node_modules/next/dist/docs/` before writing code.
- `DESIGN.md` — 26KB design doc.
- `docker-compose.yml` + `docker/synapse/` — local Postgres (port 5433) + Matrix Synapse homeserver (port 8008) with `homeserver.yaml`, signing key, log config, and `media_store/`.
- `prisma/schema.prisma` + `prisma/migrations/` (four migrations, latest `20260414085847_project_centric_restructure`).
- `prisma.config.ts`, `next.config.ts` (default), `tsconfig.json` (`@/*` → `./src/*`, strict), `eslint.config.mjs` (flat config extending `eslint-config-next`).
- `public/` — Next.js static assets.
- `.planning/codebase/` — output directory for GSD maps.

## `src/` Tree

**App shell & auth:**
- `src/app/layout.tsx` — root shell, imports `@/styles/globals.css`, wraps tree in `<Providers>`.
- `src/app/login/page.tsx`, `src/app/register/page.tsx` — unauthenticated pages.
- `src/app/(dashboard)/layout.tsx` — auth gate via `auth()`, loads user's project memberships, renders hub `Sidebar`.
- `src/app/(dashboard)/page.tsx` — project hub (list/create projects).

**Project-scoped pages (nested route group):**
- `src/app/(dashboard)/p/[projectId]/layout.tsx` — membership gate, loads current project + boards + memberCount + allProjects.
- `src/app/(dashboard)/p/[projectId]/page.tsx` — project overview.
- `src/app/(dashboard)/p/[projectId]/boards/[boardId]/page.tsx` — kanban board.
- `src/app/(dashboard)/p/[projectId]/chat/page.tsx` — project chat.
- `src/app/(dashboard)/p/[projectId]/agents/page.tsx` — AI agents.
- `src/app/(dashboard)/p/[projectId]/members/page.tsx` — member management.
- `src/app/(dashboard)/p/[projectId]/settings/page.tsx` — project settings.

**API routes:**
- `src/app/api/auth/[...nextauth]/route.ts` — re-exports NextAuth handlers.
- `src/app/api/auth/register/route.ts` — POST to create Company + owner User.
- `src/app/api/projects/route.ts`, `src/app/api/projects/[id]/route.ts`, `.../boards/route.ts`, `.../members/route.ts`.
- `src/app/api/cards/route.ts` + `src/app/api/cards/[id]/{route,move,comments,activity,members,attachments,checklists/route,checklists/[checklistId]/route,checklists/[checklistId]/items/route}.ts`.
- `src/app/api/columns/{route,[id]/route,[id]/move/route}.ts`.
- `src/app/api/agents/route.ts`, `src/app/api/team/route.ts`, `src/app/api/model-keys/{route,[id]/route}.ts`.
- `src/app/api/chat/token/route.ts`, `src/app/api/chat/rooms/route.ts`.

**Components:**
- `src/components/Providers.tsx` (client SessionProvider wrapper).
- `src/components/layout/Sidebar.tsx` (236 lines, dual-mode) + `Sidebar.module.css`.
- `src/components/kanban/CardDetailModal.tsx` (552 lines, largest component).

**Libraries:**
- `src/lib/db.ts` (Prisma singleton w/ `PrismaPg` + `pg.Pool`).
- `src/lib/auth.ts` (NextAuth v5 credentials + JWT).
- `src/lib/matrix.ts` (Synapse admin API wrappers).

**Styles:**
- `src/styles/tokens.css` — design tokens (spacing, colors, typography).
- `src/styles/globals.css` — global styles + utility classes.

## Largest Client Surfaces (by line count)

- `src/components/kanban/CardDetailModal.tsx` — 552
- `src/app/(dashboard)/p/[projectId]/chat/page.tsx` — 433
- `src/app/(dashboard)/p/[projectId]/boards/[boardId]/page.tsx` — 359
- `src/components/layout/Sidebar.tsx` — 236

## Naming Conventions

- Next.js files: `page.tsx`, `layout.tsx`, `route.ts` (framework conventions).
- Components: `PascalCase.tsx`; CSS Modules `PascalCase.module.css` paired with component.
- Library modules: lowercase (`db.ts`, `auth.ts`, `matrix.ts`).
- Route segments lowercase; route groups in parentheses (`(dashboard)`); dynamic `[param]`; catch-all `[...param]`.
- Imports use `@/...` alias exclusively for `src/...`.
- Interface types use `PascalCase`, DTO shapes often suffixed `Data` (`CardData`, `ColumnData`, `MemberData`).

## Testing

None present — no test framework in `package.json`, no `*.test.*`/`*.spec.*` files.

## Where to Add New Code

- **New API endpoint** → `src/app/api/<resource>/<action>/route.ts` following template: `auth()` → membership check via `prisma.projectMember.findUnique({ where: { projectId_userId: ... } })` → Prisma call → `NextResponse.json`.
- **New project-scoped page** → `src/app/(dashboard)/p/[projectId]/<feature>/page.tsx`; membership already enforced by parent layout; add Sidebar nav entry in `src/components/layout/Sidebar.tsx`.
- **New unauthenticated page** → `src/app/<name>/page.tsx` outside `(dashboard)` group.
- **New component** → `src/components/<feature>/<ComponentName>.tsx` (+ CSS Module).
- **New shared server util** → `src/lib/<name>.ts`; prefer singleton pattern for stateful clients like `db.ts`.
- **New data model** → edit `prisma/schema.prisma`, run `prisma migrate dev`, include `@@index` on FKs and `onDelete: Cascade` to match convention.
- **New design token** → `src/styles/tokens.css`, consume via `var(--token-name)`.
- **New Matrix operation** → add wrapper in `src/lib/matrix.ts` following `matrixFetch` pattern; never call Synapse from client components.

## Special Directories

- `.next/` — generated, gitignored.
- `node_modules/` — generated.
- `prisma/migrations/` — committed SQL history.
- `docker/synapse/media_store/` — runtime Synapse attachments.
- `public/` — static assets.
- `.planning/` — GSD planning outputs.

---

*Structure analysis: 2026-04-14*
