// M1 Phase 1 / Plan 01-03.5 — env-gating contract for Langfuse + OTel.
//
// Verifies the no-env-vars contract: with LANGFUSE_PUBLIC_KEY unset, the
// Langfuse singleton returns null and traceGeneration is a no-op pass-through.
// With OTEL_EXPORTER_OTLP_ENDPOINT unset, register() is a no-op resolve.
//
// We cannot easily mock the dynamic `import('@vercel/otel')` inside
// instrumentation.ts, so the OTel test exercises the resolve-without-throw
// behavior under both env states. The real contract — no SDK loaded when
// the env var is unset — is documented in the file's structure (lazy import
// inside the `if` branch); a build-size delta would catch regressions.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Ensure clean env at module-load time.
delete process.env.LANGFUSE_PUBLIC_KEY;
delete process.env.LANGFUSE_SECRET_KEY;
delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

test('getLangfuse: returns null when LANGFUSE_PUBLIC_KEY is unset', async () => {
  const { getLangfuse } = await import('../../src/lib/observability/langfuse');
  assert.equal(getLangfuse(), null);
  // Probe is cached — second call returns the same null without re-checking.
  assert.equal(getLangfuse(), null);
});

test('traceGeneration: returns the wrapped result when Langfuse is unconfigured', async () => {
  const { traceGeneration } = await import('../../src/lib/observability/langfuse');
  const result = await traceGeneration(
    { name: 'test.call', model: 'm', input: { x: 1 } },
    async () => ({ result: { ok: true, value: 42 }, usage: { inputTokens: 10, outputTokens: 5 } }),
  );
  assert.deepEqual(result, { ok: true, value: 42 });
});

test('traceGeneration: re-throws when the wrapped fn throws (Langfuse unconfigured)', async () => {
  const { traceGeneration } = await import('../../src/lib/observability/langfuse');
  await assert.rejects(
    traceGeneration(
      { name: 'test.call', model: 'm', input: {} },
      async () => { throw new Error('SDK boom'); },
    ),
    /SDK boom/,
  );
});

test('register: resolves without throwing when OTEL_EXPORTER_OTLP_ENDPOINT is unset', async () => {
  const mod = await import('../../instrumentation');
  await assert.doesNotReject(mod.register());
});
