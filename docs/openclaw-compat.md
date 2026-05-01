# OpenClaw compatibility — architecture & sync

## Premise (re-stated cleanly)

Every co-op `AIAgent` row describes an **OpenClaw-compatible agent spec** — prompt, model, tools, skills, memories. The spec is the stable contract. *Which runtime executes the spec* is a per-agent choice:

- `native` (today, default) — our Anthropic/OpenAI SDK loop + plugin registry.
- `openclaw` (future) — delegates to OpenClaw's agent loop, run in-process via the vendored package under `vendor/openclaw/`.

We do **not** spawn an OpenClaw gateway per agent; we do not share a single gateway across tenants. We import OpenClaw's logic as a library and drive it with our Postgres-backed state.

## Why this shape

OpenClaw today is single-user. Its session store, secret resolver, and gateway auth all assume one identity on one host. Multi-tenant use means either forking-per-tenant (infra burden) or adapting their loop to our host abstractions (what we do).

## Architecture layers

1. **Co-op domain** (`prisma/schema.prisma`) — authoritative. Agents, cards, chat, subscriptions, scheduled jobs, secrets, skills.
2. **AgentRuntime contract** (`src/lib/runtime/contract.ts`) — versioned interface every runtime implements.
3. **Runtime implementations** — plug into registry:
   - `NativeRuntime` — current `agentRunner.ts` (to be refactored as the first runtime).
   - `OpenClawRuntime` — vendored under `vendor/openclaw/`, with a host shim mapping their `SessionStore`, `SecretRef`, `Logger`, `PluginHost` into our Prisma / crypto / plugin registry.
4. **Plugin host (two tiers)**
   - **Native plugins** — kanban, about, coding, scheduler, subagent, shell, skills. Ours. Shape is ours.
   - **Imported plugins** — MCP servers (primary), ClawHub skills (already compatible), OpenClaw extension packages (via compat shim).
5. **Spec-level integrations** (never re-implemented):
   - ClawHub HTTP API — consumed directly.
   - MCP — the real stable ecosystem primitive; plug any server as tools.

## Upstream sync workflow

Two scripts:

```bash
npm run openclaw:sync         # refresh mirror, diff watched paths, write report
npm run openclaw:sync:apply   # same + run compat tests; if green, bump pinnedCommit
npm run openclaw:vendor       # git-subtree pull to vendor/openclaw/ at pinnedCommit
```

State in `.upstream-sync/`:
- `openclaw.json` — `{ repo, branch, pinnedCommit, lastSyncedAt }`
- `watched-paths.json` — files we care about (Plugin SDK, session types, server-chat loop, cron service, secrets doc, skill format doc, HTTP API doc)
- `last-report.md` — generated diff report
- `cache/openclaw/` — shallow mirror (git-ignored; the sync script manages it)

Routine:

1. Weekly cron (or on-demand) runs `npm run openclaw:sync`. Writes `last-report.md`.
2. Human reviews the report. If changes are trivial / compatible: `npm run openclaw:sync:apply`.
3. If we're also updating vendored code: `npm run openclaw:vendor` — subtree-merges at the new pinned SHA.
4. If compat tests fail or shim breaks, fix narrowly (only the `OpenClawRuntime` adapter and/or the imported-plugin shim should need touching).

## Test layers

| Suite | Runner | When | Asserts |
|---|---|---|---|
| `tests/compat/*.test.ts` | `node:test` via `tsx` | Every PR | Stable contracts: plugin shape, SKILL.md parser, cron math, session keys, policy YAML, runtime interface |
| `tests/compat/clawhub-api-shape.test.ts` | same | Scheduled (CLAWHUB_SMOKE=1) | ClawHub HTTP endpoints still return expected shapes |
| Integration (future) | same | PR | Runtime dispatch end-to-end with a mock provider + fake sandbox |
| Schema | `prisma migrate diff --exit-code` | PR | Schema and migrations agree |

Run locally:
```bash
npm run test:compat
CLAWHUB_SMOKE=1 npm run test:compat   # include public-API smoke
```

## Runtime selection (per-agent)

Add later (not in this plan): a `runtime` column on `AIAgent` defaulting to `native`. Flip to `openclaw` to route through the vendored loop. Compat tests run both runtimes against the same mock spec; divergence shows up as test failures.

## Ship order

1. ✅ AgentRuntime contract + registry (`src/lib/runtime/*`).
2. ✅ Upstream sync scripts (`scripts/openclaw-{sync,vendor}.sh`).
3. ✅ Compat test suite (`tests/compat/*`) + `tsx` runner + `npm run test:compat`.
4. Next: refactor `agentRunner.ts` into `NativeRuntime` that implements the contract, with a thin `runAgent(opts)` convenience wrapper. No behavior change.
5. Next: add MCP host plugin — the single biggest ecosystem multiplier.
6. Next: `OpenClawRuntime` adapter after their Plugin SDK stabilizes (currently alpha — re-evaluate in 4–6 weeks).
7. Next: `runtime` column on `AIAgent` + UI toggle in Capabilities tab.

## What we explicitly decline

- Running OpenClaw's gateway daemon as a service. Their auth/tenancy model doesn't fit.
- Depending on `~/.openclaw/` filesystem state. Our state is Postgres; sessions persist across restarts and replicas.
- Their ACP IDE bridge and CLI — not our product surface.
- Their `install:` auto-execution in SKILL.md. Too much cold-start cost and supply-chain risk; we use curated sandbox images instead.
