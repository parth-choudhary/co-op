# Coding Conventions

**Analysis Date:** 2026-04-14

## Naming Patterns

**Files:**
- React components: `PascalCase.tsx` (`src/components/kanban/CardDetailModal.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/Providers.tsx`)
- Next.js route segments: lowercase Next conventions (`page.tsx`, `layout.tsx`, `route.ts`)
- Dynamic segments: bracketed lowercase (`[id]`, `[projectId]`, `[...nextauth]`)
- Route groups: parenthesized (`(dashboard)`) — do not contribute to URL path
- Library / utility modules: lowercase (`src/lib/auth.ts`, `src/lib/db.ts`, `src/lib/matrix.ts`)
- CSS Modules: co-located `PascalCase.module.css` (`src/components/layout/Sidebar.module.css`)

**Functions:**
- `camelCase` for regular functions and variables (`handleSubmit`, `getInitials`, `formatDate`, `createPrismaClient`)
- React components default-exported as `PascalCase` (`export default function CardDetailModal(...)`)
- Next.js route handlers exported as UPPERCASE HTTP verbs: `GET`, `POST`, `PUT`, `DELETE` from `route.ts`
- Top-level async handlers use `async function` declarations (not arrow functions)

**Variables:**
- `camelCase` for locals and state
- React state setters: `const [foo, setFoo] = useState(...)`
- Module-level constants in SCREAMING_SNAKE_CASE when truly constant (`MATRIX_HOMESERVER`, `MATRIX_ADMIN_TOKEN`, `LABEL_COLORS` in `src/components/kanban/CardDetailModal.tsx`)
- Module-level data arrays in `camelCase` when informal (`colors` in `src/app/(dashboard)/page.tsx`)

**Types:**
- `PascalCase` interfaces/type aliases (`MemberData`, `ChecklistData`, `SidebarProps`)
- Component prop interfaces named inline as `Props` or explicit `<Component>Props` (e.g., `SidebarProps`)
- Data-shape interfaces use `Data` suffix (`CardDetailData`, `ActivityData`, `CommentData`)

## Code Style

**Formatting:**
- No Prettier/Biome config — authors follow ESLint defaults + house style
- Single quotes for strings; semicolons always; trailing commas in multi-line literals; 2-space indent
- Loose line-length (many long inline-style JSX lines, e.g., `src/app/(dashboard)/page.tsx:45`)
- Compact single-line guard `if` statements (e.g., `if (!session?.user) return NextResponse.json(...)`)
- Early-return / short-circuit preferred over nested `else`

**Linting:**
- Flat ESLint 9 config in `eslint.config.mjs`
- Extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` verbatim — no custom rules
- Global ignores: `.next/**`, `out/**`, `build/**`, `next-env.d.ts`
- Script: `npm run lint` → `eslint`
- TS `strict: true` in `tsconfig.json` but `as any` is used liberally for session/Prisma seams

## Import Organization

**Order (observed):**
1. External / framework imports (`next/server`, `next-auth`, `react`, `bcryptjs`)
2. Icon imports from `lucide-react` (often a large destructured block)
3. Internal `@/`-aliased imports (`@/lib/auth`, `@/lib/db`, `@/components/...`)
4. Relative imports last (e.g., `./Sidebar.module.css`)

**Path Aliases:**
- `@/*` → `./src/*` in `tsconfig.json`
- Preferred over `../../..` relative traversal; only CSS modules use relative paths

**Client vs Server:**
- Client components: `'use client';` as first line (`src/app/(dashboard)/page.tsx`, `src/components/kanban/CardDetailModal.tsx`, `src/components/layout/Sidebar.tsx`, `src/app/login/page.tsx`)
- Server components / route handlers omit the directive (`src/app/(dashboard)/layout.tsx`, all `src/app/api/**/route.ts`)

## Error Handling

**API routes (`src/app/api/**/route.ts`):**
- Guard-clause order: authenticate → validate → act
- 401: `if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })`
- 400: `return NextResponse.json({ error: 'Name is required' }, { status: 400 })`
- 403: `return NextResponse.json({ error: 'Not a member' }, { status: 403 })` (`src/app/api/chat/rooms/route.ts`)
- 404: `return NextResponse.json({ error: 'Card not found' }, { status: 404 })` (`src/app/api/cards/[id]/route.ts`)
- 201 on create: `return NextResponse.json(card, { status: 201 })`
- Error body shape: `{ error: string }` — always
- No try/catch around handler bodies — uncaught errors bubble to Next's default 500

**External fetch helpers (`src/lib/matrix.ts`):**
- Check `res.ok`; recover JSON with `await res.json().catch(() => ({}))`
- Throw `new Error('Failed to <action>: ${err.error || res.statusText}')`
- Some helpers return safe fallbacks on failure (`getJoinedRooms` → `{ joined_rooms: [] }`, `getRoomState` → `[]`)

**Client-side fetch:**
- `try { ... } finally { setLoading(false); }` (see `src/app/(dashboard)/page.tsx` `handleCreate`, `src/app/login/page.tsx` `handleSubmit`)
- Silent catch fallback: `catch { setError('Something went wrong'); }`
- No global error boundary

## Logging

**Framework:** None. No logger dependency; no `console.log` in production paths.

**Patterns:**
- Errors either thrown or returned as JSON
- DB-readiness failures swallowed silently: `catch { /* DB might not be ready */ }` in `src/app/(dashboard)/layout.tsx`

## Comments

**When to Comment:**
- Section banners inside large components: `// ---- Types ----` (`src/components/kanban/CardDetailModal.tsx`)
- Intent-revealing single-line comments above non-obvious steps: `// Verify membership`, `// Auto-create the creator as project owner`, `// Log activity for significant changes`
- Module purpose comment at top of utility files: `// Server-side Matrix admin utilities` (`src/lib/matrix.ts`)

