---
status: code-complete
phase: 1
plan: 3
date: 2026-05-04
---

# Plan 01-03 — instrumentation.ts + Langfuse + LLM call wrapping

## What shipped

Auto-traced LLM calls without per-handler instrumentation. Every Anthropic / OpenAI / CLI call site in agentRunner.ts is wrapped in `traceGeneration` from a Langfuse singleton; `instrumentation.ts` registers `@vercel/otel` for raw GenAI spans. All env-gated — keyless setups see no behavior change.

## Commits (5)

| # | Hash | Subject |
|---|------|---------|
| 1 | `58b8295` | deps + instrumentation.ts entry point |
| 2 | `6a6888a` | Langfuse singleton + traceGeneration wrapper |
| 3 | `f12f9c0` | wrap Anthropic / OpenAI / CLI calls |
| 4 | `4010993` | docker-compose Langfuse stanza commented |
| 5 | `98ee475` | 4 env-gating tests |

## Files

- `instrumentation.ts` — Next.js 16 entry point, lazy `@vercel/otel` import
- `src/lib/observability/langfuse.ts` — getLangfuse singleton + traceGeneration
- `src/lib/agentRunner.ts` — three SDK call sites wrapped
- `docker-compose.yml` — commented Langfuse + langfuse-db service block + volume
- `tests/compat/instrumentation-shape.test.ts` — 4 cases
- `package.json` — langfuse@^3.38.20, @vercel/otel@^2.1.2, @opentelemetry/api@^1.9.1

## Requirements

RUN-06 ✅ instrumentation.ts registers OTel + Langfuse; self-host stanza in docker-compose.yml

## Verification

- `npm run build` clean (deps installed)
- `npx tsc --noEmit` clean for `src/`
- `npm test` 103 → 107 (+4), all green
- With `LANGFUSE_PUBLIC_KEY` unset, getLangfuse() returns null and traceGeneration is a no-op single conditional branch — no SDK loaded, no behavior change

## Caveats

- `.env~` template additions written to disk locally but the file is gitignored (.env* pattern). Local-only.
- The `scripts/capture-screenshots.ts` tsc error is pre-existing — `@playwright/test` was a transitive dep that got pruned during the langfuse install. Orthogonal to this plan; not blocking.
