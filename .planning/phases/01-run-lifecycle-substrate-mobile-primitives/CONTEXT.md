# Phase 1 Context — Run-lifecycle substrate + mobile primitives

**Gathered:** 2026-05-02
**Mode:** Hand-written (gsd-sdk query interface unavailable; the published `@gsd-build/sdk@0.1.0` ships a different CLI than the workflow expects).
**Source:** `.planning/ROADMAP.md` Phase 1, `.planning/REQUIREMENTS.md` (RUN-01..06 + MOB-01..04, MOB-12), `.planning/research/SUMMARY.md`, `.planning/research/STACK.md`, `.planning/research/ARCHITECTURE.md`.

---

## Phase Boundary

Establish the keystone substrate that every later M1 phase reads from:

1. **Append-only `AgentRunEvent` ledger** — source of truth for tool calls, LLM messages, retries, side-effects. No mutable run-status columns.
2. **Deterministic harness** — `buildHarness(runId, agentStateAtStart, projectStateAtStart, now)` is pure; `snapshotHarness()` writes the result to a `HarnessSnapshot` row at run start.
3. **`RunDiff` model** — structured before/after for every entity an agent touches (cards, comments, attachments, members, channels). Powers Phase 3's diff view and Phase 4's revert.
4. **`instrumentation.ts`** — `@vercel/otel` + Langfuse SDK registered globally so every Anthropic/OpenAI/CLI call gets a GenAI span without per-handler wiring.
5. **Mobile primitives** — viewport meta, breakpoint + safe-area tokens in `tokens.css`, `vaul`-backed Drawer + BottomSheet, PWA manifest. Every later UI phase consumes these.

Phase 1 ships **no user-visible feature changes**. Existing flows (kanban, chat, agents, settings) keep working unchanged. Phase 1 is the substrate; Phase 3 is the first phase that turns it into a UI surface.

## Implementation Decisions

### Plan split (locked)

Four plans, intentionally sized for parallel execution:

- **01-01** — Prisma deltas + ledger writer + `RunDiff` snapshot helpers (RUN-01, RUN-02, RUN-05). Backend.
- **01-02** — `HarnessSnapshot` model + `buildHarness` / `snapshotHarness` split (RUN-03, RUN-04). Backend; depends on 01-01's `HarnessSnapshot` table existing.
- **01-03** — `instrumentation.ts` + Langfuse SDK + commented self-host stanza (RUN-06). Cross-cutting; no app-code dependency.
- **01-04** — Mobile primitives (MOB-01, MOB-02, MOB-03, MOB-04, MOB-12). Frontend; independent of backend tracks.

### Stack additions (locked from research)

- `@vercel/otel ^2.1.2` — Next.js 16 instrumentation entry-point integration.
- `@opentelemetry/api ^1.9.1` — GenAI semconv span schema.
- `langfuse ^3.38.20` — registered globally; opt-in via env (`LANGFUSE_*`); commented self-host stanza in `docker-compose.yml`.
- `zod ^4.4.1` — `AgentRunEvent.payload` typing + `RunDiff.before`/`after` shape validation. Re-used in Phase 2 + 4.
- `vaul ^1.1.2` — BottomSheet + Drawer primitives, React 19 peer-dep.

### Anti-patterns (carried from research)

- **No mutable run-status columns** that would let the runner forget event-ordering. Ledger is the source of truth; status on `AgentTaskRun` is a denormalized projection.
- **No DB or `Date.now()` reads inside `buildHarness()`** — resumes would produce different prompts. All inputs threaded as parameters.
- **No separate `/m/` mobile route tree** — single responsive tree, breakpoint-driven layout swap.
- **No `react-spring`** — vaul + framer-motion already cover gesture / drag / motion.
- **No mid-run silent model fallback** — explicit per-agent backend; fallback only at next-run boundary, always logged.

### Brownfield safety

`AgentTaskRun` already exists (`prisma/schema.prisma`). Phase 1 ADDS columns (`heartbeatAt`, `harnessSnapshotId` FK, `summaryMd`); does NOT drop or rename existing columns. Existing scheduled jobs and runs continue to insert without modification — the ledger is additive.

## Specific Ideas

- Reset-and-onboard drill at exit (defuses Pitfall 13 — dogfood blindness): solo-dev cadence makes it a "fresh terminal, fresh DB, fresh README, can I get a working co-op stack?" exercise.
- Langfuse default = opt-in via env. Self-hosted stanza in `docker-compose.yml` sits commented-out so a one-line uncomment + `docker compose up langfuse` is the path.
- PWA manifest minimum viable (icons + name + theme color); push pipeline waits until Phase 5.
- Mobile primitives ship the components but don't yet retrofit every consumer. Sidebar + CardDetailModal adopt them at <768px in this phase as proof; the full responsive sweep happens in Phase 3.

## Canonical References

- `prisma/schema.prisma:236` — `AIAgent` model (agent record with `projectId`, `modelProvider`, `modelName`, system prompt, plugins).
- `src/lib/agentHarness.ts:280` — current `compileHarness` function (gets refactored in 01-02).
- `src/lib/agentRunner.ts:128` — current `runAgent` (calls `compileHarness`, then dispatches Anthropic/OpenAI/CLI).
- `prisma/schema.prisma` — `AgentTaskRun` model (gets new columns in 01-01).
- `node_modules/next/dist/docs/` — Next.js 16 `instrumentation.ts` entry point reference.
- Langfuse + OTel docs (HIGH-confidence in research SUMMARY.md, lines 131-134).

## Deferred Ideas

- Replay / time-travel run inspection — v2; ledger-shape supports it but Phase 1 doesn't add a UI.
- Operator-tier Langfuse UI — Phase 3 + later; instrumentation lays groundwork.
- Cost-per-run aggregation — Phase 3 (AUD-08); ledger fields are present.
- Container-query-driven component reflow — v2; tokens.css adds breakpoint vars but consumers don't switch to container queries this phase.
