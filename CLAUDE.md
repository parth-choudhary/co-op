@AGENTS.md

# Co-Op project context for AI agents

## Planning structure (GSD)

This project uses the [Get-Shit-Done](https://github.com/...) workflow under `.planning/`:

- `.planning/PROJECT.md` — current product framing, Validated/Active/Out-of-Scope requirements, locked decisions, dogfood paradox notes. **Read first** when starting any non-trivial task.
- `.planning/REQUIREMENTS.md` — current milestone v1 requirements with REQ-IDs (RUN/REL/AUD/PLAN/MOB/M2P) and phase traceability.
- `.planning/ROADMAP.md` — phase breakdown for the active milestone, success criteria per phase, pitfalls each phase must defuse.
- `.planning/STATE.md` — current position, deferred items, prior work, blockers.
- `.planning/research/` — domain research (STACK / FEATURES / ARCHITECTURE / PITFALLS / SUMMARY) backing the roadmap; consult before proposing libraries or architectural patterns.
- `.planning/codebase/` — brownfield codebase map (ARCHITECTURE / STACK / STRUCTURE / CONVENTIONS / TESTING / INTEGRATIONS / CONCERNS) — authoritative on existing patterns.
- `.planning/phases/NN-name/` — per-phase plan + execution artifacts.

## Active milestone: M1 — Trust Foundation

The current milestone establishes "agents can be **trusted** to act" across run-lifecycle plumbing → reliability → audit → planning loop → on-phone dogfood closure → M2 composition validation. The inflection target is **co-op runs co-op** — the user trusts the planning loop enough to drive co-op's own work through it.

When making changes, prefer:

- **Brownfield invariant:** existing Validated capabilities don't regress. Integrate with established patterns (Prisma singleton, `auth()` gate on every project-scoped route, plugin contract, `(dashboard)` + `p/[projectId]` route segments).
- **Stack is locked:** Next.js 16 / React 19 / Prisma 7 / Postgres / Synapse. No framework substitutions in M1.
- **Multi-provider parity:** Anthropic / OpenAI / Claude CLI / Codex CLI all stay first-class. Anti-pattern: LangChain.js / LangGraph.js as runtime — conflicts with multi-provider support.
- **Visual identity locked:** `DESIGN.md` is the spec. Mobile work adapts layout but does not redesign the aesthetic.
- **Run-mode flag respected:** every tool call goes through the runtime's mode gate (`read-only` / `propose-only` / `propose-and-execute`).
- **Plan-as-data, not plan-as-prose:** plans live in the `CardPlan` model with hash-bound approval, not in card comments or Markdown blobs.
- **Single responsive route tree:** mobile is a layout adaptation of the existing routes, not a separate `/m/` tree.

## Common GSD commands

- `/gsd-progress` — situational status check / advance the workflow.
- `/gsd-plan-phase N` — create a detailed plan for a phase.
- `/gsd-execute-phase N` — execute all plans in a phase with wave-based parallelization.
- `/gsd-verify-work` — UAT walkthrough of completed work.
- `/gsd-undo` — safe revert via the phase manifest.
