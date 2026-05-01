# Research Synthesis — Co-Op M1 + M2 Forecast

**Project:** Co-Op
**Domain:** Agent-as-teammate workspace (brownfield) — M1 trust foundation, M2 marketing-as-platform
**Researched:** 2026-05-01
**Confidence:** MEDIUM-HIGH overall

**Files synthesized:**
- `.planning/PROJECT.md`
- `.planning/research/STACK.md`
- `.planning/research/FEATURES.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`

---

## Project Snapshot

Co-Op is a self-hostable workspace where humans and AI agents share the same kanban, chat, and card surfaces — agents as first-class teammates, not bolt-on assistants. The codebase already ships shared-surface primitives (boards/cards/chat, plugins, scheduler, GitHub App, multi-provider runtimes, `SOUL.md` voice). **Milestone 1** turns *"agents can act"* into *"agents can be trusted to act"* across four directions: agent-run reliability, visibility/audit, planning-loop tooling (propose → approve → execute), and mobile-friendly UI at ≥375px. The M1 inflection target is **"co-op runs co-op"** — the user trusts the planning loop enough to drive co-op's own work through it. **Milestone 2** is marketing-as-platform: drafts/posts/listen-respond shipped as **plugin + skill + agent template** so any project gets the chops; deferred but architecturally pre-figured.

---

## Convergence — what all four researchers agree on

- **Run/AgentRunEvent is the keystone.** A first-class `AgentTaskRun` header + append-only `AgentRunEvent` ledger + `HarnessSnapshot` is the single foundation that reliability, visibility, planning, mobile push, *and* M2 marketing all depend on. Phase 1 must establish it.
- **Reliability ships first.** No planning loop or visibility surface is trustworthy without bounded retries, hard iteration cap, idempotency, deterministic harness, subprocess watchdog, and tool-output quarantine.
- **Plan-as-data, not plan-as-prose.** The plan is a structured `CardPlan` row (`status: draft|pending|approved|rejected|applied|superseded`) with ordered steps + acceptance, NOT a Markdown comment, NOT a "Proposed" kanban column. Approval is a hash-binding contract; the runtime refuses tool calls outside the approved set. Plan amendments are explicit re-approval, capped at 2 per run.
- **Plan = card decomposition is the differentiating bet.** No competitor (Devin, Cursor Plan Mode, Sweep, Linear Agent, Copilot Workspace) ships plans natively as kanban cards. Plan steps render as ghost cards on the board; approve flips them to real subtasks.
- **Mobile = single responsive route tree.** One URL space, breakpoint-driven layout swap (desktop kanban / mobile single-column pager; sidebar → Drawer; modals → BottomSheet). A separate `/m/` tree is an explicit anti-pattern.
- **Touch DnD via `@hello-pangea/dnd` long-press, with non-drag fallback.** Tune `touchAction: 'manipulation'` on drag handles, `overscrollBehavior: 'contain'` on columns, ship a "Move to…" picker as the always-available fallback. On small screens, paginate columns and drag vertically only.
- **Hard kill the anti-features in code, not policy:** infinite retry, auto-retry on auth/permission errors, mid-run model fallback, auto-approve "trivial" plans, edit-history mutation of activity log, agent self-amending plans without re-approval, hover-only affordances, headless-browser social automation (M2).
- **Self-host story holds.** Langfuse self-hosted, OpenTelemetry GenAI semconv, no AGPL backends, no hosted SaaS, single-replica PM2 + in-process scheduler is fine for M1; the event-ledger unblocks future multi-replica without rewriting the runner.
- **Append-only audit, two-tier logs.** Activity log = human-facing, no payloads, indefinite. Operator trace = full payloads, redacted by default, 7–14d retention. Summaries generated from ledger, not chat trace.

---

## Divergence — open trade-offs and resolutions

### D1. Mobile placement in the phase order

| Source | Position |
|---|---|
| Features | "Mobile is gated by push, not by layout" — both must land in M1 together |
| Architecture | "Responsive single-tree, primitives early" — mobile primitives before run-timeline / plan-review |
| Pitfalls | "Mobile is independent of backend, low risk; can ship anytime after backend is stable" |

