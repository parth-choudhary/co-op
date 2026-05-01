// Resolves sender references to display names. One DB roundtrip per resolve()
// call regardless of how many distinct senders appear.
//
// Sender lookup keys differ by source:
//   - Matrix events carry a `matrixUserId` like "@alice:coop.local" — could be a
//     human (User.matrixUserId) or an agent (AIAgent.matrixUserId).
//   - Comments carry a `userId` or `agentId` directly.
//
// We batch lookups across both axes so the resolver works for either source.

import prisma from '../db';
import type { SenderRef } from './types';

export interface ResolvedSenders {
  /** Lookup: matrix user id → display name */
  byMatrixUserId: Map<string, { name: string; userId?: string; agentId?: string }>;
  /** Lookup: app user id → display name */
  byUserId: Map<string, { name: string; matrixUserId?: string }>;
  /** Lookup: app agent id → display name */
  byAgentId: Map<string, { name: string; matrixUserId?: string }>;
}

export async function resolveSenders(refs: SenderRef[]): Promise<ResolvedSenders> {
  const matrixIds = new Set<string>();
  const userIds = new Set<string>();
  const agentIds = new Set<string>();
  for (const r of refs) {
    if (r.matrixUserId) matrixIds.add(r.matrixUserId);
    if (r.userId) userIds.add(r.userId);
    if (r.agentId) agentIds.add(r.agentId);
  }

  const [usersByMatrix, agentsByMatrix, usersById, agentsById] = await Promise.all([
    matrixIds.size > 0
      ? prisma.user.findMany({
          where: { matrixUserId: { in: [...matrixIds] } },
          select: { id: true, name: true, matrixUserId: true },
        })
      : Promise.resolve([] as Array<{ id: string; name: string | null; matrixUserId: string | null }>),
    matrixIds.size > 0
      ? prisma.aIAgent.findMany({
          where: { matrixUserId: { in: [...matrixIds] } },
          select: { id: true, name: true, matrixUserId: true },
        })
      : Promise.resolve([] as Array<{ id: string; name: string; matrixUserId: string | null }>),
    userIds.size > 0
      ? prisma.user.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, name: true, matrixUserId: true },
        })
      : Promise.resolve([] as Array<{ id: string; name: string | null; matrixUserId: string | null }>),
    agentIds.size > 0
      ? prisma.aIAgent.findMany({
          where: { id: { in: [...agentIds] } },
          select: { id: true, name: true, matrixUserId: true },
        })
      : Promise.resolve([] as Array<{ id: string; name: string; matrixUserId: string | null }>),
  ]);

  const byMatrixUserId = new Map<string, { name: string; userId?: string; agentId?: string }>();
  for (const u of usersByMatrix) {
    if (u.matrixUserId) byMatrixUserId.set(u.matrixUserId, { name: u.name || u.matrixUserId, userId: u.id });
  }
  for (const a of agentsByMatrix) {
    if (a.matrixUserId) byMatrixUserId.set(a.matrixUserId, { name: a.name, agentId: a.id });
  }

  const byUserId = new Map<string, { name: string; matrixUserId?: string }>();
  for (const u of usersById) {
    byUserId.set(u.id, { name: u.name || u.id, matrixUserId: u.matrixUserId || undefined });
  }

  const byAgentId = new Map<string, { name: string; matrixUserId?: string }>();
  for (const a of agentsById) {
    byAgentId.set(a.id, { name: a.name, matrixUserId: a.matrixUserId || undefined });
  }

  return { byMatrixUserId, byUserId, byAgentId };
}

/** Apply a resolved-senders map to fill in displayName on a SenderRef. */
export function nameFor(ref: SenderRef, resolved: ResolvedSenders): string {
  if (ref.displayName) return ref.displayName;
  if (ref.matrixUserId && resolved.byMatrixUserId.has(ref.matrixUserId)) {
    return resolved.byMatrixUserId.get(ref.matrixUserId)!.name;
  }
  if (ref.agentId && resolved.byAgentId.has(ref.agentId)) {
    return resolved.byAgentId.get(ref.agentId)!.name;
  }
  if (ref.userId && resolved.byUserId.has(ref.userId)) {
    return resolved.byUserId.get(ref.userId)!.name;
  }
  // Fallback: best-effort short label so the model still has something to anchor on.
  if (ref.matrixUserId) {
    const local = ref.matrixUserId.replace(/^@/, '').split(':')[0];
    return local;
  }
  return 'unknown';
}
