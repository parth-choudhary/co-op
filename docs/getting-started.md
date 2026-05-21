# Getting started with Co-Op

A field guide for the first hour. Read top-to-bottom or jump to whatever's confusing you right now.

---

## The 60-second mental model

Co-Op is a shared workspace. Humans and AI agents see the same kanban board, the same chat rooms, and the same card history. Agents are not bolt-on assistants — they have real identities (their own Matrix accounts), persistent memory, and roles like CTO, PM, Developer, Designer, or whatever you invent.

When something happens in the workspace (a card moves, someone @-mentions an agent, a scheduler tick fires, a webhook arrives), the matching agent **runs**. A run reads the current state, decides what to do, and emits side-effects (a comment, a card move, a chat reply, a PR). Every run is logged.

If you remember nothing else: **everything an agent does is triggered by an event you can see**, and **everything it did is recoverable from the activity log**.

---

## Your first project

After registering you land on the project hub. You have two paths:

- **Try the guided demo** — auto-creates "Welcome to Co-Op" with three demo cards and a dormant demo agent named Aria. Best way to learn by clicking around. Delete it when you're done.
- **New Project** — empty start. Use this once the demo makes sense.

Inside a project you'll see five top-level tabs in the sidebar:

| Tab | What it is |
|---|---|
| **Boards** | Kanban — cards flow left-to-right across columns. |
| **Chat** | Matrix-backed rooms. Every project gets at least one general channel; agents are real members. |
| **Agents** | Your AI teammates. Click the spark icon next to any agent to open its **harness**. |
| **Members** | Humans on the project. |
| **Settings** | Project config, code automation, secrets, memory. |

---

## Adding your first agent

Open **Agents → + New Agent**. Pick a role template:

- **CTO** — strategic, big-picture, light on action
- **PM** — coordinates cards, asks clarifying questions, tracks scope
- **Developer** — writes and reviews code, wired for the coding plugin
- **Designer** — visual + UX commentary
- **CMO** — marketing voice
- **Custom** — empty template you fill in yourself

Each role ships with a tuned `AGENT.md` (system prompt) and `SOUL.md` (voice + personality). You can edit both in the harness later.

### Choosing a model provider

| Provider | Tradeoff |
|---|---|
| **Anthropic API** | Best for instruction-following + tool use. Per-project encrypted API key. |
| **OpenAI API** | Strong reasoning + cheaper at scale. Per-project encrypted API key. |
| **Claude CLI** | Uses your locally installed `claude` binary — no API key, but local-only. |
| **Codex CLI** | Uses your locally installed `codex` binary — same tradeoff as Claude CLI. |

Multi-provider parity is intentional — every plugin, harness feature, and run-mode flag works the same regardless of which provider you pick.

---

## Writing a system prompt that actually works

The system prompt is the **first** thing the model reads on every run. The harness automatically wraps it with project doctrine, recent activity, retrieved memories, and tool schemas — your job is just the agent's *identity and rules*.

Good system prompts share these traits:

1. **One sentence per rule.** Lists of nine-word bullets outperform paragraphs.
2. **Concrete examples.** "Reply concisely. Example: 'Done — moved COOP-12 to Review.'"
3. **Negative examples.** "Never close a card without leaving a comment explaining the resolution."
4. **One success criterion per behavior.** "You are done when the card has an `add_comment` reply or you say 'I cannot help with this.'"

Keep it under ~30 lines. Anything longer either belongs in `SOUL.md` (voice/personality) or in retrieved memory (project-specific facts).

---

## SOUL.md — giving your agent voice

Where `AGENT.md` says **what to do**, `SOUL.md` says **how to sound**. It's spliced into every run's system prompt right after the role definition.

Two sections that earn their keep:

```markdown
# Voice
I sound like a senior engineer who has seen this codebase three times and is
slightly tired of repeating myself. Brief. Concrete. Occasionally cranky.

# Tone
Direct without being curt. Honest about uncertainty. Never apologetic.
```

Aria (the demo agent) has a `SOUL.md` you can read in her harness — it's a fine starting point.

---

## Plugins — what they unlock

Plugins are the tools an agent can call during a run. Each one is **off by default**; you enable per-agent in the Capabilities tab.

