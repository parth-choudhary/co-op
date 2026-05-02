# Phase 1: Run-lifecycle substrate + mobile primitives — Context

**Gathered:** 2026-05-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the keystone substrate every later M1 phase reads from:

1. **Append-only event ledger** — `AgentRunEvent` model + writer that captures every tool call, LLM message, retry, and side-effect. Source of truth for reliability (P2), audit (P3), planning (P4), and revert (P3).
2. **Deterministic harness** — refactor `src/lib/agentHarness.ts` into pure `buildHarness(inputs) → prompt` + `snapshotHarness(runId) → HarnessSnapshot`. Same inputs ⇒ byte-identical prompt + tool schema + plugin allowlist + run-mode flag. Resumes don't drift.
3. **Run snapshots and diffs** — `HarnessSnapshot` records the exact prompt artifact at run start; `RunDiff` records before/after for every entity an agent touches.
4. **Instrumentation baseline** — `instrumentation.ts` registers `@vercel/otel` + Langfuse SDK. Every Anthropic / OpenAI / CLI call is auto-traced via OTel GenAI semconv. Self-host Langfuse stanza ships commented-out in `docker-compose.yml`.
5. **Mobile UI primitives** — viewport meta, breakpoint tokens (`--bp-sm` 480, `--bp-md` 768, `--bp-lg` 1024) + safe-area helpers, vaul Drawer + BottomSheet primitives, PWA manifest. Sidebar adopts Drawer at <768px; CardDetailModal adopts BottomSheet at <768px.

**Out of scope for this phase** (lives in later phases):
- Bounded retries / iteration cap / idempotency wrappers (P2)
- Run-mode flag enforcement (P2; P1 only persists the flag in `HarnessSnapshot`)
- `/runs` route / timeline / summaries / diff UI (P3)
- `CardPlan` model / planning plugin / plan queue (P4)
- Mobile kanban single-column pager / chat list-detail / push (P5)

</domain>

<decisions>
## Implementation Decisions

### Mobile Philosophy

- **D-01 (Mobile design ambition): Selective redesign.** Hot paths (plan review, run audit, kanban, chat) get phone-tuned layouts; secondary surfaces (settings, agents, login/register) are faithful adaptation of desktop. P1 ships the primitives; P3 + P5 do the redesign work on hot paths.
- **D-02 (Density tradeoff on phone): Density preserved.** DESIGN.md's terminal density survives on phone — the same content density, sized down. 44pt touch targets are reached by adjusting padding, not by inflating typography scale. **No mobile-only typography scale.** Whitespace tokens stay the same; the breakpoint switches the layout structure (single-column kanban, BottomSheet modals, Drawer sidebar) without mutating density tokens.
- **D-03 (Phone navigation pattern): Hybrid — bottom tab bar + Drawer.** Bottom tab bar for global destinations; Drawer for project-scoped sub-nav (boards, agents, members, settings) + project switcher. This is bolder than the roadmap's MOB-03 (which was Drawer-only) — the planner must add a sub-deliverable for the bottom tab bar component.
- **D-04 (Bottom tab destinations): Plans / Runs / Chat (3 tabs).** Projects/profile/settings live in the Drawer; cross-project notifications fold into push routing rather than a separate tab. Topbar contains the hamburger (open Drawer) + (likely) project name + a profile/account menu.
- **D-05 (Tab scoping): Current-project scoped, with empty state.** When a project is selected (via Drawer), Plans/Runs/Chat tabs show that project's items. Before any project is selected (fresh login), the tabs render a "Pick a project" empty state and the user is nudged to open the Drawer to choose. This matches the M1 dogfood case (1 active project at a time) and avoids a global-aggregate UI we'd have to design and maintain. Reasonable default; planner may surface this in P5 plan-review work if it doesn't feel right in practice.

### Claude's Discretion

User did not pick these gray areas; defaulted as below — call these out in plan-phase if any feel wrong.

