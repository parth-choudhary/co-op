# Architecture Research

**Domain:** Agent-as-teammate workspace (brownfield, M1: reliability + visibility + planning loop + mobile)
**Researched:** 2026-05-01
**Confidence:** HIGH for run-reliability/observability patterns and mobile patterns; MEDIUM for planning-loop placement (multiple viable shapes; opinionated recommendation below); LOW for M2 marketing-platform shape (sketch-only by request).

## Standard Architecture

### System Overview — where M1 capabilities slot into the existing stack

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Presentation — Next.js 16 App Router (existing)                          │
│                                                                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────┐  │
│  │ (dashboard)      │  │ p/[projectId]    │  │ NEW: drawers / sheets  │  │
│  │   layout.tsx     │  │   layout.tsx     │  │  (mobile chrome)       │  │
│  │  (auth gate)     │  │  (member gate)   │  │  framer-motion-driven  │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────────┬───────────┘  │
│           │                     │                          │              │
│           ▼                     ▼                          ▼              │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ Pages: boards · chat · agents · members · settings · NEW runs    │    │
│  │   (responsive — same routes, breakpoint-driven layout swap)      │    │
│  └──────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ fetch('/api/...')
┌──────────────────────────────────────────────────────────────────────────┐
│  API / Route Handlers — src/app/api/**/route.ts (existing)                │
│                                                                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌───────────────────────┐    │
│  │ projects │ │  cards   │ │   agents     │ │ NEW: runs/* + plans/* │    │
│  │  chat    │ │ comments │ │ model-keys   │ │   (audit + approval)  │    │
│  └─────┬────┘ └─────┬────┘ └──────┬───────┘ └───────────┬───────────┘    │
└────────┼────────────┼─────────────┼─────────────────────┼─────────────────┘
         │            │             │                     │
         ▼            ▼             ▼                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Service / Domain Layer — src/lib/** (existing, extended)                 │
│                                                                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐    │
│  │  agentRunner.ts  │──│ agentHarness.ts  │──│ chatHistory / memory │    │
│  │  (run loop)      │  │ (prompt assembly)│  │ (existing)           │    │
│  └─────────┬────────┘  └────────┬─────────┘  └──────────────────────┘    │
│            │                    │                                         │
│            │ NEW thin slices:   │                                         │
│            ▼                    ▼                                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐    │
│  │ runEvents.ts     │  │ harnessSnapshot  │  │ NEW: planning.ts     │    │
│  │ (append-only     │  │ (deterministic   │  │ (proposes plans →    │    │
│  │  event ledger)   │  │  digest + store) │  │  Plan rows)          │    │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘    │
│                                                                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐    │
│  │ plugins/registry │  │ scheduler/tick   │  │ matrix.ts            │    │
│  │ (existing)       │  │ (existing)       │  │ (existing)           │    │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ prisma
┌──────────────────────────────────────────────────────────────────────────┐
│  Data — Postgres via prisma singleton (existing schema, additive deltas) │
│                                                                           │
│  Existing: AgentTaskRun · AgentActivityLog · ProjectAboutProposal · …    │
│  NEW:      AgentRunEvent · HarnessSnapshot · CardPlan · CardDiff · …     │
└──────────────────────────────────────────────────────────────────────────┘
```

The architecture is **extension, not replacement**. Every new capability is a thin slice next to existing files, additive Prisma models, and new route handlers under the same patterns. No new top-level layers.

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| `agentRunner.ts` (existing, hardened) | Drive the per-run loop: provider call → tool dispatch → loop until `stop_reason` | Wrap each tool call with retry + idempotency token; emit `AgentRunEvent` rows; pull harness from `HarnessSnapshot` so resumed runs see the same prompt |
| `agentHarness.ts` (existing, refactored) | Assemble prompt deterministically (system + about + memory + kanban context + chat) | Split assembly into pure `buildHarness(input) → harnessJson` and persistence `snapshotHarness(runId, harnessJson) → HarnessSnapshot` so re-runs are bit-identical |
| **NEW `runEvents.ts`** | Append-only ledger of everything that happened in a run | Wraps `prisma.agentRunEvent.create` with typed event variants (`harness_compiled`, `provider_call_started`, `provider_call_finished`, `tool_call`, `tool_result`, `error`, `retry`, `run_finished`) |
| **NEW `runDiffs.ts`** | Capture "what changed" outside the agent's bubble — DB rows, files, external API effects | After each tool call returns, diff the resource the tool touched (Card, Comment, etc.) and write a `CardDiff`/`RunDiff` row referencing the run + tool-call event |
| **NEW `planning.ts`** | Generate a card decomposition proposal (subtasks + acceptance) from backlog context, persist as `CardPlan`, surface via UI for human approval | New service; calls `agentRunner.runAgent(...)` with a planner harness context, parses the structured output, writes `CardPlan` row in `pending` status |
| **NEW `runAuditDigest.ts`** | Plain-language run summary built from event ledger after `run_finished` | Pure transform: `events[] → markdown summary`; cached on `AgentTaskRun.summaryMd` |
| `plugins/registry.ts` (existing) | Resolve enabled tools per agent | Unchanged shape; new `planning` plugin registered through the same contract |
| `plugins/builtin/planning.ts` (NEW) | Tools that let an agent *propose* (not execute) plans: `propose_card_plan`, `update_card_plan` | Same `Plugin` shape as `kanban.ts`; gated by capability key `planning` |
| `scheduler/tick.ts` (existing) | Cron-fire perpetual agents, deliver scheduled reminders | Unchanged contract; will be the consumer of new "auto-resume aborted run" logic |
| **NEW `runResumer.ts`** | On boot/tick, find runs in `running` with stale heartbeats and either resume from last `tool_result` event or mark `aborted` | Called from `instrumentation.ts` once per process boot, then from each `runTick()` |
| **NEW `mobile/` UI primitives** | Drawer, BottomSheet, NavStack — touch-affordant overlays | `src/components/mobile/*.tsx`, framer-motion + `react-modal-sheet` patterns; consumed by existing pages via responsive composition |

## Recommended Project Structure

```
src/
├── lib/
│   ├── agentRunner.ts              # existing — extended with retry + ledger emit
│   ├── agentHarness.ts             # existing — split into pure build + snapshot
│   ├── runEvents.ts                # NEW — typed append-only ledger writer
│   ├── runDiffs.ts                 # NEW — capture DB/external-effect diffs per tool call
│   ├── runAuditDigest.ts           # NEW — events[] → human summary (markdown)
│   ├── runResumer.ts               # NEW — orphan-run recovery (boot + tick)
│   ├── runHeartbeat.ts             # NEW — periodic "I'm still alive" writes during long runs
│   ├── planning/
│   │   ├── proposeCardPlan.ts      # NEW — orchestrates planner agent run
│   │   ├── planSchema.ts           # NEW — zod-ish parse of structured planner output
│   │   └── applyApprovedPlan.ts    # NEW — converts approved CardPlan → real subtasks
│   ├── plugins/
│   │   └── builtin/
│   │       └── planning.ts         # NEW — propose_*/update_* tools (no execution)
│   ├── scheduler/tick.ts           # existing — calls runResumer
│   ├── chatHistory/                # existing
│   └── …                           # existing (auth, db, matrix, crypto, etc.)
├── app/
│   ├── (dashboard)/
│   │   └── p/[projectId]/
│   │       ├── runs/                              # NEW — run list + drill-in
│   │       │   ├── page.tsx                       # run timeline (project-wide)
│   │       │   └── [runId]/page.tsx               # single run detail (timeline view)
│   │       ├── plans/                             # NEW — pending plans review queue
│   │       │   └── page.tsx
│   │       └── (existing pages — boards/chat/agents/members/settings)
│   └── api/
│       ├── runs/
│       │   ├── route.ts                           # NEW — list runs (project-scoped)
│       │   ├── [id]/route.ts                      # NEW — run detail w/ events
│       │   ├── [id]/events/route.ts               # NEW — event ledger fetch
│       │   ├── [id]/diffs/route.ts                # NEW — captured diffs for run
│       │   ├── [id]/cancel/route.ts               # NEW — soft-cancel running run
│       │   └── [id]/retry/route.ts                # NEW — re-fire a finished run
│       ├── plans/
│       │   ├── route.ts                           # NEW — list pending plans
│       │   ├── [id]/route.ts                      # NEW — plan detail
│       │   ├── [id]/approve/route.ts              # NEW — approve → applyApprovedPlan
│       │   └── [id]/reject/route.ts               # NEW — reject with reason
│       └── (existing)
├── components/
│   ├── runs/                                       # NEW
│   │   ├── RunTimeline.tsx                        # event ledger as vertical timeline
│   │   ├── RunDiffCard.tsx                        # one captured diff
│   │   └── RunSummaryHeader.tsx                   # plain-language digest
│   ├── plans/                                      # NEW
│   │   ├── PlanReviewModal.tsx                    # approve/edit/reject UX
│   │   └── PlanProposalCard.tsx                   # backlog-side surface
│   ├── mobile/                                     # NEW
│   │   ├── BottomSheet.tsx                        # framer-motion sheet w/ keyboard offset
│   │   ├── Drawer.tsx                             # left/right edge drawer (sidebar on phone)
│   │   ├── MobileNav.tsx                          # bottom-tab navigation, project-scoped
│   │   └── useVisualViewport.ts                   # hook: keyboard-safe inset
│   ├── kanban/CardDetailModal.tsx                  # existing — adopt mobile/BottomSheet at <768px
│   └── layout/Sidebar.tsx                          # existing — switch to Drawer at <768px
└── styles/
    └── breakpoints.css                             # NEW — single source of truth: 375 / 768 / 1280
