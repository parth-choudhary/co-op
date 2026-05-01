# Feature Research

**Domain:** Agent-as-teammate workspace (M1 reliability/visibility/planning/mobile + M2 marketing-as-platform)
**Researched:** 2026-05-01
**Confidence:** MEDIUM-HIGH (multiple primary sources per claim; some platform-specific details only in marketing pages and community write-ups)

## Scope of this research

Co-op already has the shared-workspace primitives (boards, cards, chat, agents, plugins, scheduler, GitHub App). M1 is about turning *"agents can act"* into *"agents can be trusted to act"* — reliability, visibility, planning loop, mobile review. M2 (deferred) is marketing as a reusable plugin/skill/template stack.

The feature landscape below is benchmarked against the platforms named in the milestone brief: **Devin, OpenHands, Sweep, Cline, Cursor (Background Agents + Plan Mode), Replit Agent, Lovable, v0, Charm Crush, Linear (Agent + Code Reviews), Notion Agent, Sourcegraph Cody, Aider**, plus mobile-first tools (Nimbalyst, Taskade, ClawSwarm) and the agentic UX patterns literature.

---

## Feature Landscape

### 1. Agent-Run Reliability Surfaces

#### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| **Auto-retry transient LLM/tool errors with exponential backoff** | Every serious agent (OpenHands, Devin, Cursor) silently retries 429/5xx/timeouts. Without it, runs flake on rate limits and look broken. | M | OpenHands' default is ~184s total wait across 5 retries (8/16/32/64/64). Distinguish *transient* (rate limit, timeout, connection reset) from *non-retriable* (auth, malformed action, logic error). Co-op already has this partially in `agentRunner.ts` — audit and tighten. |
| **Configurable run timeout with surfaced cause** | Agents can hang indefinitely on stuck tool calls (documented bug class in OpenHands). Without a timeout, dogfood loops can wedge for hours on a model API stall. | S | Wall-clock timeout per run, plus per-tool-call timeout. Surface "timed out after X" not just "failed". |
| **Visible run state: queued / running / paused / failed / done** | Replit, Devin, Cursor all show this. Without it, the human can't tell "it's still working" from "it died 20 min ago". | S | Already partially implemented in `CardActivity` — needs explicit status enum on the agent run itself, not just on the activity row. |
| **Last-error message visible without digging into logs** | Replit Console exposes errors with one-click "Ask AI to fix"; Cursor surfaces errors in the chat strip. Buried errors = dead runs. | S | Render the last error inline on the card/agent view. |
| **Manual retry / re-run / cancel buttons** | Universal in Devin/Cursor/Replit/Sweep. The user must be able to say "try that again" or "stop, you're going in circles" without editing the database. | S | Re-run = new run from same prompt; retry = resume failed run. Both needed. |
| **Idempotent tool calls / safe re-execution** | Without idempotency, retries duplicate writes (double-create cards, double-post comments). This is a class of subtle bugs that erodes trust fast. | M | Audit each plugin tool: kanban (create vs upsert), coding (branch reuse), shell (no implicit retries), scheduler (dedupe job IDs). |

#### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| **Checkpoint/resume from partial work** | Microsoft Agent Framework, LangGraph, and the eunomia checkpoint literature treat this as the next reliability frontier. Most coding agents (Cursor, Sweep, Devin) currently re-do work on failure. Co-op's event-sourced activity log is half the foundation already. | L | Save tool-call boundaries as resumable checkpoints; on retry, replay state and skip completed tool calls. Pairs naturally with idempotency. |
| **"I'm stuck" escalation** (agent self-flags need for human) | Hatchworks/agentic-design.ai pattern: after N retries on the same tool with the same error, agent must stop and post a "stuck on X, need human" message. Most platforms don't do this; they just keep burning tokens. | S | Detect repeated identical tool errors → post a structured "blocked" message → notify, halt run. Cheap to add, big trust win. |
| **Deterministic harness assembly (snapshot of system prompt + soul + memory + tools at run start)** | Implied by co-op's existing `agentHarness.ts`. Pin the harness blob to the run record so a re-run is reproducible even if `SOUL.md` was edited mid-run. Few competitors do this — it's a co-op-shaped move because co-op exposes the harness as a first-class thing. | M | Hash + persist the assembled harness; show "harness was edited mid-run" warning if the live harness drifted. |
| **Structured failure taxonomy** (auth / rate-limit / tool-error / model-refusal / timeout / stuck-loop) | Lets the UI show different recovery affordances per type. Cline Enterprise hints at this; most don't surface it. | M | Classify in the runner; render category-aware error cards (e.g. rate-limit → "wait + retry", auth → "fix key in settings"). |

#### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| **Infinite retry until success** | "Just keep trying!" feels obviously right. | Burns tokens, masks real failures, can lock a card forever, and infinitely retried bad tool calls can cause real damage (duplicate PRs, repeated emails). | Bounded retries (≤ 5) + escalate-to-human on N-th identical failure. |
| **Auto-retry on auth/permission errors** | Same retry button works for everything else. | These never fix themselves. Retrying just delays the real fix and can trigger account lockouts. | Classify and route: auth/permission errors short-circuit the retry loop and surface a "fix this in settings" card. |
| **Silent fallback to a different model on failure** | "If Anthropic is down, use OpenAI" sounds nice. | The agent's behavior changes silently — different tool support, different reasoning style. Bug reports become impossible. Mid-run model swaps are documented foot-guns in the agentic UX literature. | Explicit per-agent backend selection; fallback only at next-run boundary, never mid-run, and always logged. |

---

### 2. Agent Run Audit (Visibility / What Did the Agent Actually Do?)

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| **Per-run activity log (every tool call + result)** | Devin's Progress tab, Cursor's chat strip, Cline's step list, Replit's Console — all do this. Without it, agents are black boxes. | M | Co-op already has `CardActivity` and a per-agent activity log. M1 needs to elevate *run-level* logs (group activities by run, show clean tool-call/result pairs). |
| **Diff view of files/cards/state the agent changed** | Aider (git-commit-per-change), Cursor, Lovable Agent Mode, Sweep, Linear Code Reviews all show this. "What changed?" is the first question every reviewer asks. | M | For coding work: lean on git/PR diffs. For *kanban* work (the M1 dogfood case): card-level structured diffs (title before/after, column moves, new subtasks, comment additions). This is a co-op-shaped surface. |
| **Plain-language run summary** | Devin posts "Here's what I did: 1) ... 2) ..."; Lovable surfaces summaries alongside diffs; Cody auto-summarizes PRs. The human shouldn't have to read 200 tool-call lines to understand the result. | M | Generate at end of run from the run's tool-call sequence. Use the agent's own model. Persist as part of the run record. |
| **Linkable run records** | Each run has a stable URL/permalink. Devin sessions, Replit Agent runs, Cursor agent threads — all linkable. Critical for debugging conversations and chat-thread references. | S | Add `/p/[projectId]/runs/[runId]` route. |
| **Filter activity log by actor (which agent) and by run** | When 3 agents and 2 humans touched a card, the timeline becomes unreadable without filters. | S | Add filter chips on existing activity log. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| **Time-travel / step-through replay of a run** | Devin's Progress tab lets you click any step and see shell/IDE/browser state at that moment. Replay.io built a whole MCP product around it. Few platforms ship this — and co-op's event-sourced activity log makes it cheaper to add than for most. | L | Group activities into a temporal index; clicking step N shows the harness + memory + last tool result at that point. M1 can ship a *read-only* version (jump to step → render context) without true forking. |
| **Card-level "what this agent changed" diff** | Linear Code Reviews ships *structural* diffs for human-and-agent output as a single review surface. Co-op's polymorphic CardMember/CardActivity model maps onto this naturally. Differentiator vs. Linear because co-op has the agent's *reasoning* alongside the diff. | M | Render an "Agent did: …" panel on each card showing all changes attributed to the agent during a single run. |
| **Diff annotations / inline comments on agent output** | Diffx, Linear Code Reviews, and Cursor's "Review → Find Issues" all let the human leave comments inline that get fed back to the agent for fixes. | M | Hook into existing comments + plugin contract: a comment on an agent-authored row becomes a tool-callable revision request. |
| **Run-level cost/token visibility** | Cline shows token + $ cost; Cursor shows context-window usage. Self-host users especially want this — it's their own bill. | S | Capture `usage` from each model call, sum per run, display on the run record. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| **Raw-JSON-only activity log** | Easy to ship, "fully auditable". | Unscannable. Mobile-hostile. Trains the user to ignore the log. | Structured tool-call/result pairs with collapsible raw view. |
| **One activity row per token / chain-of-thought dump** | Maximum transparency feels safer. | Drowns the signal. Devin and Cursor both deliberately hide raw CoT and surface tool calls + summaries instead. | Tool-call granularity + optional "show reasoning" expand. |
| **Edit-history that mutates the activity log** | Lets you "clean up" noisy runs. | Destroys auditability. The whole point of the log is that it's append-only. | Append "annotation" rows; never mutate. |

---

