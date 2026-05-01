import { createHash } from 'crypto';
import prisma from './db';

// Session threading helpers — inspired by OpenClaw's per-sessionKey queue.
// A "session" in our model is a rolling conversation identifier. Multiple webhook
// invocations with the same sessionKey extend the same transcript; advisory
// locks serialize their execution per session.

export function defaultSessionKey(agentId: string, source: string, sourceRef: string, sender?: string): string {
  const parts = [agentId, source, sourceRef, sender || ''].join('|');
  return 'sess:' + createHash('sha256').update(parts).digest('hex').slice(0, 24);
}

// Render a subscription's sessionKeyTemplate with payload fields. Very small
// interpolation language: {{path.to.field}} replaced with payload value, else empty.
export function renderSessionKeyTemplate(template: string, payload: any): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_m, path) => {
    const segs = String(path).trim().split('.');
    let cur: any = payload;
    for (const s of segs) { if (cur == null) return ''; cur = cur[s]; }
    return cur == null ? '' : String(cur);
  });
}

// Acquire a Postgres advisory lock scoped to a sessionKey for the duration of
// the current transaction. Returns the bigint lock id used. Caller must execute
// inside a $transaction so the lock auto-releases on commit/rollback.
export function lockIdForSession(sessionKey: string): bigint {
  const h = createHash('sha256').update(sessionKey).digest();
  // Use first 8 bytes as signed 64-bit int.
  const view = new DataView(h.buffer, h.byteOffset, 8);
  const v = view.getBigInt64(0, false);
  return v;
}

export async function loadSessionTranscript(sessionKey: string, limit = 6): Promise<string> {
  const rows = await prisma.agentTaskRun.findMany({
    where: { sessionKey, status: { in: ['completed', 'failed'] } },
    orderBy: { startedAt: 'desc' },
    take: limit,
    select: { startedAt: true, taskBrief: true, errorMessage: true, status: true },
  });
  if (rows.length === 0) return '';
  const lines: string[] = ['## Prior turns in this conversation (most recent first)'];
  for (const r of rows as any[]) {
    const when = r.startedAt.toISOString();
    const body = (r.taskBrief || '').slice(0, 500) || r.errorMessage?.slice(0, 200) || '(no summary)';
    lines.push(`- [${when}] (${r.status}) ${body}`);
  }
  return lines.join('\n');
}

// Idempotency: returns { cached: true, response } if the key was already
// handled within TTL; otherwise records the key and returns { cached: false }.
export async function claimIdempotency(scope: string, key: string, ttlSec = 300): Promise<{ cached: true; response: any } | { cached: false; rowId: string }> {
  const now = new Date();
  const existing = await prisma.webhookIdempotency.findUnique({ where: { scope_key: { scope, key } } }).catch(() => null);
  if (existing && existing.expiresAt > now) {
    return { cached: true, response: existing.responseJson };
  }
  const expiresAt = new Date(now.getTime() + ttlSec * 1000);
  const row = await prisma.webhookIdempotency.upsert({
    where: { scope_key: { scope, key } },
    create: { scope, key, expiresAt },
    update: { expiresAt, runIds: [], responseJson: undefined as any },
  });
  return { cached: false, rowId: row.id };
}

export async function storeIdempotencyResponse(scope: string, key: string, response: any, runIds: string[]) {
  await prisma.webhookIdempotency.update({
    where: { scope_key: { scope, key } },
    data: { responseJson: response as any, runIds },
  }).catch(() => {});
}