```

### Structure Rationale

- **`src/lib/run*.ts` siblings to `agentRunner.ts`:** keep all run-lifecycle concerns (events, diffs, digest, heartbeat, resume) in one folder neighborhood, not buried in `agentRunner.ts` itself. The runner stays the orchestrator; new files are single-purpose collaborators it calls.
- **`src/lib/planning/`:** subfolder because there are at least three files (propose, schema, apply); avoids flattening unrelated logic into `agentTools.ts`.
- **`src/lib/plugins/builtin/planning.ts`:** the planner is an *agent role* but its tools are a *plugin*; both layers exist together. Plugin contract is unchanged.
- **`src/app/(dashboard)/p/[projectId]/runs/` and `…/plans/`:** project-scoped, so they belong under the existing `p/[projectId]` segment — the parent layout already enforces membership.
- **`src/app/api/runs/` and `…/plans/`:** new resource roots under the existing API tree; each handler follows the established pattern (`auth()` → `projectMember.findUnique` → Prisma → `NextResponse.json`).
- **`src/components/mobile/`:** mobile primitives are *additive*, used at small breakpoints by responsive composition. Putting them in their own folder keeps the kanban/chat/sidebar components from sprouting `if (mobile)` branches inline.
- **No new route group:** mobile uses the same routes as desktop. A separate `(mobile)` group would double the page count and break the "agents see what humans see" invariant — worse, it would force agents to know which URL to send. One responsive route tree.

## Architectural Patterns

### Pattern 1: Append-only event ledger as run state-of-truth

**What:** Every observable thing inside an `AgentTaskRun` becomes a row in `AgentRunEvent` (FK → AgentTaskRun) the instant it happens. The runner reads from this ledger to reconstruct what to do on resume; the UI reads from it to render the timeline. `AgentTaskRun` itself stops carrying mid-run mutable state — it's a header (status, started/finished, errorMessage, summaryMd) and the events are the body. Mirror of OpenHands' "events.jsonl + state.json materialized cache" model and OpenAI Agents SDK's trace+span model, sized for a single-replica Postgres deployment.

**When to use:** Whenever a run can be inspected, cancelled, retried, or resumed. That is to say: always, in this milestone.

**Trade-offs:**
- Pro: Resumption becomes trivial — last `tool_result` event is the resume point; the runner replays from there with the same `HarnessSnapshot`.
- Pro: UI gets a free timeline and "what changed" view; agent-debugging stops being log-archaeology.
- Pro: Idempotency keys live on the event row (`AgentRunEvent.idempotencyKey`), so replaying a tool call twice doesn't double-write side effects.
- Con: Storage growth — bound by `AgentTaskRun.finishedAt < now() - 30d` retention sweep on the tick. With Postgres on a single PM2 box this is fine for 1k runs/month at ~50 events/run.
- Con: Schema discipline — the `payload Json` field on each event must be typed at the application layer (no enum; just typed-narrow union in `runEvents.ts`).

**Example:**
```typescript
// src/lib/runEvents.ts
export type RunEvent =
  | { kind: 'harness_compiled'; harnessSnapshotId: string }
  | { kind: 'provider_call_started'; provider: string; model: string; idempotencyKey: string }
  | { kind: 'provider_call_finished'; usage: TokenUsage; stopReason: string }
  | { kind: 'tool_call'; toolName: string; args: unknown; idempotencyKey: string }
  | { kind: 'tool_result'; ok: boolean; data?: unknown; error?: string; latencyMs: number }
  | { kind: 'retry'; attempt: number; reason: string }
  | { kind: 'error'; message: string; stack?: string }
  | { kind: 'run_finished'; reason: 'completed' | 'aborted' | 'cancelled' };

