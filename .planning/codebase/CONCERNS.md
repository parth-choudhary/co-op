# Technical Concerns

**Analysis Date:** 2026-04-14

## Tech Debt

- **Pervasive `as any` casts** — 37 occurrences across 20 files. `prisma` is globally typed `any` in `src/lib/db.ts` (line 11: `new (PrismaClient as any)({ adapter })`); every API route casts `session.user as any` to reach custom JWT fields. Fix by adding a NextAuth module augmentation for `companyId`, `companyName`, `role`, and using the real `PrismaClient` type.
- **Double-fetch on board mount** — `src/app/(dashboard)/p/[projectId]/boards/[boardId]/page.tsx` lines 55-88 run two sequential `useEffect` hooks that both fetch board data; the first (`/api/projects/{id}/boards`) is entirely wasted by the second (`/api/projects/{id}`).
- **Mis-pinned dependency** — `package.json` pins `lucide-react: ^1.8.0`, which does not match the published major for lucide-react. Likely a typo.
- **Orphaned `companyId` columns** — `prisma/schema.prisma` lines 72 and 96 leave a `companyId String?` on `AIAgent` and `ModelKey` with no relation, no index — dead columns after the `project_centric_restructure` migration.
- **Hardcoded Matrix homeserver name** — `src/lib/matrix.ts:24` bakes `:coop.local` into the MXID regardless of `MATRIX_HOMESERVER_URL`.

## Security (Critical)

- **Missing authorization on card/column routes** — Every route under `src/app/api/cards/**` and `src/app/api/columns/**` only checks `session?.user`. None verify the caller is a member of the owning project. Any authenticated user can read, move, edit, or delete any card, column, comment, checklist, attachment, or activity in any company by guessing IDs. This is a cross-tenant horizontal privilege escalation. Fix: join Card → Column → Board → Project → ProjectMember on every card-scoped request. Files include `src/app/api/cards/route.ts`, `src/app/api/cards/[id]/route.ts`, `src/app/api/cards/[id]/move/route.ts`, `src/app/api/cards/[id]/attachments/route.ts`, `src/app/api/cards/[id]/comments/route.ts`, `src/app/api/cards/[id]/activity/route.ts`, `src/app/api/cards/[id]/checklists/route.ts`, `src/app/api/cards/[id]/checklists/[checklistId]/route.ts`, `src/app/api/cards/[id]/checklists/[checklistId]/items/route.ts`, `src/app/api/cards/[id]/members/route.ts`, `src/app/api/columns/route.ts`, `src/app/api/columns/[id]/route.ts`, `src/app/api/columns/[id]/move/route.ts`.
- **Plaintext API keys under a misleading name** — `src/app/api/model-keys/route.ts:43` stores the raw provider key into `ModelKey.keyEncrypted` with no encryption. The schema field name (`keyEncrypted`) implies otherwise. Needs envelope encryption (AES-GCM with a master key).
- **Weak Matrix password derivation** — `src/lib/matrix.ts:156-158` derives the Matrix password as `coop_matrix_${userId}_${NEXTAUTH_SECRET.slice(0,8)}`. A leaked `NEXTAUTH_SECRET` compromises every Matrix account. The function's own docstring says "use a proper key derivation" in production.
- **Matrix admin token defaults to empty string** — `src/lib/matrix.ts:5` silently falls back to `''`. Should fail fast in production.
- **DB credentials fallback** — `src/lib/db.ts:8` defaults to `postgresql://coop:coop@localhost:5433/coop` if `DATABASE_URL` is unset. A mis-configured production deploy will silently bind localhost dev creds.
- **No input validation** — Routes trust `request.json()` shapes directly (no zod/valibot). Extra fields flow through. Add per-route schemas.
- **No rate limiting** — `src/app/api/auth/register/route.ts` and NextAuth credentials login in `src/lib/auth.ts` are unthrottled.
- **No CSRF defense beyond NextAuth cookie defaults** on mutation routes.
- **Data-URL attachments** — `src/components/kanban/CardDetailModal.tsx:173-178` uploads files as base64 data URLs and persists them in Postgres text; rendering them later is an XSS risk if mimeType is attacker-controlled.

## Known Bugs / Rough Edges

