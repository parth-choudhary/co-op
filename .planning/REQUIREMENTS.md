# Co-Op — Milestone 1 Requirements

**Milestone:** M1 — Trust foundation for "co-op runs co-op"
**Source:** Synthesized from `.planning/PROJECT.md` Active section + `.planning/research/SUMMARY.md` (5 canonical phases) on 2026-05-01.
**Inflection target:** The user trusts the planning loop enough to drive co-op's own work through it.

---

## v1 Requirements

### RUN — Run lifecycle plumbing (foundation)

> Keystone substrate. Establishes the data model and primitives every other category reads from. No standalone user value; every other category breaks without it.

- [ ] **RUN-01**: Every agent run is represented by an `AgentTaskRun` row with status (`pending` / `running` / `succeeded` / `failed` / `cancelled`), heartbeat timestamp, and a foreign key to a `HarnessSnapshot`.
- [ ] **RUN-02**: Every tool call, LLM message, retry, and side-effect during a run writes an immutable `AgentRunEvent` ledger entry; the ledger is the source of truth, not mutable columns on `AgentTaskRun`.
- [ ] **RUN-03**: Harness assembly is deterministic — given the same `(runId, agentStateAtStart, projectStateAtStart, now)`, `buildHarness()` produces an identical prompt and tool schema across calls and resumes.
- [ ] **RUN-04**: Every run produces a `HarnessSnapshot` capturing the exact prompt + tool schema + plugin allowlist + run-mode flag in effect at run start.
- [ ] **RUN-05**: A `RunDiff` model captures the structured before/after of every entity an agent touches in a run (cards, comments, attachments, members, channels).
- [ ] **RUN-06**: `instrumentation.ts` registers OpenTelemetry GenAI spans + Langfuse SDK so every Anthropic/OpenAI/CLI call is traced automatically; self-host Langfuse is documented in `docker-compose.yml`.

### REL — Agent-run reliability

> Pre-requirement for trusting agents with planning. Bounded, deterministic, recoverable, side-effect-safe.

- [ ] **REL-01**: Tool calls retry with bounded exponential backoff (max 5 attempts via `p-retry` + `AbortSignal`) on transient errors; auth/permission errors short-circuit immediately.
- [ ] **REL-02**: Each run has a hard iteration cap (15–25 tool calls, configurable per agent) and a wall-clock budget; runs exceeding either fail-fast and emit a `cap_exceeded` event with a clear reason.
- [ ] **REL-03**: Tool calls are idempotent against retries via the existing `WebhookIdempotency` table extended with `tool:<toolName>` scope; replays of the same `(runId, stepId, toolCallId)` return the cached result.
- [ ] **REL-04**: CLI subprocess runs (Claude Code, Codex CLI) execute in a per-run isolated `HOME` and `cwd`, are killed cleanly on cancel/timeout, and a reaper on app boot reaps any zombies left by a previous process.
- [ ] **REL-05**: Tool outputs are wrapped in a quarantine envelope before re-injection into LLM context; a classifier flags suspicious patterns (e.g., "ignore previous instructions", unexpected base64 blobs, unexpected URLs) into a `tool_output_quarantined` event.
- [ ] **REL-06**: Each `AIAgent` carries a run-mode flag (`read-only` / `propose-only` / `propose-and-execute`); the runtime refuses every tool call inconsistent with the flag and emits a `mode_violation` event.
- [ ] **REL-07**: Failed runs can be manually retried, re-run from the latest checkpoint, or cancelled from a runs UI; all three actions emit auditable events and respect the run-mode flag.
- [ ] **REL-08**: A run that hits the same tool/error pattern N times within itself self-escalates as `stuck` and surfaces to the project owner via notification.
- [ ] **REL-09**: Brownfield safety fixes land alongside reliability work: atomic move-reindex, encrypted-at-rest API keys (replacing any plaintext), cross-tenant route gates audited end-to-end, Zod validation on every mutating route.

### AUD — Agent visibility / audit

> Humans can scan a run, trust what they see, and revert what they don't. Pre-requirement for the planning-loop trust gate.