### 3. Planning-Loop UX (Propose → Approve → Execute)

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| **Explicit "plan" artifact, separate from execution** | Devin Interactive Planning, Cursor Plan Mode, Copilot Workspace plan specs, Sweep's plan-comment, Linear Agent's planning skill — all converged on this. The plan is its own object: a structured list, often a Markdown file, distinct from the run that executes it. | M | Add a `Plan` model (or a typed plan card type). Structure: ordered steps, each linkable to a downstream card or tool call. |
| **Plan editing / step reorder / step removal before approval** | Devin lets you edit/reorder/approve each step. Cursor + Copilot Workspace ship inline plan editors. Without this, "review plan" is just a yes/no gate. | M | Drag-reorder + edit-in-place on plan steps. Co-op's existing kanban DnD primitives transfer cleanly. |
| **Approve-then-execute gate (agent does not act on the plan until human says go)** | Devin's "Planning Checkpoint" + "PR Checkpoint" two-gate model is now the canonical pattern. Copilot Workspace, Cursor Plan Mode, Sweep all enforce it. | S | Plan record has explicit `status: draft / awaiting-review / approved / rejected`; agent runner refuses to execute non-approved plans. |
| **Plan grounded in repo/backlog citations** | Devin generates "plans with repo citations"; Cursor shows file paths + code outlines in plans. Without grounding, plans are hallucinated lists. | M | Each plan step references existing card IDs / file paths / commit SHAs. The plan generator must read the backlog (already a co-op plugin). |
| **Re-plan / iterate on the plan with feedback** | "This plan is wrong, try again" is essential. Cursor + Devin both support iterative re-planning in the same session. | S | Plan revisions chained to the same root request. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| **Plan = card decomposition** (the plan is itself kanban cards) | Co-op-shaped move: instead of a separate Markdown plan, the agent's plan *is* a tree of proposed cards (parent + subtasks). Approval = "convert to real cards". This makes the plan natively reviewable in the surface humans already use, on mobile, on phone. None of Devin/Cursor/Sweep do this — they treat plans as a sidebar artifact. Linear Agent gestures at it but ships Markdown specs. | M | Plan steps render as ghost-state cards on the board; approve → flip to real cards; reject → remove. The dogfood loop *is* this. |
| **Multi-agent planning collaboration** (PM agent proposes, Dev agent reviews) | Co-op already has multiple agents per project. The planning loop can be agent-on-agent: PM agent decomposes, Dev agent flags missing cards, human approves the consolidated plan. ClawSwarm and Notion Agent gesture at this; no one has shipped it well. | M | Reuse the existing event subscription (card created → agent reacts) for plan-step-added events. |
| **Plan-level cost estimate** | "This plan will cost ~$2.40 and ~12 minutes." Lets the user budget large plans. Few competitors ship this — most show cost only after the fact. | M | Estimate from historical avg per-step cost + step count. |
| **"What's still missing?" gap analysis** | The Devin SKILL.md pattern + Linear Agent's triage skill both hint at this: the agent reads the backlog and proposes cards for *gaps*, not just decomposition of an existing card. | M | A "review backlog" plan type, separate from "decompose this card". |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| **Auto-approve trivial plans / "skip planning for small tasks"** | Friction-reduction. | Erodes the trust foundation the planning loop exists to build. Devin explicitly resists this; Copilot Workspace makes the gate optional but visible. The dogfood loop's value comes from the gate. | Keep the gate. Make plans for small tasks fast (one-step plans), not skipped. |
| **Plans as freeform Markdown only** | Maximally flexible. | Hard to act on programmatically; can't drive UI affordances; can't be partially executed. Cursor learned this — its Markdown plan files are now linked to structured step state. | Structured plan with optional Markdown notes per step. |
| **Agent edits its own plan mid-execution without re-approval** | "Be smart, adapt." | Defeats the gate. The user approves plan v1, the agent executes plan v3. Devin's two-checkpoint model exists precisely to prevent this. | If the plan needs to change mid-run, agent stops and proposes a delta plan. |

---

### 4. Mobile Experiences for Agent Platforms

#### Landscape (who actually has this)

Most of the named platforms **do not** have phone-usable agent workflows. The exceptions and what they do:

- **Linear Mobile** (native Swift/Kotlin) — write issues, comments, updates; *delegate to agent and view real-time reasoning* in the mobile app; Linear Code Reviews surface diffs on mobile (private beta as of 2026-03).
- **Notion 3.2 Mobile** (Jan 2026) — full-parity AI Agent on phone; voice-to-task; agent runs while phone is locked; databases / forms editable.
- **Replit Mobile** — basic agent prompting, console viewing.
- **Nimbalyst** (third-party for Claude Code/Codex) — **review diffs, resume sessions, assign tasks from phone, push notifications when sessions complete or hit errors or need approval**. This is the most aggressive phone-first agent management UX in market.
- **Taskade** — full task/agent management on iOS/iPad with reliable comment/chat notifications.
- **ClawSwarm** — defers to Discord/Slack mobile apps for approve/reject; doesn't ship its own mobile UI.

The rest (Devin, OpenHands, Sweep, Cursor, Lovable, v0, Aider, Charm, Cody, Cline) are essentially desktop/IDE/CLI-only.