- **Chat poll interval race** — `src/app/(dashboard)/p/[projectId]/chat/page.tsx:69,112-121` keeps `pollInterval` in state and also returns its own effect cleanup. Rapid room switching can orphan intervals that keep polling Synapse.
- **Card `assigneeUser`/`assigneeAgent` never written** — includes exist across `src/app/api/cards/route.ts` and `.../[id]/route.ts`, but no route sets `assigneeUserId`/`assigneeAgentId`. Only `CardMember` rows are created. UI consumers expecting `card.assigneeUser` will see `null`.
- **No comment edit/delete endpoints** — `src/app/api/cards/[id]/comments/route.ts` only exposes GET/POST.
- **Pagination boundary** — `comments`/`activity` routes (`src/app/api/cards/[id]/comments/route.ts:13-27`, `.../activity/route.ts:13-24`) return `hasMore=false` when the list is exactly `take` items, even if more exist; harmless but imprecise.
- **Channel creation swallows Matrix errors** — `src/app/api/chat/rooms/route.ts:80-85` bare-catches Synapse failures and persists a channel with `matrixRoomId: null`, producing a zombie channel the user cannot message.
- **Layouts swallow DB errors silently** — `src/app/(dashboard)/layout.tsx:20` and `src/app/(dashboard)/p/[projectId]/layout.tsx:50` use `catch { /* DB might not be ready */ }`, hiding outages behind empty sidebars.
- **Non-atomic move reindexing** — `src/app/api/cards/[id]/move/route.ts:11-27` reads `card.position` outside the transaction, then uses it inside. Concurrent moves can produce duplicate/gapped positions. Same pattern in `src/app/api/columns/[id]/move/route.ts:11-22`.

## Performance

- **Over-eager includes on project GET** — `src/app/api/projects/[id]/route.ts:17-48` loads every board → every column → every card → members+checklists+attachments+comment counts in one query.
- **Heavy project list for switcher** — `src/app/api/projects/route.ts:11-24` returns boards+columns+card counts for each membership; the sidebar only needs id/name/color/icon.
- **Chat polling 5s/room** — `src/app/(dashboard)/p/[projectId]/chat/page.tsx:118`. Switch to Matrix `/sync` or matrix-js-sdk.
- **Layout re-runs per nav** — `src/app/(dashboard)/p/[projectId]/layout.tsx` issues 5 sequential DB queries each render; parallelize with `Promise.all` and/or React `cache()`.
- **Board double-fetch** — see tech debt.

## Fragile Areas

- **`src/components/kanban/CardDetailModal.tsx` (552 lines)** — single component handling fetch, title/desc editing, labels, members, checklists CRUD, attachments, due date, comments, activity, with inline styles throughout. Extract `MemberPicker`, `LabelPicker`, `ChecklistSection`, `CommentList`, `AttachmentsList`, and move fetch logic into a hook.
- **`src/app/(dashboard)/p/[projectId]/chat/page.tsx` (433 lines)** — client talks to Synapse REST directly with raw `fetch` and ad-hoc txnIds; mixes transport, state, polling, mentions, uploads. Wrap Matrix I/O in a dedicated client/hook.
- **`src/lib/db.ts`** — pool created at import with no retry; first failure gives a cryptic error.

## Scaling Limits

- **Integer position columns** — `src/app/api/cards/[id]/move/route.ts` and `.../columns/[id]/move/route.ts` do O(n) updates per move. Move to fractional/lexorank indexing for large boards.
- **Project deep-include endpoint** — scales poorly past a handful of projects.
- **docker-compose Synapse** — `docker-compose.yml` runs single-node Synapse; document prod topology with workers + Redis.

## Dependencies at Risk

- `next-auth: ^5.0.0-beta.30` (beta; pin exact).
- `@prisma/client ^7.7.0` + `@prisma/adapter-pg ^7.7.0` (the `as any` cast in `src/lib/db.ts` suggests adapter types are not being used as intended; re-verify against Prisma 7 docs).
- `next: 16.2.3` — `AGENTS.md` explicitly warns Next 16 has breaking changes from any model's training data; contributors must consult `node_modules/next/dist/docs/` before writing route code.

## Missing Critical Features

- **No agent invocation runtime** — `AIAgent` records can be created (`src/app/api/agents/route.ts`) but nothing ever runs them. No `POST /api/agents/[id]/run`, no `src/lib/agents/`, no provider adapters. The core "AI cooperates on cards" premise has no backend.
- **No real attachment storage** — data URLs only (see bugs).
- **No real-time board updates** — only chat polls; boards never reflect other users' moves live.
- **No runtime schema validation** — routes trust JSON.
- **No tests** — `package.json` has no test runner; zero `*.test.*`/`*.spec.*` files.
- **No audit log beyond `CardActivity`** — project/member/agent/key/auth events not recorded.

## Test Coverage Gaps

- **Entire codebase** — highest priority. Start with API integration tests against a throwaway Postgres, especially for authorization.
- **Cross-tenant access attempts** — needed to prove the authorization fix lands and regressions don't slip in.
- **Concurrent move reindexing** under contention.
- **Matrix-down fallback paths** across `src/lib/matrix.ts` and `src/app/api/chat/**`.

---

*Concerns analysis: 2026-04-14*
