import prisma from './db';

// Memory v3 / Phase 3 — lifecycle ops for AgentMemory + ProjectMemory.
//
// Three operations, all manually triggered today (no scheduler tick yet):
//   - dedupAgentMemory(agentId)
//   - dedupProjectMemory(projectId)
//   - markStaleAgentMemories(agentId)
//
// Dedup finds rows with cosine similarity > DEDUP_COSINE_THRESHOLD on the
// embedding column AND matching `kind`, then collapses each pair to a single
// row keeping the newer updatedAt and joining sourceRef values. Greedy
// processing — once a row is dropped, subsequent pairs involving it are
// skipped — so the collapse is deterministic and idempotent across runs.
//
// Stale-marking only applies to AgentMemory.kind='context'. The 'context'
// kind is for in-the-moment notes that decay; preferences / decisions /
// facts don't. ProjectMemory has no 'context' kind; the stale column on
// ProjectMemory exists for the manual toggle from the harness UI (Phase 4)
// and any future use, not for automatic marking.

export const DEDUP_COSINE_THRESHOLD = 0.92;
export const STALE_AGE_DAYS = 90;

export interface DedupResult {
  pairsFound: number;
  rowsMerged: number;
  merges: Array<{ kept: string; dropped: string; kind: string }>;
}

export interface StaleResult {
  marked: number;
}

interface AgentDedupRow {
  id_a: string; id_b: string;
  key_a: string; key_b: string;
  kind: string;
  ref_a: string | null; ref_b: string | null;
  updated_a: Date; updated_b: Date;
  sim: number;
}

interface ProjectDedupRow extends AgentDedupRow {}

function mergeSourceRefs(a: string | null, b: string | null): string | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;
  return `${a} | ${b}`;
}

/** Pick (kept, dropped, mergedRef) from a candidate pair. Newer wins. */
function resolvePair<T extends AgentDedupRow>(p: T): { kept: string; dropped: string; mergedRef: string | null } {
  const aIsNewer = p.updated_a >= p.updated_b;
  const kept = aIsNewer ? p.id_a : p.id_b;
  const dropped = aIsNewer ? p.id_b : p.id_a;
  const refKept = aIsNewer ? p.ref_a : p.ref_b;
  const refDropped = aIsNewer ? p.ref_b : p.ref_a;
  return { kept, dropped, mergedRef: mergeSourceRefs(refKept, refDropped) };
}

export async function dedupAgentMemory(agentId: string): Promise<DedupResult> {
  const pairs = await prisma.$queryRaw<AgentDedupRow[]>`
    SELECT a."id" AS id_a, b."id" AS id_b,
           a."key" AS key_a, b."key" AS key_b,
           a."kind" AS kind,
           a."sourceRef" AS ref_a, b."sourceRef" AS ref_b,
           a."updatedAt" AS updated_a, b."updatedAt" AS updated_b,
           (1 - (a."embedding" <=> b."embedding"))::float8 AS sim
    FROM "AgentMemory" a
    JOIN "AgentMemory" b
      ON a."agentId" = b."agentId"
     AND a."kind" = b."kind"
     AND a."id" < b."id"
    WHERE a."agentId" = ${agentId}
      AND a."embedding" IS NOT NULL
      AND b."embedding" IS NOT NULL
      AND a."stale" = false
      AND b."stale" = false
      AND (1 - (a."embedding" <=> b."embedding")) > ${DEDUP_COSINE_THRESHOLD}
    ORDER BY (1 - (a."embedding" <=> b."embedding")) DESC
  `;

  const dropped = new Set<string>();
  const merges: DedupResult['merges'] = [];

  for (const p of pairs) {
    if (dropped.has(p.id_a) || dropped.has(p.id_b)) continue;
    const { kept, dropped: oldId, mergedRef } = resolvePair(p);
    await prisma.$transaction([
      prisma.agentMemory.update({ where: { id: kept }, data: { sourceRef: mergedRef } }),
      prisma.agentMemory.delete({ where: { id: oldId } }),
    ]);
    dropped.add(oldId);
    merges.push({ kept, dropped: oldId, kind: p.kind });
  }

  return { pairsFound: pairs.length, rowsMerged: merges.length, merges };
}