#### Table Stakes (for a 2026 agent workspace shipping mobile)

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| **Layout that works at ≥375px (iPhone SE) without horizontal scroll** | Already in PROJECT.md as the milestone target. Linear, Notion, Replit all do this; competitors that don't, lose review-on-phone use cases. | L | Co-op's surfaces (kanban, card detail, chat, agents, settings, auth) all need responsive passes. CSS-modules + tokens.css already; no framework swap. Drag-and-drop on touch is the hardest part. |
| **Push notifications for: mention, card assigned, plan needs review, run failed, run done** | Linear Mobile, Notion, Nimbalyst all ship this. The notification *is* the mobile UX for most agent flows — the user reviews on phone only when something is asking for them. | L | Web push (PWA) is the cheapest path; native iOS/Android push needs APNs/FCM. Server-side: notifications model already exists, needs a push transport. |
| **Tap-to-approve/reject for plans and runs** | Nimbalyst's defining UX: the notification deep-links into a one-tap approval surface. ServiceNow Now Mobile does the same for approvals. | M | Surface the approve/reject affordance prominently in mobile plan/run views. |
| **Readable diff view on phone** | Linear Code Reviews (mobile diffs), Nimbalyst (phone diff review). For card-level diffs, this is mostly a layout problem; for code diffs, harder (line wrapping, syntax highlighting at small width). | M | Card-level structured diffs are easier first target. Code diffs can use scrollable horizontally + collapse hunks pattern. |
| **Chat works** | Mentions, replies, send messages. Matrix client on mobile-web is a known-quantity surface. | S | Existing Matrix room layout needs responsive pass; the underlying Synapse client works on mobile already. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| **PWA install (add to home screen)** | Cheap-but-real "app" on iOS/Android without the app-store tax. Replit and Linear both ship native, but a PWA gets co-op 80% of the way for self-hosters who can't afford native. | S | Manifest + service worker + icons. Existing Next.js build supports this trivially. |
| **Touch-optimized kanban** | DnD on touch is the make-or-break for the kanban-on-phone bet. `@hello-pangea/dnd` (already in use) supports touch but needs UX testing. Most kanban tools degrade to "tap to move" on mobile. | M | Test with real devices; consider a "tap to move + column picker" fallback for narrow screens. |
| **Voice-to-card / voice-to-plan** | Notion 3.2 ships voice-to-task with full agent interpretation. The ergonomics on a walk are unmatched. M1 stretch goal; M2 candidate. | M | Web Speech API or Whisper-as-a-tool. Defer to M2 unless trivial. |
| **Mobile-aware notification routing** | "If it's after 10pm, only notify on `failed` and `needs review`, not on `done`." | S | User preference + simple time/category rule. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| **Full feature parity on phone** | "Mobile users deserve everything." | Stretches scope, dilutes the desktop UX. Linear and Notion *did* ship near-parity, but they have native teams. Co-op's milestone goal is "primary flows usable", not parity. | Scope mobile to: dashboard, project hub, kanban (review-mode), chat, agents (review-mode), settings, auth. Editing harness/SOUL on phone is out. |
| **Native iOS/Android app** | Better notifications, smoother UX. | Ships a second codebase. PROJECT.md constrains stack and bandwidth. PWA + web push covers 80% of value at 5% of cost. | PWA. Revisit native after dogfood validates the workflow. |
| **Mobile-only build of the app** | Sometimes argued for "consumer-feel". | Two codebases, two truths. Devin/Cursor ship desktop-first and many users access on tablet via the desktop UI. | Single responsive build. |

---

### 5. Reusable Marketing/Content Capabilities (M2 — deferred but inform M1 architecture)

#### Landscape

The market has *not* converged on a "marketing as a building block" pattern inside agent platforms — it lives mostly as **skill packs** (ClawHub-compatible directories of prompts + scripts + reference docs). Co-op's existing skills support is the right substrate.

Notable patterns from agent-skill repositories:
- **alirezarezvani/claude-skills** — 232+ skills covering marketing, product, compliance, C-level
- **kostja94/marketing-skills** — 160+ skills: SEO, content, paid ads, channels (deliberately not locked to one runtime)
- **coreyhaines31/marketingskills** — CRO, copywriting, SEO, analytics, growth engineering
- **Affitor/affiliate-skills** — 50 skills for trending research → posts → infographics → landing pages → deploy
- **SpillwaveSolutions/running-marketing-campaigns-agent-skill** — full campaign skill with UTM, content strategy, email sequences, brand voice, analytics

The five-skill content marketing pattern (MindStudio): **Trending Research → Copywriting → Repurposing → UGC Scripts → Schedule/Post**.