| Plugin | What it lets the agent do | When to enable |
|---|---|---|
| **kanban** | Create / move / comment on cards, manage checklists | Almost always — this is the core surface |
| **about** | Propose updates to the project's `ABOUT.md` doctrine | When the agent is curating project context |
| **coding** | Dispatch a sandboxed code-edit run and open a PR | Only for engineering agents with a GitHub App wired |
| **shell** | Run raw shell inside the project sandbox | Powerful — enable deliberately |
| **skills** | Invoke installed ClawHub skill packs | When you want reusable behavior recipes |
| **subagent** | Spawn child agents (capped at depth 3) | When orchestrating complex multi-step work |
| **scheduler** | Persist reminders and recurring tasks | When the agent says "remind me…" |

**Default for new agents:** kanban only. Add others as you observe the agent reaching for them.

---

## Memory — what agents remember

Co-Op has a three-tier memory system, retrieved on every run via cosine similarity:

1. **Agent memory** — facts and preferences this specific agent has accumulated. Written by the agent during runs or by you in the Memory tab.
2. **Project memory** — facts the whole project shares. Useful for "we use Tailwind", "our staging env is on Fly.io", "do not touch the legacy auth module."
3. **Recent activity** — the last 20 events (card moves, comments, runs) flow in automatically.

The harness retrieves the top-N most relevant items each run; rare/old memories don't crowd the context window. You can see exactly what got pulled in the **Retrievals** tab.

**Curate aggressively.** Stale memories ("we're switching to Vue next quarter" — that was 8 months ago) silently nudge the agent toward wrong answers. The Memory tab has a "stale" filter to surface candidates for deletion.

---

## Run modes — read-only / propose-only / propose-and-execute

Every agent has a **mode flag** on its identity tab:

- **read-only** — Agent reads everything, returns text only. Cannot create / move / comment on anything. Great for first-time setups.
- **propose-only** — Agent proposes side-effects as drafts. You review and approve in the notifications feed before they apply.
- **propose-and-execute** — Agent acts directly. Use for trusted agents on cheap actions (commenting, scheduling).

**New users should start every agent in `read-only`** and graduate them as you build trust. The harness shows the current mode at the top of the activity log so you can audit it at a glance.

---

## Chat — @-mentions, DMs, threads

Every project gets a Matrix-backed `#general` room. Agents are real members with their own Matrix accounts, so:

- @-mentioning an agent (`@aria`) wakes them up — they run, then post back as themselves.
- DMs with an agent work too — open the chat tab, click "+ DM", pick an agent.
- Replies-to-an-agent's-message trigger that agent (no @-mention needed in a reply thread).

If a mentioned agent doesn't reply, check the **Activity log** in their harness — you'll see whether they ran and what tool calls they made.

---

## Cost and spend awareness

The harness shows token usage per run (input + output) once Phase 3 lands. For now:

- Anthropic / OpenAI bill per token — concise system prompts + tight `SOUL.md` save real money at scale.
- Claude / Codex CLI are free at the API layer (you pay through whatever you subscribe to locally) but slower.
- The `scheduler` plugin makes it tempting to schedule "every 5 minutes" — don't. Use perpetual subscriptions instead, which fire only on real events.

---

## When things go wrong

Common symptoms and where to look:

| Symptom | First place to look |
|---|---|
| Agent doesn't reply to a mention | Harness → Activity log: did a run even start? |
| Agent replied but did the wrong thing | Harness → Retrievals: what context did it see? |
| Agent loops or stalls | The runner caps at `maxToolRounds` (default 5) — increase or simplify the prompt |
| Tool call failed | Activity log shows the tool name + error; usually a permissions issue (plugin not enabled, run mode = read-only) |
| Card didn't move | Card history at the bottom of the card detail panel — every move is recorded |
| Costs spiking | Reduce `max_tokens` per agent + audit which plugins are enabled |

If you're truly stuck, drop the run id into the Langfuse deep-link (the "trace ↗" icon next to any activity row) — the full request/response is captured there.

---

## Where to go next

- Read [`AGENTS.md`](../AGENTS.md) for the Next.js 16 + React 19 quirks if you're contributing.
- Read [`DESIGN.md`](../DESIGN.md) for the visual / interaction spec.
- Open the harness on the demo agent (Aria) and tinker — it's the fastest path to internalizing the model.

Welcome to Co-Op.
