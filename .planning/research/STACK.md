# Stack Research

**Domain:** agent-as-teammate workspace — additive libraries for Milestone 1 (reliability, visibility, mobile, planning loop)
**Researched:** 2026-05-01
**Confidence:** HIGH for verified libraries (Vaul, Langfuse, Zod, p-retry, motion, react-resizable-panels). MEDIUM for architectural patterns (plan-and-execute, container-query layout strategy). Versions confirmed against npm registry on the research date.

> **Scope note:** Co-Op's core stack (Next.js 16.2.3, React 19.2.4, Prisma 7.7.0, PostgreSQL 15+, Synapse, NextAuth v5 beta, framer-motion ^12.38.0, @hello-pangea/dnd ^18.0.1, lucide-react ^1.8.0) is locked. Everything below is **additive** — no replacements. Each recommendation is checked against the locked stack for compatibility.

## Recommended Stack

### Core Technologies (additive)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Langfuse JS/TS SDK** (`langfuse`) | `^3.38.20` | LLM/agent run tracing, prompt+output capture, latency/token metrics, evaluation hooks | Self-hostable (Docker/Helm) — fits Co-Op's "self-host only" constraint. Native wrappers for OpenAI and Anthropic JS SDKs (already used). Speaks OpenTelemetry, so Co-Op can later swap exporters without rewriting instrumentation. Provides the run-trace foundation needed for the "Agent visibility / audit" requirement. |
| **OpenTelemetry GenAI conventions** (`@opentelemetry/api ^1.9.1` + `@vercel/otel ^2.1.2`) | as listed | Standardized span schema for agent reasoning, tool calls, token usage; integrates with Next.js 16 `instrumentation.ts` | Next.js 16 auto-detects `instrumentation.ts` (no `experimental.instrumentationHook` flag needed). `@vercel/otel` works for self-hosted deployments via standard `OTEL_*` env vars — no Vercel platform dependency. The OTel GenAI semconv (released 2026) is the emerging vendor-neutral standard; instrumenting once feeds Langfuse, Phoenix, or any backend. |
| **Zod** (`zod`) | `^4.4.1` | Runtime validation of LLM structured outputs (proposed card splits, plan steps, tool args) | The codebase currently has zero schema validation (per `.planning/codebase/ARCHITECTURE.md`); the planning loop *requires* validating agent JSON output. Zod v4 is 4–8× faster than v3, has native JSON Schema export (essential for prompting LLMs with response schemas), and is the de-facto integration target for OpenAI structured outputs and Anthropic tool-use schemas. Bundle size (~14kB) is acceptable for a server-heavy app. |
| **p-retry** (`p-retry`) | `^8.0.0` | Promise-returning function retries with exponential backoff and abort signals | Tiny, single-purpose, ESM-native, sindresorhus-maintained. Replaces ad-hoc retry loops with a tested primitive. Supports `AbortSignal` (critical for canceling long agent runs) and an `onFailedAttempt` hook (perfect for emitting `CardActivity`/Langfuse events on each retry). Pairs with `AbortController` for the new "cancel run" UX. |
| **Vaul** (`vaul`) | `^1.1.2` | Mobile bottom-sheet / drawer primitive for the project Sidebar, card detail modal, and chat composer on phones | Built on Radix Dialog (a11y handled). Explicitly added React 19 to peer deps in 1.1.1. Designed exactly for the "responsive Dialog → Drawer" swap that Co-Op needs for `CardDetailModal`, `Sidebar`, and chat panels at ≤768px. No conflict with framer-motion 12 — Vaul ships its own physics-based gesture engine. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **diff** (Kpdecker) | `^9.0.0` | Compute textual diffs (cards, comments, plan revisions, file edits an agent proposes) | Use as the *engine*. Renders nothing on its own — pair with a viewer. Apache-2.0, zero deps, the canonical JS diff library. |
| **diff2html** | `^3.4.56` | Render unified-diff strings as HTML for "what did the agent change?" panels | Actively maintained (2026 releases), syntax highlighting via highlight.js, side-by-side and inline modes. Use for read-only diff panels in agent activity feeds. Avoid `react-diff-viewer` — last release was 6 years ago, no React 19 support. |
| **shiki** | `^4.0.2` | Syntax-highlight code blocks inside agent run logs and diff panels | TextMate-grade highlighting via VS Code grammars. SSR-friendly, ESM, no client runtime if rendered at request time. Works in Server Components — fits the existing RSC pattern. |
| **react-resizable-panels** | `^4.10.0` | Resizable split-pane layouts (run timeline + diff panel, plan editor + preview) | v4 (2026) supports React Server Components, mouse/touch/keyboard, WAI-ARIA window-splitter pattern. Caveat: in v4, hidden-via-CSS panels still render shells on mobile — collapse via state instead of `display: none`. Use only on ≥1024px breakpoints. |
| **sonner** | `^2.0.7` | Toast notifications for run-completed / retry / approval-needed events | Maintained by the Vaul author, React 19 compatible, accessible by default. Fits the existing notification feed visually and ergonomically. Cheaper than building toast UI on top of framer-motion 12. |
| **es-toolkit** | n/a (optional) | Lodash-replacement utilities (debounce, throttle, retry helpers) | Optional. Worth it only if multiple call-sites need the same primitives; otherwise keep dependencies small. |

