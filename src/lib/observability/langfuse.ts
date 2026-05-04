import { Langfuse } from 'langfuse';

// M1 Phase 1 / Plan 01-03.2 — Langfuse client singleton + traceGeneration wrapper.
//
// All wiring is env-gated: with LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY
// unset, getLangfuse() returns null and traceGeneration is a no-op (single
// conditional branch on the hot path). Self-host stanza in
// docker-compose.yml is uncomment-able for local Langfuse.

let cached: Langfuse | null = null;
let probed = false;

export function getLangfuse(): Langfuse | null {
  if (probed) return cached;
  probed = true;
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) return null;
  cached = new Langfuse({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com',
  });
  return cached;
}

export interface TraceGenerationOpts {
  /** Span name — usually the SDK call site, e.g. "anthropic.messages.create". */
  name: string;
  /** Model identifier (the agent's modelName). */
  model: string;
  /** Whatever the SDK call's input was — system prompt, messages, tool schemas. */
  input: unknown;
  /** Optional grouping metadata: agentId, projectId, runId, etc. */
  metadata?: Record<string, unknown>;
  /** Optional run id — when present, the trace name is "run/<runId>". */
  runId?: string | null;
  /** Optional agent id — recorded in trace metadata. */
  agentId?: string | null;
}

/**
 * Wrap a Promise-returning SDK call in a Langfuse generation span. No-op
 * when Langfuse is unconfigured: the wrapped fn runs and its result is
 * returned directly. When configured, emits a trace with one generation
 * span; failures are recorded with level=ERROR and re-thrown.
 *
 * The fn must return `{ result, usage? }` — usage is reported to Langfuse
 * for cost/token telemetry (Phase 3 AUD-08 surfaces these in the UI).
 */
export async function traceGeneration<T>(
  opts: TraceGenerationOpts,
  fn: () => Promise<{ result: T; usage?: { inputTokens?: number; outputTokens?: number } }>,
): Promise<T> {
  const lf = getLangfuse();
  if (!lf) {
    const { result } = await fn();
    return result;
  }
  const trace = lf.trace({
    name: opts.runId ? `run/${opts.runId}` : opts.name,
    metadata: { agentId: opts.agentId ?? null, ...opts.metadata },
  });
  const gen = trace.generation({
    name: opts.name,
    model: opts.model,
    input: opts.input as any,
  });
  try {
    const { result, usage } = await fn();
    // Langfuse SDK uses { input, output, total } in TOKENS units; map our
    // SDK-shaped { inputTokens, outputTokens } onto it.
    const lfUsage = usage
      ? {
          input: usage.inputTokens,
          output: usage.outputTokens,
          unit: 'TOKENS' as const,
        }
      : undefined;
    gen.end({ output: result as any, usage: lfUsage });
    return result;
  } catch (err) {
    gen.end({ output: { error: String(err) } as any, level: 'ERROR' });
    throw err;
  }
}