export async function dedupProjectMemory(projectId: string): Promise<DedupResult> {
  const pairs = await prisma.$queryRaw<ProjectDedupRow[]>`
    SELECT a."id" AS id_a, b."id" AS id_b,
           a."key" AS key_a, b."key" AS key_b,
           a."kind" AS kind,
           a."sourceRef" AS ref_a, b."sourceRef" AS ref_b,
           a."updatedAt" AS updated_a, b."updatedAt" AS updated_b,
           (1 - (a."embedding" <=> b."embedding"))::float8 AS sim
    FROM "ProjectMemory" a
    JOIN "ProjectMemory" b
      ON a."projectId" = b."projectId"
     AND a."kind" = b."kind"
     AND a."id" < b."id"
    WHERE a."projectId" = ${projectId}
      AND a."embedding" IS NOT NULL
      AND b."embedding" IS NOT NULL
      AND a."stale" = false
      AND b."stale" = false
      AND (1 - (a."embedding" <=> b."embedding")) > ${DEDUP_COSINE_THRESHOLD}
    ORDER BY (1 - (a."embedding" <=> b."embedding")) DESC
  `;

  const dropped = new Set<string>();
  const merges: DedupResult['merges'] = [];

  for (const p of pairs) {
    if (dropped.has(p.id_a) || dropped.has(p.id_b)) continue;
    const { kept, dropped: oldId, mergedRef } = resolvePair(p);
    await prisma.$transaction([
      prisma.projectMemory.update({ where: { id: kept }, data: { sourceRef: mergedRef } }),
      prisma.projectMemory.delete({ where: { id: oldId } }),
    ]);
    dropped.add(oldId);
    merges.push({ kept, dropped: oldId, kind: p.kind });
  }

  return { pairsFound: pairs.length, rowsMerged: merges.length, merges };
}

/**
 * Mark kind='context' AgentMemory rows as stale when they haven't been
 * retrieved in STALE_AGE_DAYS. Rows with lastRetrievedAt=null (never
 * retrieved) only count as stale once their createdAt is older than the
 * cutoff — otherwise newly-added rows would be marked stale immediately,
 * before they had a chance to be picked up by retrieval.
 */
export async function markStaleAgentMemories(agentId: string): Promise<StaleResult> {
  const cutoff = new Date(Date.now() - STALE_AGE_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.agentMemory.updateMany({
    where: {
      agentId,
      kind: 'context',
      stale: false,
      OR: [
        { lastRetrievedAt: null, createdAt: { lt: cutoff } },
        { lastRetrievedAt: { lt: cutoff } },
      ],
    },
    data: { stale: true },
  });
  return { marked: result.count };
}

export interface MemorySummary {
  total: number;
  embedded: number;
  stale: number;
  /** Pairs of rows that would collapse if dedup ran now. Doesn't actually
   *  collapse anything — just a count for the audit UI. */
  dedupCandidates: number;
}

export async function agentMemorySummary(agentId: string): Promise<MemorySummary> {
  const [counts, candidatesRow] = await Promise.all([
    prisma.$queryRaw<Array<{ total: bigint; embedded: bigint; stale: bigint }>>`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT("embedding")::bigint AS embedded,
        COUNT(*) FILTER (WHERE "stale" = true)::bigint AS stale
      FROM "AgentMemory"
      WHERE "agentId" = ${agentId}
    `,
    prisma.$queryRaw<Array<{ pairs: bigint }>>`
      SELECT COUNT(*)::bigint AS pairs
      FROM "AgentMemory" a
      JOIN "AgentMemory" b
        ON a."agentId" = b."agentId"
       AND a."kind" = b."kind"
       AND a."id" < b."id"
      WHERE a."agentId" = ${agentId}
        AND a."embedding" IS NOT NULL
        AND b."embedding" IS NOT NULL
        AND a."stale" = false
        AND b."stale" = false
        AND (1 - (a."embedding" <=> b."embedding")) > ${DEDUP_COSINE_THRESHOLD}
    `,
  ]);
  const c = counts[0];
  return {
    total: Number(c?.total ?? 0),
    embedded: Number(c?.embedded ?? 0),
    stale: Number(c?.stale ?? 0),
    dedupCandidates: Number(candidatesRow[0]?.pairs ?? 0),
  };
}

export async function projectMemorySummary(projectId: string): Promise<MemorySummary> {
  const [counts, candidatesRow] = await Promise.all([
    prisma.$queryRaw<Array<{ total: bigint; embedded: bigint; stale: bigint }>>`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT("embedding")::bigint AS embedded,
        COUNT(*) FILTER (WHERE "stale" = true)::bigint AS stale
      FROM "ProjectMemory"
      WHERE "projectId" = ${projectId}
    `,
    prisma.$queryRaw<Array<{ pairs: bigint }>>`
      SELECT COUNT(*)::bigint AS pairs
      FROM "ProjectMemory" a
      JOIN "ProjectMemory" b
        ON a."projectId" = b."projectId"
       AND a."kind" = b."kind"
       AND a."id" < b."id"
      WHERE a."projectId" = ${projectId}
        AND a."embedding" IS NOT NULL
        AND b."embedding" IS NOT NULL
        AND a."stale" = false
        AND b."stale" = false
        AND (1 - (a."embedding" <=> b."embedding")) > ${DEDUP_COSINE_THRESHOLD}
    `,
  ]);
  const c = counts[0];
  return {
    total: Number(c?.total ?? 0),
    embedded: Number(c?.embedded ?? 0),
    stale: Number(c?.stale ?? 0),
    dedupCandidates: Number(candidatesRow[0]?.pairs ?? 0),
  };
}