### Plan/execute pattern (no new framework)

**Recommendation: Build the plan-and-execute loop natively in TypeScript on top of the existing plugin contract — do NOT add LangGraph/LangChain.**

Rationale (MEDIUM-HIGH confidence):
- LangChain.js + LangGraph.js are heavy (peer-dep sprawl, opinionated state machine, OpenAI-first abstractions) and would conflict with Co-Op's already-shipped "multi-provider agent runtimes" (Anthropic, OpenAI, Claude CLI, Codex CLI). The existing runtime layer in `src/lib/plugins/` is the integration boundary — replacing it would regress provider parity (an explicit constraint).
- The plan-and-execute pattern itself is small: a planner LLM call returns a structured `Plan` (validated by Zod), the executor iterates steps, persists each step's status to Postgres, and surfaces approvals via the existing notification feed. No state-machine library needed for that.
- LangGraph's value (durable checkpoints, interrupts) overlaps heavily with what a Postgres-backed `AgentRun` table + `pause_state` JSON column gives you for free in this codebase.
- If durability/orchestration grows complex later (long-running multi-day runs, fan-out/fan-in), revisit **Inngest** (`^4.2.6`, see Alternatives) — it integrates with Next.js 16 in <5 minutes and self-hosts.

Build the loop with: Zod (schema), p-retry (per-step resilience), Langfuse (tracing), and a new `AgentRun` / `AgentRunStep` Prisma model (no new framework).

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **Langfuse self-host (Docker)** | Local + production trace collection | Add to existing `docker-compose.yml` alongside Postgres + Synapse. Single container + its own Postgres. Shares the self-host story already in place. |
| **OTel Collector** (optional) | Span aggregation/forwarding | Only needed if exporting to multiple backends. For M1, point `@vercel/otel` directly at Langfuse — defer the collector until there's a second consumer. |
| **CSS Container Queries** | Component-driven responsive widgets | First-class browser feature in 2026 (Chrome 105+, Firefox 110+, Safari 16+ → ≥95% support). Use for cards/widgets that re-flow inside variable-width containers (kanban columns at different breakpoints, sidebar in collapsed vs expanded mode). Pair with viewport media queries for *page-level* layout switches. No library needed — pure CSS. |

## Installation

```bash
# Observability — Langfuse + OpenTelemetry GenAI semconv
npm install langfuse @opentelemetry/api @vercel/otel

# Agent reliability — retries, schema validation
npm install p-retry zod

# Mobile responsive UI — drawers, toasts
npm install vaul sonner

# Visibility — diff + render + syntax highlight
npm install diff diff2html shiki

# Optional split panes for desktop run-inspection panel
npm install react-resizable-panels
```

