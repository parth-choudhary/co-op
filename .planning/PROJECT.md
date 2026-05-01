# Co-Op

**A self-hostable team workspace where humans and AI agents share the same kanban, chat, and card history.**

## Vision

AI agents are first-class teammates, not bolt-on assistants. Each agent has a role (CTO / PM / Developer / Designer / CMO / Custom), a persistent identity (its own Matrix account, system prompt, `SOUL.md`, per-agent memory, activity log), and access to the same boards, cards, and chat channels humans use. Agents can be @-mentioned, assigned cards, scheduled to run on cron, and given typed tools (kanban, code, shell, scheduler, skills, sub-agents).

## Stack

- **Framework:** Next.js 16 (App Router) — see `AGENTS.md`, this is NOT the Next.js you remember.
- **UI:** React 19, TipTap editor, `@hello-pangea/dnd`, Framer Motion, Lucide icons.
- **Data:** Prisma 7 + `@prisma/adapter-pg` + PostgreSQL 15 (Docker on `:5433`).
- **Auth:** NextAuth v5 (beta) credentials provider, JWT sessions.
- **Chat:** Synapse Matrix homeserver (`coop.local` on `:8008`); each project + DM channel maps to a Matrix room; agents have real Matrix accounts.
- **Agent backends:** Anthropic SDK, OpenAI SDK, Claude CLI, Codex CLI — pluggable runtime layer in `src/lib/runtime/`.
- **Scheduler:** In-process cron tick (`src/lib/scheduler/`). Single-replica only by default.
- **Coding integration:** GitHub App + sandboxed runner dispatch (`src/lib/coding/`).
- **Process supervision:** PM2 (`ecosystem.config.cjs`) for self-hosted prod.

## Architecture (one paragraph)

Next.js 16 monolith with project-scoped multi-tenancy. All data flows through one Prisma singleton (`src/lib/db.ts`). Route handlers under `src/app/api/**/route.ts` enforce `ProjectMember` membership and return JSON. Real-time messaging is delegated to Synapse — Next.js orchestrates room provisioning via the admin API in `src/lib/matrix.ts`. Agent execution lives in `src/lib/agentRunner.ts` and is provider-agnostic; the system prompt is compiled per-run by `src/lib/agentHarness.ts:compileHarness`, which assembles role + `SOUL.md` + project doctrine (about/USER.md/AGENTS.md) + per-agent memory + recent activity + kanban context. Detailed maps live in `.planning/codebase/`.

## Current Status

Active development. Production-shaped (Docker compose, PM2, Prisma migrations, type-checked TS, integration test scripts) but pre-v1.0. License is unset — source-available, not yet redistributable. Single-replica scheduler is a known constraint.

## Active Milestone

**Memory v1–v4** — upgrade agent memory from "load-everything-into-prompt" to a relevance-ranked, project-shared, lifecycle-managed system. See `.planning/ROADMAP.md`.

## Key References

- `README.md` — quickstart + screenshots
- `AGENTS.md` — Next.js 16 breaking-change warning
- `DESIGN.md` — visual design system (deep-space command-terminal palette)
- `.planning/codebase/` — STACK / ARCHITECTURE / STRUCTURE / CONVENTIONS / TESTING / INTEGRATIONS / CONCERNS (April 2026 brownfield map)
- `prisma/schema.prisma` — data model (15+ models)
- `src/lib/agentHarness.ts` — system-prompt assembly (the function this milestone is centered on)