**Resolution:** **Mobile primitives ship parallel to Reliability (Phase 1)**, *consumed* by every subsequent UI surface. **Push notifications ship in the same phase as the planning-loop UI (Phase 4)** because push deep-links into plan/run review surfaces. Confidence: HIGH.

### D2. Phase ordering

Three sequences all converge on "ledger first, reliability second." **Resolution:** Five canonical phases (below). Visibility (P3) and Planning (P4) are sequential rather than parallel — they share the run-detail page, and the dogfood-cadence constraint favors smaller serialized phases over coordinated parallel ones for a solo dev. Confidence: MEDIUM-HIGH.

### D3. Planning-loop surface placement

Convergence on `CardPlan` model + badge + `/plans` queue. **Resolution:** Land `CardPlan` + queue + approval enforcement first (sub-phase 4a, testable without DnD); ghost-card rendering on the board second (sub-phase 4b). Confidence: HIGH.

### D4. Tool-call retries — where they live

**Resolution:** Retries live in the runner's tool-dispatch wrapper (`p-retry` + `AbortSignal`); plugin handlers throw on transient failure; the wrapper decides policy and emits `retry` events. Iteration cap (15–25) and token/wall-clock budgets in same wrapper. **No per-handler try/catch retry loops.** Confidence: HIGH.

### D5. Stack: net-new dependency budget

**Resolution:** Take Stack's full list except `react-resizable-panels` (defer). Hand-roll BottomSheet/Drawer per Architecture; reach for `react-modal-sheet` only if hand-roll proves leaky. Strict additive-only. Reuse `WebhookIdempotency` (existing) for tool-call idempotency keys. Confidence: HIGH.

### D6. M2 readiness — what M1 must not foreclose

**Resolution:** Phase 5 (M2 spec/handoff) ships *no marketing code* but: (a) validates three-layer composition by adding one non-marketing example agent template + skill set wired through the plugin contract; (b) drafts anti-slop / anti-claim linter shapes as design notes; (c) confirms `CardPlan` is generic enough to carry a marketing campaign. Confidence: MEDIUM-HIGH.

---

## Recommended Phase Shape (canonical)

### Phase 1 — Run-lifecycle plumbing + mobile primitives (parallel)
- **Goal:** Establish keystone (`AgentTaskRun` header, `AgentRunEvent` ledger, `HarnessSnapshot`, refactored `agentHarness.ts` with pure `buildHarness` + `snapshotHarness`). In parallel, mobile UI primitives.
- **Hard prerequisites:** None.
- **Key pitfalls defused:** Sets up surface for 1, 2, 3, 4, 6, 7, 14. Defuses 13 via reset-and-onboard drill at exit.
- **Key stack additions:** `@vercel/otel`, `@opentelemetry/api`, `langfuse` (registered), `zod` (event payload typing), `vaul` (BottomSheet primitives).
- **Deliverables:** Prisma deltas (`AgentRunEvent`, `HarnessSnapshot`, `RunDiff`; nullable `AgentTaskRun.{summaryMd, heartbeatAt, harnessSnapshotId}`); `src/lib/{runEvents, runDiffs, runHeartbeat}.ts`; `agentHarness.ts` split; `instrumentation.ts`; `src/components/mobile/{Drawer, BottomSheet, MobileNav, useVisualViewport}.tsx`; `src/styles/breakpoints.css`; Sidebar + CardDetailModal adopt mobile primitives at <768px.

