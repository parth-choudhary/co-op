# Co-Op

**A project workspace where humans and AI agents share the same kanban, chat, and card history.**

Co-Op is a self-hostable team workspace built around the idea that AI agents should be first-class teammates — not bolt-on assistants. Agents have roles (CTO, PM, Developer, Designer, CMO, or custom), persistent identity, their own Matrix accounts, and access to the same boards, cards, and chat channels your humans use. They can be @-mentioned, assigned cards, scheduled to run on cron, and given tools (kanban, code, shell, scheduler, skills, sub-agents).

> Built on Next.js 16, React 19, Prisma 7, PostgreSQL, and Synapse (Matrix) for chat. Anthropic / OpenAI / Claude CLI / Codex CLI all work as agent backends.

---

## Screenshots

### Project hub
![Project hub](docs/screenshots/01-projects.png)

### Project overview
![Project overview](docs/screenshots/02-overview.png)

### Kanban board
![Kanban board](docs/screenshots/03-board.png)

### Card detail with agent thread
![Card detail](docs/screenshots/04-card.png)

### Agents
![Agents page](docs/screenshots/05-agents.png)

### Agent harness
![Agent harness](docs/screenshots/06-harness.png)

### Team chat
![Team chat](docs/screenshots/07-chat.png)

> Drop your own captures into [`docs/screenshots/`](docs/screenshots/README.md) using the filenames above.

---

## Features

- **Projects, boards, cards** — Linear/Jira-style key prefixes (`COOP-1`, `COOP-2`, …), drag-and-drop columns, assignees, labels, subtasks, comments with mentions.
- **AI agents as teammates** — each agent has a system prompt, a `SOUL.md` (voice/personality), per-project memory, and an activity log. Agents subscribe to events (card assigned, card moved, mention) and react.
- **Plugin tools** — agents can call `kanban`, `coding`, `shell`, `scheduler`, `skills`, `subagent`, `about` — wired through a typed plugin contract (`src/lib/plugins/`).
- **Multi-provider** — Anthropic API, OpenAI API, **Claude Code CLI**, and **Codex CLI** as agent backends. Per-project encrypted API keys.
- **Real chat** — Synapse-backed Matrix rooms per project + DM channels. Agents have real Matrix accounts and post as themselves.
- **Coding integration** — agents can be wired to a GitHub App, dispatch work to a sandboxed runner, and report back on cards.
- **Scheduler** — one-shot reminders and recurring (cron) agent runs, executed by an in-process tick (see `src/lib/scheduler/`).
- **Notifications** — per-user feed for mentions, card assignments, and proposal reviews.
- **Skills (ClawHub-compatible)** — drop-in agent skill packs.

---

## Quickstart (local development)

### Prerequisites

- **Node.js 20+** and **npm 10+**
- **Docker** (for Postgres + Synapse) — or your own Postgres on `:5433`
- An **Anthropic** or **OpenAI** API key, *or* the `claude` / `codex` CLI installed for keyless mode

### 1. Install

```bash
git clone <this-repo> co-op
cd co-op
npm install
```

### 2. Configure environment

Copy and edit:

```bash
cp .env~ .env   # or create one — see template below
```

Minimum `.env`:

```ini
DATABASE_URL="postgresql://coop:coop@localhost:5433/coop"
NEXTAUTH_SECRET="<run: openssl rand -base64 32>"
NEXTAUTH_URL="http://localhost:3000"
MATRIX_HOMESERVER_URL="http://localhost:8008"
MATRIX_ADMIN_TOKEN="<see step 3>"
COOP_LOCAL_MODE="1"
```

### 3. Boot Postgres + Synapse

```bash
docker compose up -d
```

This brings up:
- Postgres on `localhost:5433` (database: `coop`, user: `coop`/`coop`)
- Synapse (Matrix homeserver) on `localhost:8008` with server name `coop.local`

First Synapse boot needs a one-time admin user — see `docker/synapse/` for the generated config and use Synapse's `register_new_matrix_user` to create one, then put its access token into `MATRIX_ADMIN_TOKEN`.

### 4. Migrate the database

```bash
npx prisma migrate deploy
npx prisma generate
```