**JSDoc/TSDoc:**
- Short `/** ... */` descriptions above exported helpers in `src/lib/matrix.ts`
- Not used on React components or API handlers

## Function Design

**Size:**
- API handlers small and focused (5-30 lines), one HTTP verb each
- Client components large and monolithic (`CardDetailModal.tsx` contains many inline sub-renders)

**Parameters:**
- React components: destructured props (`function Sidebar({ user, projects, currentProject, boards, memberCount }: SidebarProps)`)
- Utility helpers: positional with inline defaults (`sendMessage(roomId, accessToken, body, msgtype: string = 'm.text')`)
- Next.js route handlers: `(request: NextRequest, { params }: { params: Promise<{ id: string }> })` — **`params` is a Promise and must be awaited** (Next 16 convention; see `AGENTS.md`)
- Unused first arg: underscore-prefixed `_request` (e.g., `src/app/api/cards/[id]/route.ts` GET/DELETE)

**Return Values:**
- API handlers always return `NextResponse.json(...)`
- Prisma query results consumed directly — no wrapper `Result<T, E>` pattern

## Module Design

**Exports:**
- Components: `export default function Name(...)`
- Utilities: named `export async function ...`
- Singletons: named + default combined (`src/lib/db.ts` exports `prisma` both ways)
- Route handlers: named UPPERCASE HTTP-verb exports (Next.js requirement)

**Barrel Files:**
- None — direct path imports only

## Type-safety Tradeoffs

**`as any` escape hatches are common and intentional:**
- `const user = session.user as any` in every authenticated API handler (NextAuth session type not augmented)
- `src/lib/auth.ts` callbacks cast `user as any` / `session.user as any` to attach `companyId`, `companyName`, `role`
- Prisma client typed `any` in `src/lib/db.ts`: `export const prisma: any = ...` and `new (PrismaClient as any)({ adapter })`
- Prisma `.map((m: any) => ...)` callbacks
- Dynamic patch objects: `const updateData: any = {}` in `src/app/api/cards/[id]/route.ts`

**Rule for new code:** Match existing patterns — do not introduce strict typing around the session/Prisma boundary unless augmenting NextAuth types globally.

## Prisma / Data Access Conventions

- Shared `include` shapes defined as module-level `const` objects; enum literals use `as const` (e.g., `orderBy: { position: 'asc' as const }` in `src/app/api/cards/[id]/route.ts`)
- Prefer `select` over returning entire records; nested `select: { id, name, avatarUrl }` for user/agent embeds
- Position fields: computed via `_max` aggregate + 1 (`position: (maxPos._max.position ?? -1) + 1` in `src/app/api/cards/route.ts` and `src/app/api/columns/route.ts`)
- Multi-step creates wrapped in `prisma.$transaction(async (tx: any) => { ... })` (see `src/app/api/projects/route.ts` POST — creates project, owner membership, default board, default columns)
- Strings always `.trim()`'d before insert/update; empty strings normalized to `null` via `data.description?.trim() || null`
- Cursor-pagination pattern in `src/app/api/cards/[id]/comments/route.ts`: `take: take + 1`, pop last, return `{ items, hasMore, nextCursor }`

## Next.js / App Router Conventions

- **Next.js 16.2.3 + React 19.2.4** — `AGENTS.md` warns: "This is NOT the Next.js you know. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code."
- Route `params` is a `Promise` — always `const { id } = await params;`
- Route groups `(dashboard)` share a layout without adding URL segments
- Auth gating in server layouts: `const session = await auth(); if (!session?.user) redirect('/login');` (`src/app/(dashboard)/layout.tsx`)
- Client navigation: `useRouter()` from `next/navigation` → `router.push(...)` + `router.refresh()` after auth state changes
- Root metadata defined in `src/app/layout.tsx`

## Styling Conventions

- Design tokens in `src/styles/tokens.css` / `src/styles/globals.css` — referenced via `var(--space-8)`, `var(--color-accent)`, `var(--sidebar-width)`, etc.
- Utility classes on elements: `className="btn btn-primary"`, `className="heading-2"`, `className="text-secondary"`, `className="fade-in"`
- Inline `style={{ ... }}` objects used heavily for layout one-offs; tokens referenced inside via `var(--...)`
- CSS Modules used for component-specific complex styles (`src/components/layout/Sidebar.module.css`)
- Icons: always `lucide-react`, imported by name, sized via `size={N}` prop

---

*Convention analysis: 2026-04-14*