- [ ] **AUD-01**: A new `/p/[projectId]/runs` route lists every run for the project with status, agent, timestamp, cost, token usage, and tool-call count; filterable by agent and status.
- [ ] **AUD-02**: A run-detail route at `/p/[projectId]/runs/[runId]` renders a timeline of `AgentRunEvent` entries grouped by step, with collapsible raw payload sections.
- [ ] **AUD-03**: Each run produces a plain-language summary (≤3 sentences) derived from the `AgentRunEvent` ledger — not from the LLM trace — and verified to reference only events that actually occurred.
- [ ] **AUD-04**: A run touching multiple entities renders a single unified diff view; each touched entity shows before / after / "deleted" (negative-space) so deletions don't disappear from the audit.
- [ ] **AUD-05**: Audit logs are two-tier — `activity` (human-facing, no payloads, indefinite retention) and `trace` (operator-tier, full payloads, redacted by default, 7–14 day retention).
- [ ] **AUD-06**: A redactor middleware scrubs API keys, OAuth tokens, email addresses, and Matrix tokens from operator-tier logs; a fuzz test plants 50+ secret-shaped strings and asserts none survive into stored payloads.
- [ ] **AUD-07**: Reverting a run via a single button restores every entity in the run's `RunDiff` via stored inverse-ops; the revert itself is recorded as a new run with `kind: revert` linked to the original.
- [ ] **AUD-08**: Cost and token usage are visible per-run, aggregated per-agent, and aggregated per-project; cost is currency-formatted and includes provider breakdown.
- [ ] **AUD-09**: A `Sonner`-based toast system surfaces run lifecycle events (started / retried / stuck / completed / reverted) without modal interruption.

### PLAN — Planning-loop tooling

> The dogfood differentiator. Plan-as-data, hash-bound approval, refusal of out-of-plan tool calls, ghost-card rendering on the kanban.

- [ ] **PLAN-01**: A new Prisma model `CardPlan` stores plans with `status` (`draft` / `pending` / `approved` / `rejected` / `applied` / `superseded`), `stepsJson` (Zod-validated array of `{ title, description, acceptance, suggestedAssigneeAgentId? }`), `contentHash`, and references to its proposing run + parent card.
- [ ] **PLAN-02**: A new built-in `planning` plugin exposes `propose_card_plan` and `update_card_plan` tools; the plugin is propose-only and cannot mutate cards or comments directly.
- [ ] **PLAN-03**: An agent run that emits a plan transitions the plan to `pending` and blocks pending human approval at `/p/[projectId]/plans`.
- [ ] **PLAN-04**: Approval is hash-bound — if `contentHash` changes between approval and execution start, the run blocks and requires re-approval.
- [ ] **PLAN-05**: Plan amendments during execution are capped at 2 per run; each amendment requires re-approval; further amendment attempts emit `amendment_cap_exceeded` and stop the run.
- [ ] **PLAN-06**: The runtime refuses any tool call from a run executing an `approved` plan whose tool name is not in the approved step set; refusals emit `out_of_plan_tool_call` events visible in audit.
- [ ] **PLAN-07**: Approved plan steps render as ghost cards on the kanban board; approving the plan flips ghosts to real subtask cards in the same run, atomically.
- [ ] **PLAN-08**: A "Planner" agent template ships with a preconfigured system prompt + `planning` plugin allowlist + `read-only` access to the project backlog and `propose-only` run mode.
- [ ] **PLAN-09**: The `/p/[projectId]/plans` queue UI presents pending plans with tiered actions (approve all / approve step-by-step / reject / amend); no auto-approve, no confidence scores, no rubber-stamp shortcuts.
- [ ] **PLAN-10**: A "false-approve" telemetry counter increments every time an approved plan is later reverted; the counter surfaces in `/p/[projectId]/runs` aggregates as a trust signal.

### MOB — Mobile-friendly UI

> Phone-usable across every primary flow at ≥375px without breaking desktop. The shared-surface bet means agents and humans use the same UI; the surface must work on the device a human is reviewing from.