export async function appendRunEvent(runId: string, evt: RunEvent) {
  await prisma.agentRunEvent.create({
    data: {
      runId, kind: evt.kind, payload: evt as any,
      idempotencyKey: 'idempotencyKey' in evt ? evt.idempotencyKey : null,
    },
  });
}
```

### Pattern 2: Deterministic harness snapshot

**What:** `agentHarness.ts` is split into a pure assembler (no side effects, no DB writes from inside) and a snapshot persister. The output is hashed (sha256 over the canonical-JSON serialization), stored once per run as a `HarnessSnapshot` row, and reused on resume. Same input → same hash → same prompt; this is what makes resumption *correct* rather than *almost correct*.

**When to use:** First call of every run. Cached snapshot read on resume.

**Trade-offs:**
- Pro: Eliminates the "second run is subtly different" bug class (memory written between calls, kanban changed, time-of-day in prompt, etc.).
- Pro: Audit story — humans can see exactly what the agent saw at run start, not approximately.
- Con: Forces the harness to be timestamp-explicit (pass `now` as input, don't read clock inside).
- Con: One extra write per run (`HarnessSnapshot`). Cheap.

**Example:**
```typescript
// src/lib/agentHarness.ts (refactored)
export interface HarnessInputs {
  agentId: string; projectId: string | null; userPrompt: string;
  now: Date;                  // passed in, not new Date() inside
  priorMessages: PriorMessage[];
  // …
}
export function buildHarness(i: HarnessInputs): HarnessJson { /* pure */ }
export async function snapshotHarness(runId: string, h: HarnessJson) {
  const canonical = stableStringify(h);
  const sha = sha256(canonical);
  return prisma.harnessSnapshot.create({
    data: { runId, sha, contentJson: h as any },
  });
}
```

### Pattern 3: Idempotency keys on every side-effecting tool call

**What:** Every tool call that writes (creates a card, posts a Matrix message, opens a PR) carries an `idempotencyKey = sha256(runId + toolCallEventId + canonical(args))`. The tool handler checks `WebhookIdempotency` (already exists) — if the key has been seen, return the cached prior result instead of re-executing. Borrowed from Inngest/Mastra "idempotent step execute".

**When to use:** All write-tools in `plugins/builtin/*.ts` and `agentActions.ts`. Read-tools (e.g. `get_agent_kanban_context`) skip it.

**Trade-offs:**
- Pro: Crash-during-tool-call no longer means "ran the side effect twice on retry."
- Pro: Co-existence with the existing `WebhookIdempotency` table — no new model, just new scope value (`tool:<toolName>`).
- Con: Tool authors have to remember the convention. Mitigate with a `wrapIdempotent(handler)` helper in `plugins/contract.ts`.

### Pattern 4: Plan-as-card-payload with explicit lifecycle state

**What:** Recommended placement for proposed plans is a **dedicated `CardPlan` model FK'd to `Card`**, *not* a free-text comment, *not* the card body, and *not* a column-state machine. The plan has structure (steps, acceptance criteria, optional referenced files) and a lifecycle (`draft → pending_review → approved → applied → superseded`); a comment can't carry structure and a column shift can't carry approval semantics. The card's `Comment` thread mirrors human-readable summaries of plan transitions; the structured plan lives on `CardPlan`.

**When to use:** Whenever an agent proposes work on a backlog card.

**Trade-offs:**
- Pro: Approval UX is decoupled from kanban columns — cards stay in their existing column; a small "Plan pending review" badge surfaces approval state. Avoids the anti-pattern of inventing a "Proposed" column that fights the existing board layout.
- Pro: Auditable — you can ask "what plans has this card had?" and the model answers it.
- Pro: Multiple revisions possible (`status='superseded'`); humans can compare diffs across plan iterations.
- Con: Another model and another route group. But the `ProjectAboutProposal` model is exactly the same shape — same `pending/approved/rejected` lifecycle, same `reviewedById/reviewedAt` audit fields. Copy that pattern.

**Recommendation: do all three layers.**
- New **agent role** (planner) — agent record with system prompt tuned for decomposition, no execution capabilities. Different `role` value. Templated in `src/lib/agentTemplates/`.
- New **plugin** (`planning`) — `propose_card_plan(cardId, steps[], acceptance, notes)` and `update_card_plan(planId, …)` tools. Capability key `planning`. Any agent can be granted this capability.
- New **lifecycle state on `CardPlan`** — not on the card itself. Card lifecycle stays as-is.

**Example:**
```typescript
// prisma/schema.prisma — additive
model CardPlan {
  id          String   @id @default(cuid())
  cardId      String
  card        Card     @relation(fields: [cardId], references: [id], onDelete: Cascade)
  proposedBy  String   // agentId
  agent       AIAgent  @relation(fields: [proposedBy], references: [id], onDelete: Cascade)
  status      String   @default("pending") // draft|pending|approved|rejected|applied|superseded
  stepsJson   Json     // [{ title, description, acceptance, suggestedAssigneeAgentId? }]
  notes       String?  @db.Text
  reviewedById String?
  reviewedAt   DateTime?
  appliedAt    DateTime?
  parentPlanId String?  // for revisions / supersession chain
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@index([cardId, status])
}
```

### Pattern 5: Responsive route tree with breakpoint-driven layout swap

**What:** One route tree. At a hard breakpoint (768px), the same page renders a different shell — desktop kanban becomes a horizontally-scrollable single-column-at-a-time view; sidebar becomes a swipe-in `Drawer`; modals become `BottomSheet`s. CSS-driven where possible; JS feature toggles only where touch interactions need different sensors (DnD).

**When to use:** Always; this is the architectural choice for the milestone.

**Trade-offs vs. separate `(mobile)` route group:**
- Pro (responsive single-tree): single canonical URL per feature → agents and humans share links → "agents see what humans see" preserved → links sent in chat/cards work for everyone.
- Pro: half the pages to maintain.
- Pro: no "redirect to mobile route" race that breaks bookmarks and prefetch.
- Con: page components grow a bit (responsive forks). Mitigated by extracting mobile chrome into `components/mobile/*` so page bodies stay focused on data.
- Con vs. responsive: separate-tree advocates argue for cleaner per-platform UX. Counter: the kanban is the same data on both; we're adapting layout, not redesigning the product. Locked by `DESIGN.md`.

### Pattern 6: Touch-aware DnD via @hello-pangea/dnd long-press sensor (already there)

**What:** `@hello-pangea/dnd` already supports touch out-of-the-box via the touch sensor with long-press initiation. We don't add a sensor; we tune two knobs and add one CSS rule.

- Set `enableDefaultSensors` true (default) — keeps mouse + keyboard + touch.
- On `Draggable`, add `style={{ touchAction: 'manipulation' }}` to the drag handle area only; the rest of the column scrolls normally. Without this, vertical scroll competes with drag start and feels broken.
- On the column container, set `style={{ overscrollBehavior: 'contain' }}` to prevent body bounce on iOS during a drag.
- For very small screens, switch the board layout to a single-column-at-a-time pager (snap scroll); cards still drag long-press → drop, but you change the *target column* by paging, not by dragging across multiple columns. Long-distance horizontal drags are miserable on phones.

### Pattern 7: Visual viewport hook for keyboard-safe chat/comment inputs

**What:** Mobile chat input and card-comment input use a `useVisualViewport()` hook that subscribes to `window.visualViewport.resize` and exposes a `bottomInset` value the input pins itself to. Inputs use `position: fixed; bottom: 0; transform: translateY(-bottomInset)` rather than `bottom: env(keyboard-inset-height)` so we work on iOS Safari (which still doesn't honor `keyboard-inset-*` consistently) and Android.

**Fallback:** for browsers without `visualViewport`, use `100dvh` for the chat container — modern dynamic-viewport units cover most cases without the JS observer.

**Example:**
```typescript
// src/components/mobile/useVisualViewport.ts
export function useVisualViewport() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport; if (!vv) return;
    const onResize = () => setInset(window.innerHeight - vv.height - vv.offsetTop);
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    onResize();
    return () => { vv.removeEventListener('resize', onResize); vv.removeEventListener('scroll', onResize); };
  }, []);
  return { bottomInset: Math.max(0, inset) };
}
```

### Pattern 8: framer-motion BottomSheet/Drawer (avoid library if simple)

**What:** A `BottomSheet` component built on framer-motion's `motion.div` with drag-to-dismiss (`drag="y"` constrained to `dragConstraints={{ top: 0 }}`), spring transitions, and a backdrop. For this milestone the surface area is small (CardDetailModal becomes a sheet, sidebar becomes a drawer); a hand-rolled component fits, and we avoid a new dependency.

**Library option:** if the build-vs-buy line tips later, `react-modal-sheet` (Temzasse) is the closest fit — it bundles `avoidKeyboard` (visualViewport offset) and a11y. Add only if hand-roll proves leaky.

## Data Flow

### Run lifecycle flow (with new event ledger)

```
trigger (chat msg | card move | scheduler tick | plan-approval | manual)
    │
    ▼
src/app/api/.../route.ts        — existing trigger surfaces
    │
    ▼
prisma.agentTaskRun.create      — header row (status='running', startedAt)
    │
    ▼
runAgent({ runId, … })          — agentRunner.ts (extended)
    │
    ├─ buildHarness(inputs)     — pure
    ├─ snapshotHarness(runId)   — HarnessSnapshot row
    ├─ appendRunEvent(harness_compiled)
    │
    ▼ loop:
    ├─ appendRunEvent(provider_call_started, idempotencyKey)
    ├─ provider.complete(...)    — anthropic | openai | cli
    ├─ appendRunEvent(provider_call_finished, usage, stopReason)
    │
    ├─ if tool_use:
    │   ├─ appendRunEvent(tool_call, idempotencyKey)
    │   ├─ wrapIdempotent(handler)(...)  — checks WebhookIdempotency
    │   ├─ runDiffs.captureDiff(toolName, before, after, runId, eventId)
    │   ├─ appendRunEvent(tool_result, latencyMs, ok, data)
    │   └─ continue loop
    │
    ├─ on transient error:
    │   ├─ appendRunEvent(retry, attempt, reason)
    │   └─ exponential backoff up to 3 attempts
    │
    └─ on stop:
        ├─ appendRunEvent(run_finished, reason)
        ├─ runAuditDigest.compose(runId) → markdown
        └─ prisma.agentTaskRun.update({ status, finishedAt, summaryMd })
```

### Resume flow (new)

```
process boot OR scheduler tick
    │
    ▼
runResumer.scan()                — find runs where status='running' AND no event in 90s
    │
    ▼
for each orphan run:
    ├─ load HarnessSnapshot(runId)
    ├─ load events ordered by createdAt
    ├─ find last 'tool_result' or 'provider_call_finished'
    ├─ if older than maxRunAge (e.g. 10min) → mark 'aborted', append run_finished
    └─ otherwise → re-enter agentRunner from that point with same harness
```

### Plan approval flow (new)

```
user clicks "Propose plan" on a card  OR  agent fires `propose_card_plan` tool
    │
    ▼
src/lib/planning/proposeCardPlan.ts
    ├─ runAgent({ harnessContext: 'planner', …, runId })  — produces structured output
    ├─ planSchema.parse(output)                            — strict zod-ish parse
    └─ prisma.cardPlan.create({ status: 'pending', stepsJson, … })
    │
    ▼
notification fanout (existing notifications.ts) → human reviewer
    │
    ▼
human opens /p/[projectId]/plans/[planId]
    ├─ approve  → applyApprovedPlan(planId)
    │              ├─ for each step: prisma.card.create({ parentCardId, … })
    │              ├─ optional auto-assign per step
    │              └─ prisma.cardPlan.update({ status: 'applied', appliedAt })
    └─ reject   → prisma.cardPlan.update({ status: 'rejected', reviewedAt, … })
```

### Mobile rendering flow

```
request → page.tsx (Server Component, identical to desktop) — fetches data
    │
    ▼
returns <ClientShell data={…}>
    │
    ▼
ClientShell uses CSS @media + a tiny `useIsMobile()` (matchMedia hook)
    ├─ desktop: <Sidebar />   <KanbanBoard />        <CardDetailModal />
    └─ mobile:  <Drawer />    <KanbanBoardMobile />  <CardDetailSheet />
                              (single column pager)  (BottomSheet variant)
```

State is identical across the fork; only the chrome differs. No double data-fetching, no separate API.

### Key data flows

1. **Run → events → digest → activity:** the `AgentActivityLog` (existing) becomes a *projection* of `AgentRunEvent`. Existing call sites stay; we additionally write the event ledger so we have higher-resolution data without breaking the existing log.
2. **Tool call → diff capture → run-detail UI:** every write-tool emits a paired `RunDiff` row with `before`/`after` JSON snapshots scoped to the touched resource. The run detail page renders these as "Card COOP-12: title changed, 3 subtasks added."
3. **Plan proposal → approval → subtask creation:** structured plan persists; approval converts to real subtasks (existing card model) atomically in a `prisma.$transaction` so partial application can't leave orphans.
4. **Mobile chat → keyboard-aware input:** `visualViewport` hook drives `bottomInset` → input position; same input component, different padding at runtime.

## Data Model Deltas

Additive. No existing model is modified beyond adding optional columns (marked `?` below).

```prisma
// Run-lifecycle additions
model AgentRunEvent {
  id              String   @id @default(cuid())
  runId           String
  run             AgentTaskRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  kind            String   // see RunEvent union in src/lib/runEvents.ts
  payload         Json
  idempotencyKey  String?
  createdAt       DateTime @default(now())
  @@index([runId, createdAt])
  @@index([idempotencyKey])
}

model HarnessSnapshot {
  id          String   @id @default(cuid())
  runId       String   @unique
  run         AgentTaskRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  sha         String
  contentJson Json
  createdAt   DateTime @default(now())
  @@index([sha])
}

model RunDiff {
  id           String   @id @default(cuid())
  runId        String
  run          AgentTaskRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  eventId      String?  // FK to AgentRunEvent (the tool_call event)
  resourceKind String   // 'card' | 'comment' | 'project' | 'channel' | 'external'
  resourceId   String?
  beforeJson   Json?
  afterJson    Json?
  summary      String?  @db.Text  // human-readable one-liner
  createdAt    DateTime @default(now())
  @@index([runId])
  @@index([resourceKind, resourceId])
}

// Planning loop
model CardPlan {
  id           String   @id @default(cuid())
  cardId       String
  card         Card     @relation(fields: [cardId], references: [id], onDelete: Cascade)
  proposedBy   String   // agentId
  agent        AIAgent  @relation(fields: [proposedBy], references: [id], onDelete: Cascade)
  runId        String?  // the AgentTaskRun that produced it
  status       String   @default("pending") // draft|pending|approved|rejected|applied|superseded
  stepsJson    Json     // [{ title, description, acceptance, suggestedAssigneeAgentId? }]
  notes        String?  @db.Text
  reviewedById String?
  reviewedAt   DateTime?
  appliedAt    DateTime?
  parentPlanId String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@index([cardId, status])
  @@index([proposedBy])
}

// Additive columns on existing models (nullable, no breakage):
//   AgentTaskRun.summaryMd        String?  @db.Text   — cache for runAuditDigest
//   AgentTaskRun.heartbeatAt      DateTime?           — runResumer staleness check
//   AgentTaskRun.harnessSnapshotId String? @unique    — convenience FK (else look up by runId)
//   AIAgent.role                                       — already exists; planner role is a value, not a column
```

## Build Order Implications

Strict prerequisites — each layer needs the previous to be useful:

1. **Run-lifecycle plumbing first.** `AgentRunEvent` + `HarnessSnapshot` + `runEvents.ts` + `agentHarness.ts` split. Without this, observability and reliability and planning all read from the wrong source. **Blocks everything else.**

2. **Reliability hardening (uses ledger):** retry wrapping, idempotency keys on tool calls, `runResumer.ts`, heartbeats. **Blocks** trustworthy planning loop (you can't approve a plan whose generator might silently drop work).

3. **Observability surfaces (reads ledger):** `RunTimeline`, `RunDiffCard`, `runAuditDigest`, `/runs` route group. **Blocks** human trust to approve plans (humans need to see how an agent thinks before they delegate planning).

4. **Planning loop (uses ledger + observability):** `CardPlan` model, `planning` plugin, planner role, approval UI. **Blocks** M2 marketing (which is "planning loop applied to marketing campaigns").

5. **Mobile in parallel** with 2–4. Mobile work touches presentation only; it doesn't depend on agent-runtime changes. Recommended: mobile primitives (Drawer, BottomSheet, hooks) early because every subsequent UI surface (run timeline, plan review) needs to render on phone.

Within layer 1: `AgentRunEvent` schema + writer → `agentHarness.ts` split → `agentRunner.ts` ledger emits → existing `agentActions.ts` callers updated. Order matters because `agentRunner.ts` depends on a writer existing.

## Component Boundaries — what talks to what

| Boundary | Direction | Communication | Notes |
|----------|-----------|---------------|-------|
| Route handlers ↔ `agentRunner.ts` | one-way invocation | direct function call | unchanged from today |
| `agentRunner.ts` ↔ `runEvents.ts` | one-way write | direct function call | new — runner is sole writer |
| `agentRunner.ts` ↔ `runDiffs.ts` | one-way write | direct function call | new — wrapped around tool dispatch |
| `agentRunner.ts` ↔ `agentHarness.ts` | one-way read | pure function call | refactored — no DB writes inside `buildHarness` |
| `runResumer.ts` ↔ `agentRunner.ts` | one-way invocation | direct function call (resume entry point) | new |
| `runResumer.ts` ↔ scheduler `tick.ts` | invoked by | direct call from `runTick()` | new |
| Plugin tool handler ↔ `runDiffs.captureDiff` | hook around | helper called from inside `wrapIdempotent` | new — handlers don't touch ledger directly |
| `planning/proposeCardPlan.ts` ↔ `agentRunner.ts` | one-way invocation | direct function call | new |
| `planning/applyApprovedPlan.ts` ↔ Prisma | direct write | `prisma.$transaction` | new |
| Run-detail UI ↔ events API | read-only | `fetch('/api/runs/[id]/events')` | new |
| Plan review UI ↔ plans API | RW | `fetch('/api/plans/[id]/approve')` | new |
| Mobile primitives ↔ existing pages | composition | imported by page components | new — pages compose `<Drawer>`/`<BottomSheet>` based on viewport |
| `useVisualViewport` hook ↔ chat input | one-way read | hook return value | new |

**Invariants preserved:** Prisma singleton stays the only DB client. `auth()` runs at the top of every new route. Plugin contract (`Plugin`, `PluginToolSpec`) is unchanged — `planning.ts` plugs in via the same shape. Matrix is unchanged.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 user (today) | Current single-PM2 + in-process scheduler is sufficient. Run resumer at boot is enough. |
| 5–10 users (small co-op) | Add `AgentRunEvent` retention sweep (60d). Move heartbeat updates onto a short-interval `setInterval` inside the runner so resumer can detect death within ~30s. Still single-replica. |
| 50+ users / multi-replica | Out of scope for M1 by explicit constraint. The event ledger pattern is the *enabler* for that future — at multi-replica time, replace the in-process scheduler with a leased-queue worker (Inngest, BullMQ on Redis, or pg-boss); the runner code doesn't change because it already writes events and uses idempotency keys. |
| 1k runs/day | Add partial index `(status, heartbeatAt) WHERE status='running'` for the resumer scan. |

### First bottleneck

`AgentRunEvent` table growth. At ~50 events/run × 1k runs/day = 50k rows/day, ~1.5M/month. Postgres handles this easily but the run-detail UI will get slow if queried unindexed. Mitigation: composite index `(runId, createdAt)` (already in schema above), and a 60-day retention sweep in the existing scheduler tick.

### Second bottleneck

Provider rate-limit cliffs when an agent retries aggressively. Mitigation: cap retries per run (3 transient retries max), and use exponential backoff with jitter starting at 1s. The scheduler tick already throttles cron-fired runs by checking for in-flight `status: { in: ['queued', 'running'] }` — extend the same gate to retries.

## Anti-Patterns

### Anti-Pattern 1: Storing run state on `AgentTaskRun` columns

**What people do:** Add `currentStep`, `lastToolName`, `partialOutput` columns to track in-flight progress on the run row itself.
**Why it's wrong:** Every column is a write contention point; you lose history on overwrite; you can't reconstruct *order* of events; resumption becomes guesswork ("which column tells me where I was?").
**Do this instead:** Append-only `AgentRunEvent` rows. The `AgentTaskRun` row stays a header (immutable except `status` and `finishedAt`).

### Anti-Pattern 2: Reading the clock and DB inside `agentHarness.compileHarness`

**What people do:** `buildHarness` calls `new Date()` and Prisma queries internally so the caller can pass minimal arguments.
**Why it's wrong:** Resumes produce a different prompt than the original run because `now` and DB state have moved. The agent sees inconsistent reality across attempts → drift → silent wrong answers. (Already partially the case in current `agentHarness.ts`.)
**Do this instead:** Pass `now: Date` and pre-fetched context as arguments. Let one outer function (`prepareHarnessInputs`) do the IO; let `buildHarness` be pure.

### Anti-Pattern 3: Treating proposed plans as comments

**What people do:** Have the agent post `## Proposed Plan\n- step 1\n- step 2…` as a comment on the card and let humans react with emojis.
**Why it's wrong:** No structure → can't auto-create subtasks on approval. No status → can't tell "approved" from "discussed." No revision history. Mixed with chat noise. Anti-pattern in `ProjectAboutProposal`'s own design history; we have already learned this lesson elsewhere in the codebase — copy that pattern, don't re-make the mistake.
**Do this instead:** Structured `CardPlan` model with explicit lifecycle. Mirror a *summary* into a comment for human readability if you want, but the source of truth is the row.

### Anti-Pattern 4: Inventing a "Proposed" or "Plan Review" kanban column

**What people do:** Move the card to a synthetic column when a plan exists, move it back when approved.
**Why it's wrong:** Conflates two orthogonal axes (work-state vs. plan-state). Breaks columns the user actually configured. Doesn't compose with multiple boards. And what about cards that don't have plans?
**Do this instead:** Keep the card in its existing column. Surface plan state as a *badge* on the card, a queue under `/p/[projectId]/plans`, and a notification.

### Anti-Pattern 5: Separate `/m/` mobile route tree

**What people do:** Detect viewport at the edge, redirect mobile users to a parallel `/m/...` URL space with its own pages.
**Why it's wrong:** Doubles maintenance, breaks shared links (the agent posts a desktop URL into chat → mobile user 404s or has to click-through), defeats the "agents see what humans see" core thesis.
**Do this instead:** One route tree, responsive layouts, breakpoint-driven shell. Mobile-specific *components* live in `src/components/mobile/`; pages compose them.

### Anti-Pattern 6: Per-tool ad-hoc retries inside handlers

**What people do:** Each tool handler implements its own try/catch retry loop.
**Why it's wrong:** Inconsistent semantics; the runner can't tell "this is a retry" vs. "this is a fresh call"; events are missing; the user can't see retries in the timeline.
**Do this instead:** Retries live in *one place* — the runner's tool dispatch wrapper — and emit `retry` events. Handlers throw on transient failure; the wrapper decides the retry policy.

### Anti-Pattern 7: Long-distance horizontal drag on phone kanban

**What people do:** Try to make multi-column horizontal drag work on a 375px viewport.
**Why it's wrong:** Drag distance ≫ screen width, scroll fights drag, accidental drops, hand fatigue. Users hate it.
**Do this instead:** Single-column pager on phone; drag-and-drop is *vertical only* (reorder within column); column changes happen via long-press → menu → "Move to column…" picker. Touch-native UX, accepts that the desktop interaction model doesn't transfer.

## Integration Points

### External services

| Service | Integration pattern | Notes |
|---------|---------------------|-------|
| Synapse / Matrix | unchanged — `src/lib/matrix.ts` wrappers | run audit timeline links to Matrix events when a tool sends a message; store `matrixEventId` in the relevant `AgentRunEvent.payload` |
| Anthropic / OpenAI / Claude Code CLI / Codex CLI | unchanged provider parity | retries wrap the *runner's* call to provider, not the SDK's internal retry; idempotency key passed through where supported (Anthropic supports `request_id`-style metadata; OpenAI does not yet — accept replay on resume for OpenAI runs) |
| GitHub App / sandboxed runner | unchanged | coding plugin tools wrap with `wrapIdempotent` so a sandbox-runner crash mid-task replays correctly on resume |

### Internal boundaries

| Boundary | Communication | Considerations |
|----------|---------------|----------------|
| `agentRunner.ts` ↔ `plugins/builtin/*` | function call via `tool.handler(ctx, args)` | new `wrapIdempotent` helper sits in the registry, not the runner — keeps plugin contract clean |
| `runEvents.ts` ↔ `agentActivityLog` (existing) | dual-write during transition; eventually `agentActivityLog` becomes a thin projection of events | back-compat: keep existing `logAgentActivity` calls; add `appendRunEvent` alongside |
| `planning/applyApprovedPlan.ts` ↔ kanban tools | direct Prisma in a `$transaction` (not via tool call) | because there's no agent in this loop — the human approved, the system applies. Avoids circular tool-call from web request. |
| Mobile components ↔ desktop components | composition | shared types, shared API; only the rendering primitives differ |

## M2 Marketing-Platform Architecture (sketch only)

> **Confidence: LOW — preview, not detailed.** Per milestone scope, M2 is deferred. This sketch validates that M1's decisions don't paint M2 into a corner.

```
┌─────────────────────────────────────────────────────────────────┐
│  Marketing capability = composition of three M1 layers           │
├─────────────────────────────────────────────────────────────────┤
│  1. Plugin (publishing)                                          │
│     src/lib/plugins/builtin/marketing.ts                         │
│     tools: post_to_x, post_to_reddit, draft_blog, schedule_post  │
│     auth flow: ProjectSecret keys for X/Reddit/etc.              │
│     channel: webhook to receive engagement signals               │
├─────────────────────────────────────────────────────────────────┤
│  2. Skill packs (workflows)                                      │
│     ClawHub-compatible skill packs (existing) define multi-step  │
│     procedures: "Launch announcement", "Weekly digest",          │
│     "Listen and reply." Skills compose plugin tools.             │
├─────────────────────────────────────────────────────────────────┤
│  3. Agent templates (personas)                                   │
│     src/lib/agentTemplates/: marketing-lead, copywriter,         │
│     community-manager. Pre-configured system prompt + skills +   │
│     plugins. Spawned per project with one click.                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼  uses
                ┌──────────────────────────────────┐
                │  M1 foundations:                  │
                │  - planning loop (campaign briefs │
                │    → approved plans → execution)  │
                │  - run reliability (publishing    │
                │    is side-effect-heavy)          │
                │  - observability (which post,     │
                │    when, why?)                    │
                │  - mobile (review on phone)       │
                └──────────────────────────────────┘
```

**Integration shape with existing plugin contract:** zero new shapes. `marketing.ts` is just another `Plugin` registered via `plugins/registry.ts`. Skills already exist (`src/lib/skills/`). Agent templates is the *one* new structural addition (`src/lib/agentTemplates/`) and it's a thin file that returns `Partial<AIAgent>` for the `prisma.aIAgent.create` call. No architectural surprise.

**Key M1 decision that enables M2:** the planning-loop's `CardPlan` model is generic — a "marketing campaign" is a card with a multi-step plan. M2 doesn't need a new approval surface; it reuses `/p/[projectId]/plans`.

## Sources

- [LangGraph durable execution and idempotency](https://docs.langchain.com/oss/python/langgraph/durable-execution) — HIGH confidence; checkpointer/resumption patterns directly applicable
- [LangGraph human-in-the-loop interrupts](https://docs.langchain.com/oss/python/langchain/human-in-the-loop) — HIGH; informs plan-approval state machine
- [OpenHands event-sourced state architecture (arXiv)](https://arxiv.org/html/2511.03690v1) — HIGH; the events.jsonl + state.json model is the direct inspiration for `AgentRunEvent`
- [OpenHands deep-dive — event log structure](https://dev.to/truongpx396/openhands-deep-dive-build-your-own-guide-1al0) — MEDIUM; secondary corroboration
- [OpenAI Agents SDK tracing](https://openai.github.io/openai-agents-python/tracing/) — HIGH; trace+span model and built-in event recording
- [Pydantic AI / Logfire span tree observability](https://ai.pydantic.dev/logfire/) — HIGH; informs run-detail UI as tree-vs-timeline tradeoff (we choose timeline for human readability, tree available via parent-child event references)
- [Mastra workflow step retries + idempotency](https://mastra.ai/docs/reference/workflows/step-retries) — HIGH; canonical statement of "idempotent execute is mandatory"
- [Inngest durable workflow + idempotency](https://www.inngest.com/docs/guides/error-handling) — HIGH; idempotency key pattern adopted directly
- [Diagrid — checkpoints are not durable execution (critique)](https://www.diagrid.io/blog/checkpoints-are-not-durable-execution-why-langgraph-crewai-google-adk-and-others-fall-short-for-production-agent-workflows) — MEDIUM; cautions us that checkpointers alone aren't enough — hence the idempotency-key pattern on top
- [@hello-pangea/dnd touch sensor](https://github.com/hello-pangea/dnd/blob/main/docs/sensors/touch.md) — HIGH; long-press behavior, sensor configuration
- [Visual Viewport API + dvh fallback](https://dev.to/franciscomoretti/fix-mobile-keyboard-overlap-with-visualviewport-3a4a) — HIGH; canonical pattern for keyboard-safe inputs
- [react-modal-sheet (built on Motion)](https://github.com/Temzasse/react-modal-sheet) — MEDIUM; reference implementation if hand-roll proves leaky
- [Next.js 16 layouts and route groups](https://nextjs.org/docs/app/getting-started/layouts-and-pages) — HIGH; confirms responsive single-tree is the idiomatic choice
- [AI agent audit log structure (parent-child spans)](https://prefactor.tech/blog/audit-trails-in-ci-cd-best-practices-for-ai-agents) — MEDIUM; informs the optional tree-shaped projection of the event ledger

---
*Architecture research for: agent-as-teammate workspace (co-op M1)*
*Researched: 2026-05-01*
