# Roadmap: Co-Op — Milestone 1 (Trust Foundation)

## Overview

Milestone 1 turns *"agents can act"* into *"agents can be trusted to act."* Six sequential phases progress from substrate (event ledger + mobile primitives) → reliability hardening → audit visibility → planning-loop core → on-phone dogfood closure (ghost cards + push) → M2 composition validation. The user reaches the M1 inflection — **"co-op runs co-op"** — at the end of Phase 5, when they tap-approve a planner-agent's card decomposition from their phone and watch agents execute the approved steps within a refusing runtime. Phase 6 ships no marketing code; it certifies the plugin / skill / agent-template stack is M2-ready.

**Granularity:** standard (6 phases, 2-5 plans each).
**Coverage:** 54 / 54 v1 requirements mapped (100%).
**Sequencing constraint:** ledger → reliability → visibility → planning → mobile-first closure → M2 spec. Solo-dev cadence runs phases sequentially; plans within a phase parallelize.

## Prior Work (Pre-M1)

Memory v1 + v2 (embedding-ranked retrieval, project-tier shared memory) shipped 2026-05-01 as CODE_COMPLETE work outside this milestone — see `.planning/phases/02-memory-v2-project-tier/` and `.planning/quick/20260501-memory-v1-embedding-rank/`. The harness retrieval changes from those phases are non-breaking and orthogonal to M1; the residual Memory v3 (lifecycle / dedup) and v4 (retrieval audit UI) work is **not** part of M1 scope. Memory v4's "retrieval audit UI" overlaps conceptually with M1 Phase 3 audit surfaces; if that piece becomes desirable mid-milestone it lands as an inserted decimal phase rather than expanding any integer phase.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4, 5, 6): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Run-lifecycle substrate + mobile primitives** — Append-only event ledger, deterministic harness, OTel/Langfuse instrumentation, and the mobile drawer / bottom-sheet / viewport tokens that every later UI inherits. **CODE_COMPLETE 2026-05-05** (24 commits, test count 94 → 120). See `.planning/phases/01-run-lifecycle-substrate-mobile-primitives/01-{01..04}-SUMMARY.md`.
- [ ] **Phase 2: Reliability hardening** — Bounded retries, iteration cap, idempotent tool calls, subprocess watchdog, tool-output quarantine, run-mode flag, manual recovery actions, and brownfield CONCERNS.md fixes.
- [ ] **Phase 3: Visibility & audit surfaces** — `/runs` list + run-detail timeline, ledger-derived summaries, unified diff with negative-space deletes, two-tier logs with redactor, one-click revert, cost / token telemetry, and global mobile audit passes (touch targets, hover/focus parity, login/settings 375px).
- [ ] **Phase 4: Planning-loop core** — `CardPlan` model, propose-only `planning` plugin, hash-bound approval, refusal of out-of-plan tool calls, amendment cap, Planner agent template, and the `/plans` queue UI with tiered actions plus false-approve telemetry.
- [ ] **Phase 5: On-phone dogfood closure (ghost cards + push)** — Mobile kanban single-column pager, "Move to…" picker, chat list/detail stack, soft-keyboard composer, ghost-card rendering with atomic flip-on-approve, PWA push pipeline, and tap-to-approve / tap-to-revert flows that close the M1 inflection on a phone.
- [ ] **Phase 6: M2 composition validation** — Plugin/skill/template contract regression test, one non-marketing example trio (Code Reviewer), `CardPlan` carries a marketing-campaign brief test, anti-slop and anti-claim linter design notes, and per-project secret/attribution scoping regression.

## Phase Details

### Phase 1: Run-lifecycle substrate + mobile primitives
**Goal**: Ship the keystone event ledger, deterministic harness, and mobile UI primitives that every subsequent phase consumes.
**Depends on**: Nothing (first phase)
**Parallelizable with**: Plans within this phase run in parallel — three backend tracks (ledger, harness determinism, instrumentation) and one frontend track (mobile primitives + manifest) are independent.
**Requirements**: RUN-01, RUN-02, RUN-03, RUN-04, RUN-05, RUN-06, MOB-01, MOB-02, MOB-03, MOB-04, MOB-12
**Success Criteria** (what must be TRUE):
  1. Operator can query `AgentRunEvent` for any run and reconstruct the full sequence of tool calls, LLM messages, retries, and side-effects from the ledger alone.
  2. Operator can re-run `buildHarness(runId, agentStateAtStart, projectStateAtStart, now)` twice and get byte-identical prompt + tool schema + plugin allowlist + run-mode flag.
  3. Operator can open Langfuse (or any OTel-compatible viewer) and see GenAI spans for every Anthropic / OpenAI / CLI call without code-side instrumentation in plugin handlers.
  4. User can install Co-Op to home screen on iOS Safari and Android Chrome from any project page; the manifest carries icons + theme color.
  5. User can open the dashboard, project hub, and any settings modal at 375×667 with the sidebar collapsed into a vaul Drawer (hamburger trigger) and modals re-rendered as vaul BottomSheets with sticky header / footer.