#### Table Stakes (for a marketing-capable agent platform)

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| **Content drafting skill (post, blog, email)** | Universal across all marketing skill packs surveyed. | S | Skill pack — co-op's existing ClawHub-compatible loader. |
| **Brand-voice / style-guide doc the agent reads** | Every campaign skill ships brand voice as a reference doc. Mirrors co-op's existing `SOUL.md` pattern. | S | A `BRAND.md` per project, loaded into the marketing-agent harness. |
| **Posting/distribution adapters** (X, LinkedIn, Bluesky, Mastodon, RSS) | The "post somewhere" step is what makes a marketing agent *do* marketing rather than just write. | M | Plugin tools, one per platform; treat as M2 plugin contract additions. |
| **UTM / tracking link generation** | In every campaign skill. Without it, posted content is unmeasurable. | S | Skill + helper plugin tool. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| **Marketing as a *layered* contribution: plugin (mechanism) + skill (knowledge) + agent template (role)** | This is the M2 thesis from PROJECT.md. The reason it's a differentiator: every other marketing-skill repo is one layer (skills only). Co-op shipping all three means a new project gets the marketing chops *by adopting the CMO agent template*, which auto-pulls the skills, which depend on the plugins. | L | Architecturally, this is what M1 must *not foreclose*: the plugin contract, skill loader, and agent template format all need to compose cleanly. M1 can validate this composition without shipping marketing-specific pieces. |
| **Listen-and-respond loop** (mentions, replies, support inbox) | Beyond "post content" — the marketing agent watches, drafts replies, escalates ambiguous ones to human. PROJECT.md flags this as deferred but in scope. | L | M2 — needs a polling/webhook plugin per platform. Has the same plan-then-approve UX as M1's planning loop. |
| **Hosted demo / preview** | The "show, don't tell" half of marketing. Lovable's publish flow + v0's preview are the closest analogues. | L | M2. Out of M1 scope but flagged so coding-loop work doesn't accidentally close the door. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| **Marketing built directly into the core (not as plugin/skill/template)** | Faster to ship for the co-op-marketing-co-op dogfood case. | Defeats the "any project gets it" thesis. M2's whole value is reusability. | Layered: plugin + skill + agent template, every time. |
| **Auto-post without human approval** | "Set it and forget it." | One bad agent post on a brand account is irrecoverable. Same risk class as auto-merge PR. | Plan-then-approve, same gate as code/cards. The M1 planning loop is the trust foundation M2 reuses. |
| **Hosted multi-tenant marketing service** | "Run my project's marketing for me." | Out of scope per PROJECT.md (no hosted SaaS). Pulls co-op into infra it has chosen not to build. | Self-host, plugin-based. |

---

## Feature Dependencies

```
[Run record + status enum]
    └──requires──> [run timeout + visible state]
                       └──requires──> [last-error surface + retry button]

[Idempotent tool calls]
    └──enables──> [Auto-retry transient errors]
    └──enables──> [Checkpoint/resume from partial work]

[Run-grouped activity log]
    └──requires──> [Run record exists as first-class entity]
    └──enables──> [Plain-language run summary]
    └──enables──> [Diff view per run]
    └──enables──> [Time-travel replay]

[Card-level diff view]
    └──requires──> [Run-grouped activity log]
    └──enables──> [Plan = card decomposition (review surface)]

[Plan model + plan status]
    └──requires──> [Approve-gate enforcement in agentRunner]
    └──enables──> [Plan editing UX]
    └──enables──> [Re-plan iteration]
    └──enables──> [Plan = card decomposition]

[Mobile-friendly UI / responsive layout]
    └──enables──> [Mobile review of plans]
    └──enables──> [Mobile review of runs]
    └──requires──> [Push notifications to make mobile useful]

[Push notifications]
    └──requires──> [Run state events emitted reliably]
    └──requires──> [Mobile-friendly UI for the deep-link target]

[Plugin + Skill + Agent Template (composable layers)]  // M2 prereq
    └──requires──> [M1 plugin contract not regressed]
    └──requires──> [M1 skill loader not regressed]
    └──requires──> [M1 agent template format not regressed]

[Auto-retry] ──conflicts──> [Auto-retry on auth/permission errors (anti-feature)]
[Plan-then-approve gate] ──conflicts──> [Auto-approve trivial plans (anti-feature)]
[Append-only audit log] ──conflicts──> [Edit-history of activity log (anti-feature)]
```

### Dependency Notes

- **Run record is the keystone:** Reliability surfaces (status, timeout, retry), audit surfaces (grouped log, summary, diff), planning surfaces (plan → approved → run linkage), and mobile surfaces (notifications fire from run state changes) all hang off a first-class `Run` entity. M1's earliest phase should establish it.
- **Idempotency precedes retries precedes checkpoints:** Cannot safely auto-retry without idempotent tools. Cannot safely checkpoint/resume without idempotent tools + a retry mechanism that knows which steps are "done".
- **Plan model precedes the differentiator surface:** "Plan = card decomposition" is the unique co-op move, but it requires the plain plan model to exist first. Ship the boring plan model first, the kanban-rendered plan second.
- **Mobile and push are co-dependent:** Responsive layout without push gets you "I can use it on phone if I happen to open it"; push without responsive layout gets you "I get pinged but can't act". Both must land in M1.
- **M2 is unblocked by M1, not built by M1:** M1 doesn't ship marketing features, but it must not regress the plugin / skill / template composition that M2 depends on. Validate the three-layer pattern with one non-marketing example during M1 to surface contract issues.

---

## MVP Definition (M1 — what this milestone actually ships)

### Launch With (M1)

Minimum viable to declare M1 done — co-op can run co-op's planning loop on a phone with a trustworthy agent.