### Phase 2 — Reliability hardening
- **Goal:** Deterministic, bounded, idempotent, recoverable agent runs.
- **Requirements covered:** Active item "Agent-run reliability."
- **Hard prerequisites:** Phase 1.
- **Parallelizable with:** Mobile responsive passes on existing pages (auth, settings, dashboard).
- **Key pitfalls defused:** **1** (loop cap + budgets + tool-thrash guard), **2** (envelope + capability mediation + classifier), **3** (subprocess watchdog + per-run isolated `HOME` + reaper sweep), **4** (optimistic concurrency + atomic move reindex), **14** (run-mode flag, snapshot-before-mutation, `co-op-build` vs `co-op-meta` namespaces).
- **Key stack additions:** `p-retry`, `zod` (route + tool schemas), Langfuse wrappers around Anthropic/OpenAI calls.
- **Deliverables:** `agentRunner.ts` extended with `wrapIdempotent`, bounded retries, iteration cap, token/wall-clock budgets; `runResumer.ts`; subprocess watchdog with per-run `HOME` + working-dir smoke tests; "I'm stuck" escalation; tool-output quarantine envelope; run-mode flag on `AIAgent`; manual retry/re-run/cancel API + buttons; CONCERNS.md fixes (atomic move reindexing, plaintext-key encryption, cross-tenant route checks, schema validation on every mutating route).

### Phase 3 — Visibility / Audit surfaces
- **Goal:** Humans can scan a run and trust what they see.
- **Requirements covered:** Active item "Agent visibility / audit."
- **Hard prerequisites:** Phase 1 (ledger), Phase 2 (idempotency keys).
- **Parallelizable with:** Continued mobile responsive passes on chat and agents pages.
- **Key pitfalls defused:** **6** (ledger-derived summaries + diff verification + two-column UI), **7** (two-tier logs + redactor + sensitivity tags), **8** (run-scoped diff with negative-space + side-effect badges + reject = revert).
- **Key stack additions:** `diff` + `diff2html` + `shiki`, `sonner`, Langfuse trace UI as operator-tier surface.
- **Deliverables:** `/p/[projectId]/runs` routes; `runAuditDigest.ts`; `RunTimeline / RunDiffCard / RunSummaryHeader`; redactor middleware + secret fuzz test; per-run cost/token visibility; card-level diff with negative-space rendering; one-click revert via inverse-op record; reset-and-onboard drill at exit.

### Phase 4 — Planning loop + mobile push
- **Goal:** Close the dogfood loop. Agent proposes → human reviews on phone → tap-approve → agent executes within approved set. M1 inflection target.
- **Requirements covered:** Active item "Planning-loop tooling" + completes "Mobile-friendly UI" (push).
- **Hard prerequisites:** Phases 1, 2, 3.
- **Parallelizable with:** Nothing.
- **Key pitfalls defused:** **5** (plan-as-data + hash-bound approval + amendment cap), **8** sub (plan-execution diff), **9** (tiered actions + batched approval + no confidence scores + false-approve metric), **10/11/12** (touch affordances + iOS keyboard + DnD scroll-trapping with non-drag fallback), **14** sub (run-mode flag honored end-to-end).
- **Key stack additions:** `zod` for `CardPlan.stepsJson`, Web Push API + service worker, `vaul` for plan-review BottomSheet, `sonner` for approval toasts.
- **Deliverables (4a):** `CardPlan` model; `planning/{proposeCardPlan, planSchema, applyApprovedPlan}.ts`; `plugins/builtin/planning.ts` (`propose_card_plan`, `update_card_plan`); `/api/plans/*`; `/p/[projectId]/plans` queue + `PlanReviewModal`. **(4b):** Ghost-card rendering on kanban. **(Push):** PWA manifest + service worker; Web Push for mention/assigned/plan-review/run-failed/run-done; tap-to-approve UX; mobile-aware notification routing; approval-fatigue mitigations; reset-and-onboard drill at exit.

### Phase 5 — M2 spec/handoff (composition validation)
- **Goal:** Confirm M1's plugin/skill/agent-template composition is M2-ready; lock M2 guardrail shapes.
- **Hard prerequisites:** Phases 1–4.
- **Key pitfalls pre-figured:** **15** (anti-slop linter spec), **16** (API-only social posting + warmup), **17** (per-project UTM), **18** (anti-claim linter against PROJECT.md Validated).
- **Deliverables:** One non-marketing example (e.g., Code Reviewer template + skill pack + plugin tool) composed end-to-end through existing contract; M2 spec doc (layered composition contract, linter specs, social-platform integration, per-project attribution); confirmation `CardPlan` carries a marketing campaign generically; final reset-and-onboard drill; M1 marked complete.

