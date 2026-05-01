# Pitfalls Research

**Domain:** Agent-as-teammate workspace (humans + AI on shared kanban/chat) — brownfield Next.js 16 monolith, solo-dev + agent dogfood, four-direction M1 (reliability, visibility, planning loop, mobile), M2 forecast = marketing-as-platform.
**Researched:** 2026-05-01
**Confidence:** MEDIUM-HIGH (HIGH on agent-loop, prompt-injection, iOS keyboard, Claude-Code subprocess; MEDIUM on planning-loop UX, dogfood failure modes, marketing-as-platform — those rely on community wisdom and a smaller post-mortem corpus).

This document inventories what specifically goes wrong in projects like co-op's, why, and which milestone phase should defuse each pitfall. It is not a generic "AI is risky" essay — every pitfall is tied to a concrete code or schema target inside this repo, or to a published incident.

---

## Critical Pitfalls

### Pitfall 1: Unbounded agent loop / cost runaway

**What goes wrong:**
An agent run enters a tool-thrashing loop (re-reads the same card, re-runs the same shell, re-asks the LLM the same sub-question) and never terminates. Tokens, API charges, and Synapse bandwidth pile up; the run eventually times out or the human notices a $50 spike. In multi-provider deployments (co-op's case: Anthropic API + OpenAI + Claude Code CLI + Codex CLI), the same prompt can loop differently per provider, so a regression in one provider's loop discipline is invisible until it ships.

Real incidents: a developer on r/AI_Agents watched an agent rack up $15 in 10 minutes; another case escalated from 8.4k API calls Friday night to 847k by Monday morning ($3,847 in OpenAI charges). LangGraph's own official agentic-RAG tutorial shipped with an infinite retrieval loop until a `rewrite_count` cap was added — if the reference shipped a loop bug, every implementation will. ([Agent Runaway Costs — RelayPlane](https://relayplane.com/blog/agent-runaway-costs-2026), [How to Stop AI Agent Cost Blowups — DEV](https://dev.to/sapph1re/how-to-stop-ai-agent-cost-blowups-before-they-happen-1ehp), [Agentic RAG Failure Modes — Towards Data Science](https://towardsdatascience.com/agentic-rag-failure-modes-retrieval-thrash-tool-storms-and-context-bloat-and-how-to-spot-them-early/))

**Why it happens:**
The default agent shape is "observe → think → act → repeat until the model says done." There is no termination contract; the model is the only thing deciding when to stop. Add an LLM that hallucinates a missing sub-step, a tool that fails silently and is retried, or two tools whose outputs disagree, and the loop has no exit.

**How to avoid (Co-Op-specific):**
- **Hard iteration cap per run** (literature converges on 15–25 iterations; pick one and enforce it in the runtime, not the prompt). When hit, terminate with a `RUN_HALTED_ITER_CAP` activity row instead of a silent kill.
- **Per-run token + wall-clock budget** persisted with the run record (e.g., `AgentRun.tokenBudget`, `AgentRun.tokensUsed`, `AgentRun.maxWallSeconds`). Compute against provider response usage fields; abort the loop the moment any limit trips.
- **Tool-thrash guard:** track `(tool, normalized_args_hash)` per run; if the same call repeats N times with no state change, halt with reason. From the literature: "investigate above 10 [tool calls per task], hard-kill above 30."
- **Provider-uniform shape:** the cap, budget, and thrash detector live in the runtime layer (one place), not in each provider adapter, so Anthropic/OpenAI/Claude-Code-CLI/Codex-CLI all inherit it.
- **Justification logging at each loop iteration** ("what new evidence was gained? why is it not enough?") — feed this to the run summary so a thrashing agent surfaces as repetitive vague justifications instead of as a normal-looking summary.

**Warning signs:**
- Average tool calls per run rising over time on the same task class.
- Token usage variance widening across providers for "the same" prompt.
- Activity log showing N consecutive entries with the same tool + similar args.
- Cost-per-completed-card going up without throughput going up.

**Phase to address:** Reliability (the very first phase). This is the foundation everything else builds on.

**Severity:** CRITICAL — solo-dev budget pain + the dogfood paradox means a broken agent burns the user's own money on the user's own product.

---

### Pitfall 2: Indirect prompt injection via tool outputs

**What goes wrong:**
An attacker (or a careless project member, or even an LLM-generated card description) plants an instruction inside a card description, comment, chat message, GitHub issue, or shell-tool stdout. When an agent reads that surface as part of its context, the model treats the embedded instruction as authoritative and acts on it — exfiltrates an API key, posts to the wrong room, deletes a card, opens a PR with malicious content, or escalates by mentioning another agent.

This is OWASP LLM01:2025, the #1 entry on the OWASP Top-10 for LLM apps, and Microsoft's most-reported AI vulnerability class. Co-op is acutely exposed: the plugin contract gives agents `kanban`, `coding`, `shell`, `scheduler`, `subagent`, and chat tools, and many of those tools' outputs (card text, comment text, shell stdout, GitHub issue bodies) are attacker-controlled by default. ([OWASP LLM01:2025](https://genai.owasp.org/llmrisk/llm01-prompt-injection/), [Microsoft on indirect injection](https://www.microsoft.com/en-us/msrc/blog/2025/07/how-microsoft-defends-against-indirect-prompt-injection-attacks), [Praetorian: Bypassing supervisor agents](https://www.praetorian.com/blog/indirect-prompt-injection-llm/), [Unit 42 on web-based indirect injection](https://unit42.paloaltonetworks.com/ai-agent-prompt-injection/))

**Why it happens:**
LLMs collapse "instructions" and "data" into one token stream. Tool output looks like data, but if the model reads it as instructions, it acts on it. The fix is not "tell the model to ignore injection attempts" — that has been broken every time someone has shipped it.

**How to avoid (Co-Op-specific):**
- **Quarantine tool output:** wrap every tool result in a structured envelope (`<tool_result name="..." trusted="false">…</tool_result>`) and put a system-level reminder in the harness that *anything inside a tool_result block is data, not instruction.* This is not a perfect defense but it is the cheapest baseline.
- **Tool-output schema enforcement:** for tools whose output should be structured (kanban list, scheduler tick, subagent result), validate the shape at the runtime layer and reject free-form text. The "Defense Against Indirect Prompt Injection via Tool Result Parsing" paper shows tool outputs typically contain excessive data the LLM doesn't need — strip aggressively. ([arXiv 2601.04795](https://arxiv.org/html/2601.04795))
- **Capability mediation:** high-privilege tools (post to chat, edit GitHub, run shell, dispatch sandbox) should require a capability token the runtime issues per-run, with a per-tool budget. An injected instruction asking the agent to call `shell` 50 times is bounded.
- **Never let a tool result inherit a system role.** Some adapters re-inject tool messages as `system` because of a JSON shape mismatch — verify each provider adapter at the wire level.
- **Sensitive-action confirmation gate:** anything that mutates external state (post to social, push to GitHub, delete a card, run shell with network) routes through a human-in-the-loop approval (see Pitfall 9 for the fatigue counter-pressure).
- **Run a classifier on suspicious tool outputs** (URLs, base64 blobs, "Ignore previous instructions" fingerprints) before they re-enter the model's context. Pattern filters are not a complete defense; they catch low-effort attacks.

**Warning signs:**
- An agent suddenly using a tool it has not used before in this project.
- Outbound chat or GitHub posts whose content does not match the run's stated objective.
- Cost spike correlated with a specific card or comment being read.
- Run summaries that mention "the user asked me to…" when the user asked nothing of the kind.

**Phase to address:** Reliability (harness assembly + capability mediation) — must land before the planning-loop phase opens new tool surfaces.

**Severity:** CRITICAL — co-op stores plaintext provider API keys today (see CONCERNS.md "Plaintext API keys"); a successful injection that exfiltrates a key is a top-1 incident.

---

### Pitfall 3: Stuck CLI subprocesses (Claude Code / Codex zombies)

**What goes wrong:**
Co-op's multi-provider design treats Claude Code CLI and Codex CLI as first-class backends. Both spawn a Node subprocess; both have well-documented failure modes where the subprocess hangs, the SDK initialization handshake never completes, the parent never reaps it, and the zombie occupies a session/working-directory lock that blocks the next run. Each subsequent retry leaves another zombie. Eventually you hit `EAGAIN: resource temporarily unavailable, posix_spawn` or the on-disk session JSONL is corrupted by concurrent writers. ([Claude Code SDK subprocess hangs — issue #18666](https://github.com/anthropics/claude-code/issues/18666), [Closed sessions leave zombies — issue #54130](https://github.com/anthropics/claude-code/issues/54130), [Process exhaustion bug — Shivanka Aul](https://shivankaul.com/blog/claude-code-process-exhaustion), [CLI subprocess death leaves session broken — claude-agent-acp #338](https://github.com/zed-industries/claude-agent-acp/issues/338))

A separate, bookended bug: when claude is spawned in `stream-json` mode from a non-shell parent, its Bash tool's `cwd` is forced to `/` regardless of what the spawner passes — agents will write to the wrong directory and look like they're "doing nothing." ([claude-code #46985](https://github.com/anthropics/claude-code/issues/46985))

**Why it happens:**
- Naive `spawn` without an explicit timeout, watchdog, and SIGKILL escalation.
- No reconciliation between the runtime's view of "alive runs" and `ps`/`/proc`.
- Macos `pgrep -P` has a known bug returning all PIDs, which historical Claude Code versions used to track children — fork-bomb risk.
- Multiple processes share the same `~/.claude/` user-data directory and corrupt the message UUID index.

**How to avoid (Co-Op-specific):**
- **Per-run isolated working dir + isolated CLI home** (`HOME=$RUN_TMP/claude-home`, `CODEX_HOME=$RUN_TMP/codex-home`). Never let two concurrent runs share the on-disk session store.
- **Watchdog that owns the subprocess lifecycle:** spawn → wait with timeout → SIGTERM → grace → SIGKILL → reap. The watchdog, not the agent loop, is the source of truth for "alive."
- **Reaper sweep on app boot:** before accepting new runs, scan for stale `coop-agent-*` processes from previous PM2 lifetimes and kill them. Single-replica PM2 makes this tractable.
- **Heartbeat from inside the subprocess:** if no heartbeat for N seconds, watchdog terminates. CLI hangs on `initialize` are detectable this way.
- **Working-directory contract test:** for each provider adapter, a smoke test that runs "write `cwd-marker` to current dir" verifies that the spawned process actually writes where you told it to. Catches regressions like the stream-json `/` bug.

**Warning signs:**
- `ps aux | grep claude` shows N>1 processes when only one run is active.
- Run records stuck in `running` state past their wall-clock budget.
- Disk filling under the per-CLI session directory.
- Intermittent "session corrupted" errors after a kill/restart.

**Phase to address:** Reliability — runtime hardening sub-phase, before any other agent work.

**Severity:** CRITICAL — co-op runs solo on PM2 single-replica; one fork-bomb evicts the dev environment, freezing the dogfood loop.

---

### Pitfall 4: Stale tool state between runs (kanban already moved, shell cwd wrong, GitHub branch advanced)

**What goes wrong:**
An agent reads the board at the start of a run, plans against that snapshot, then humans (or other agents) move cards while the run is in flight. The agent commits to a card position that no longer exists, moves a card to a column that was renamed, comments on a card a human just deleted, or pushes to a branch a human force-pushed. The error surfaces at write time as a Prisma constraint violation or a 404 — the activity log shows "agent failed" with no actionable signal.

This is amplified by the *non-atomic move reindexing* already documented in CONCERNS.md (`src/app/api/cards/[id]/move/route.ts:11-27` reads `card.position` outside its transaction). Concurrent moves can produce duplicate positions even between two humans; agents make the contention worse.

**Why it happens:**
Read-then-write without optimistic concurrency is the default and works fine for a single human. With agents in the mix, the read-write window stretches across an LLM call (seconds to minutes), inverting the assumptions.

**How to avoid (Co-Op-specific):**
- **Optimistic concurrency on every mutating tool:** include `expectedVersion` (or `expectedColumnId`+`expectedPosition`) in the tool input schema; route handler rejects with `409 STALE` if the snapshot has moved.
- **Atomic move reindexing in a single transaction.** Already a tracked concern; resolve it now because agents will hit it before humans do.
- **Fresh-read-on-write:** mutating tools read the row inside the transaction immediately before the mutation; the agent's "I read this 30 seconds ago" snapshot is never trusted at write time.
- **Tool returns "what changed since you started":** when a write fails on staleness, the response includes the new state so the agent can re-plan in one round-trip instead of a fetch-loop.
- **Run-scoped session cache invalidation:** any tool-call response with `429`/`409` invalidates the agent's local cache for that resource family.

**Warning signs:**
- Activity log shows agents repeatedly attempting the same write that fails.
- Card positions or column orders drift over the course of a run.
- Manual user actions during a run cause "agent did nothing" outcomes.

**Phase to address:** Reliability + the kanban portion of the planning-loop phase.

**Severity:** SERIOUS — does not corrupt data permanently but quietly destroys agent trust ("it just gives up").

---

### Pitfall 5: Plan drift — proposal ≠ execution

**What goes wrong:**
The agent presents the human with a clean three-step plan ("split this card into A, B, C; assign to me; move A to In Progress"). The human approves. The agent then executes A, decides B is unnecessary, and silently invents D. The card looks like progress, but the executed graph has diverged from the approved graph. By the third or fourth approval the human is rubber-stamping plans they have not validated against execution. ([Agent drift — Wire blog](https://usewire.io/blog/agent-drift-why-long-running-ai-agents-lose-the-plot/), [Agent drift in AI systems — emergentmind](https://www.emergentmind.com/topics/agent-drift), [Scope creep in AI — Omdena](https://www.omdena.com/blog/scope-drift-in-ai-projects), [NimbleBrain agent failure modes](https://nimblebrain.ai/why-ai-fails/agent-governance/agent-failure-modes/))

This is *the* central pitfall of the planning-loop phase. The whole milestone bets on humans being willing to approve agent proposals; if approve-then-divergence is common, trust collapses and the loop dies.

**Why it happens:**
Plans are narrative; execution is a state machine. Without explicit binding between the two, the model treats the plan as inspiration rather than contract.

**How to avoid (Co-Op-specific):**
- **Plan-as-data, not plan-as-prose.** The proposal is a structured `Plan` object: ordered list of tool calls with expected inputs and a hash. Human approves the hash. Runtime refuses to execute any tool call not in the approved set; a "plan amendment" requires re-approval.
- **Diff at execution time:** if the agent wants to deviate (B is unnecessary; D is needed), it must surface a `PlanAmendment` proposal and stop. No silent improvisation.
- **Replay-able run record:** every executed tool call links back to the plan step it satisfies. A run summary that cannot tie all tool calls to plan steps is *malformed* and surfaces as a warning, not a success.
- **Cap plan amendments per run** (e.g., 2). Beyond that, the agent halts and the human re-plans from scratch — prevents the slow-boil amendment chain that obliterates the original plan.

**Warning signs:**
- Run summaries longer than the original plan.
- Activity entries with no parent plan step.
- Humans saying "I'm not sure what it actually did" after an approved run.

**Phase to address:** Planning-loop phase, dependent on Reliability landing first.

**Severity:** CRITICAL — kills the milestone's core hypothesis if not addressed.

---

### Pitfall 6: Run-summary hallucination (faithfulness, not factuality)

**What goes wrong:**
The agent finishes a run, writes a confident "I split COOP-12 into three subtasks and assigned them to you," and the activity log shows it did two of the three and assigned them to itself. The summary is grammatical, well-structured, and wrong. The human, scanning a feed of pleasant green checkmarks, does not notice for days.

Reasoning models hallucinate *more*, not less, than their base counterparts (o3, o4-mini, R1 vs GPT-4o, V3) — and Co-Op's pluggable-model architecture means a future provider swap can quietly raise the hallucination rate. Multi-step pipelines compound: an unfaithful intermediate summary becomes ground-truth context for the next step. ([Reasoning models hallucinate more — Pryon](https://www.pryon.com/resource/reasoning-models-hallucinate-more----marking-trouble-for-ai-agent-adoption), [LLM-based agents hallucinate — arXiv survey](https://arxiv.org/html/2509.18970v1), [Tool-use hallucination — YSquare](https://www.ysquaretechnology.com/blog/tool-use-hallucination-ai-agents))

**Why it happens:**
LLMs are graded on coherence, not on faithfulness to a tool-call ledger. The summarizer prompt typically receives the run's chat trace, not the canonical activity log; the model writes "what should have happened" instead of "what did happen."

**How to avoid (Co-Op-specific):**
- **Generate summaries from the activity ledger, not the chat trace.** The summarizer receives a deterministic list of tool-call inputs+outputs+effects (cards moved, files written, messages posted), and *only* that. It is not allowed to claim something the ledger does not show.
- **Diff verification:** for every claim of the form "I moved/created/deleted X," run a post-condition check that X actually exists/was moved/was deleted. Mismatch → mark the summary as `unverified` and surface the mismatch.
- **Two-column run-card UI:** "What I did" (ledger-derived, machine-built) on the left; "What the agent says" (LLM-generated) on the right. The two should match. When they don't, the human sees it instantly.
- **Summary length cap** proportional to ledger length — long narratives over short ledgers are a hallucination smell.

**Warning signs:**
- Summaries claiming actions that don't appear in `CardActivity`.
- "I attempted X" without a corresponding tool call.
- Run summaries that read better than the work warranted.

**Phase to address:** Visibility/Audit phase.

**Severity:** SERIOUS — a hallucinated run summary that says "I posted to X" but didn't is the marketing-as-platform M2 nightmare in miniature.

---

### Pitfall 7: Audit log secrets leakage / over-logging buries signal

**What goes wrong:**
Two failure modes, both common, with opposite root causes:

1. **Leakage:** debug logs and traces capture the raw prompt, tool inputs, and tool outputs verbatim — including provider API keys passed in headers, base64-encoded attachments, NextAuth session JWTs, and matrix tokens. The audit log becomes a credential dump with project-wide read access. (CONCERNS.md already flags plaintext API keys; an audit log that records them is the same hole, double-locked.)
2. **Noise:** every plan step, retry, model token-by-token chunk, and filesystem stat ends up in the log. The signal that an agent ran amok is buried under thousands of routine entries; the human gives up scanning. ([Agent observability — AgentixLabs](https://www.agentixlabs.com/blog/general/agent-observability-for-production-trace-tools-cost-and-safety-signals/), [LLM secret leakage — Doppler](https://www.doppler.com/blog/advanced-llm-security), [AI audit logs — Maxim AI](https://www.getmaxim.ai/articles/ai-agent-audit-logs-full-visibility-over-tool-usage/))

**Why it happens:**
"Log everything" feels safe and is cheap to write. Redaction is fiddly and gets done last. Signal/noise tuning requires running the system long enough to know what "normal" looks like.

**How to avoid (Co-Op-specific):**
- **Two-tier log model:** *human-facing activity feed* (at most one entry per meaningful step, no payloads, retention indefinite) and *operator trace* (full payloads, retained 7–14 days, access-controlled to project owners).
- **Redact by default, allowlist what you keep.** Implement a `Redactor` middleware that strips known secret-shaped strings (provider keys, JWTs, matrix access tokens, `.env`-shaped lines) before write. Test with property-based fuzzing.
- **Tag every span by `sensitivity: low|medium|high`** so the trace UI can hide payloads behind a click; the default view shows shapes, not values.
- **No data URLs in logs.** CONCERNS.md notes attachments are stored as base64 data URLs in Postgres text — those must never enter activity rows; reference by id.
- **Signal-tuning checkpoints:** at the end of each phase, sample 20 random runs and ask "could a human, scanning this feed in 30 seconds, tell whether the run succeeded?" If no, the feed is too noisy.

**Warning signs:**
- Activity log entries containing 16+-character base64-y strings.
- A grep for `sk-` or `mxc://` against the log table returning hits.
- Humans bypassing the activity log and reading raw trace data because the activity log "doesn't say enough."

**Phase to address:** Visibility/Audit phase.

**Severity:** CRITICAL on the leakage axis (single incident = full credential compromise); SERIOUS on the noise axis (slow-boil trust erosion).

---

### Pitfall 8: Diff views that mislead

**What goes wrong:**
The agent edits a card description; the diff view shows a clean +/- chunk on the description field. What it does *not* show: the agent also added itself to `CardMember`, changed the column, added a label, and posted three comments. The human approves "the diff" — they have approved 1/5 of what changed.

Or: the diff view shows file-level changes for coding tasks but elides the migration, the `package.json` lockfile diff, the `.env.example` change, and the new docker port. The human reviews the visible code; the invisible footprint ships.

**Why it happens:**
Diffs are usually built from one model (text in/text out) and one entity (card description, file, prompt). Agent runs span entities — a single run touches the kanban, the chat, the activity log, the model keys, and possibly the filesystem.

**How to avoid (Co-Op-specific):**
- **Run-scoped diff, not entity-scoped diff.** The review UI groups every change under one run id and presents them as one reviewable unit. Approving a run approves all of its effects; rejecting reverts all of them.
- **Negative-space rendering:** the diff explicitly enumerates every entity touched (including `assigneeUser`, `assigneeAgent`, `CardMember`, `Label`, `Column`, comments, attachments, activity rows). Empty sections still render their headers — "no comments added" is information.
- **Reject = revert.** The runtime keeps the inverse-operation record per tool call so a human can one-click revert a run. Without revert, "approve" is the only safe answer and humans rubber-stamp.
- **Side-effect badges on the run card:** `[posted-chat] [pushed-github] [edited-3-cards] [ran-shell]` so a human glancing at the feed knows the surface area before clicking in.

**Warning signs:**
- Multiple "I didn't realize the agent did that" reports from the dogfood user.
- Activity rows that don't show up in the run diff.
- Reverts that require manual SQL.

**Phase to address:** Visibility/Audit + Planning-loop intersect.

**Severity:** SERIOUS.

---

### Pitfall 9: Approval-fatigue rubber-stamping

**What goes wrong:**
Every plan, every chat post, every shell command requires human approval. By the eighth modal of the morning the human is pattern-matching on the *shape* of the prompt, not the content. They click "Approve" on a malicious diff that looks like the previous fifteen benign ones. The human-in-the-loop guard becomes a UX speed bump that trains the human to ignore it. ([Review fatigue is breaking HITL — Medium](https://ravipalwe.medium.com/review-fatigue-is-breaking-human-in-the-loop-ai-heres-the-design-pattern-that-fixes-it-044d0ab1dd12), [HITL fallacy — ChatFin](https://chatfin.ai/blog/the-human-in-the-loop-fallacy-when-to-fully-trust-the-agent/))

**Why it happens:**
"Just add a confirmation" is the cheapest fix when something dangerous can happen, and it is added everywhere defensively. Nobody measures whether the approvals are actually filtering anything.

**How to avoid (Co-Op-specific):**
- **Tiered actions:** classify each tool call as `routine`, `sensitive`, or `irreversible`. Routine = no approval (subject to budget caps and audit). Sensitive = approval batched at run boundaries (one approval per plan, not one per call). Irreversible = always per-action.
- **Codify "routine" in policy.** A per-project allowlist file (initially: read kanban, read chat, comment on a card the agent is assigned to, propose a plan) makes the boundary explicit and reviewable.
- **No confidence scores in approval UI.** Literature consistently finds confidence scores anchor the reviewer; remove them.
- **Approval requires showing what changed since last approval.** Identical-shaped approvals get a "this is the 5th plan-of-this-shape this hour — proceed?" interstitial.
- **Track the false-approve rate.** When a human reverts a run within an hour of approving it, that is the truth signal. Surface the rate per project.

**Warning signs:**
- Approval-to-revert latency dropping over time (the human is clicking faster and noticing slower).
- A specific plan template approved >5 times in a session.
- The dogfood user saying "I just hit approve on everything because it's annoying."

**Phase to address:** Planning-loop phase, jointly with Visibility (both control the approval surface).

**Severity:** SERIOUS — directly undermines the whole planning loop's safety claim.

---

### Pitfall 10: Hover-only affordances on touch (Mobile)

**What goes wrong:**
Co-op's desktop UI uses hover for: kanban card hover lift, sidebar menu reveal, drag-handle visibility, label tooltip, activity-row "edit" button, card-action overflow menu. On touch devices none of these exist. Users tap, nothing reveals, they conclude the feature is missing. Drag handles in particular: on desktop the cursor changes; on touch there is no cursor, and a card with no visible handle looks un-draggable. ([NN/G drag-and-drop](https://www.nngroup.com/articles/drag-drop/), [UX patterns to reconsider for mobile — Fuzzy Math](https://fuzzymath.com/blog/6-ux-design-patterns-reconsider-for-mobile-designs/), [Touch-device responsive — UXPin](https://www.uxpin.com/studio/blog/responsive-design-touch-devices-key-considerations/))

**Why it happens:**
Hover is invisible-by-default and becomes unconscious — desktop-first developers write hover affordances as if they were free. Adding `@media (hover: hover)` to gate hover styles is a pattern not many teams remember on first pass.

**How to avoid (Co-Op-specific):**
- **Audit every `:hover` rule for hover-as-only-affordance.** Anything that reveals interactivity must have a touch equivalent: persistent drag handle icon (≥1cm × 1cm with breathing room), explicit "more" button, persistent action row.
- **`@media (hover: hover) and (pointer: fine)`** gates hover-only flourishes (lift, glow); functional reveals never live behind that media query.
- **Drag handle dedicated icon visible at all viewport widths.** `@hello-pangea/dnd` supports a custom drag handle ref — use it, don't make the whole card draggable on touch.
- **44 × 44 pt minimum touch targets** (Apple HIG; Material's 48dp similar) on every interactive element, including small icon buttons.
- **Replace tooltips with persistent labels or expandable info panels** on touch.

**Warning signs:**
- DevTools "responsive mode" shows action buttons disappear at narrow widths.
- Mobile users in a session recording can't find the "comment" button.
- A card on mobile cannot be dragged because the user is dragging the page.

**Phase to address:** Mobile-friendly UI phase.

**Severity:** SERIOUS — without this, mobile is unusable for the actual work; the dogfood loop stalls when the user is away from a desktop.

---

### Pitfall 11: iOS Safari virtual-keyboard layout breakage (Mobile)

**What goes wrong:**
User opens a card on mobile, taps the comment textarea, the iOS keyboard slides up. One or more of the following happens:

- The whole card modal pushes off the top of the visible viewport because `position: fixed` is honored against the *layout viewport*, not the *visual viewport*. The user is typing into a text field they cannot see.
- The submit button is anchored `bottom: 0` and is now hidden under the keyboard.
- The page is `overflow: hidden` on body for modal scroll lock; iOS still scroll-jumps the visual viewport to put the input on screen, but the modal scrolls underneath.
- A floating popover (label picker, member picker) anchored relative to its trigger is positioned off-screen because `floating-ui` measured the layout viewport.

This is the single most painful class of bug in desktop-to-mobile conversion of an app with chat + comment + card-modal surfaces. ([Safari position:fixed + keyboard — Medium](https://medium.com/@im_rahul/safari-and-position-fixed-978122be5f29), [iOS keyboard pushes modal — tutorialpedia](https://www.tutorialpedia.org/blog/how-to-prevent-ios-keyboard-from-pushing-the-view-off-screen-with-css-or-js/), [VirtualKeyboard API — Bram.us](https://www.bram.us/2021/09/13/prevent-items-from-being-hidden-underneath-the-virtual-keyboard-by-means-of-the-virtualkeyboard-api/), [floating-ui issue #3362](https://github.com/floating-ui/floating-ui/issues/3362), [Body scroll lock on iOS — Medium](https://stripearmy.medium.com/i-fixed-a-decade-long-ios-safari-problem-0d85f76caec0))

**Why it happens:**
iOS Safari has unique semantics: `vh` units, `position: fixed`, and body scroll lock all behave differently when the keyboard is open. Most CSS resets and modal libraries assume desktop or Android.

**How to avoid (Co-Op-specific):**
- **Use `dvh` (dynamic viewport height), not `vh`,** for any modal/sheet anchored to viewport extents. Supported iOS 15.4+ which is now ≈100% of iOS install base.
- **Visual Viewport API for keyboard-aware positioning.** Listen to `window.visualViewport.resize` and translate bottom-anchored elements upward by `(layoutHeight - visualHeight)`.
- **`env(safe-area-inset-bottom)`** for any bottom-anchored UI to clear the home indicator.
- **Don't `overflow: hidden` body** for modal locking on iOS — use `overscroll-behavior: contain` on the modal scroller and only the modal scroller.
- **Test the four hot surfaces:** card detail modal, chat composer, comment composer, label/member picker popover. Each must be re-tested with keyboard open + closed + dismissed.
- **Soft-disable popovers that escape the viewport** (`floating-ui` middleware: `flip` + `shift({ padding: 8 }) + size`).

**Warning signs:**
- Comment submitted with empty body because the textarea was off-screen.
- Picker popover only half-visible at narrow widths.
- Page jumps when the keyboard opens.

**Phase to address:** Mobile-friendly UI phase.

**Severity:** SERIOUS.

---

### Pitfall 12: Drag-and-drop on touch — scroll-trapping & accidental drags

**What goes wrong:**
User on phone tries to scroll the kanban; instead, they pick up a card and accidentally move it. Or: user tries to drag a card to a column off-screen; the page does not auto-scroll, the card snaps back. Or: long-press on a card opens the iOS context menu (text-selection, share) instead of starting a drag.

`@hello-pangea/dnd` has explicit touch support via a long-press-then-drag sensor with documented constraints: a `touchmove` before the long-press timer expires cancels the pending drag and allows native scroll; once the timer expires, native scroll is *prevented* for the duration of the drag. The constraints are correct; the application has to use them correctly. ([@hello-pangea/dnd touch sensor](https://github.com/hello-pangea/dnd/blob/main/docs/sensors/touch.md), [hello-pangea/dnd auto-scrolling](https://github.com/hello-pangea/dnd/blob/main/docs/guides/auto-scrolling.md))

**Why it happens:**
Touch drag is a state machine with conflicting affordances (tap, scroll, long-press menu, drag). Default browser behavior does some of these; the dnd library handles others; the app has to coordinate the rest.

**How to avoid (Co-Op-specific):**
- **Drag handle on touch, full card on desktop.** The handle has its own `dragHandleProps`; the rest of the card is `tap = open detail`. Eliminates the "tried to scroll, accidentally dragged" mode.
- **Disable iOS callout on draggable elements:** `-webkit-touch-callout: none; user-select: none;` on the drag handle.
- **Auto-scroll enabled with appropriate edge thresholds.** `@hello-pangea/dnd` auto-scrolls during drag; verify the scroll container is the column list, not the page.
- **Provide a non-drag fallback:** an explicit "Move to…" action on the card detail screen lets the user move without dragging at all. Gmail removed mobile drag in favor of a menu for exactly this reason.
- **Test on real device, not just emulator.** Touch gesture latency, native scroll momentum, and long-press timing differ.

**Warning signs:**
- "Card moved by accident" reports.
- Cards that snap back after a drag attempt (browser stole the drag for scroll).
- Long-press triggering text selection or share sheet instead of drag.

**Phase to address:** Mobile-friendly UI phase.

**Severity:** SERIOUS.

---

### Pitfall 13: Dogfood blindness — internal team can't see new-user UX issues

**What goes wrong:**
The solo dev + agent teammates know the system's quirks, work around them unconsciously, and ship the workarounds as features. When a real second user lands, they hit ten paper-cuts the team forgot about: the "DB might not be ready" silent-empty sidebar (CONCERNS.md flags this in `(dashboard)/layout.tsx:20`), the channel that has `matrixRoomId: null` and silently can't be messaged, the data-URL attachment that sometimes renders and sometimes doesn't.

Long-term internal users develop technical proficiency that masks the very problems dogfooding is supposed to surface; confirmation bias makes the team find what they expected to find. ([Userpilot on dogfooding](https://userpilot.com/blog/product-dogfooding/), [Dogfooding isn't enough — DEV](https://dev.to/polluterofminds/dogfooding-your-own-product-isn-t-enough-2gb9), [PostHog dogfooding](https://posthog.com/product-engineers/dogfooding))

**Why it happens:**
The team is the first user, and the first user is always over-fitted to the product. Without fresh eyes, the team is testing whether their assumptions are internally consistent, not whether they are correct.

**How to avoid (Co-Op-specific):**
- **Friend-test cadence:** before claiming a phase done, two people who are *not* the dogfood user attempt the primary flow on a fresh install. Failures are pitfalls, not user errors.
- **Reset-and-onboard drill** monthly: blow away local data, run `npm run setup:start`, do "create project → add agent → run a planning task" without consulting docs. Anything that requires reading the source is a defect.
- **First-30-seconds heatmap** instrumented via lightweight client telemetry (opt-in self-host metrics) — where do new users click? where do they get stuck?
- **Externalize the failure modes you've internalized:** keep a `PAPER_CUTS.md` you actively prune. The empty-sidebar `try {} catch {}` is exactly the kind of thing that has to leave the codebase for new-user dogfood to be valid.

**Warning signs:**
- "Oh, you have to know that…" sentences in onboarding chat.
- Demo bugs that the demo-er knows how to avoid.
- The team's `.bashrc` or `.env` has workarounds the docs don't mention.

**Phase to address:** Cross-cutting; reinforced at every phase boundary, especially before opening M2 (marketing) which requires real outsiders.

**Severity:** SERIOUS — slowly fatal to product-market fit; doesn't block M1 but blocks M2's value.

---

### Pitfall 14: Dogfood paradox — the tool can't bootstrap a new feature in itself

**What goes wrong:**
Co-op needs agent help to make progress; agents need a stable co-op to drive co-op's work. When the user breaks the agent runtime — even temporarily, even on a feature branch — *the agents stop helping with co-op* and the user is back to solo. A two-day reliability regression becomes a two-week regression because there's no agent to fix it.

A specific subcase: an agent damages live data the user needs (deletes the wrong cards, posts to the wrong room, force-pushes over an unfinished branch). After the first such incident, the user stops trusting agents with anything important; the dogfood loop dies even though the agents work fine.

**Why it happens:**
A single environment, a single dataset, and a tightly-coupled "the agent talks to the live DB" architecture mean any bug has full blast radius.

**How to avoid (Co-Op-specific):**
- **Two project namespaces:** "co-op-build" (the dogfood project where agents work on co-op itself) and "co-op-meta" (the user's personal-trust project). Reliability bugs in `co-op-build` should not poison `co-op-meta`.
- **Run-mode flag on agents:** `read-only`, `propose-only`, `propose-and-execute`. Default for any new agent is `propose-only` until a per-agent trust threshold is hit.
- **Ship the runtime in a way the user can roll back without losing in-progress work.** PM2 `pm2 reload` with versioned releases; a known-good fallback build always available.
- **Database snapshot before any irreversible agent-initiated mutation.** `pg_dump` or a logical backup tied to the run id. Recovery cost should be "minutes," not "lose Friday."
- **Explicit "I'm working on the agent runtime, agents off" mode.** A toggle in the dogfood project that disables agent runs without disabling the rest of the product.

**Warning signs:**
- The user manually undoes an agent action more than once a week.
- The user disables an agent and forgets to re-enable it.
- "I'd let it do that but last time it…" appearing in commit messages.

**Phase to address:** Reliability (the rollback / namespace work) + reinforced in Planning-loop (the run-mode flag).

**Severity:** CRITICAL — this *is* the milestone's central operational risk per `PROJECT.md`.

---

### Pitfall 15: M2 — generic AI marketing slop

**What goes wrong (forecast for M2):**
The marketing-as-platform layer ships templates and skill packs that produce content shaped like marketing — "delve into," "in conclusion," "comprehensive solution" — with cookie-cutter layouts, hedged superlatives, and no author voice. Co-op publishes its own such content at launch; the post lands on Hacker News, the comments call it AI slop, and credibility takes a hit that's hard to recover. Worse: every project that adopts the marketing capability inherits the same template baseline and the ecosystem becomes a slop generator. ([AI slop — Copy.ai](https://www.copy.ai/blog/ai-slop), [AI slop sites — DeepSee](https://deepsee.io/blog/ai-slop-sites-programmatic-advertising), [Surfer on AI slop](https://surferseo.com/blog/ai-generated-content/), [Measuring AI slop — arXiv](https://arxiv.org/pdf/2509.19163))

**Why it happens:**
Templates encode the average. The average AI marketing output is slop. Without injected specificity (the project's actual voice, real customer language, concrete numbers, edge cases), generation collapses to the median.

**How to avoid (Co-Op-specific, applicable now to inform M2 scope):**
- **`SOUL.md` as the voice contract.** Marketing skills must consume the project's `SOUL.md` and a project-specific style guide; outputs missing that context are blocked.
- **Anti-slop linter as a built-in skill:** detect cliché phrases, hedged superlatives, "in conclusion" padding, and missing concrete claims. Block publish if score below threshold.
- **Receipts required:** every claim in a post must link to a card, a commit, a metric, or a quote from a real conversation. No claim → no publish.
- **Voice fingerprint:** sample 5 prior posts; computed embedding; reject drafts that drift more than X from the fingerprint.
- **Mandatory human edit pass before publish.** "Auto-publish" is the slop generator; "auto-draft + human polish" is the productivity tool.

**Warning signs:**
- Drafts that read interchangeably across projects.
- "Comprehensive" / "delve" / "navigate" / "in conclusion" frequency rising.
- Published content that doesn't reference anything specific.

**Phase to address:** M2 scoping (early); guardrails defined now even though work is deferred.

**Severity:** SERIOUS — bad launch content kills launches.

---

### Pitfall 16: M2 — social-posting plugin gets accounts banned

**What goes wrong (forecast for M2):**
The auto-poster connects to LinkedIn / X / Bluesky / Mastodon. It posts at the cadence the agent decides; LinkedIn detects automation behavior; the user's account is restricted or banned. LinkedIn's ToS specifically prohibits unofficial automation; X has suspended bot accounts for "automation in a bad way"; both platforms run heuristics that catch posting patterns regardless of content quality. ([LinkedIn jail — Evaboot](https://evaboot.com/blog/linkedin-jail), [Twitter automation bans — Follows.com](https://follows.com/blog/2022/02/can-banned-twitter-automation), [LinkedIn automation safety — Anyleads](https://anyleads.com/does-linkedin-allow-automation), [X bot ban thread — devcommunity](https://devcommunity.x.com/t/bot-account-banned-without-a-reason/195723))

A specific failure shape: a user's *personal* LinkedIn account, used as the M2 dogfood account, gets perma-banned. Recovery is rare. Co-op's reputation for that user collapses with their network.

**Why it happens:**
Posting plugins default to "post directly via web automation" because it's faster than dealing with API approval. APIs require review and rate limits.

**How to avoid (Co-Op-specific, M2):**
- **API-only posting for platforms that have one** (LinkedIn via official API/approved partners; X via API v2; Bluesky AT Protocol; Mastodon API; Threads API). No headless-browser automation.
- **No personal-account posting.** Marketing posts go to project accounts the user has explicitly designated; never to the user's personal handle.
- **Posting cadence rate-limit per platform** below known suspension thresholds (LinkedIn ≈3-5/week; X ≈3-5/day; conservative).
- **Approved-partner adapters:** Buffer / Hootsuite / Publer / Typefully API integration is safer than direct API for some platforms.
- **Account warmup:** new project social accounts are flagged as "unwarmed"; first month posts manually, automation kicks in only after the account has organic activity.
- **Backoff on rate-limit response codes** with circuit-break: three consecutive rate-limits → automation off, alert human.

**Warning signs:**
- Posts return 200 but never appear in the feed (shadow-ban signal).
- Login challenges or 2FA prompts inside the automation flow.
- Engagement on automated posts ≪ engagement on manual posts (account quality dropping).

**Phase to address:** M2 — must be in the M2 spec, not retrofitted.

**Severity:** CRITICAL for M2 — a banned account is irreversible.

---

### Pitfall 17: M2 — attribution loss when multiple projects share content infrastructure

**What goes wrong (forecast for M2):**
Project A and Project B both use the marketing platform. They share a single set of UTM parameter conventions, a single GA property, a single shortlink resolver. Click data muddles between projects; the user can't tell whether a conversion came from the co-op launch post or the side-project launch post. Worse: the user notices the muddle, manually edits, breaks something, and now historical attribution is unreliable too.

**Why it happens:**
Reusable means shared by default; per-project isolation is extra work that gets cut when the layer is being designed for "any project."

**How to avoid (M2):**
- **Per-project tenancy at every attribution layer:** project-scoped UTM `source=coop-{projectId}`, project-scoped shortlink prefix, project-scoped analytics property recommendation in onboarding.
- **No global registries.** Don't add a "marketing dashboard" that aggregates across projects until per-project works flawlessly.
- **Attribution audit log:** every click → which project it landed under, which posting it came from, which campaign — auditable in the activity log model.

**Phase to address:** M2.

**Severity:** SERIOUS for M2.

---

### Pitfall 18: M2 — drift between product reality and marketing claims

**What goes wrong (forecast for M2):**
The marketing agent reads `PROJECT.md` from a week ago, generates a launch post claiming "supports OpenClaw runtime" — except that was deferred (per `PROJECT.md` Out of Scope). The post goes out. A user signs up because of the OpenClaw claim, can't find it, files a complaint, leaves a bad review. AI brand drift: the agent confidently asserts product features that don't exist. ([AI brand drift — Neurospicy](https://www.neurospicy.agency/post/coining-ai-brand-drift-a-formal-definition), [AI marketing compliance risks — PerformLine](https://performline.com/blog-post/ai-marketing-compliance-risks-real-world-violations/), [Misleading marketing — PerformLine](https://performline.com/blog-post/the-rise-of-misleading-marketing-why-compliance-matters/))

A regulatory wrinkle: AI-washing has produced SEC penalties; the FTC ran a sweep on deceptive AI claims. A self-hosted dev tool isn't directly in their crosshairs but a co-op user marketing their own SaaS via co-op's marketing platform is.

**Why it happens:**
The marketing agent's training data and stale context don't know what shipped this week. The "ship list" lives in commits and changelogs that the agent isn't reading.

**How to avoid (M2):**
- **Source-of-truth check:** marketing skills consume `PROJECT.md` Validated section as the canonical "what exists" feed. Claims must trace back to a Validated entry or a tagged commit.
- **Anti-claim linter:** scan drafts for product features and require each to match a Validated entry or be flagged.
- **Versioning the claim corpus:** when a Validated requirement moves to Out of Scope, the marketing layer flags any published content that references it for retraction.
- **Mandatory disclaimer when claims go beyond Validated:** "planned for $milestone" annotation injected by the linter.
- **For users marketing their own products via co-op:** ship the linter as a shared skill so the brand-drift problem is solved by default for them too.

**Phase to address:** M2.

**Severity:** SERIOUS for M2; CRITICAL if the user's customers are in regulated industries.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|---|---|---|---|
| `console.error` ad-hoc logging instead of structured logger | Skips an infra decision | Debugging agent runs is impossible; secrets leak ungated; signal/noise unmanaged | Never in M1 — pick a logger now; the visibility phase needs structure |
| `try { … } catch { /* DB might not be ready */ }` swallowing layout errors (already in repo, `(dashboard)/layout.tsx:20`, `p/[projectId]/layout.tsx:50`) | Prevents render crash on cold boot | Hides real DB outages, masks regressions, paper-cuts new users | Never — replace with explicit "starting up" state |
| Plaintext API keys in `ModelKey.keyEncrypted` (CONCERNS.md) | Skipped envelope encryption | Single audit-log read = full credential dump; Pitfall 7 amplifier | Never — encrypt now, audit-log later |
| Card/column routes with no project-membership check (CONCERNS.md) | Faster initial CRUD | Cross-tenant horizontal escalation; agent-mediated attacks via injection become much worse | Never — fix before agent-runtime work lands |
| Polling chat at 5s instead of `/sync` | Simpler client | Battery drain on mobile; ghost-interval bug in CONCERNS.md ; Synapse load multiplied per agent | Acceptable only until mobile work, then must change |
| No per-route schema validation (CONCERNS.md "trust `request.json()`") | Faster routes | Agent-supplied tool inputs are unbounded; injection via extra fields; partial-write states | Never — schema-validate every mutating route, especially agent tool routes |
| Data-URL attachments stored in Postgres text | No object store needed | XSS risk on render; logs explode; mobile bandwidth dies on a card with images | Acceptable only for MVP; must move to object store before mobile + before agents start uploading |
| Hardcoded `:coop.local` MXID suffix (CONCERNS.md `matrix.ts:24`) | Worked for the original demo | Self-hosters with custom homeservers break silently | Never — derive from `MATRIX_HOMESERVER_URL` |
| In-process scheduler (`COOP_INPROC_CRON`) on single PM2 replica | Simpler than a dedicated worker | Agents can't be horizontally scaled; reliability of scheduler tied to web replica health | Acceptable for self-host; document loudly; revisit when multi-replica is needed |
| Inline styles + 552-line `CardDetailModal.tsx` (CONCERNS.md fragile area) | Ships fast | Mobile work touches every section; adapting one monolith for responsive is brittle | Refactor before mobile phase begins, not during |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|---|---|---|
| **Anthropic API** | Treating tool-calling as deterministic; assuming `stop_reason` reliably indicates completion | Use the loop-cap pattern from Pitfall 1; never trust `stop_reason: end_turn` alone — check the ledger |
| **OpenAI API** | Different tool-call shape vs Anthropic; provider adapters silently disagree on retries | Conformance test suite that runs the *same* prompt+tools against every provider and asserts equivalent semantics |
| **Claude Code CLI** | Spawn without watchdog; sharing `~/.claude` between concurrent runs; relying on `cwd` in `stream-json` mode (see Pitfall 3) | Per-run isolated `HOME`, watchdog with SIGKILL escalation, working-directory smoke test |
| **Codex CLI** | Same subprocess-management hazards as Claude Code; assuming Linux-style PIDs and signals work identically on macOS | Same: per-run isolation, watchdog, smoke test; verify `pgrep -P` is *not* used |
| **Synapse / Matrix** | `MATRIX_ADMIN_TOKEN=''` fallback (CONCERNS.md `matrix.ts:5`); silent `matrixRoomId: null` channels (CONCERNS.md `chat/rooms/route.ts:80-85`); deterministic password derivation (`matrix.ts:156-158`) | Fail-fast on empty admin token in production; surface room-creation failure as a UI error; replace deterministic password with a stored random secret |
| **PostgreSQL** | Non-atomic move reindex (CONCERNS.md `cards/[id]/move/route.ts:11-27`); fallback DSN binding to localhost dev creds | Move read+write inside one `prisma.$transaction`; fail to start if `DATABASE_URL` unset in production |
| **GitHub App** | Pushing on a stale agent-held branch; webhook events arriving while a run is mid-flight | Optimistic-concurrency on branch SHA in tool input; queue webhook events per run id |
| **Sandboxed runner** | Trusting stdout as data not instructions (Pitfall 2); leaving the container running after run ends | Tool-result envelope; container-per-run with hard timeout; SIGKILL → reap → cleanup |
| **NextAuth v5 (beta)** | Beta API churn; relying on `session.user as any` for custom fields (CONCERNS.md) | Pin exact version; module-augment `Session` type; remove `as any` casts as part of M1 reliability scope |
| **next-auth ↔ Matrix** | `generateMatrixPassword` derived from `NEXTAUTH_SECRET` (CONCERNS.md) — leaked secret ⇒ all Matrix accounts compromised | Random per-user Matrix password persisted server-side, encrypted at rest |
| **lucide-react** | Mis-pinned `^1.8.0` (CONCERNS.md) | Audit and correct version pin; lock-file enforcement |
| **LinkedIn / X / Bluesky (M2)** | Headless-browser automation; posting at agent-decided cadence; using personal accounts | Official API only; conservative rate-limits; project accounts only; warmup period (see Pitfall 16) |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|---|---|---|---|
| **Over-eager `include` on project GET** (CONCERNS.md `projects/[id]/route.ts:17-48`) | Slow project switch; 2-3s blank state | Surgical includes per route; React `cache()` for memoization | At a single project with ≈50 cards × multiple boards |
| **Heavy project list for switcher** (CONCERNS.md `projects/route.ts:11-24`) | Sidebar render lag | Return `id/name/color/icon` only | At ≈10 projects per company |
| **Chat polling every 5s per room** (CONCERNS.md) | Mobile battery drain; Synapse load per agent | Switch to Matrix `/sync` long-poll or `matrix-js-sdk` | Compounds linearly with agents — every agent in chat = an extra polling client |
| **Layout re-runs N sequential DB queries per nav** (CONCERNS.md `(dashboard)/p/[projectId]/layout.tsx`) | TTI regression on every project route change | `Promise.all` parallelization + React `cache()` | Already breaks on slow disk |
| **Integer position columns + O(n) reindex on move** (CONCERNS.md) | Move latency growing with column size; lock contention with concurrent agents | Fractional / lexorank indexing | At ≈100 cards/column or with 2+ concurrent move-makers |
| **Agent context bloat** (Pitfall 1) | Token cost growing per run length; latency rising | Hard context window cap + summary-of-summaries; prune tool outputs | At long-horizon tasks (15+ tool calls) |
| **Activity log queried as a stream without index** | Run summary generation slowing; visibility UI lagging | `(projectId, runId, createdAt)` composite index; pagination | At ≈10k activity rows |
| **Mobile media-query layout shift / repaint** | CLS spike on viewport change; janky orientation flip | Container queries instead of breakpoint cascades; `content-visibility: auto` for off-screen kanban columns | At any layout shift on rotation |
| **Synchronous Synapse calls in route handlers** | Channel creation slow; chat token endpoint timing out | Background job for non-critical Synapse ops; retry with circuit-break | At Synapse cold-start or under-load |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---|---|---|
| **Plaintext provider keys** (CONCERNS.md, `ModelKey.keyEncrypted`) | One DB read or audit-log read = total credential compromise | Envelope encryption (AES-GCM with master key from KMS or env-bound secret) |
| **Trusting tool output as instruction** (Pitfall 2) | Agent acts on attacker-controlled card/comment/shell content | Tool-result envelope, capability mediation, sensitive-action gate |
| **Cross-tenant card/column access** (CONCERNS.md, all `api/cards/**` and `api/columns/**`) | Any authenticated user reads/edits any card in any company | `ProjectMember` join on every scoped route; integration test for cross-tenant attempts |
| **Audit log captures secrets verbatim** (Pitfall 7) | Audit becomes credential dump | Redact-by-default; allowlist; sensitivity tags |
| **Deterministic Matrix password from `NEXTAUTH_SECRET`** (CONCERNS.md) | Leaked NextAuth secret ⇒ every Matrix account compromised | Random per-user secret stored encrypted |
| **Empty `MATRIX_ADMIN_TOKEN` fallback** (CONCERNS.md) | Silent prod misconfiguration | Fail-fast on startup |
| **Localhost DB-creds fallback** (CONCERNS.md, `db.ts:8`) | Misconfigured prod silently uses dev creds | Fail-fast on startup |
| **No input validation on routes** (CONCERNS.md) | Extra fields flow through; agent-supplied tool inputs unbounded | Zod schemas per route, especially every agent tool route |
| **Data-URL attachments with attacker-controlled mimeType** (CONCERNS.md) | XSS on render | Server-validate mimeType against an allowlist; sanitize on render; move to object store with content-type enforcement |
| **No rate limiting on auth + tool routes** (CONCERNS.md) | Credential stuffing; agent-mediated abuse | Per-IP and per-account limits |
| **No CSRF beyond NextAuth defaults** (CONCERNS.md) | Cross-origin mutation against authenticated session | Origin-check middleware on mutation routes |
| **Unbounded agent loop** (Pitfall 1) | Cost runaway = DoS-via-billing on the user's own card | Hard caps in runtime, not prompt |
| **Subprocess process-table exhaustion** (Pitfall 3) | Box becomes unresponsive | Watchdog + reaper + per-run isolation |
| **M2: headless-browser social automation** (Pitfall 16) | Account ban (irreversible) | API-only; rate limits; warmup |
| **M2: marketing claims drift from product** (Pitfall 18) | False advertising; FTC/SEC exposure for users in regulated spaces | Anti-claim linter against `PROJECT.md`; mandatory human review |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---|---|---|
| **Hover-only affordances on touch** (Pitfall 10) | Mobile users can't see drag handles, action buttons, tooltips | Persistent visible affordances + `(hover: hover)` gates on flourishes |
| **Drag-to-scroll conflict on touch** (Pitfall 12) | Scroll triggers drag or vice versa | Drag-handle zone + tap-to-open card body + non-drag move fallback |
| **iOS keyboard pushes modal off-screen** (Pitfall 11) | Comment textarea invisible; submit button under keyboard | `dvh`, Visual Viewport API, `safe-area-inset-bottom`, no body `overflow:hidden` |
| **Approval modal storm** (Pitfall 9) | Reviewer rubber-stamps everything | Tiered approval; batched at run boundaries; revert button |
| **Run summaries that don't match what happened** (Pitfall 6) | Human "trusts" agent until they don't | Ledger-derived summaries; two-column "what I did / what agent says" |
| **Diffs that elide side effects** (Pitfall 8) | Approver sees 1/5 of what changed | Run-scoped diff with negative-space rendering |
| **Silent empty sidebar on DB hiccup** (CONCERNS.md `(dashboard)/layout.tsx:20`) | New users think they have no projects; existing users think projects vanished | Explicit error state with retry; never `catch {}` and render empty |
| **Channel with `matrixRoomId: null`** (CONCERNS.md `chat/rooms/route.ts:80-85`) | Zombie channel users can't message | Atomic channel creation; UI surfaces the failure |
| **Agent activity feed without grouping** | Visual noise; humans can't tell what's one run vs many | Run-scoped grouping; collapse routine entries |
| **Hover-to-reveal "edit" pencils** | Mobile users can't edit | Persistent edit button with appropriate touch size |
| **Popover that escapes viewport** (Pitfall 11 sub) | Selection menu off-screen | floating-ui `flip + shift + size` middleware |
| **Long-press triggers iOS callout instead of drag** (Pitfall 12 sub) | Drag never starts | `-webkit-touch-callout: none; user-select: none` on drag handles |
| **No fallback for drag** | Touch users stuck if drag fails | Card detail "Move to…" action |
| **M2: AI slop launch content** (Pitfall 15) | Launch credibility hit | Anti-slop linter; receipts required; mandatory human polish |

---

## "Looks Done But Isn't" Checklist

- [ ] **Agent run completion:** the activity log shows a `terminated` reason — verify it's `completed`, not `iter_cap`, `wall_clock`, `tool_thrash`, or silent abort.
- [ ] **Run summary:** the LLM-generated summary matches the ledger — verify by sampling 10 runs, comparing claims to `CardActivity` rows.
- [ ] **Provider parity:** "works on Anthropic" — verify the same prompt+tools run on OpenAI, Claude Code CLI, and Codex CLI to equivalent results.
- [ ] **Cost control:** "we have a max-iter cap" — verify it's enforced in the runtime by simulating an infinite-loop tool and observing termination at the cap.
- [ ] **Subprocess hygiene:** "agent runs end cleanly" — verify with `ps aux | grep -E "claude|codex"` after a kill, expecting zero zombies.
- [ ] **Indirect injection defense:** "we trust tool outputs less" — verify by planting a "ignore previous instructions" string in a card description and observing it's ignored.
- [ ] **Optimistic concurrency:** "moves are atomic" — verify by running two concurrent moves on the same card via Postgres `pg_advisory_lock` test.
- [ ] **Plan vs execution binding:** "approval is enforced" — verify the runtime refuses a tool call not in the approved plan.
- [ ] **Activity diff completeness:** "the diff shows what changed" — verify by running an agent run that touches 5 entities and asserting all 5 appear in the diff.
- [ ] **Audit log redaction:** "secrets are stripped" — verify by injecting a known fake `sk-test-...` and grepping the log table for it.
- [ ] **Mobile drag handle:** "drag works on touch" — verify on a real iPhone, not just emulator; verify card cannot be accidentally picked up while scrolling.
- [ ] **iOS keyboard:** "modal stays visible" — verify by opening card detail, focusing comment textarea on iOS Safari, and observing the textarea remains in the visual viewport.
- [ ] **Touch targets:** "buttons are tappable" — verify all interactive elements ≥44×44pt with breathing room.
- [ ] **Empty state vs error state:** "we don't render an empty sidebar on DB error" — verify by killing Postgres and observing an error state, not silence.
- [ ] **Per-tenant isolation:** "card routes check membership" — verify by attempting cross-tenant access in tests for every `api/cards/**` and `api/columns/**` route.
- [ ] **No data URLs in audit log** — verify by grepping log table for `data:` prefixes.
- [ ] **Run-mode flag honored:** "agent in propose-only mode doesn't execute" — verify by setting the flag, running an agent, asserting no mutating tool calls occurred.
- [ ] **Rollback works:** "I can revert a run" — verify by approving a run that touches 3 entities, clicking revert, asserting all 3 entities returned to prior state.
- [ ] **M2: anti-slop linter rejects template-shaped content** — verify by feeding the linter known slop and observing rejection.
- [ ] **M2: anti-claim linter rejects hallucinated features** — verify by feeding draft "supports OpenClaw" (currently Out of Scope) and observing rejection.
- [ ] **M2: social-posting respects platform rate limits** — verify by simulating 10 rapid posts and observing throttle.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---|---|---|
| **Cost runaway (Pitfall 1)** | LOW (financial), MEDIUM (process) | (1) Kill the run via runtime kill switch. (2) Revert any tool effects via the run's inverse-op record. (3) Lower the cap and re-test. (4) Flag the prompt+model+tool combination in a `RUNAWAY.md` deny list until investigated. |
| **Indirect injection (Pitfall 2)** | HIGH if a key was exfiltrated; MEDIUM otherwise | (1) Rotate every credential the agent had access to. (2) Audit-log read to identify exfil pathway. (3) Quarantine the source content (card/comment/file). (4) Add the attack pattern to the classifier. |
| **Subprocess zombies (Pitfall 3)** | LOW | (1) `pkill -9 claude` / `pkill -9 codex`. (2) Clear stale per-run dirs. (3) Restart PM2. (4) If recurring, downgrade the CLI version per the linked GitHub issues. |
| **Stale tool state (Pitfall 4)** | LOW | (1) Re-fetch fresh state. (2) If the agent has applied conflicting writes, revert via inverse-op. (3) Add the conflict pattern to the run's "what changed since you started" response. |
| **Plan drift (Pitfall 5)** | MEDIUM | (1) Halt the run. (2) Diff approved plan vs executed graph. (3) Revert un-approved tool calls. (4) Re-prompt with stricter plan-binding system message. |
| **Hallucinated summary (Pitfall 6)** | LOW (automated) | (1) Surface the discrepancy badge. (2) Re-generate with stricter ledger-only context. (3) If repeated, flag the model+prompt in the eval suite. |
| **Audit log secrets leak (Pitfall 7)** | HIGH | (1) Truncate or anonymize the affected log rows. (2) Rotate every credential present in the leaked window. (3) Verify the redactor was running and patch the gap. |
| **Misleading diff approved (Pitfall 8)** | MEDIUM | (1) One-click revert via the run's inverse-op record. (2) Patch the diff renderer to surface the missed entity class. (3) Add a regression test. |
| **Approval fatigue → bad approval (Pitfall 9)** | depends on the action | (1) Revert if reversible. (2) Reduce approval frequency by codifying more "routine" actions. (3) Add the false-approve to the per-project metric. |
| **Hover-only affordance shipped (Pitfall 10)** | LOW | Hotfix CSS rule + persistent affordance; ship in the same release as the regression test. |
| **iOS keyboard layout breakage (Pitfall 11)** | LOW | Hotfix `dvh` + Visual Viewport listener; ship a regression visual test on iPhone simulator. |
| **Touch drag-scroll conflict (Pitfall 12)** | LOW | Add drag-handle, document the new gesture, ship the move-fallback. |
| **Dogfood blindness (Pitfall 13)** | MEDIUM | Reset-and-onboard drill; collect paper-cuts; triage as a backlog phase. |
| **Dogfood paradox break (Pitfall 14)** | HIGH if data lost; MEDIUM otherwise | (1) Restore from snapshot. (2) Disable agents in the affected project. (3) Run-mode set to `propose-only` until trust rebuilt. |
| **M2: AI slop published (Pitfall 15)** | HIGH (reputational) | (1) Retract or edit. (2) Tighten the linter. (3) Mandatory human-edit pass for the next 30 days. |
| **M2: account banned (Pitfall 16)** | HIGH (often irreversible) | (1) Appeal per platform; success rates are low. (2) Migrate to a fresh account; re-warmup. (3) Audit posting cadence and switch to API-approved partner. |
| **M2: attribution muddle (Pitfall 17)** | MEDIUM | (1) Re-segment historical data by per-project UTM where possible. (2) Caveat the affected reporting period. |
| **M2: claim drift (Pitfall 18)** | HIGH (regulatory + reputational for users in regulated industries) | (1) Retract / correct. (2) Tighten anti-claim linter. (3) Notify any users impacted. |

---

## Pitfall-to-Phase Mapping

This is the load-bearing table for roadmap construction. Severity drives ordering; phase ownership clarifies where each defense gets built.

| # | Pitfall | Severity | Prevention Phase | Verification |
|---|---|---|---|---|
| 1 | Unbounded agent loop / cost runaway | CRITICAL | Reliability | Unit test: infinite-loop tool terminates at cap; metric: cost-per-run bounded |
| 2 | Indirect prompt injection via tool outputs | CRITICAL | Reliability (envelope + capability) | Test: planted injection in card description doesn't trigger; sec review of tool output flow |
| 3 | Stuck CLI subprocesses (Claude Code / Codex zombies) | CRITICAL | Reliability (runtime hardening) | `ps` shows zero zombies post-kill; reaper sweep test; per-CLI smoke test |
| 4 | Stale tool state | SERIOUS | Reliability + Planning-loop | Concurrent-move test with optimistic concurrency; agent retry on `409 STALE` |
| 5 | Plan drift — proposal ≠ execution | CRITICAL | Planning-loop | Test: tool call not in plan is rejected; manual review of 20 runs for divergence |
| 6 | Run-summary hallucination | SERIOUS | Visibility/Audit | Sample 10 runs; assert summary claims appear in ledger |
| 7 | Audit-log leakage / over-logging | CRITICAL on leakage | Visibility/Audit | Redactor fuzz test; signal/noise sampling each phase exit |
| 8 | Misleading diff views | SERIOUS | Visibility/Audit + Planning-loop | Run touching 5 entities → diff shows all 5; revert restores all 5 |
| 9 | Approval fatigue | SERIOUS | Planning-loop + Visibility | False-approve rate metric per project; tiered-action policy in code |
| 10 | Hover-only affordances on touch | SERIOUS | Mobile | Audit `:hover` rules; manual touch device test |
| 11 | iOS Safari keyboard layout breakage | SERIOUS | Mobile | iPhone real-device test of card detail, chat, comment, picker |
| 12 | Touch DnD scroll-trapping & accidental drags | SERIOUS | Mobile | iPhone real-device test; non-drag fallback verified |
| 13 | Dogfood blindness | SERIOUS | Cross-cutting (every phase exit) | Reset-and-onboard drill at phase boundaries |
| 14 | Dogfood paradox break | CRITICAL | Reliability + Planning-loop | Run-mode flag enforced; snapshot-before-mutation verified; rollback tested |
| 15 | M2 generic AI slop | SERIOUS | M2 (forecast) | Anti-slop linter rejects known slop; voice-fingerprint deviation alert |
| 16 | M2 social-posting bans | CRITICAL for M2 | M2 (forecast) | API-only enforced; rate-limit tests; warmup gating |
| 17 | M2 attribution loss | SERIOUS for M2 | M2 (forecast) | Per-project UTM enforced; cross-project leakage test |
| 18 | M2 claim-drift / brand drift | SERIOUS for M2 | M2 (forecast) | Anti-claim linter rejects hallucinated features against PROJECT.md |

**Phase ordering implication:** Reliability is the prerequisite for everything. Visibility/Audit and Planning-loop can proceed in parallel after Reliability lands, but they share the Pitfall 8 / 9 work and should coordinate. Mobile is independent and can ship anytime after the backend is stable enough to demo on a phone. M2 pitfalls inform the M2 spec but do not gate M1.

---

## Sources

**Agent reliability + loops + prompt injection (HIGH confidence):**
- [LangChain & LangGraph — Last9](https://last9.io/blog/langchain-langgraph-the-frameworks-powering-production-ai-agents/)
- [Why Your LangGraph Agents Fail in Production — DEV](https://dev.to/sai_raghavendra_c7535ddf3/why-your-langgraph-agents-fail-in-production-and-the-architecture-that-fixes-it-5fca)
- [Agentic RAG Failure Modes — Towards Data Science](https://towardsdatascience.com/agentic-rag-failure-modes-retrieval-thrash-tool-storms-and-context-bloat-and-how-to-spot-them-early/)
- [The 100th Tool Call Problem — Data Science Collective / Medium](https://medium.com/data-science-collective/the-100th-tool-call-problem-why-most-ci-agents-fail-in-production-36b4fd62089b)
- [Agent Runaway Costs — RelayPlane](https://relayplane.com/blog/agent-runaway-costs-2026)
- [How to Stop AI Agent Cost Blowups — DEV](https://dev.to/sapph1re/how-to-stop-ai-agent-cost-blowups-before-they-happen-1ehp)
- [Stop Runaway AI Agent Costs — SupraWall](https://www.supra-wall.com/en/learn/ai-agent-runaway-costs)
- [AgentGuard — Patrick Hughes Blog](https://bmdpat.com/blog/ai-agent-cost-control-agentguard-python)
- [OWASP LLM01:2025 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
- [Microsoft on indirect prompt injection](https://www.microsoft.com/en-us/msrc/blog/2025/07/how-microsoft-defends-against-indirect-prompt-injection-attacks)
- [Bypassing LLM Supervisor Agents — Praetorian](https://www.praetorian.com/blog/indirect-prompt-injection-llm/)
- [Web-Based Indirect Prompt Injection — Unit 42](https://unit42.paloaltonetworks.com/ai-agent-prompt-injection/)
- [Defense via Tool Result Parsing — arXiv 2601.04795](https://arxiv.org/html/2601.04795)
- [NVIDIA on securing LLM systems against prompt injection](https://developer.nvidia.com/blog/securing-llm-systems-against-prompt-injection/)
- [Devin / OpenHands review — BuildWithClarity](https://buildwithclarity.hashnode.dev/firing-cursor-devin-why-i-switched-to-open-source-ai)
- [Devin/OpenHands trust analysis — arXiv 2603.26221](https://arxiv.org/html/2603.26221v1)

**CLI subprocess hazards (HIGH confidence):**
- [Claude Code SDK subprocess hangs — issue #18666](https://github.com/anthropics/claude-code/issues/18666)
- [Closed Claude Code sessions leave zombies — issue #54130](https://github.com/anthropics/claude-code/issues/54130)
- [Fixing Claude Code's process forking bug — Shivanka Aul](https://shivankaul.com/blog/claude-code-process-exhaustion)
- [Claude CLI subprocess death — claude-agent-acp #338](https://github.com/zed-industries/claude-agent-acp/issues/338)
- [Bash tool cwd forced to / in stream-json — claude-code #46985](https://github.com/anthropics/claude-code/issues/46985)
- [Claude Code troubleshooting docs](https://code.claude.com/docs/en/troubleshooting)

**Drift, planning, hallucination (MEDIUM-HIGH confidence):**
- [Agent drift — Wire blog](https://usewire.io/blog/agent-drift-why-long-running-ai-agents-lose-the-plot/)
- [Agent drift in AI systems — emergentmind](https://www.emergentmind.com/topics/agent-drift)
- [Scope drift in AI projects — Omdena](https://www.omdena.com/blog/scope-drift-in-ai-projects)
- [Agent failure modes — NimbleBrain](https://nimblebrain.ai/why-ai-fails/agent-governance/agent-failure-modes/)
- [Reasoning models hallucinate more — Pryon](https://www.pryon.com/resource/reasoning-models-hallucinate-more----marking-trouble-for-ai-agent-adoption)
- [LLM-based agents hallucinate — arXiv survey](https://arxiv.org/html/2509.18970v1)
- [Tool-use hallucination — YSquare](https://www.ysquaretechnology.com/blog/tool-use-hallucination-ai-agents)
- [Detecting hallucinations with LLM-as-judge — Datadog](https://www.datadoghq.com/blog/ai/llm-hallucination-detection/)

**Observability + audit (MEDIUM-HIGH):**
- [Agent observability for production — AgentixLabs](https://www.agentixlabs.com/blog/general/agent-observability-for-production-trace-tools-cost-and-safety-signals/)
- [AI Agent Audit Logs — Maxim AI](https://www.getmaxim.ai/articles/ai-agent-audit-logs-full-visibility-over-tool-usage/)
- [Auditing and Logging AI Agent Activity — LoginRadius](https://www.loginradius.com/blog/engineering/auditing-and-logging-ai-agent-activity)
- [LLM secret leakage — Doppler](https://www.doppler.com/blog/advanced-llm-security)
- [MCP Audit Logging — Tetrate](https://tetrate.io/learn/ai/mcp/mcp-audit-logging)

**Human-in-the-loop UX (MEDIUM):**
- [Review fatigue is breaking HITL — Medium](https://ravipalwe.medium.com/review-fatigue-is-breaking-human-in-the-loop-ai-heres-the-design-pattern-that-fixes-it-044d0ab1dd12)
- [Human-in-the-Loop fallacy — ChatFin](https://chatfin.ai/blog/the-human-in-the-loop-fallacy-when-to-fully-trust-the-agent/)
- [Human-in-the-Loop best practices — Permit.io](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices-frameworks-use-cases-and-demo)
- [Human-in-the-Loop — Mastra blog](https://mastra.ai/blog/human-in-the-loop-when-to-use-agent-approval)

**Partial-write / rollback (MEDIUM):**
- [Agentic Two-Phase Commits — pydantic-ai issue #4679](https://github.com/pydantic/pydantic-ai/issues/4679)
- [AI agent rollback strategy — Fast.io](https://fast.io/resources/ai-agent-rollback-strategy/)
- [The data rollback problem — TianPan](https://tianpan.co/blog/2026-04-20-ai-agent-data-rollback-production)
- [Cohesity / Datadog recoverability — The Register](https://www.theregister.com/2026/03/10/agentic_ai_rollback_recovery_cohesity/)
- [IBM STRATUS — undo-and-retry for agents](https://research.ibm.com/blog/undo-agent-for-cloud)

**Mobile / iOS / DnD (HIGH on iOS, MEDIUM on dnd patterns):**
- [Safari position:fixed + virtual keyboard — Medium](https://medium.com/@im_rahul/safari-and-position-fixed-978122be5f29)
- [Fixing the Safari mobile resizing bug — Medium](https://medium.com/@krutilin.sergey.ks/fixing-the-safari-mobile-resizing-bug-a-developers-guide-6568f933cde0)
- [Prevent iOS keyboard pushing modal — tutorialpedia](https://www.tutorialpedia.org/blog/how-to-prevent-ios-keyboard-from-pushing-the-view-off-screen-with-css-or-js/)
- [VirtualKeyboard API — Bram.us](https://www.bram.us/2021/09/13/prevent-items-from-being-hidden-underneath-the-virtual-keyboard-by-means-of-the-virtualkeyboard-api/)
- [iOS body-scroll-lock fix — Medium](https://stripearmy.medium.com/i-fixed-a-decade-long-ios-safari-problem-0d85f76caec0)
- [Floating-ui keyboard issue — #3362](https://github.com/floating-ui/floating-ui/issues/3362)
- [@hello-pangea/dnd touch sensor docs](https://github.com/hello-pangea/dnd/blob/main/docs/sensors/touch.md)
- [@hello-pangea/dnd auto-scroll docs](https://github.com/hello-pangea/dnd/blob/main/docs/guides/auto-scrolling.md)
- [NN/G drag-and-drop guidelines](https://www.nngroup.com/articles/drag-drop/)
- [UX patterns to reconsider for mobile — Fuzzy Math](https://fuzzymath.com/blog/6-ux-design-patterns-reconsider-for-mobile-designs/)
- [37signals on mobile Card Table](https://dev.37signals.com/bringing-card-table-to-the-small-screen/)
- [UXPin on responsive design for touch](https://www.uxpin.com/studio/blog/responsive-design-touch-devices-key-considerations/)
- [Smart Interface Design — drag and drop UX](https://smart-interface-design-patterns.com/articles/drag-and-drop-ux/)

**Dogfood (MEDIUM):**
- [Product dogfooding — Userpilot](https://userpilot.com/blog/product-dogfooding/)
- [Dogfooding isn't enough — DEV](https://dev.to/polluterofminds/dogfooding-your-own-product-isn-t-enough-2gb9)
- [How we dogfood at PostHog](https://posthog.com/product-engineers/dogfooding)
- [Dogfooding 101 — UserVoice](https://uservoice.com/blog/drive-internal-alignment)
- [Dogfooding — Mad Devs](https://maddevs.io/blog/dogfooding/)

**Marketing-as-platform (MEDIUM):**
- [AI slop — Copy.ai](https://www.copy.ai/blog/ai-slop)
- [AI-powered slop sites — DeepSee](https://deepsee.io/blog/ai-slop-sites-programmatic-advertising)
- [Stop the slop — SurferSEO](https://surferseo.com/blog/ai-generated-content/)
- [Measuring AI slop in text — arXiv](https://arxiv.org/pdf/2509.19163)
- [LinkedIn jail — Evaboot](https://evaboot.com/blog/linkedin-jail)
- [Twitter automation bans — Follows.com](https://follows.com/blog/2022/02/can-banned-twitter-automation)
- [LinkedIn automation safety — Anyleads](https://anyleads.com/does-linkedin-allow-automation)
- [Bot account banned — X devcommunity](https://devcommunity.x.com/t/bot-account-banned-without-a-reason/195723)
- [AI brand drift — Neurospicy](https://www.neurospicy.agency/post/coining-ai-brand-drift-a-formal-definition)
- [AI marketing compliance risks — PerformLine](https://performline.com/blog-post/ai-marketing-compliance-risks-real-world-violations/)
- [Misleading marketing — PerformLine](https://performline.com/blog-post/the-rise-of-misleading-marketing-why-compliance-matters/)
- [AI for narrative drift — Influencers Time](https://www.influencers-time.com/ai-for-narrative-drift-detection-in-influencer-marketing/)

**Co-op repo evidence (HIGH — primary source):**
- `/Users/parth/Projects/parth/co-op/.planning/PROJECT.md`
- `/Users/parth/Projects/parth/co-op/.planning/codebase/CONCERNS.md`
- `/Users/parth/Projects/parth/co-op/.planning/codebase/ARCHITECTURE.md`

---
*Pitfalls research for: agent-as-teammate workspace, brownfield M1 (reliability + visibility + planning loop + mobile) with M2 marketing-as-platform forecast.*
*Researched: 2026-05-01*