**Pitfalls defused**: 13 (dogfood blindness — drill at exit). Sets up substrate for 1, 2, 3, 4, 6, 7, 14.
**Plans**: 4 plans
**UI hint**: yes

Plans:
- [ ] 01-01: Prisma deltas + `AgentRunEvent` ledger writer + `RunDiff` snapshot helpers (RUN-01, RUN-02, RUN-05)
- [ ] 01-02: `HarnessSnapshot` model + `buildHarness` / `snapshotHarness` split with deterministic inputs (RUN-03, RUN-04)
- [ ] 01-03: `instrumentation.ts` registers `@vercel/otel` + Langfuse SDK; `docker-compose.yml` ships commented-out self-host Langfuse stanza (RUN-06)
- [ ] 01-04: Mobile primitives — viewport meta, `tokens.css` breakpoints + safe-area, vaul Drawer + BottomSheet components, PWA manifest (MOB-01, MOB-02, MOB-03, MOB-04, MOB-12)

### Phase 2: Reliability hardening
**Goal**: Make every agent run bounded, deterministic, idempotent, recoverable, and side-effect-safe — so a human can hand a card to an agent without watching it.
**Depends on**: Phase 1 (ledger emits the events; idempotency reuses `WebhookIdempotency` extended for `tool:<toolName>`).
**Parallelizable with**: Mobile responsive passes on auth + settings + dashboard (carried into P3 as cross-cutting work).
**Requirements**: REL-01, REL-02, REL-03, REL-04, REL-05, REL-06, REL-07, REL-08, REL-09
**Success Criteria** (what must be TRUE):
  1. Operator runs a tool that returns a transient 503 and observes ≤5 retries with exponential backoff in the ledger; the same tool returning 401 short-circuits with no retries and a clear error event.
  2. Operator runs an agent past its iteration cap (15-25 tool calls) or wall-clock budget and the run fails fast with a `cap_exceeded` event citing which limit was hit.
  3. Operator cancels a CLI subprocess run mid-flight, re-checks `ps`, and sees zero zombies; restart of the app reaps any leftover subprocess from a crashed previous process.
  4. Operator switches an agent to `read-only` mode and watches the runtime emit `mode_violation` (and refuse the call) when the agent attempts any mutating tool.
  5. User clicks "Retry" on a failed run from the runs UI and the system replays from the latest checkpoint without double-applying any side-effect (idempotency keys verified).
**Pitfalls defused**: **1** (CRITICAL — unbounded loop / cost runaway), **2** (CRITICAL — indirect prompt injection via tool-output quarantine envelope), **3** (CRITICAL — CLI subprocess zombies via watchdog + reaper + isolated `HOME`), **4** (SERIOUS — stale tool state via atomic move reindex), **14** (CRITICAL — dogfood paradox via run-mode flag), plus the CONCERNS.md fixes (encrypted keys, cross-tenant gates, Zod on every mutating route).
**Plans**: 4 plans
**UI hint**: yes

Plans:
- [ ] 02-01: Tool-dispatch wrapper — `p-retry` bounded backoff, iteration cap + wall-clock budget, idempotency via `WebhookIdempotency.tool:<name>` scope (REL-01, REL-02, REL-03)
- [ ] 02-02: Subprocess watchdog — per-run isolated `HOME` + `cwd`, clean kill, boot-time reaper, tool-output quarantine envelope + classifier (REL-04, REL-05)
- [ ] 02-03: Run-mode flag on `AIAgent` (`read-only` / `propose-only` / `propose-and-execute`); manual retry / re-run / cancel API + buttons; "stuck" self-escalation (REL-06, REL-07, REL-08)
- [ ] 02-04: Brownfield safety — atomic move reindex, encrypted-at-rest API keys (replace plaintext), cross-tenant route audit, Zod on every mutating route (REL-09)