No new dev dependencies required — all the above ship their own types or are already typed by `@types/*` already present.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Langfuse** | Arize Phoenix (Elastic 2.0, OTel-native, eval-heavy) | If the team prioritizes evaluation/experiment workflows over run-debugging. Phoenix is excellent for offline eval pipelines. For Co-Op's M1 (live run inspection), Langfuse's UI is more directly applicable. |
| **Langfuse** | Helicone (proxy-based) | If you want zero-code instrumentation. Helicone is a drop-in HTTP proxy. Trade-off: must route every provider call through it (harder for Claude CLI / Codex CLI which spawn child processes). |
| **Native plan-and-execute** | LangGraph.js (`@langchain/langgraph ^1.2.9`) | If/when state-machine complexity grows: long-running, multi-day, branching agent workflows with human approvals at multiple checkpoints. Today the cost (peer deps, abstraction tax) outweighs the value for Co-Op's targeted planning loop. |
| **Native plan-and-execute** | Inngest (`^4.2.6`) | If durable execution becomes load-bearing — agents running for hours, scheduler reliability across restarts. Inngest works with the existing Next.js 16 setup, self-hosts, and provides step-level retries and observability. Overkill for M1; revisit if scheduler races become a real pain point. |
| **Native plan-and-execute** | Trigger.dev v3 | Similar to Inngest. Trigger.dev v3 has better DX for self-hosting. Choose Inngest if you're already integrating it for retries; choose Trigger.dev if hours-long Bun workers matter. |
| **Vaul (mobile-only drawer)** | Radix Dialog + responsive `useMediaQuery` switch | Use this if you want one component that renders Dialog on desktop and Drawer on mobile. More code but tighter a11y. Acceptable; just know Vaul already wraps Radix Dialog underneath. |
| **Zod v4** | Valibot (`valibot`) | If shipping client-side validation at scale matters (Valibot is ~6kB vs Zod's ~14kB). For Co-Op (server-heavy, internal app), Zod's ecosystem integration wins. |
| **diff2html** | `react-diff-view` (`^3.3.3`) | If you want a tightly integrated React component tree (props + render-prop API) instead of an HTML-string output. `react-diff-view` is actively maintained (unlike `react-diff-viewer`), so it's a valid second choice — pick it if your diff UI needs heavy React composition. |
| **react-resizable-panels** | CSS grid + `resize: horizontal` | If you only need one or two split-pane spots, native CSS is enough and ships zero JS. Use the library when you need keyboard/touch a11y, persistence, or nested splits. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **LangChain.js / LangGraph.js as the agent runtime** | Conflicts with Co-Op's existing multi-provider plugin contract. Wraps providers in heavy abstractions and assumes OpenAI-shaped APIs; introduces peer-dep churn against Anthropic SDK + Claude CLI + Codex CLI. The constraint "new work cannot regress provider parity" makes it a poor fit. | Native TS plan/execute on the existing plugin layer. Optionally borrow LangGraph *patterns* (interrupt/resume) without the dep. |
| **`react-diff-viewer`** | Last release ~6 years ago; no React 19 support. | `diff2html` (active) or `react-diff-view` (active). |
| **Tailwind CSS v4** | Co-Op's design system uses CSS custom properties and CSS Modules per `DESIGN.md` and the existing `src/styles/tokens.css` + `*.module.css` pattern. Adding Tailwind midstream is a big migration with no Milestone 1 payoff. The locked visual identity makes Tailwind's utility approach orthogonal to existing tokens. | Continue with CSS variables + media queries + container queries. |
| **`react-spring`** for mobile drawer physics | Adds a parallel animation engine alongside framer-motion 12, doubling animation runtime cost and bundle. | Vaul (its own gesture physics) or framer-motion 12's `drag` props. |
| **`react-query` / `@tanstack/react-query`** *for this milestone* | Tempting for run-status polling, but the codebase has zero global state today. Introducing it for one feature creates an inconsistent data-fetching pattern. | Use plain `fetch` + `useState`/`useEffect` like the rest of the codebase, and consider TanStack Query as its own dedicated decision later. |
| **`react-hot-toast`** | Maintenance has slowed; React 19 strict-mode compatibility is intermittent. | `sonner` — same author as Vaul, React 19 native, accessible. |
| **`xstate`** for the planning state machine | Powerful but heavy for what is effectively a four-state run lifecycle (`pending → planning → awaiting_approval → executing → done/failed`). | Postgres `AgentRun.status` enum + transition guards in route handlers. |
| **`@opentelemetry/sdk-node` directly without `@vercel/otel`** | Possible but verbose; you'll re-implement Next.js-aware instrumentation that `@vercel/otel` already wraps. | `@vercel/otel` (works fine self-hosted via OTEL env vars). |
| **`framer-motion` global page transitions for mobile** | Mobile chrome (sidebar in/out, bottom-sheet) needs gesture-driven physics, not declarative animations. Mixing both for the same surface fights itself. | Vaul for sheets/drawers; framer-motion 12 for entrance/exit transitions of static elements. |
| **Any AGPL-licensed observability tool** | Co-Op is self-hosted but distributed (the user can run it). AGPL backends complicate that. | Langfuse is MIT (server is MIT/EE-dual; self-host MIT path exists). Phoenix is Elastic 2.0. Both are safe. |

## Stack Patterns by Variant

**If the user has Langfuse running (recommended for M1):**
- Wrap LLM calls with `langfuse-anthropic` / `langfuse-openai` integrations.
- Tag every span with `agentId`, `projectId`, `cardId`, `runId` for filterable views.
- Use Langfuse "sessions" for full multi-step runs.

**If the user opts out of Langfuse (e.g., air-gapped install):**
- Keep `@vercel/otel` registered with `instrumentation.ts`. Set `OTEL_TRACES_EXPORTER=console` for stdout-only mode.
- Persist run summaries directly in a new `AgentRun` Prisma model — Langfuse becomes a *bonus* surface, not a hard dependency. The OTel instrumentation stays untouched.

**For mobile breakpoint strategy:**
- **<768px:** Sidebar collapses into a Vaul-driven bottom drawer triggered from a top-bar button. `CardDetailModal` becomes a full-screen Vaul drawer. Kanban columns become a horizontal swipe (one column visible).
- **768–1024px (tablet):** Sidebar stays inline but narrower. Modals become Vaul drawers (vertical sheets are still better than centered dialogs at this size).
- **≥1024px (current desktop):** No change. CSS container queries inside the kanban column to re-flow card metadata (assignee chips, label pills) at narrow column widths.
- Drag-drop on touch: `@hello-pangea/dnd` already supports touch via long-press sensor (default). Keep it; no library swap needed. Known iOS auto-scroll shake is a webkit bug, not fixable client-side — document as a known issue, not a blocker.

**For agent run UI:**
- Run header (status, duration, model, cost) → server component.
- Step timeline → client component, re-fetches every 2s while status is `running`.
- Diff panels → server-rendered `diff2html` HTML, hydrated only if interactive expand/collapse is needed.
- Approve/Reject → POST to a new `/api/agent-runs/[id]/decision` route that resumes the run.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `next@16.2.3` | `react@19.2.4`, `instrumentation.ts` (auto-detected) | Remove any `experimental.instrumentationHook: true` if it appears later — ignored in 16. Per `AGENTS.md`, always check `node_modules/next/dist/docs/` before writing new framework code. |
| `react@19.2.4` | `vaul@^1.1.2`, `sonner@^2.0.7`, `framer-motion@^12.38.0`, `@hello-pangea/dnd@^18.0.1`, `react-resizable-panels@^4.10.0` | All explicitly support React 19. |
| `framer-motion@^12.38.0` | `vaul@^1.1.2` | No conflict — Vaul ships its own gesture physics. Both can coexist; reach for framer-motion for declarative transitions, Vaul for sheets. Note that framer-motion has been rebranded "Motion" — `motion@^12.38.0` is the new package name; `framer-motion@^12.38.0` is the alias still maintained. Stay on `framer-motion` for now to avoid a rename churn in M1. |
| `langfuse@^3.38.20` | `@anthropic-ai/sdk` (already used), `openai` (already used) | Native wrappers exist for both. Token counting is fully supported when calls go through the wrapper; manual span creation skips automatic token attribution for Anthropic. |
| `zod@^4.4.1` | `openai` structured outputs, Anthropic tool-use schemas | Use `z.toJSONSchema(schema)` (Zod v4 native) for prompting LLMs with the expected response shape. Avoid Zod 3.x — slower, missing JSON Schema export. |
| `p-retry@^8.0.0` | Node 18.18+ (Co-Op requirement) | ESM-only. Co-Op already imports ESM packages, so no issue. Pass `AbortSignal` to allow run cancellation. |
| `@vercel/otel@^2.1.2` | `@opentelemetry/api@^1.9.1` | The `@vercel/otel` peer-dep range pins OTel API; let it resolve transitively rather than pinning manually. |
| `@hello-pangea/dnd@^18.0.1` | Touch devices | Long-press default sensor — already works on mobile. Known iOS auto-scroll shake (webkit bug) is unfixable client-side. |
| `vaul@^1.1.2` | Radix Dialog (transitive) | Works with React 19. The non-modal mode has a known `aria-hidden` quirk; use modal mode (`Drawer.Root` default) wherever possible. |
| `diff2html@^3.4.56` + `highlight.js` | Server Components | Render diffs server-side for SEO-irrelevant internal pages — no client JS needed unless you want collapsible sections. |

## Sources

- [Langfuse JS/TS SDK docs](https://langfuse.com/guides/cookbook/js_langfuse_sdk) — verified API surface, Anthropic + OpenAI wrappers (HIGH).
- [Langfuse OpenTelemetry integration](https://langfuse.com/integrations/native/opentelemetry) — confirmed OTel-native ingestion (HIGH).
- [Langfuse Anthropic JS](https://langfuse.com/integrations/model-providers/anthropic-js) — confirmed Anthropic JS instrumentation pattern (HIGH).
- [OpenTelemetry GenAI semconv announcement (2026)](https://earezki.com/ai-news/2026-03-21-opentelemetry-just-standardized-llm-tracing-heres-what-it-actually-looks-like-in-code/) — confirms standardization status (MEDIUM).
- [Next.js 16 OpenTelemetry guide](https://nextjs.org/docs/app/guides/open-telemetry) — confirms `instrumentation.ts` auto-detection in v15+/16 and `@vercel/otel` self-host compatibility (HIGH).
- [Vaul releases & React 19 peer-dep](https://github.com/emilkowalski/vaul/releases) — confirmed React 19 added in 1.1.1, current 1.1.2 (HIGH).
- [Vaul docs & shadcn/ui Drawer recipe](https://ui.shadcn.com/docs/components/radix/drawer) — confirms Radix Dialog underpinnings and accessibility tradeoffs (HIGH).
- [@hello-pangea/dnd touch sensor docs](https://github.com/hello-pangea/dnd/blob/main/docs/sensors/touch.md) — confirmed long-press default and iOS webkit shake (HIGH).
- [Zod v4 vs Valibot benchmark (2026)](https://dev.to/whoffagents/zod-v4-vs-valibot-runtime-validation-in-2026-i-benchmarked-both-3jnc) — confirmed Zod v4 perf gains and bundle deltas (MEDIUM).
- [LangChain structured output docs (TS)](https://docs.langchain.com/oss/javascript/langchain/structured-output) — confirms Zod is recommended schema lib for LLM structured output (HIGH).
- [LangGraph plan-and-execute pattern](https://blog.langchain.com/plan-and-execute-agents/) — pattern reference, used here for *design* not as a dep (MEDIUM).
- [Inngest Next.js quickstart](https://www.inngest.com/docs/getting-started/nextjs-quick-start) — confirmed alternative for durable workflows (MEDIUM).
- [Container queries 2026 guide](https://blog.logrocket.com/container-queries-2026/) — confirmed browser-support coverage and dashboard use cases (HIGH).
- [react-resizable-panels v4 changelog](https://github.com/bvaughn/react-resizable-panels/blob/v4/CHANGELOG.md) — confirmed RSC support and v4 mobile caveat (HIGH).
- [diff2html](https://diff2html.xyz/) — verified active maintenance vs. stale react-diff-viewer (HIGH).
- [Sonner](https://www.npmjs.com/package/sonner) — version verified via npm registry (HIGH).
- npm registry queries on 2026-05-01 for: `langfuse@3.38.20`, `vaul@1.1.2`, `p-retry@8.0.0`, `zod@4.4.1`, `@langchain/langgraph@1.2.9`, `inngest@4.2.6`, `@opentelemetry/api@1.9.1`, `@vercel/otel@2.1.2`, `motion@12.38.0`, `framer-motion@12.38.0`, `react-resizable-panels@4.10.0`, `diff2html@3.4.56`, `diff@9.0.0`, `shiki@4.0.2`, `sonner@2.0.7`, `@hello-pangea/dnd@18.0.1` — all confirmed (HIGH).

---
*Stack research for: agent reliability + observability + mobile responsive + planning loop UI (Milestone 1 additions to Co-Op's locked stack)*
*Researched: 2026-05-01*