### Research flags (phase-level)

| Phase | Needs `/gsd-research-phase`? | Why |
|---|---|---|
| 1 | No | Well-trodden patterns |
| 2 | **Yes** | Subprocess watchdog (CLI gotchas evolve), tool-output classifier, run-mode flag enforcement |
| 3 | Maybe | Card-level structured diff rendering; ledger-derived summary prompting |
| 4 | **Yes** | Web Push self-hosted Next.js + iOS Safari quirks; ghost-card rendering on `@hello-pangea/dnd`; tiered-approval UX |
| 5 | No | Spec phase, synthesis only |

---

## Stack Additions (deduplicated)

Versions verified via npm registry on 2026-05-01.

| Package | Version | What for | Confidence | Phase introduces |
|---|---|---|---|---|
| `langfuse` | `^3.38.20` | LLM/agent run tracing; Anthropic + OpenAI native wrappers | HIGH | P1 (registered) → P2 (wraps every call) → P3 (operator-tier UI) |
| `@opentelemetry/api` | `^1.9.1` | OTel GenAI semconv span schema | HIGH | P1 |
| `@vercel/otel` | `^2.1.2` | Next.js 16 `instrumentation.ts` integration; self-host via `OTEL_*` envs | HIGH | P1 |
| `zod` | `^4.4.1` | Runtime validation of LLM structured outputs, route + tool schemas; native JSON Schema export | HIGH | P1 → P2 → P4 |
| `p-retry` | `^8.0.0` | Bounded exponential-backoff with `AbortSignal` | HIGH | P2 |
| `vaul` | `^1.1.2` | Mobile bottom-sheet / drawer; React 19 peer-dep | HIGH | P1 |
| `sonner` | `^2.0.7` | Toast notifications (run-completed/retry/approval-needed) | HIGH | P3 → P4 |
| `diff` (kpdecker) | `^9.0.0` | Diff engine | HIGH | P3 |
| `diff2html` | `^3.4.56` | Render unified-diff HTML; SSR-friendly | HIGH | P3 |
| `shiki` | `^4.0.2` | Syntax highlighting in diff panels; works in RSC | HIGH | P3 |
| `react-resizable-panels` | *defer* | Split-pane layouts (desktop only) | n/a | Skip P3 unless needed |

**Plan-and-execute pattern:** Built natively in TypeScript on existing plugin contract — **no LangChain/LangGraph**. Conflicts with locked multi-provider parity. Revisit Inngest only if durable-execution complexity grows.

**Reuse, don't add:** `WebhookIdempotency` (existing) is the table for tool-call idempotency keys with new scope value `tool:<toolName>`.

---

## Anti-patterns (deduplicated)

What NOT to add, with reasoning:

- **LangChain.js / LangGraph.js as runtime** — conflicts with multi-provider parity → native TS plan/execute on existing plugin layer
- **Tailwind v4** — locked design system uses CSS variables + CSS Modules → continue with `tokens.css` + media + container queries
- **`react-spring`** — doubles animation runtime alongside `framer-motion` → Vaul's gesture physics or framer-motion `drag`
- **`react-query` for one feature** — codebase has zero global state → plain `fetch` + `useState`/`useEffect`
- **`xstate` for planning state machine** — heavy for 4-state lifecycle → Postgres `CardPlan.status` enum + transition guards
- **`react-diff-viewer`** — last release 6 years ago, no React 19 → `diff2html`
- **Run state on `AgentTaskRun` mutable columns** — write contention, lost ordering → append-only `AgentRunEvent` ledger
- **Reading clock/DB inside `buildHarness`** — resumes produce different prompts → pass `now: Date` and pre-fetched context
- **Plans as comments / Markdown blobs** — no structure, no status, no revisions → structured `CardPlan` with explicit lifecycle
- **Synthetic "Proposed" kanban column** — conflates work-state with plan-state → plan as a card *badge* + `/plans` queue
- **Separate `/m/` mobile route tree** — doubles maintenance, breaks shared links, defeats "agents see what humans see" → one responsive tree
- **Per-tool ad-hoc retries inside handlers** — inconsistent semantics, missing events → retries in *one place* (runner's wrapper)
- **Long-distance horizontal drag on phone kanban** → single-column pager + vertical drag + "Move to…" picker
- **Hover-only affordances** → persistent visible affordances; flourishes gated by `@media (hover: hover) and (pointer: fine)`
- **Edit-history mutating activity log** → append "annotation" rows; never mutate
- **Auto-approve trivial plans** → keep the gate; make small plans fast, not skipped
- **Auto-retry on auth/permission errors** → classify and short-circuit; surface "fix in settings"
- **Mid-run silent model fallback** → explicit per-agent backend; fallback only at next-run boundary, always logged
- **Infinite retry until success** → bounded retries (≤5) + escalate-to-human
- **Headless-browser social automation** (M2) → API-only; conservative rate-limits; project accounts only; warmup
- **Raw-JSON-only activity log / per-token activity rows / chain-of-thought dumps** → structured tool-call/result pairs with collapsible raw view

---

## Pitfall density by phase

### Phase 1
- **13** (dogfood blindness, SERIOUS) — reset-and-onboard drill at exit
- Sets up substrate for 1, 2, 3, 4, 6, 7, 14

### Phase 2
- **1** (unbounded loop / cost runaway, **CRITICAL**) — iteration cap test; cost-per-run bounded; tool-thrash guard
- **2** (indirect prompt injection, **CRITICAL**) — planted injection ignored; envelope present; capability budget per run
- **3** (CLI subprocess zombies, **CRITICAL**) — `ps` shows zero zombies post-kill; reaper on boot; per-run isolated `HOME`; cwd smoke test
- **4** (stale tool state, SERIOUS) — concurrent-move test; `409 STALE` retry with fresh state; atomic move reindex
- **14** (dogfood paradox, **CRITICAL**) — run-mode flag enforced; snapshot-before-mutation; rollback works; namespacing
- CONCERNS.md fixes (mixed): plaintext keys, cross-tenant routes, schema validation, atomic moves

### Phase 3
- **6** (run-summary hallucination, SERIOUS) — sample 10 runs; assert claims appear in ledger
- **7** (audit log leakage / over-logging, **CRITICAL on leakage**) — redactor fuzz test; two-tier logs; sensitivity tags
- **8** (misleading diff views, SERIOUS) — run touching 5 entities → diff shows all 5; revert restores all 5; side-effect badges
- **13** recurring drill at exit

### Phase 4
- **5** (plan drift, **CRITICAL**) — tool call not in approved plan rejected; amendment cap (2/run); manual review of 20 runs
- **8 sub** (plan-execution diff, SERIOUS)
- **9** (approval-fatigue rubber-stamping, SERIOUS) — tiered actions in code; batched at run boundaries; no confidence scores; false-approve metric
- **10** (hover-only on touch, SERIOUS) — `:hover` audit; persistent ≥44pt drag handle; flourishes gated
- **11** (iOS keyboard, SERIOUS) — iPhone real-device test of card detail / chat / comment / picker; `dvh` + `useVisualViewport` + safe-area
- **12** (touch DnD scroll-trapping, SERIOUS) — drag handle separate from body; "Move to…" non-drag fallback
- **13** recurring drill
- **14 sub** (CRITICAL) — run-mode flag honored end-to-end through plan approval

### Phase 5
- **13** final drill — M1 marked complete in PROJECT.md
- **15** (M2 generic AI slop, SERIOUS-design) — anti-slop linter spec drafted
- **16** (M2 social-posting bans, CRITICAL-design) — API-only; rate-limit defaults; warmup gating
- **17** (M2 attribution loss, SERIOUS-design) — per-project UTM schema
- **18** (M2 claim drift, SERIOUS-design) — anti-claim linter spec against PROJECT.md Validated

---

## Open questions for the roadmapper

1. **Scope of CONCERNS.md fixes inside Phase 2** — own sub-phase ("Phase 2a: brownfield safety") or interleaved into Phase 2?
2. **PWA scope** — manifest in Phase 1's mobile primitives track, or Phase 4 alongside push? (Pragmatic split: manifest P1, push P4.)
3. **Friend-test cadence frequency** — drill at every phase exit means four drills in M1. Solo dev — recruit outside testers, or personal "fresh terminal, fresh DB" exercise?
4. **Run-mode flag granularity** — `read-only / propose-only / propose-and-execute` per-agent, per-project, or both?
5. **Ghost-card DnD interaction (sub-phase 4b)** — can ghost cards be drag-reordered before approval? Concurrent human DnD on real cards in same column?
6. **Langfuse default** — opt-in or opt-out? If on by default, add to `docker-compose.yml` in Phase 1.
7. **Inverse-op record format** — per-tool, per-`RunDiff`, structured undo? Needs a design pass before Phase 3 starts coding.
8. **Phase 5 example template choice** — Code Reviewer, Docs Writer, or On-Call Triage?

---

## What M1 must NOT foreclose (for M2)

1. **Plugin contract shape stays unchanged.** M2's `marketing` plugin (post-to-X, draft-blog, schedule-post) registers through the same `Plugin` interface.
2. **Skill loader (ClawHub-compatible) stays generic.** No M1-specific assumptions in the loader; M2 ships marketing skill packs through it.
3. **Agent template format supports marketing personas.** Template = `Partial<AIAgent>` + skill list + plugin allowlist; carries marketing-lead, copywriter, community-manager unchanged.
4. **`CardPlan` is generic.** Steps typed `{ title, description, acceptance, suggestedAssigneeAgentId? }` — no kanban-only assumptions. Marketing campaign brief is structurally a multi-step plan; M2 reuses `CardPlan` and `/p/[projectId]/plans`.
5. **Approval surface is the M2 reuse target.** Plan-approve UX is *the* approval flow for M2's "draft post → human approves → posts." Don't fork.
6. **`SOUL.md` and project-level `BRAND.md` remain readable by harness.** M2 marketing skills consume `SOUL.md` (voice) and `BRAND.md` (style guide); harness assembly supports loading additional per-project markdown without regression.
7. **Run reliability + observability + diff = M2's safety net.** M2's posting/listening loops are side-effect-heavy (banned account = irreversible). They reuse M1's bounded retries, idempotency keys, run-scoped diff, and revert.
8. **Validate with non-marketing example in Phase 5.** One full plugin + skill + template trio (e.g., Code Reviewer) confirms composition before M2 commits to specifics.
9. **Anti-slop and anti-claim linter shapes pre-specified.** Phase 5 produces design notes (not code) for: (a) anti-slop — voice-fingerprint deviation, cliché detection, receipts required; (b) anti-claim — outputs cross-checked against `PROJECT.md` Validated section.
10. **Per-project secret + attribution isolation at the project layer.** `ProjectSecret` + `ProjectMember` scoping should already cover this — verify no M1 work erodes per-project isolation.

---

## Confidence Assessment

| Area | Confidence | Notes |
|---|---|---|
| Stack | HIGH | Versions npm-verified 2026-05-01; React 19 + Next.js 16 compat confirmed; explicit anti-patterns named |
| Features | MEDIUM-HIGH | Multiple primary sources per claim across 13 platforms; some mobile details partly marketing-page sourced |
| Architecture | MEDIUM-HIGH | HIGH on run-reliability/observability/mobile; MEDIUM on planning-loop placement |
| Pitfalls | MEDIUM-HIGH | HIGH on agent-loop, prompt injection, iOS keyboard, Claude Code subprocess; MEDIUM on planning-loop UX, dogfood, M2 forecast |

**Overall:** MEDIUM-HIGH. Dependency graph is unambiguous; phase ordering is canonical given "ledger is keystone" agreement; differentiating bet (plan = card decomposition) is feature-research consensus; M2 composability story is architectural consensus.