### Phase 3: Visibility & audit surfaces
**Goal**: Humans can scan any run, trust what they see, and revert what they don't — and the existing surfaces (auth, settings, dashboard) all work cleanly at 375px.
**Depends on**: Phase 1 (ledger to derive summaries from), Phase 2 (idempotency keys for revert ops).
**Parallelizable with**: Plans within phase parallelize. Mobile passes (MOB-09 / 10 / 11) parallelize with audit UI plans because they touch existing pages, not new ones.
**Requirements**: AUD-01, AUD-02, AUD-03, AUD-04, AUD-05, AUD-06, AUD-07, AUD-08, AUD-09, MOB-09, MOB-10, MOB-11
**Success Criteria** (what must be TRUE):
  1. User opens `/p/[projectId]/runs`, filters by agent + status, and sees status / agent / timestamp / cost / token / tool-call count for every run.
  2. User opens any run-detail page, reads a ≤3-sentence plain-language summary, expands the timeline, and every claim in the summary corresponds to a real `AgentRunEvent` (verifier passes on 10 sampled runs).
  3. User clicks "Revert" on a run that touched 5 entities and watches all 5 entities (including any deletions, shown as negative-space) restore atomically; the revert is itself a new run linked to the original.
  4. Operator runs the redactor fuzz test that plants 50+ secret-shaped strings into tool outputs and confirms zero secrets survive into stored operator-tier payloads.
  5. User taps any `.btn` / `.btn-icon` / drag handle / link on phone (audit reports zero violations); login + register + settings render without horizontal overflow at 375×667.
**Pitfalls defused**: **6** (SERIOUS — run-summary hallucination via ledger-derived summaries + diff verification), **7** (CRITICAL on leakage — two-tier logs + redactor fuzz test + sensitivity tags), **8** (SERIOUS — misleading diff via run-scoped negative-space rendering + side-effect badges + reject = revert), **10** (SERIOUS — hover-only on touch via persistent affordances + `@media (hover)` gates), **13** (recurring drill at exit).
**Plans**: 5 plans
**UI hint**: yes

Plans:
- [ ] 03-01: `/p/[projectId]/runs` list route + filters + cost/token aggregation per-run / per-agent / per-project (AUD-01, AUD-08)
- [ ] 03-02: Run-detail timeline (`RunTimeline`) + ledger-derived plain-language summary (`runAuditDigest.ts`) + collapsible raw payload sections (AUD-02, AUD-03)
- [ ] 03-03: Unified diff view with negative-space deletes + side-effect badges + one-click revert via stored inverse-ops (AUD-04, AUD-07)
- [ ] 03-04: Two-tier logs (`activity` vs `trace`) + redactor middleware + secret fuzz test + Sonner toast for run lifecycle events (AUD-05, AUD-06, AUD-09)
- [ ] 03-05: Cross-cutting mobile audit — 44pt touch-target sweep, `:hover` / `:focus-visible` / `:active` parity, login/register/settings no-overflow at 375px (MOB-09, MOB-10, MOB-11)

### Phase 4: Planning-loop core
**Goal**: Ship plan-as-data: agents propose structured plans through a propose-only plugin, humans approve via the `/plans` queue with tiered actions, and the runtime refuses any out-of-plan tool call.
**Depends on**: Phases 1, 2, 3 (ledger emits plan events; mode-flag enforces propose-only; audit surfaces reveal refusals + false-approves).
**Parallelizable with**: Plans within phase parallelize on backend (model + plugin) vs frontend (queue + modal) tracks.
**Requirements**: PLAN-01, PLAN-02, PLAN-03, PLAN-04, PLAN-05, PLAN-06, PLAN-08, PLAN-09, PLAN-10
**Success Criteria** (what must be TRUE):
  1. User runs the Planner agent template and observes it emit a `pending` `CardPlan` with Zod-validated steps; the plan blocks for human approval at `/p/[projectId]/plans`.
  2. User approves a plan, then a malicious patch mutates `stepsJson` between approval and execution start; the runtime detects the `contentHash` change and blocks the run requiring re-approval.
  3. User watches an executing agent attempt a tool call outside the approved step set and sees the runtime emit `out_of_plan_tool_call` and refuse the call; the audit timeline surfaces the refusal.
  4. User triggers a third amendment on a single run and the runtime emits `amendment_cap_exceeded` and stops the run (cap = 2).
  5. User opens `/p/[projectId]/runs` aggregates and sees a "false-approve" counter increment after reverting a previously approved plan — surfacing as a trust signal.