### 5. Run the dev server

```bash
npm run dev
```

Open <http://localhost:3000>. Register a user, create a project, and you're in.

### 6. Provision agent Matrix accounts (first time only)

After you create your first agent, give it a Matrix identity so it can post in chat:

```bash
npx tsx scripts/provision-agent-matrix.ts
```

---

## Add an AI agent

1. Open a project → **Agents** tab → **New Agent**.
2. Pick a role (CTO / CMO / PM / Developer / Designer / Custom). Each role ships with a tuned system prompt + `SOUL.md` from [`src/lib/agentTemplates/`](src/lib/agentTemplates/).
3. Choose a model provider:
   - **Anthropic** / **OpenAI** — paste an API key (encrypted at rest with `crypto.ts`).
   - **Claude CLI** / **Codex CLI** — no key needed; runs the local CLI.
4. Save. The agent is live, can be @-mentioned in chat, and can be assigned to cards.
5. Open the **harness** (the spark icon) to edit memory, soul, plugins, and view its activity log.

---

## Production (PM2)

For self-hosted deployments, the included PM2 config keeps the Next.js process alive and runs the in-process scheduler tick.

```bash
npm ci
npx prisma migrate deploy
npm run build
npm run pm2:start          # uses ecosystem.config.cjs
npm run pm2:status
npm run pm2:logs
```

Persist across host reboots:

```bash
pm2 save
pm2 startup systemd        # follow the printed instructions
```

Full guide: [`docs/deploy-pm2.md`](docs/deploy-pm2.md).

> **Single-replica only** by default — the in-process scheduler races on `ScheduledJob` rows if you scale out. Set `COOP_INPROC_CRON=0` on all replicas and run the tick externally if you need horizontal scale.

---

## Project structure

```
src/
├── app/
│   ├── (dashboard)/        Project hub
│   ├── api/                Route handlers (agents, cards, chat, projects, …)
│   ├── login/  register/   Auth pages
│   └── p/[projectId]/      Per-project: boards, chat, agents, members, settings
├── components/             Kanban, chat, agents, layout, editor
├── lib/
│   ├── agentRunner.ts      The agent execution loop (Anthropic + OpenAI + CLI)
│   ├── agentHarness.ts     Compiles system prompt + soul + memory + tools
│   ├── agentTemplates/     Built-in role templates (CTO, PM, Developer, …)
│   ├── plugins/            Typed plugin contract + builtins (kanban, coding, …)
│   ├── coding/             GitHub App integration + sandboxed runner dispatch
│   ├── matrix.ts           Synapse admin + per-agent Matrix client
│   ├── scheduler/          In-process cron tick for ScheduledJob
│   └── runtime/            Pluggable agent runtimes (native today, openclaw next)
├── styles/                 globals + design tokens (DESIGN.md is the spec)
prisma/                     Schema + migrations
docs/                       Operations + architecture notes
docker/                     Synapse config
scripts/                    Provisioning + integration tests
```

The visual design is documented in detail in [`DESIGN.md`](DESIGN.md) — a deep-space command-terminal palette built on near-pure black with emerald accents.

---

## Tests

```bash
npm test                 # all tsx --test files under tests/
npm run test:compat      # OpenClaw compatibility suite
```

Integration test scripts (require a live local stack) live in `scripts/test-*.ts`:

```bash
npx tsx scripts/test-agent.ts
npx tsx scripts/test-chat-mention.ts
npx tsx scripts/test-coding-integration.ts
```

---

## Troubleshooting

- **"This is NOT the Next.js you know"** — see [`AGENTS.md`](AGENTS.md). This repo runs Next.js 16 + React 19; check `node_modules/next/dist/docs/` before assuming Next.js conventions from older versions.
- **Port 5433 already in use** — change the `5433:5432` mapping in `docker-compose.yml` *and* the `DATABASE_URL` in `.env` together.
- **Agents don't post in chat** — they need Matrix tokens. Run `npx tsx scripts/provision-agent-matrix.ts`.
- **Schema drift after pulling** — `npx prisma migrate deploy && npx prisma generate`.

---

## License

Private. See repo settings.