- [ ] **First-class `Run` model** with status (`queued / running / paused / failed / done`), wall-clock + per-tool timeout, harness snapshot, last-error message — *foundation for everything else*
- [ ] **Auto-retry transient errors** with bounded exponential backoff, classified failure taxonomy, and skip-retry on auth/permission — *table stakes; co-op already has partial; finish it*
- [ ] **Manual retry / re-run / cancel** buttons on run + card surfaces — *table stakes*
- [ ] **"I'm stuck" escalation** after N identical tool errors — *cheap, big trust win*
- [ ] **Run-grouped activity log** (existing CardActivity, regrouped + filterable by run + agent) — *foundation for audit*
- [ ] **Plain-language run summary** at end of run — *the human-scannable artifact*
- [ ] **Card-level diff view** ("what changed on this card during run X") — *the co-op-shaped audit surface*
- [ ] **Plan model with status** + approve-gate enforcement in `agentRunner` — *foundation for the planning loop*
- [ ] **Plan editing UX** (reorder, edit, remove steps) before approve — *table stakes for plan-then-approve*
- [ ] **Plan = card decomposition** (plan steps render as ghost cards on the board, approve → real cards) — *the co-op-shaped differentiator*
- [ ] **Responsive layout** at ≥375px for: dashboard, project hub, kanban (review-mode), card detail, chat, agents (review-mode), settings, auth — *PROJECT.md-mandated*
- [ ] **Web push notifications** (PWA) for: mention, card assigned, plan needs review, run failed, run done — *makes mobile actually useful*
- [ ] **Tap-to-approve / tap-to-reject** plans on phone — *closes the planning loop on mobile*
- [ ] **Per-run cost/token visibility** — *self-hosters pay the bill*

### Add After Validation (M1.x — if scope opens up)

- [ ] **Checkpoint/resume from partial work** — high engineering cost, needs idempotency audit; defer until M1 reliability foundation lands
- [ ] **Time-travel replay of run state** — read-only first; full forking is M2+
- [ ] **Diff annotations / inline comments on agent output** — natural extension of card diff + comments, but adds plugin-tool surface for "revise based on comment"
- [ ] **Multi-agent planning collaboration** (PM proposes, Dev reviews) — uses existing event subscription model; defer until single-agent planning is solid
- [ ] **Plan-level cost estimate** — depends on having historical per-step cost data, which only accumulates after M1 ships

### Future Consideration (M2+)

- [ ] **Marketing capability stack**: Brand voice doc + content drafting skills + posting plugin adapters + listen-and-respond + hosted preview — *PROJECT.md M2*
- [ ] **Voice-to-card / voice-to-plan** on mobile — Notion 3.2 set the bar; nice-to-have, not core to M1's trust loop
- [ ] **Native iOS/Android app** — defer indefinitely per PROJECT.md; PWA path covers M1
- [ ] **Mid-run model fallback** (explicit, logged) — only after multi-provider parity is rock-solid; foot-gun risk

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| First-class Run model | HIGH | MEDIUM | P1 |
| Auto-retry transient errors (finish/tighten) | HIGH | LOW-MEDIUM | P1 |
| Manual retry/re-run/cancel | HIGH | LOW | P1 |
| "I'm stuck" escalation | HIGH | LOW | P1 |
| Run-grouped activity log | HIGH | MEDIUM | P1 |
| Plain-language run summary | HIGH | MEDIUM | P1 |
| Card-level diff view | HIGH | MEDIUM | P1 |
| Plan model + approve gate | HIGH | MEDIUM | P1 |
| Plan editing UX | HIGH | MEDIUM | P1 |
| Plan = card decomposition (ghost cards) | HIGH | MEDIUM | P1 |
| Responsive layout (primary flows) | HIGH | HIGH | P1 |
| Web push notifications | HIGH | MEDIUM | P1 |
| Tap-to-approve plans on phone | HIGH | LOW | P1 |
| Per-run cost/token visibility | MEDIUM | LOW | P1 |
| Configurable run timeout | HIGH | LOW | P1 |
| Idempotent tool-call audit | MEDIUM | MEDIUM | P1 |
| Deterministic harness snapshot per run | MEDIUM | MEDIUM | P2 |
| Structured failure taxonomy in UI | MEDIUM | MEDIUM | P2 |
| Re-plan iteration | MEDIUM | LOW | P2 |
| Plan grounded in repo/backlog citations | MEDIUM | MEDIUM | P2 |
| PWA install + manifest | MEDIUM | LOW | P2 |
| Touch-optimized kanban | MEDIUM | MEDIUM | P2 |
| Diff annotations / inline comments on output | MEDIUM | MEDIUM | P2 |
| Checkpoint/resume from partial work | MEDIUM | HIGH | P3 |
| Time-travel replay of run state | LOW-MEDIUM | HIGH | P3 |
| Multi-agent planning collaboration | MEDIUM | MEDIUM | P3 |
| Plan-level cost estimate | LOW | MEDIUM | P3 |
| Voice-to-card/voice-to-plan | LOW-MEDIUM | MEDIUM | P3 |
| Marketing capability stack | HIGH (M2) | HIGH | P3 (M2) |
| Listen-and-respond loop | HIGH (M2) | HIGH | P3 (M2) |
| Native iOS/Android app | MEDIUM | HIGH | DEFER |

