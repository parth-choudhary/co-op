# Architecture

**Analysis Date:** 2026-04-14

## Pattern Overview

**Overall:** Next.js 16 App Router full-stack monolith with project-scoped multi-tenancy, layered around a single Prisma ORM data boundary. Federated real-time chat is delegated to a self-hosted Matrix (Synapse) homeserver.

**Key Characteristics:**
- Server-rendered React Server Components for shell/layout, Client Components for interactive views (Kanban board, chat, modals).
- Data access flows exclusively through a shared singleton `PrismaClient` (`src/lib/db.ts`) using the `@prisma/adapter-pg` driver adapter against PostgreSQL.
- Authentication is handled by NextAuth v5 (beta) with JWT session strategy and a credentials provider (`src/lib/auth.ts`).
- Route Handlers (`src/app/api/**/route.ts`) provide a RESTful JSON API consumed by client components via `fetch`.
- Real-time messaging is offloaded: each `Project` and `ChatChannel` maps to a Matrix room; Next.js orchestrates provisioning via admin API (`src/lib/matrix.ts`).
- Multi-tenant by `Company` → scoped by `Project` → authorization enforced by `ProjectMember` lookups on every scoped route.

## Layers

**Presentation (Server Shell) Layer:**
- Purpose: Authenticate, resolve session, fetch navigation context, render layout chrome.
- Location: `src/app/layout.tsx`, `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/p/[projectId]/layout.tsx`.
- Contains: Server Components that call `auth()` and Prisma directly, redirect unauthenticated users, and render the shared `Sidebar`.
- Depends on: `src/lib/auth.ts`, `src/lib/db.ts`, `src/components/layout/Sidebar.tsx`.
- Used by: Next.js routing — wraps all page segments under the corresponding route group.

**Presentation (Client Interaction) Layer:**
- Purpose: Interactive UI — Kanban drag-drop, card detail modal, chat client, forms.
- Location: `src/app/(dashboard)/p/[projectId]/boards/[boardId]/page.tsx`, `src/app/(dashboard)/p/[projectId]/chat/page.tsx`, `src/components/kanban/CardDetailModal.tsx`, `src/components/layout/Sidebar.tsx`.
- Contains: `'use client'` components with `useState`/`useEffect`, `fetch` calls against internal API, `@hello-pangea/dnd` DnD bindings.
- Depends on: API route handlers, `next-auth/react` `SessionProvider` (from `src/components/Providers.tsx`), `lucide-react` icons.
- Used by: Rendered inside server layouts.

**API / Route Handler Layer:**
- Purpose: REST-style endpoints for CRUD operations and cross-cutting operations (move, attachments, chat room provisioning).
- Location: `src/app/api/**/route.ts`.
- Contains: `GET`/`POST`/`PUT`/`PATCH`/`DELETE` exports. Each handler runs `auth()`, validates input, enforces `ProjectMember` membership where applicable, executes Prisma queries, and returns `NextResponse.json`.
- Depends on: `src/lib/auth.ts`, `src/lib/db.ts`, `src/lib/matrix.ts`.
- Used by: Client Components via `fetch('/api/...')`.

**Domain / Data Layer:**
- Purpose: Persistent data model and relational constraints.
- Location: `prisma/schema.prisma` with migrations in `prisma/migrations/`.
- Contains: 15 models — `Company`, `User`, `Project`, `ProjectMember`, `AIAgent`, `ModelKey`, `Board`, `Column`, `Card`, `Comment`, `Checklist`, `ChecklistItem`, `Attachment`, `CardActivity`, `CardMember`, `ChatChannel`.
- Depends on: PostgreSQL 15+ (provisioned via `docker-compose.yml` on port 5433).
- Used by: Every route handler and every server layout/page via the `prisma` singleton.

**Integration Layer (Matrix):**
- Purpose: Encapsulate Synapse admin + client API calls for user registration, room creation, messaging, media upload.
- Location: `src/lib/matrix.ts`.
- Contains: `matrixFetch`, `registerMatrixUser`, `loginMatrixUser`, `createMatrixRoom`, `getJoinedRooms`, `getRoomState`, `sendMessage`, `uploadMedia`, `mxcToHttp`, `generateMatrixPassword`.
- Depends on: `MATRIX_HOMESERVER_URL`, `MATRIX_ADMIN_TOKEN`, `NEXTAUTH_SECRET` env vars.
- Used by: `src/app/api/chat/token/route.ts`, `src/app/api/chat/rooms/route.ts`.