- [ ] **MOB-01**: A `<meta viewport>` declaration with `width=device-width, initial-scale=1, viewport-fit=cover` is present on every rendered page.
- [ ] **MOB-02**: Breakpoint tokens (`--bp-sm: 480px`, `--bp-md: 768px`, `--bp-lg: 1024px`) and safe-area helpers (`env(safe-area-inset-*)`) are defined in `tokens.css` and applied consistently across components.
- [ ] **MOB-03**: At <768px the sidebar collapses into a `vaul` Drawer triggered by a hamburger in the topbar; backdrop tap and ESC dismiss; swipe-down closes; framer-motion `prefers-reduced-motion` is honored.
- [ ] **MOB-04**: At <768px every modal overlay (`CardDetailModal`, `AgentHarnessModal`, settings modals, plan-review modal) renders as a `vaul` BottomSheet with sticky header (close) and sticky footer (primary action); content scrolls between.
- [ ] **MOB-05**: At <768px the kanban board is a single-column pager — one column visible at a time with horizontal scroll-snap on the column container; vertical drag-to-reorder works inside a column.
- [ ] **MOB-06**: Cards expose a "Move to…" picker as a non-drag fallback for cross-column moves on every breakpoint; on touch devices the picker is the primary affordance for column changes.
- [ ] **MOB-07**: At <768px the chat surface stacks list/detail — the room list is the default view; selecting a room slides to messages; the back button returns to the list.
- [ ] **MOB-08**: The chat composer stays above the soft keyboard via the Visual Viewport API listener; the message list auto-scrolls to bottom when the composer gains focus.
- [ ] **MOB-09**: Every interactive element has a minimum 44×44pt touch target; an audit pass verifies every `.btn`, `.btn-icon`, drag handle, and link.
- [ ] **MOB-10**: Every `:hover` affordance has `:focus-visible` and `:active` parity; hover-only visual flourishes are gated by `@media (hover: hover) and (pointer: fine)`.
- [ ] **MOB-11**: Login, register, and settings pages render without horizontal overflow at 375×667; decorative pseudo-elements are clamped or hidden below `--bp-sm`.
- [ ] **MOB-12**: A PWA manifest with icons + theme colors ships in Phase 1; the app is installable to home screen on iOS Safari (Add-to-Home-Screen) and Android Chrome.
- [ ] **MOB-13**: A service worker + Web Push subscription pipeline fires push notifications for: @-mention in chat, card assigned, plan ready for review, run failed, run done; tapping a push deep-links to the relevant `/runs/[id]` or `/plans` route.
- [ ] **MOB-14**: Plan review, run-detail, and run revert are fully operable on phone — tap-to-approve, tap-to-revert, tap-to-cancel work without modal overflow or scroll-trap.

### M2P — Marketing-as-platform readiness (composition validation)

> No marketing code in M1. Verify the M2 surface remains composable; lock guardrail design.

- [ ] **M2P-01**: The plugin contract, skill loader, and agent template format have no breaking signature changes between M1 start and M1 end; a regression test asserts the contract is unchanged.
- [ ] **M2P-02**: One non-marketing example trio (e.g., a "Code Reviewer" agent template + skill pack + plugin tool) is built end-to-end through the existing contract; the example exists primarily as composition validation.
- [ ] **M2P-03**: A contract test verifies `CardPlan` carries a multi-step marketing-campaign brief — title + description + acceptance criteria — without M1 schema modifications.
- [ ] **M2P-04**: An anti-slop linter design note is written: voice-fingerprint deviation, cliché detection, "receipts required" rule (every claim must be referenced from the ledger).
- [ ] **M2P-05**: An anti-claim linter design note is written: every M2 output cross-checks claims against `PROJECT.md`'s Validated section before publishing; non-Validated claims block.
- [ ] **M2P-06**: A regression test verifies M1 changes preserve `ProjectSecret` and `ProjectMember` scoping — no cross-project secret access, no cross-tenant attribution leakage.

---

## v2 Requirements (deferred — research informed but out of M1)

