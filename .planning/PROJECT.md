# Co-Op

## What This Is

Co-Op is a self-hostable team workspace where humans and AI agents share the same kanban, chat, and card surfaces — agents are real teammates, not bolt-on assistants. It's optimized for small dev teams (2–10) of mixed human + agent membership; today it's pre-users, owned and dogfooded by a solo developer plus co-op's own agents.

## Core Value

**Shared workspace fabric** — humans and agents work in the same UI surfaces (boards, cards, chat). Everything else (agent identity, multi-provider backends, plugins, scheduling) exists to make that shared fabric feel real. If those layers fail but humans and agents still meet on the same kanban, co-op is still co-op.

## Requirements

### Validated

<!-- Inferred from existing codebase as of 2026-04-14 codebase map. Locked unless explicitly revisited. -->

- ✓ Multi-tenant project workspaces (Company → Project → ProjectMember) — existing
- ✓ Linear/Jira-style key-prefixed cards (`COOP-1`, …) on kanban boards with columns, drag-drop, assignees, labels, subtasks, comments with @-mentions — existing
- ✓ AI agents as first-class members with system prompt + `SOUL.md` (voice/personality) + per-project memory + activity log — existing
- ✓ Agents subscribe to events (card assigned, card moved, mention) and react — existing
- ✓ Multi-provider agent backends — Anthropic API, OpenAI API, Claude Code CLI, Codex CLI — existing
- ✓ Per-project encrypted API keys — existing
- ✓ Plugin tool contract (`src/lib/plugins/`) with built-ins: `kanban`, `coding`, `shell`, `scheduler`, `skills`, `subagent`, `about` — existing
- ✓ Real-time chat via Synapse-backed Matrix rooms per project + DM channels; agents post as themselves with their own Matrix accounts — existing
- ✓ GitHub App integration + sandboxed runner dispatch for coding tasks — existing (basic; depth deferred)
- ✓ In-process scheduler tick for one-shot reminders + recurring (cron) agent runs — existing
- ✓ Notification feed for mentions, card assignments, proposal reviews — existing
- ✓ ClawHub-compatible skill packs — existing
- ✓ NextAuth v5 credentials auth (email/password) with JWT sessions — existing
- ✓ Self-host via `docker compose` (Postgres + Synapse) + PM2 for the Next.js process — existing
- ✓ Visual identity: deep-space terminal aesthetic (carbon-black + emerald accents) per `DESIGN.md` — existing

### Active

<!-- Milestone 1: Foundation for the planning loop. Hypotheses until shipped. -->

- [ ] **Agent-run reliability** — retries, error surfaces, deterministic harness assembly, runtime hardening so agents finish what they start without drift or silent failure
- [ ] **Agent visibility / audit** — improved activity log, diff views of what an agent changed, plain-language run summaries the human can scan quickly
- [ ] **Planning-loop tooling** — agents read the backlog, propose card decompositions, draft plans; humans review and approve before execution
- [ ] **Mobile-friendly UI** — phone-usable across primary flows (dashboard, project hub, kanban, chat, agents, settings, auth) at ≥375px without breaking the desktop experience

### Out of Scope

<!-- Explicit boundaries with reasoning. -->

- **In-app code editor** — firm non-goal. Coding integration ships work to GitHub / sandbox runner; not an in-IDE experience.
- **Coding ship-loop depth (deeper GitHub App, richer sandbox runner, full PR/CI flows)** — deferred. The dogfood loop being targeted is *planning → split*, not *triage → ship*; coding-loop polish is a future milestone after agents are reliable enough to trust with planning.
- **Marketing platform capability** (drafts launch content, posts to social, hosted demo, listen-and-respond) — deferred to **Milestone 2**. Built as a layered plugin + skill + agent-template stack so any project gets the chops, with co-op marketing co-op as the dogfood case. Distribution / docs polish folds in here.
- **OpenClaw integration / pluggable runtime** — deferred to a later milestone. The native runtime is sufficient for current dogfood needs.
- **Hosted SaaS / multi-tenant cloud** — deferred. Self-host first; no cloud product, no billing, no shared-tenancy hardening in this scope.
- **Linear/Jira-replacement product surface** — not now. Kanban + cards + comments is enough; do not chase sprints, OKRs, roadmap UIs.
- **Slack-replacement features** — not now. Chat exists to enable agent collaboration; rich-messenger features stay minimal.
- **Horizontal scale** — out for now. Single-replica PM2 only; in-process scheduler races on multi-replica (`COOP_INPROC_CRON=0` workaround documented but unsupported).