## Data Flow

**Project CRUD Flow (create project):**

1. User submits form from `src/app/(dashboard)/page.tsx` (Project Hub).
2. Client `fetch('/api/projects', { method: 'POST' })`.
3. `src/app/api/projects/route.ts` authenticates via `auth()`, extracts `companyId` from session.
4. A `prisma.$transaction` creates the `Project`, inserts the creator as `ProjectMember { role: 'owner' }`, creates a default `Board` named "Main Board", and seeds four default `Column` rows (To Do, In Progress, Review, Done).
5. Full project (with `_count` aggregations) is re-fetched and returned JSON.
6. Client navigates to `/p/[projectId]`.

**Kanban Card Move Flow:**

1. User drags card in `src/app/(dashboard)/p/[projectId]/boards/[boardId]/page.tsx` (uses `@hello-pangea/dnd`).
2. `onDragEnd` optimistically updates local React state.
3. Client `fetch('/api/cards/[id]/move', { method: 'PATCH' })` with `{ columnId, position }`.
4. `src/app/api/cards/[id]/move/route.ts` reorders `position` on affected rows and writes a `CardActivity` row.
5. Client refreshes board data on failure.

**Chat / Matrix Bootstrap Flow:**

1. Chat page loads → `fetch('/api/chat/token')`.
2. `src/app/api/chat/token/route.ts` looks up `User.matrixUserId`. If missing, it calls `registerMatrixUser` against Synapse admin API to create `@coop_<userId>:coop.local` with a deterministic password (`generateMatrixPassword`), then persists `matrixUserId`.
3. It calls `loginMatrixUser` to obtain an access token and returns `{ accessToken, userId, homeserver, deviceId }` to the client.
4. Client uses token to talk directly to Synapse for message streaming.
5. Project/channel creation (`/api/chat/rooms`) creates a Matrix room and stores `matrixRoomId` on `Project` or `ChatChannel`.

**Authorization Flow (project-scoped API):**

1. Every scoped route calls `await auth()`; null session → `401`.
2. Route extracts `projectId` from URL params or request body.
3. Route queries `prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: user.id } } })`; missing → `403`.
4. On pass, the handler performs its work.

**State Management:**
- Server state: Fetched in Server Components (layouts/pages) or returned by route handlers.
- Client state: Local `useState`/`useEffect` per page; no global store (no Zustand/Redux/React Query). Data is refetched on mount and mutated optimistically.
- Session state: `SessionProvider` from `next-auth/react` wraps the whole tree in `src/components/Providers.tsx`.

## Key Abstractions

**`prisma` singleton:**
- Purpose: Sole database client, re-used across hot reloads via `globalThis` guard.
- Examples: `src/lib/db.ts`.
- Pattern: Module singleton seeded with `PrismaPg` driver adapter over `pg.Pool`.

**`auth()` helper:**
- Purpose: Resolve the current session in Server Components and Route Handlers.
- Examples: `src/lib/auth.ts`, consumed by every layout and API route.
- Pattern: NextAuth v5 exports — `{ handlers, signIn, signOut, auth }` destructured from `NextAuth(config)`.

**Route Group `(dashboard)`:**
- Purpose: Groups authenticated application pages under a shared layout without adding a URL segment.
- Examples: `src/app/(dashboard)/layout.tsx`.
- Pattern: Next.js App Router route groups.

**Project-scoped dynamic segment `p/[projectId]`:**
- Purpose: Every project-scoped feature lives under this segment; the segment's layout enforces membership and loads the `Sidebar` with project context.
- Examples: `src/app/(dashboard)/p/[projectId]/layout.tsx`.
- Pattern: Dynamic route + shared layout authorization gate.

**`Sidebar` dual-mode component:**
- Purpose: Single component renders either hub navigation (projects list + switcher) or project navigation (boards, chat, agents, members, settings).
- Examples: `src/components/layout/Sidebar.tsx`.
- Pattern: Conditional rendering keyed on presence of `currentProject` prop.