**Pitfalls defused**: **5** (CRITICAL — plan drift via plan-as-data + hash-bound approval + amendment cap + out-of-plan refusal), **9** (SERIOUS — approval-fatigue rubber-stamping via tiered actions + no confidence scores + false-approve metric), **14 sub** (CRITICAL — run-mode flag honored end-to-end through plan approval).
**Plans**: 4 plans
**UI hint**: yes

Plans:
- [ ] 04-01: `CardPlan` Prisma model + Zod step schema + `contentHash` + `applyApprovedPlan.ts` runner (PLAN-01, PLAN-04)
- [ ] 04-02: `planning` built-in plugin (`propose_card_plan`, `update_card_plan`) — propose-only, cannot mutate cards/comments; runtime refusal of out-of-plan tool calls; amendment cap enforcement (PLAN-02, PLAN-05, PLAN-06)
- [ ] 04-03: `/p/[projectId]/plans` queue UI + plan-review modal with tiered actions (approve all / approve step-by-step / reject / amend); transitions plan to `pending` on emit (PLAN-03, PLAN-09)
- [ ] 04-04: Planner agent template (preconfigured prompt + planning plugin allowlist + read-only / propose-only mode) + false-approve telemetry counter surfaced in `/runs` aggregates (PLAN-08, PLAN-10)

### Phase 5: On-phone dogfood closure (ghost cards + push)
**Goal**: Close the M1 inflection — "co-op runs co-op" — on a phone. Mobile-first kanban + chat flows, ghost cards on the board, PWA push that deep-links to plan review, and tap-to-approve plan execution.
**Depends on**: Phases 1–4 (mobile primitives, run reliability, audit surfaces, planning-loop core all required).
**Parallelizable with**: Plans within phase parallelize across mobile-flow / ghost-card / push tracks.
**Requirements**: PLAN-07, MOB-05, MOB-06, MOB-07, MOB-08, MOB-13, MOB-14
**Success Criteria** (what must be TRUE):
  1. User opens the kanban board on a phone, swipes between columns one at a time (single-column pager with horizontal scroll-snap), and uses the "Move to…" picker as the primary cross-column move affordance.
  2. User opens chat on a phone, sees the room list as the default view, taps a room to slide into messages, and uses the back button to return; tapping the composer keeps it above the iOS soft keyboard via the Visual Viewport API.
  3. User approves a `CardPlan` and watches its steps render as ghost cards on the kanban board; approving the plan flips ghosts to real subtask cards atomically in a single run.
  4. User receives a Web Push notification on phone for `plan ready for review`, taps it, deep-links straight into `/p/[projectId]/plans`, and tap-approves without modal overflow or scroll-trap.
  5. User performs the full M1 dogfood loop on a phone in one session — backlog item → planner agent proposes plan → push notification → tap-approve → ghost-cards become real subtasks → executing agent finishes within the approved set.
**Pitfalls defused**: **5 sub** (plan-execution diff visible in mobile UI), **8 sub** (plan-execution diff during ghost-card flip), **10** (SERIOUS — touch affordances on planning surface), **11** (SERIOUS — iOS keyboard via `dvh` + Visual Viewport + safe-area), **12** (SERIOUS — touch DnD scroll-trapping via single-column pager + non-drag fallback), **13** (recurring drill at exit — full reset-and-onboard on a phone).
**Plans**: 3 plans
**UI hint**: yes

Plans:
- [ ] 05-01: Mobile kanban + chat flows — single-column pager with scroll-snap, "Move to…" picker as primary cross-column affordance, chat list/detail stack with back button, Visual Viewport composer (MOB-05, MOB-06, MOB-07, MOB-08)
- [ ] 05-02: Ghost-card rendering on kanban board — approved plan steps display as ghosts; approving flips to real subtask cards atomically in the same run (PLAN-07)
- [ ] 05-03: PWA push pipeline — service worker + Web Push subscription; notifications for mention / card-assigned / plan-ready / run-failed / run-done; tap-to-deep-link; mobile-operable plan review + run revert + cancel without scroll-trap (MOB-13, MOB-14)