- **D-06 (Ledger ambition): Middle path — full-fidelity capture, two-tier retention.** Capture every tool call, LLM message, retry, and side-effect. Two-tier retention (matches SUMMARY.md convergence): metadata kept indefinitely; full payloads redacted by default and retained 7–14 days (configurable via env). P1 ships the schema + writer for full fidelity; the retention/redaction policy lands in P3 (AUD-05/06). For M1 cost reasoning, assume ~50–200 events per run × ~20 runs/day × ≤2KB metadata ≈ negligible Postgres growth; full payloads dominate but are bounded by the rolling window.
- **D-07 (Existing `AgentActivityLog` fate): Parallel-write during M1; project to `AgentRunEvent` post-M1.** P1 dual-writes new run events to both `AgentRunEvent` (new) and `AgentActivityLog` (existing) to preserve UI continuity (Memory v1 `memory_retrieved` rows + existing card activity views keep working). P3 reads run-detail from the new ledger. Post-M1 (v2), migrate `AgentActivityLog` to a thin projection over `AgentRunEvent` and retire its writers. **Memory v1 verification (STATE.md blocker)** must clear before P3, since AUD-02's timeline reads from this same activity log surface.
- **D-08 (PWA identity): Single Co-Op app on home screen.** One manifest at `/manifest.webmanifest` with one icon, one name (`Co-Op`), `start_url: /`, `scope: /`. The project switcher lives inside the app (Drawer). Per-project installable apps deferred to v2 (or M2 marketing milestone where each project may want a brandable installable surface). For M1, single app keeps push routing simple — one service worker, one subscription per device — and avoids re-registering on every project switch.

### Discussed but resolved by locked decisions

- **Run-mode flag granularity** — locked as per-agent for M1 (ROADMAP "Phase-Level Decisions Resolved"); per-project deferred to v2.
- **Langfuse default** — opt-in via env; commented-out self-host stanza in `docker-compose.yml`.
- **No separate `/m/` mobile route tree** — research-locked anti-pattern; mobile is a single responsive route tree with breakpoint-driven layout swap.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & roadmap context
- `.planning/PROJECT.md` — Core value, locked decisions, dogfood paradox, two-milestone arc framing
- `.planning/REQUIREMENTS.md` §RUN, §MOB — RUN-01..06 (this phase) and MOB-01..04, MOB-12 (this phase)
- `.planning/ROADMAP.md` §"Phase 1" + §"Phase-Level Decisions Resolved" — phase goal, plans, success criteria, locked answers to research-surfaced open questions
- `.planning/STATE.md` §"Blockers/Concerns" — Memory v1 live verification pending, must clear before P3 (touches the same activity log surface AUD-02 reads from)

### Research synthesis (consult before proposing libraries / patterns)
- `.planning/research/SUMMARY.md` §"Convergence", §"Anti-patterns (deduplicated)", §"Stack Additions" — opinionated dependency budget; what NOT to add and why
- `.planning/research/STACK.md` — version-pinned recommendations (`langfuse@^3.38.20`, `@vercel/otel@^2.1.2`, `@opentelemetry/api@^1.9.1`, `zod@^4.4.1`, `vaul@^1.1.2`)
- `.planning/research/ARCHITECTURE.md` §"Run reliability convergence", §"Mobile patterns" — append-only event ledger as state-of-truth, harness determinism refactor shape, single responsive route tree
- `.planning/research/PITFALLS.md` §13 (dogfood blindness — drill at exit), §1/2/3/4/6/7/14 (substrate this phase sets up but later phases defuse)

### Codebase intel (brownfield maps, authoritative)
- `.planning/codebase/ARCHITECTURE.md` §"Layers", §"Key Abstractions" — `prisma` singleton, `auth()` helper, route group `(dashboard)`, project-scoped dynamic segment `p/[projectId]`
- `.planning/codebase/STACK.md` — existing dependency baseline; verify additions don't conflict
- `.planning/codebase/STRUCTURE.md` — file layout conventions (`src/lib/`, `src/components/`, `src/app/api/`)
- `.planning/codebase/CONVENTIONS.md` — Prisma model naming, Route Handler signatures, NextAuth augmentation gaps
- `.planning/codebase/CONCERNS.md` §"Tech Debt" — note `prisma` global typed `any`, NextAuth augmentation needed; relevant for type-correctness as P1 adds models