**`cardInclude` shared Prisma projection:**
- Purpose: DRY definition of card relations used by multiple card routes.
- Examples: `src/app/api/cards/[id]/route.ts`.
- Pattern: Module-local constant object reused in multiple Prisma calls.

**CardMember polymorphic membership:**
- Purpose: A card can be assigned to either a `User` or an `AIAgent`; `CardMember` carries optional `userId`/`agentId` with paired unique constraints.
- Examples: `prisma/schema.prisma` (`CardMember`, `Card.assigneeType`, `Comment.authorType`, `CardActivity.actorType`).
- Pattern: Polymorphic association via nullable FKs plus a discriminator string.

## Entry Points

**Root server entry:**
- Location: `src/app/layout.tsx`.
- Triggers: Every HTTP request into the Next.js app.
- Responsibilities: Import global CSS, wrap the tree in `<Providers>` (SessionProvider), set document metadata.

**Dashboard shell entry:**
- Location: `src/app/(dashboard)/layout.tsx`.
- Triggers: Requests to any route inside the `(dashboard)` group.
- Responsibilities: Require session, load the user's project memberships, render hub `Sidebar`.

**Project shell entry:**
- Location: `src/app/(dashboard)/p/[projectId]/layout.tsx`.
- Triggers: Requests to any project-scoped route.
- Responsibilities: Enforce `ProjectMember` authorization, load project/boards/memberCount, render project `Sidebar`.

**Auth endpoint:**
- Location: `src/app/api/auth/[...nextauth]/route.ts`.
- Triggers: NextAuth sign-in/sign-out/callback traffic.
- Responsibilities: Re-export `handlers.GET`/`handlers.POST` from `src/lib/auth.ts`.

**Registration endpoint:**
- Location: `src/app/api/auth/register/route.ts`.
- Triggers: POST from `src/app/register/page.tsx`.
- Responsibilities: Create `Company` + owner `User` in a transaction with bcrypt-hashed password.

**Login / Register pages:**
- Location: `src/app/login/page.tsx`, `src/app/register/page.tsx`.
- Triggers: Unauthenticated users.
- Responsibilities: Unauthenticated shells outside the `(dashboard)` group.

## Error Handling

**Strategy:** Route handlers return discriminated JSON `{ error: string }` with HTTP status codes. Server layouts use Next.js `redirect()` and `notFound()` for auth/authz failures. Matrix failures are swallowed when non-critical (e.g., channel creation proceeds if Matrix is offline) and surfaced otherwise.

**Patterns:**
- `if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });` at the top of every handler.
- Membership check → `403 Not a member`.
- Missing entity → `404`.
- Validation failure → `400 <field> is required`.
- Top-level `try { ... } catch (e: any) { return NextResponse.json({ error: e.message || '...' }, { status: 500 }); }` in handlers with external I/O (`src/app/api/chat/rooms/route.ts`, `src/app/api/chat/token/route.ts`).
- Matrix connection refused is recognized and mapped to `503` in `src/app/api/chat/token/route.ts`.
- Layout code wraps non-critical Prisma reads in `try { ... } catch { /* DB might not be ready */ }` to avoid blocking render.

## Cross-Cutting Concerns

**Logging:** Ad-hoc `console.error` only (e.g., `src/app/api/auth/register/route.ts`). No structured logger.

**Validation:** Manual — inline trimming, presence checks, and type coercion in each route handler. No schema validator (Zod/Valibot) present.

**Authentication:** NextAuth v5 Credentials provider with bcrypt password hashing (cost 12) and JWT sessions. Session callbacks attach `companyId`, `companyName`, and `role` to the token and session (`src/lib/auth.ts`).

**Authorization:** Membership gating via `ProjectMember` unique lookup on `projectId_userId`. Applied both in server layouts (`notFound()`) and API handlers (`403`).

**Multi-tenancy:** All domain rows are descendants of `Company` via `Project.companyId`. New projects inherit `user.companyId` from the session.

**Styling:** CSS custom properties in `src/styles/tokens.css` and `src/styles/globals.css`, CSS Modules for component-scoped styles (`Sidebar.module.css`), and inline `style` props for layout primitives.

---

*Architecture analysis: 2026-04-14*