- Container-query-driven component-level reflow inside variable-width containers (research-recommended; defer until M1 baseline lands)
- Run replay / time-travel inspection (Devin's killer feature; nice-to-have once ledger is mature)
- Operator-tier Langfuse UI as a first-class admin surface (P3 ships the underlying data; UI polish later)
- Agent cost budgets and project-level spend caps (REL-02 ships per-run cap; project-level capping is v2)
- `react-resizable-panels` desktop-only split-pane layouts for the run inspector
- Voice-to-task and lock-screen agent runs (Notion 3.2 style; v2)
- Multi-replica / horizontal scale for the scheduler tick (architectural ground laid by ledger; productization deferred)

---

## Out of Scope

> Carried from `PROJECT.md` Out of Scope plus research-driven exclusions.

- **In-app code editor** — firm. Coding integration ships work to GitHub / sandbox; not an in-IDE experience.
- **Coding ship-loop depth** — deferred to a future milestone after planning-loop trust is established.
- **Marketing capability code** — deferred to M2. M1 ships M2P composition validation only.
- **OpenClaw integration / pluggable runtime** — deferred. Native runtime sufficient for M1 needs.
- **Hosted SaaS / multi-tenant cloud** — deferred. Self-host first.
- **Linear/Jira-replacement product surface** (sprints, OKRs, roadmap UIs) — not now.
- **Slack-replacement features** (rich messenger polish beyond agent collaboration) — not now.
- **Horizontal scale** — single-replica PM2 only.
- **LangChain.js / LangGraph.js as runtime** — anti-pattern; conflicts with multi-provider parity.
- **Tailwind v4** — locked design system uses CSS variables + CSS Modules.
- **Separate `/m/` mobile route tree** — anti-pattern; defeats "agents see what humans see."
- **Auto-approve "trivial" plans** — anti-pattern; rubber-stamping erodes trust.
- **Auto-retry on auth/permission errors** — anti-pattern; classify and short-circuit.
- **Mid-run silent model fallback** — anti-pattern; explicit per-agent backend, fallback only at next-run boundary.
- **Headless-browser social automation** (M2 forecast) — API-only; conservative rate-limits; no scraping.

---

## Traceability

> Maps every v1 REQ-ID to exactly one phase. Mirrors `ROADMAP.md` Phase Details.

| REQ-ID | Phase | Notes |
|--------|-------|-------|
| RUN-01 | Phase 1 | `AgentTaskRun` row + heartbeat + `HarnessSnapshot` FK (plan 01-01) |
| RUN-02 | Phase 1 | `AgentRunEvent` append-only ledger writer (plan 01-01) |
| RUN-03 | Phase 1 | `buildHarness` deterministic refactor (plan 01-02) |
| RUN-04 | Phase 1 | `HarnessSnapshot` capture at run start (plan 01-02) |
| RUN-05 | Phase 1 | `RunDiff` structured before/after model (plan 01-01) |
| RUN-06 | Phase 1 | `instrumentation.ts` + OTel + Langfuse + commented `docker-compose.yml` (plan 01-03) |
| REL-01 | Phase 2 | Bounded retries with `p-retry` + `AbortSignal` (plan 02-01) |
| REL-02 | Phase 2 | Iteration cap + wall-clock budget + `cap_exceeded` event (plan 02-01) |
| REL-03 | Phase 2 | Tool-call idempotency via `WebhookIdempotency.tool:<name>` (plan 02-01) |
| REL-04 | Phase 2 | Subprocess watchdog + isolated `HOME` + boot-time reaper (plan 02-02) |
| REL-05 | Phase 2 | Tool-output quarantine envelope + classifier (plan 02-02) |
| REL-06 | Phase 2 | Run-mode flag on `AIAgent` (plan 02-03) |
| REL-07 | Phase 2 | Manual retry / re-run / cancel API + buttons (plan 02-03) |
| REL-08 | Phase 2 | "Stuck" self-escalation notification (plan 02-03) |
| REL-09 | Phase 2 | CONCERNS.md fixes (atomic move, encrypted keys, cross-tenant audit, Zod) (plan 02-04) |
| AUD-01 | Phase 3 | `/p/[projectId]/runs` list + filters (plan 03-01) |
| AUD-02 | Phase 3 | Run-detail timeline (`RunTimeline`) (plan 03-02) |
| AUD-03 | Phase 3 | Ledger-derived plain-language summary (plan 03-02) |
| AUD-04 | Phase 3 | Unified diff view with negative-space deletes (plan 03-03) |
| AUD-05 | Phase 3 | Two-tier logs (`activity` vs `trace`) (plan 03-04) |
| AUD-06 | Phase 3 | Redactor middleware + secret fuzz test (plan 03-04) |
| AUD-07 | Phase 3 | One-click revert via stored inverse-ops (plan 03-03) |
| AUD-08 | Phase 3 | Cost / token aggregation per run / agent / project (plan 03-01) |
| AUD-09 | Phase 3 | Sonner-based run lifecycle toasts (plan 03-04) |
| PLAN-01 | Phase 4 | `CardPlan` Prisma model + Zod step schema + `contentHash` (plan 04-01) |
| PLAN-02 | Phase 4 | `planning` built-in plugin (propose-only) (plan 04-02) |
| PLAN-03 | Phase 4 | `/p/[projectId]/plans` queue + `pending` transition (plan 04-03) |
| PLAN-04 | Phase 4 | Hash-bound approval enforcement (plan 04-01) |
| PLAN-05 | Phase 4 | Amendment cap (2 per run) + `amendment_cap_exceeded` (plan 04-02) |
| PLAN-06 | Phase 4 | Runtime refusal of out-of-plan tool calls (plan 04-02) |
| PLAN-07 | Phase 5 | Ghost-card rendering on kanban + atomic flip on approve (plan 05-02) |
| PLAN-08 | Phase 4 | Planner agent template (plan 04-04) |
| PLAN-09 | Phase 4 | `/plans` queue tiered-action UI (plan 04-03) |
| PLAN-10 | Phase 4 | False-approve telemetry counter in `/runs` aggregates (plan 04-04) |
| MOB-01 | Phase 1 | `<meta viewport>` declaration on every page (plan 01-04) |
| MOB-02 | Phase 1 | `tokens.css` breakpoint + safe-area helpers (plan 01-04) |
| MOB-03 | Phase 1 | Sidebar → vaul Drawer at <768px (plan 01-04) |
| MOB-04 | Phase 1 | Modals → vaul BottomSheet at <768px (plan 01-04) |
| MOB-05 | Phase 5 | Kanban single-column pager with scroll-snap (plan 05-01) |
| MOB-06 | Phase 5 | "Move to…" non-drag fallback picker (plan 05-01) |
| MOB-07 | Phase 5 | Chat list/detail stack at <768px (plan 05-01) |
| MOB-08 | Phase 5 | Visual Viewport composer over soft keyboard (plan 05-01) |
| MOB-09 | Phase 3 | 44×44pt touch-target audit pass (plan 03-05) |
| MOB-10 | Phase 3 | `:hover` / `:focus-visible` / `:active` parity audit (plan 03-05) |
| MOB-11 | Phase 3 | Login / register / settings no-overflow at 375×667 (plan 03-05) |
| MOB-12 | Phase 1 | PWA manifest + installable to home screen (plan 01-04) |
| MOB-13 | Phase 5 | Service worker + Web Push pipeline + deep links (plan 05-03) |
| MOB-14 | Phase 5 | Tap-to-approve / tap-to-revert / tap-to-cancel on phone (plan 05-03) |
| M2P-01 | Phase 6 | Plugin / skill / template contract regression test (plan 06-01) |
| M2P-02 | Phase 6 | Code Reviewer example trio composed end-to-end (plan 06-01) |
| M2P-03 | Phase 6 | `CardPlan` carries marketing-campaign brief (contract test) (plan 06-01) |
| M2P-04 | Phase 6 | Anti-slop linter design note (plan 06-02) |
| M2P-05 | Phase 6 | Anti-claim linter design note (plan 06-02) |
| M2P-06 | Phase 6 | Per-project secret + attribution scoping regression (plan 06-02) |

**Coverage:** 54 / 54 v1 requirements mapped to exactly one phase. No orphans, no duplicates.

| Phase | Requirement count |
|-------|-------------------|
| 1 | 11 (RUN-01..06, MOB-01..04, MOB-12) |
| 2 | 9 (REL-01..09) |
| 3 | 12 (AUD-01..09, MOB-09..11) |
| 4 | 9 (PLAN-01..06, PLAN-08..10) |
| 5 | 7 (PLAN-07, MOB-05..08, MOB-13, MOB-14) |
| 6 | 6 (M2P-01..06) |
| **Total** | **54** |

---

*Last updated: 2026-05-01 after roadmap creation.*