### Existing code touched (read these specific files)
- `prisma/schema.prisma:160-191` — existing `AgentTaskRun` model (extend with `summaryMd?`, `heartbeatAt?`, `harnessSnapshotId?` nullable columns)
- `prisma/schema.prisma:193-204` — existing `WebhookIdempotency` model (P2 will extend with `tool:<toolName>` scope; P1 only persists schema)
- `prisma/schema.prisma:268, 332, 423` — existing `AgentActivityLog` (parallel-write target per D-07)
- `src/lib/agentHarness.ts` — function being refactored into pure `buildHarness` + `snapshotHarness`
- `src/lib/agentRunner.ts` — execution loop; emits events, threads `AbortSignal`, attaches Langfuse spans
- `src/lib/db.ts` — Prisma singleton; `as any` cast at line 11 is known tech debt (CONCERNS.md), don't make worse
- `src/components/layout/Sidebar.tsx` + `Sidebar.module.css` — existing fixed-position sidebar; wraps in vaul Drawer at <768px
- `src/components/kanban/CardDetailModal.tsx` — existing modal pattern; renders as vaul BottomSheet at <768px
- `src/styles/globals.css` + `src/styles/tokens.css` — where viewport / breakpoint / safe-area tokens land
- `src/app/layout.tsx` — root layout; viewport meta declaration goes here
- `docker-compose.yml` — append commented-out Langfuse self-host stanza
- `DESIGN.md` — visual identity locked; mobile must respect it
- `AGENTS.md` — Next.js 16 / React 19 conventions warning (read `node_modules/next/dist/docs/` before assuming framework conventions)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`AgentTaskRun` (Prisma)** — already has `status`, `idempotencyKey`, `parentRunId`, `sessionKey`, `startedAt`, `finishedAt`. **Extend** with nullable `summaryMd`, `heartbeatAt`, `harnessSnapshotId`. Don't replace.
- **`WebhookIdempotency` (Prisma)** — already supports `(scope, key)` unique with `runIds[]` and `responseJson`. P1 doesn't extend it; P2 reuses for `tool:<toolName>` scope (per ROADMAP plan 02-01).
- **`AgentActivityLog` (Prisma)** — existing activity log surface read by Memory v1 + card activity views. Parallel-write target per D-07. Do not delete.
- **`prisma` singleton (`src/lib/db.ts`)** — sole DB client. New `AgentRunEvent` writer hangs off it. Avoid creating a parallel client.
- **Route Handler pattern** — every `src/app/api/**/route.ts` runs `await auth()`, validates input, joins `ProjectMember`, returns `NextResponse.json`. P1 may not need new routes (no UI surface for the ledger yet — that's P3), but if scaffolded, follow the pattern.
- **`framer-motion` (already installed)** — vaul uses it under the hood; no separate animation library needed. Do NOT add `react-spring` (anti-pattern).
- **`@hello-pangea/dnd` (already installed)** — touch sensor support exists; relevant for P5, not P1.
- **CSS Modules + CSS variables** — established pattern (`Sidebar.module.css`). Mobile primitives extend this; don't introduce Tailwind v4.

### Established Patterns

- **Prisma model naming** — PascalCase singular; `cuid()` PKs; `@@index` on FKs; `onDelete: Cascade` for owned relations (see `AgentTaskRun.project` line 163).
- **Status enums via String** — schema doesn't use Prisma enums (`AgentTaskRun.status` is `String @default("queued")`); follow the same pattern for `AgentRunEvent.kind` and `HarnessSnapshot` fields. Validate enum values at the application layer with Zod.
- **Polymorphic JSON via `Json?`** — used for `WebhookIdempotency.responseJson` and `ProjectAboutProposal`. Use the same shape for `AgentRunEvent.payload`.
- **Lifecycle string status** — drafts/proposals (`ProjectAboutProposal`) use string status with explicit transitions; `CardPlan` (P4) will mirror. P1's `AgentRunEvent` is append-only so no status, but `AgentTaskRun.status` remains the lifecycle source.
- **Module singleton initialization** — `prisma` is exported once via `globalThis` guard; mirror this for any P1 module needing process-wide state (e.g., the Langfuse client).
- **Server Components for layout, Client Components for interaction** — `src/app/(dashboard)/layout.tsx` is RSC; `Sidebar` is Client. Drawer/BottomSheet are Client; new instrumentation hooks are RSC-friendly where possible.

### Integration Points

- **`agentHarness.ts` → ledger** — every harness assembly emits a `harness_assembled` event with the snapshot ID. Refactor `compileHarness` into pure `buildHarness` (no DB reads, no clock reads inside) + `snapshotHarness` (DB write that persists the snapshot row).
- **`agentRunner.ts` → ledger** — every tool dispatch and LLM call wraps in event-emitting helpers (`emitToolCall`, `emitLlmMessage`, `emitRetry`, `emitSideEffect`). Maintain `AbortSignal` plumbing so P2 can hang `p-retry` and timeout on top.
- **`agentRunner.ts` → Langfuse / OTel** — wrap Anthropic/OpenAI calls with `langfuse-anthropic` / `langfuse-openai` interceptors; CLI runs (Claude Code, Codex CLI) emit OTel spans manually from the runner since they can't be wrapped at SDK level.
- **`Sidebar.tsx` → vaul Drawer** — wrap in a `<MobileSidebar>` component that conditionally renders Drawer at `<768px` (via JS `useMediaQuery` *or* CSS-only with portal'd Drawer; planner picks). Preserve `--sidebar-current-width` CSS variable behavior on desktop.
- **`CardDetailModal.tsx` → vaul BottomSheet** — wrap in a responsive Modal/BottomSheet primitive that switches at the breakpoint. P1 ships the primitive; existing modal site adopts it; remaining modals (AgentHarnessModal, settings modals) migrate in P3 + P5 as their parents are touched.
- **`layout.tsx` → viewport meta + manifest link** — add `<meta viewport>` and `<link rel="manifest">` once at root; `instrumentation.ts` registers OTel/Langfuse before any request runs.
- **`docker-compose.yml` → Langfuse stanza** — append commented-out service block; document `OTEL_*` envs in `.env~`.

</code_context>

<specifics>
## Specific Ideas

- The bottom tab bar mentioned in D-03/D-04 is **bolder than ROADMAP MOB-03** — the planner should add it as a separate plan deliverable inside `01-04: Mobile primitives` (or split 01-04 into 01-04a Drawer + BottomSheet + 01-04b BottomTabBar). Capture the scope expansion explicitly so plan-checker can validate it doesn't bleed coverage from other plans.
- **Density preserved (D-02) means specific things:** no mobile-only `font-size` overrides in `tokens.css`; padding-only tweaks for 44pt touch targets; line-heights stay desktop. Validate by sampling a hot-path screen at 375×667 and a desktop screen at 1440×900 — fonts/colors/borders look identical, only structural layout differs.
- **Bottom tab "current-project scoped" (D-05)** means each tab shows entries for the currently-selected project. The Drawer's project switcher is the way to change which project the tabs operate on. Empty state for "no project selected" is part of the deliverable.
- **`AgentActivityLog` parallel-write (D-07)** — the writer should be a small adapter that fan-outs new events into both ledger writes. Don't refactor `AgentActivityLog` callers in P1; P3 starts reading from the new ledger; v2 retires the legacy writer.
- **Single PWA app (D-08)** uses one icon. We'll need to design or repurpose an existing co-op icon for this; acceptable to ship a placeholder in P1 and replace before M2 marketing.

</specifics>

<deferred>
## Deferred Ideas

- **Per-project PWA / installable surfaces** — defer to v2 or M2 marketing; useful when each project wants a brandable home-screen icon. Out of M1 scope.
- **Global-aggregate Plans/Runs/Chat tabs** — (cross-project, no project selected). Could ship if multi-project usage emerges; for now empty-state at no-project-selected is sufficient.
- **Topbar polish on phone** (project name display, profile menu placement, search affordance) — the hybrid nav decision implies a topbar exists; specific contents are a P3 / P5 detail, not P1.
- **PWA icon set** — placeholder ships in P1; final design before M2 marketing.
- **Global notifications inbox** — folded into push routing for M1 per D-04. If push proves insufficient, revisit as a v2 surface.
- **Mobile-only animations / micro-interactions beyond vaul defaults** — out of M1; framer-motion's `prefers-reduced-motion` honored throughout per ROADMAP convergence.
- **`AgentActivityLog` retirement migration** — v2 work; M1 keeps it dual-written.

</deferred>

---

*Phase: 1-Run-lifecycle substrate + mobile primitives*
*Context gathered: 2026-05-02*
