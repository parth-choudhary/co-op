// M1 Phase 1 / Plan 01-03.1 — Next.js 16 instrumentation entry point.
//
// Auto-loaded by Next.js at server boot per their convention
// (see `node_modules/next/dist/docs/`). All wiring is env-gated; the
// no-env-vars case is a no-op and existing runs proceed unchanged.

export async function register() {
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    // Lazy import so the OTel runtime isn't pulled into cold-boot when the
    // env var isn't set. registerOTel auto-detects the exporter from
    // OTEL_EXPORTER_OTLP_* env vars; works against Langfuse's OTLP endpoint,
    // Honeycomb, Tempo, Jaeger via collector, etc.
    const { registerOTel } = await import('@vercel/otel');
    registerOTel({
      serviceName: process.env.OTEL_SERVICE_NAME || 'co-op',
    });
  }

  // Langfuse SDK registration is lazy too — the singleton is created on
  // first import by src/lib/observability/langfuse.ts. We don't import it
  // here; that would pull in transitive deps even when LANGFUSE_PUBLIC_KEY
  // isn't set.
}
