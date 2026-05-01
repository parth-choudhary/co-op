import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { runAgent } from '@/lib/agentRunner';
import {
  claimIdempotency,
  defaultSessionKey,
  lockIdForSession,
  loadSessionTranscript,
  renderSessionKeyTemplate,
  storeIdempotencyResponse,
} from '@/lib/sessions';

// Generic plugin webhook router. Plugins can register inbound webhooks keyed by
// { plugin, slug }; this route resolves matching AgentSubscription rows and
// enqueues a run per match.
//
// Behaviors adopted from OpenClaw:
//   - Idempotency-Key header (plus scope) dedupes retries within a TTL.
//   - Each run is threaded into a sessionKey, derived from the subscription's
//     template or a default based on (agentId, source, sourceRef, sender).
//     Prior runs on the same sessionKey are summarized into the prompt so the
//     agent sees the ongoing conversation.
//   - Per-session Postgres advisory lock serializes concurrent events for the
//     same session, preventing a moderator agent from replying twice in parallel.

export async function POST(request: NextRequest, { params }: { params: Promise<{ plugin: string; slug: string }> }) {
  const { plugin, slug } = await params;
  const raw = await request.text();
  const payload = safeJson(raw);

  const sourceOverride = request.nextUrl.searchParams.get('source');
  const source = sourceOverride || `${plugin}:${slug}`;
  const sourceRef = request.nextUrl.searchParams.get('sourceRef') || slug;

  const idemKey =
    request.headers.get('idempotency-key') ||
    request.headers.get('x-idempotency-key') ||
    null;
  if (idemKey) {
    const scope = `webhook:${plugin}:${slug}`;
    const claim = await claimIdempotency(scope, idemKey, 600);
    if (claim.cached) {
      return NextResponse.json({ ...claim.response, _cached: true });
    }
  }

  const subs = await prisma.agentSubscription.findMany({
    where: { source, sourceRef, enabled: true },
    include: { agent: { select: { id: true, isActive: true, projectId: true } } },
  });

  const launched: string[] = [];
  const senderHint = extractSenderHint(payload);

  for (const sub of subs) {
    if (!sub.agent?.isActive) continue;
    const sessionKey = sub.sessionKeyTemplate
      ? renderSessionKeyTemplate(sub.sessionKeyTemplate, { ...payload, _agentId: sub.agentId, _source: source, _sourceRef: sourceRef })
      : defaultSessionKey(sub.agentId, source, sourceRef, senderHint);

    const run = await prisma.agentTaskRun.create({
      data: {
        projectId: sub.projectId,
        agentId: sub.agentId,
        triggerKind: 'webhook',
        executionMode: 'local_git',
        trigger: 'webhook',
        subscriptionId: sub.id,
        sessionKey,
        idempotencyKey: idemKey,
        status: 'running',
        taskBrief: `Inbound ${source}#${sourceRef}: ${raw.slice(0, 400)}`,
      },
    });
    launched.push(run.id);

    void dispatch(run.id, sub.agentId, sessionKey, source, sourceRef, payload);
    await prisma.agentSubscription.update({ where: { id: sub.id }, data: { lastEventAt: new Date() } });
  }

  const response = { ok: true, matched: subs.length, launched };
  if (idemKey) {
    const scope = `webhook:${plugin}:${slug}`;
    await storeIdempotencyResponse(scope, idemKey, response, launched);
  }
  return NextResponse.json(response);
}

// Per-session serialization via Postgres advisory xact lock. Each event for the
// same sessionKey waits for the previous run to finish before firing the LLM.
async function dispatch(runId: string, agentId: string, sessionKey: string, source: string, sourceRef: string, payload: any) {
  const lockId = lockIdForSession(sessionKey);
  try {
    await prisma.$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${lockId}::bigint)`;
      const transcript = await loadSessionTranscript(sessionKey, 6);
      const extraContext = [
        'A perpetual subscription fired. Decide whether to respond and act accordingly. If the event does not require action, say so and stop.',
        transcript || null,
      ].filter(Boolean).join('\n\n');
      try {
        await runAgent({
          agentId,
          runId,
          userPrompt: `Inbound event on subscription ${source}/${sourceRef}.\nPayload:\n\`\`\`json\n${JSON.stringify(payload, null, 2).slice(0, 8000)}\n\`\`\``,
          extraContext,
          enableTools: true,
          harnessContext: { kind: 'webhook' },
        });
        await tx.agentTaskRun.update({ where: { id: runId }, data: { status: 'completed', finishedAt: new Date() } });
      } catch (err: any) {
        await tx.agentTaskRun.update({ where: { id: runId }, data: { status: 'failed', errorMessage: err?.message || 'run failed', finishedAt: new Date() } });
      }
    }, { timeout: 120_000, maxWait: 30_000 });
  } catch (err: any) {
    await prisma.agentTaskRun.update({
      where: { id: runId },
      data: { status: 'failed', errorMessage: `dispatch error: ${err?.message || err}`, finishedAt: new Date() },
    }).catch(() => {});
  }
}

// Best-effort sender extraction for default session keys across common
// webhook shapes. Callers who need strict threading should set
// sessionKeyTemplate on the subscription.
function extractSenderHint(payload: any): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  return payload.sender?.login
    || payload.user?.id
    || payload.author?.id
    || payload.from?.id
    || payload.username
    || undefined;
}

function safeJson(raw: string): any {
  try { return JSON.parse(raw); } catch { return { _raw: raw.slice(0, 2000) }; }
}