## Context

- **Codebase map exists:** Architecture, Conventions, Stack, Structure, Concerns, Integrations, Testing all documented at `.planning/codebase/` (analysis date 2026-04-14). Brownfield init draws Validated requirements from this map.
- **Architecture pattern:** Next.js 16 App Router monolith with project-scoped multi-tenancy; single Prisma data boundary; federated chat via Synapse Matrix homeserver; route handlers under `src/app/api/**`; client components for interactive views (kanban, chat, modals).
- **Visual design:** `DESIGN.md` defines a deep-space command-terminal palette — Abyss Black `#050507`, Emerald Signal Green `#00d992`, warm-neutral grays — with system-font headings and Inter body. Mobile work must respect it.
- **Quickstart is one command:** `npm run setup:start` boots Postgres + Synapse + dev server idempotently. Onboarding friction has been reduced; the bottleneck has shifted from setup to in-product trust.
- **Differentiator:** agents see what humans see — same UI, not API extensions. This is *why* mobile-friendly UI matters: agents and humans share the surface, so the surface needs to work everywhere a human is.
- **Dogfood paradox** is the central operational risk — agents need a stable co-op to help build co-op; co-op needs agent help to make progress. Phases must keep the system runnable end-to-end at every step.
- **Inflection target:** "Co-op runs co-op" — the milestone where the user trusts the planning loop enough to drive co-op's own work through it. Marketing-runs-co-op follows in Milestone 2.

## Constraints

- **Tech stack** (locked): Next.js 16, React 19, Prisma 7, PostgreSQL 15+, Synapse (Matrix). No framework substitutions in this milestone.
- **Multi-provider agent runtimes** (locked): Anthropic API, OpenAI API, Claude Code CLI, Codex CLI all stay first-class. New work cannot regress provider parity.
- **Visual identity** (locked): `DESIGN.md` is the spec. Mobile-friendly work adapts layout but does not redesign the aesthetic.
- **Deployment model:** self-host only; PM2 single-replica. No assumption of horizontal scale or hosted multi-tenant infrastructure.
- **Bandwidth:** solo developer + co-op's own agents. Phase scope must fit a one-human-with-AI-help cadence; ambitious phases need agent-driven leverage to be feasible.
- **Brownfield invariant:** existing Validated capabilities don't regress. New work integrates with the established patterns (Prisma singleton, `auth()` gate on every scoped route, plugin contract, route group `(dashboard)` + `p/[projectId]` segments).
- **Next.js 16 / React 19 are recent:** `AGENTS.md` warns that conventions differ from training data. Always check `node_modules/next/dist/docs/` for current conventions before writing framework code.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Two-milestone arc: M1 foundation (reliability + visibility + planning loop + mobile) → M2 marketing-as-platform | Splitting prevents the four-direction sprawl risk; M1 establishes the trust foundation M2's marketing dogfood needs | — Pending |
| Marketing built as plugins + skills + agent templates (all three layers) | Reusability — every project that uses co-op inherits the marketing chops, not just the co-op project itself | — Pending |
| Coding ship-loop depth deferred | Tarpit risk + the targeted dogfood loop is planning, not shipping; defer until agents are reliable enough to trust with code-touching work | — Pending |
| Mobile-friendly UI scoped to current milestone (not its own future polish phase) | The shared-surface bet means agents work where humans work; if humans can't review on phone, the loop stalls | — Pending |
| Stack and visual identity locked | Stable foundation; mobile is layout adaptation, not redesign | — Pending |
| Hosted SaaS / multi-tenant cloud deferred indefinitely from this scope | Pre-users; self-host validates the product before infra investment | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-01 after initialization*