### Phase 6: M2 composition validation
**Goal**: Certify that M1's plugin / skill / agent-template stack is M2-ready by composing one non-marketing example end-to-end and locking the design shapes for M2's anti-slop / anti-claim linters and per-project isolation.
**Depends on**: Phases 1–5.
**Parallelizable with**: Plans within phase parallelize between contract regression tests and design-note drafting.
**Requirements**: M2P-01, M2P-02, M2P-03, M2P-04, M2P-05, M2P-06
**Success Criteria** (what must be TRUE):
  1. Operator runs the contract regression test and confirms the plugin contract, skill loader signature, and agent template format have zero breaking signature changes between M1 start and M1 end.
  2. User invokes the "Code Reviewer" example agent template and watches it compose end-to-end through the existing plugin + skill + template contract — proving the M2 surface is reusable for any project, not just marketing.
  3. Operator runs the marketing-campaign brief contract test and confirms `CardPlan.stepsJson` carries `{title, description, acceptance, suggestedAssigneeAgentId?}` for a multi-step campaign without M1 schema modifications.
  4. Operator opens the anti-slop linter design note and reviews voice-fingerprint deviation, cliché detection, and "receipts required" rule — ready to be implemented in M2.
  5. Operator runs the per-project secret + attribution scoping regression and confirms `ProjectSecret` and `ProjectMember` isolation hold across every M1 change (no cross-project secret access, no cross-tenant attribution leakage).
**Pitfalls defused**: **15** (SERIOUS-design — anti-slop linter spec drafted), **16** (CRITICAL-design — API-only social posting + warmup gate referenced in design notes), **17** (SERIOUS-design — per-project UTM schema in design notes), **18** (SERIOUS-design — anti-claim linter spec against `PROJECT.md` Validated section), **13** (final M1 drill — mark milestone complete in `PROJECT.md`).
**Plans**: 2 plans
**UI hint**: no

Plans:
- [ ] 06-01: Composition validation — Code Reviewer template + skill pack + plugin tool wired end-to-end through existing contract; contract regression test asserting plugin / skill / template signatures unchanged; `CardPlan` marketing-campaign brief test (M2P-01, M2P-02, M2P-03)
- [ ] 06-02: M2 design notes + isolation regression — anti-slop linter spec, anti-claim linter spec, per-project secret / attribution scoping regression test (M2P-04, M2P-05, M2P-06)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Run-lifecycle substrate + mobile primitives | 0/4 | Not started | - |
| 2. Reliability hardening | 0/4 | Not started | - |
| 3. Visibility & audit surfaces | 0/5 | Not started | - |
| 4. Planning-loop core | 0/4 | Not started | - |
| 5. On-phone dogfood closure (ghost cards + push) | 0/3 | Not started | - |
| 6. M2 composition validation | 0/2 | Not started | - |

## Phase-Level Decisions Resolved

These open questions from `research/SUMMARY.md` are answered as roadmap-level decisions; phase plans should treat them as locked unless surfaced again during planning:

1. **CONCERNS.md fixes inside Phase 2** — interleaved as plan 02-04 (REL-09 captures them), not a separate sub-phase.
2. **PWA scope** — manifest in Phase 1 (plan 01-04, MOB-12); push pipeline in Phase 5 (plan 05-03, MOB-13).
3. **Run-mode flag granularity** — per-agent for M1; per-project deferred to v2.
4. **Langfuse default** — opt-in via env. Phase 1 (plan 01-03) ships a commented-out self-host stanza in `docker-compose.yml`.
5. **Phase 6 example template choice** — Code Reviewer (M2P-02).

Open questions explicitly deferred to phase planning (not pre-resolved here):
- Friend-test cadence frequency (drill at every phase exit) — solo-dev personal "fresh terminal, fresh DB" exercise unless user recruits outside testers.
- Ghost-card DnD interaction (drag-reorderable before approval? concurrent human DnD on real cards in same column?) — surfaces during 05-02 planning.
- Inverse-op record format (per-tool, per-`RunDiff`, structured undo) — design pass during 03-03 planning before coding.

---

*Last updated: 2026-05-01 after roadmap creation.*