**Priority key:**
- P1: Must have for M1 launch
- P2: Should have, add when possible within M1 if scope opens
- P3: Nice to have, future milestone

---

## Competitor Feature Analysis

| Feature | Devin | Cursor (Plan Mode + Background Agents) | Linear (Agent + Mobile + Code Reviews) | Sweep | Co-op's M1 Approach |
|---|---|---|---|---|---|
| **Plan-then-approve gate** | Two-checkpoint (plan + PR); plan is editable, plan is "checkpoint not gate" (proceeds unless intervened) | Shift+Tab → reviewable plan; Markdown file with file paths; approve before execute | Agent skill for planning; delegate-and-review | Plan posted as PR comment; reply to adjust before code | **Hard gate** (`status: awaiting-review` blocks runner) + plan-as-cards rendering |
| **Run audit / activity log** | Progress tab + Shell/IDE/Browser tools; click step → jump to that point | Chat strip + Review → Find Issues; line-by-line flagging | Realtime reasoning visible in mobile; structural diffs | PR diff + commit history | Run-grouped CardActivity + plain-language summary + card-level diff |
| **Retry / error recovery** | Manual takeover via Shell/IDE; session resume | Auto-retry transient; manual re-run | Limited (newer surface) | PR comment → Sweep retries the failing piece | Bounded retry + classified taxonomy + "stuck" escalation |
| **Mobile** | Web only (no real mobile) | Web only | Native iOS/Android with realtime agent reasoning + structural diff review | Web only | Responsive web + PWA + web push |
| **Diff view** | File-level diffs in IDE tool | Inline + Review pass | Structural diffs for human-and-agent output (Code Reviews beta) | PR diffs (GitHub-native) | Card-level structured diffs (the co-op-shaped surface) |
| **Plan-as-cards** | No (Markdown/structured plan, separate from any board) | No (Markdown plan file) | No (issue + sub-issues, but the plan isn't itself the issues) | No (PR comment) | **Yes** — plan steps are ghost cards; approve flips to real |
| **Marketing capability** | No (coding-only) | No (coding-only) | No | No | **M2 layered plugin+skill+template** |

---

## Key Synthesis for Roadmap

1. **The Run model is the keystone.** Reliability, audit, and planning all hang off `Run` having explicit status, harness snapshot, timeout, and last-error. First phase of M1 should establish it.

2. **"Plan = card decomposition" is the differentiating bet.** Every named competitor ships plans as a sidebar artifact (Markdown, comment, dialog). Co-op's shared-surface thesis says the plan should *be* the kanban it produces. This is the M1 feature most likely to make co-op feel uniquely co-op-shaped.

3. **Mobile is gated by push, not by layout.** Responsive layout alone is "I can use the page if I open it"; push notifications are "I open the page when something needs me". M1 can't ship one without the other.

4. **Anti-features are as important as features.** Auto-approve, infinite retry, mid-run model swap, and editable activity logs all sound helpful and would each undermine the trust-foundation that M1 exists to build. Lock these out in code (status enum enforcement, append-only constraint, classified retry).

5. **M2 is unblocked by M1's plugin/skill/template composition.** M1 doesn't ship marketing, but every M1 phase should validate that adding a new tool / skill / template still composes cleanly — surface contract issues now, not in M2.

---

## Sources

### Devin
- [Devin Docs: Advanced Capabilities](https://docs.devin.ai/work-with-devin/advanced-capabilities) — Interactive Planning, two-checkpoint approval model
- [Devin Docs: Session Tools](https://docs.devin.ai/work-with-devin/devin-session-tools) — Progress tab, Shell/IDE/Browser, jump-to-step
- [Lindy: Devin AI Review](https://www.lindy.ai/blog/devin-review) — plan-with-citations workflow
- [DeployHQ Devin Guide](https://www.deployhq.com/guides/devin) — plan reorder/edit
- [WWT Devin Strategic View](https://www.wwt.com/blog/empowering-the-enterprise-a-strategic-view-of-devin-aix) — two-checkpoint governance model
- [Augment: Devin vs Intent](https://www.augmentcode.com/tools/intent-vs-devin) — Devin 2.0 Interactive Planning details

### OpenHands
- [OpenHands DeepWiki: Retry and Error Handling](https://deepwiki.com/OpenHands/OpenHands/7.5-plugins-and-extensions) — exponential backoff (~184s total), retriable vs non-retriable exception classes, Gemini empty-response special case
- [OpenHands Software Agent SDK paper (arxiv 2511.03690)](https://arxiv.org/html/2511.03690v1) — event-sourced state for reproducibility and fault recovery

### Cursor
- [Cursor Docs: Plan Mode](https://cursor.com/docs/agent/plan-mode)
- [Cursor Blog: Introducing Plan Mode](https://cursor.com/blog/plan-mode) — Shift+Tab, Markdown plan file with file paths
- [Cursor Docs: Background Agents](https://docs.cursor.com/en/background-agent)
- [Cursor Blog: Best practices for coding with agents](https://cursor.com/blog/agent-best-practices) — Review → Find Issues line-by-line review pass

### GitHub Copilot Workspace + Agent Mode
- [VS Code: Planning with agents](https://code.visualstudio.com/docs/copilot/agents/planning) — Plan agent in chat, iterate on generated plan
- [Copilot Workspace project page](https://githubnext.com/projects/copilot-workspace/) — editable specs, file-level plans, concrete diffs
- [GitHub Blog: Agents panel](https://github.blog/news-insights/product-news/agents-panel-launch-copilot-coding-agent-tasks-anywhere-on-github/)

### Sweep
- [Sweep AI Documentation](https://docs.sweep.dev/agent) — plan as PR comment, reply to adjust

### Cline
- [Cline Enterprise](https://cline.bot/enterprise) — SSO, audit logs, observability, on-prem
- [Cline GitHub Issue #9952: Audit trails for autonomous code changes](https://github.com/cline/cline/issues/9952) — EU AI Act compliance discussion

### Aider
- [Augment: Continue vs Aider vs Cline](https://www.augmentcode.com/tools/continue-vs-aider-vs-cline-private-ai-coding-assistants-for-regulated-teams) — git-commit-per-change audit-trail model

### Replit Agent
- [Replit Docs: Console](https://docs.replit.com/replit-workspace/workspace-features/console) — log monitoring, Ask AI on errors

### Lovable
- [Lovable Docs: Build in Agent mode](https://docs.lovable.dev/features/agent-mode) — file diffs and summaries, verification tools
- [Lovable Blog: Agent Mode Beta](https://lovable.dev/blog/agent-mode-beta)

### Linear
- [Linear Changelog: Introducing Linear Agent (2026-03-24)](https://linear.app/changelog/2026-03-24-introducing-linear-agent) — Agent in public beta, skills, automations
- [Linear Docs: AI Agents](https://linear.app/docs/agents-in-linear) — delegate, real-time reasoning visible on mobile, Code Reviews with structural diffs
- [Linear Mobile](https://linear.app/mobile) — native Swift/Kotlin, full agent session view on phone

### Notion
- [Notion Releases: 3.2 Mobile AI (2026-01-20)](https://www.notion.com/releases/2026-01-20) — full-parity mobile agent, voice-to-task, locked-screen runs

### Charm Crush
- [Charm Crush GitHub](https://github.com/charmbracelet/crush) — terminal-first, multi-model, MCP, session management, permission control

### Mobile Agent Management
- [Nimbalyst: Mobile Agent Management](https://nimbalyst.com/mobile-agent-management/) — review diffs, resume sessions, approve/reject from phone, push on completion/error/approval-needed
- [Taskade iOS](https://apps.apple.com/us/app/taskade-ai-apps-agents/id1264713923) — agent management on phone

### Marketing Skills (M2 reference)
- [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) — 232+ skills, multi-runtime
- [kostja94/marketing-skills](https://github.com/kostja94/marketing-skills) — 160+ marketing skills, no-lock-in
- [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) — CRO/copywriting/SEO/analytics
- [Affitor/affiliate-skills](https://github.com/Affitor/affiliate-skills) — 50 skills covering full flywheel
- [SpillwaveSolutions/running-marketing-campaigns-agent-skill](https://github.com/SpillwaveSolutions/running-marketing-campaigns-agent-skill) — full campaign skill
- [MindStudio: 5-Skill Agent Workflow for Content Marketing](https://www.mindstudio.ai/blog/5-skill-agent-workflow-content-marketing-claude-code)
- [Claude API: Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)

### Agent UX / Reliability Patterns
- [Hatchworks: Agent UX Patterns](https://hatchworks.com/blog/ai-agents/agent-ux-patterns/) — pause-mid-flight, approve critical actions, recover from failures
- [Agentic Design: Error Recovery Patterns](https://agentic-design.ai/patterns/ui-ux-patterns/error-recovery-patterns) — display modalities, recovery mechanisms
- [Cipherbuilds: AI Agent Crash Recovery Patterns](https://cipherbuilds.ai/blog/ai-agent-crash-recovery-patterns) — auth-vs-data error classification
- [Fastio: AI Agent Checkpointing Guide](https://fast.io/resources/ai-agent-checkpointing-resume/) — idempotency requirements
- [Microsoft Learn: Checkpointing and Resuming Workflows](https://learn.microsoft.com/en-us/agent-framework/workflows/checkpoints)
- [eunomia: Checkpoint/Restore in AI Agents](https://eunomia.dev/blog/2025/05/11/checkpointrestore-systems-evolution-techniques-and-applications-in-ai-agents/)
- [Byteable: Refactoring Agent Diff Reports](https://byteable.ai/blog/which-autonomous-refactoring-agent-generates-beforeafter-diff-reports) — plain-language diff context

---

*Feature research for: agent-as-teammate workspace M1 (reliability/visibility/planning/mobile) + M2 (marketing-as-platform)*
*Researched: 2026-05-01*
