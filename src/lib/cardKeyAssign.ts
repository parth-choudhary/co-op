// DB-touching helpers for card keys.
//
//   - assignNextCardNumber(projectId): atomically bumps Project.nextCardNumber
//     and returns the value to use for the new card. Race-safe via Postgres
//     UPDATE ... RETURNING semantics in Prisma's `update`.
//
//   - resolveProjectIdForColumn(columnId): figures out which project a column
//     belongs to. Used by card-create paths that only have a columnId.
//
//   - resolveCardId(input, projectScope?): given either a cuid or a key like
//     "COOP-123", returns the card's cuid. Used by tools that should accept
//     either form transparently.

import prisma from './db';
import { parseCardKey } from './cardKeys';

export async function resolveProjectIdForColumn(columnId: string): Promise<string | null> {
  const col = await prisma.column.findUnique({
    where: { id: columnId },
    select: { board: { select: { projectId: true } } },
  });
  return col?.board?.projectId ?? null;
}

/** Atomically increment Project.nextCardNumber and return the value to assign,
 *  along with the project's prefix so callers can build the full key without a
 *  second roundtrip. */
export async function assignNextCardNumber(projectId: string): Promise<{ number: number; prefix: string | null }> {
  // Prisma's `increment` compiles to UPDATE ... SET col = col + 1 ... RETURNING,
  // which is atomic at the row level — no read-then-write race.
  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { nextCardNumber: { increment: 1 } },
    select: { nextCardNumber: true, cardKeyPrefix: true },
  });
  // updated.nextCardNumber is the value AFTER increment, so the number we
  // actually assign to the card is one less.
  return { number: updated.nextCardNumber - 1, prefix: updated.cardKeyPrefix };
}

/**
 * Resolve a card identifier — accepting either a cuid (current id) or a key
 * like "COOP-123" — to the canonical card cuid. Returns null if not found.
 *
 * `projectScope` narrows key lookups: a bare key alone could collide with
 * keys from other projects, so callers that have a project in context (chat
 * room, board, current project page) should pass it. Without it we look the
 * key up unscoped and return null on multi-match.
 */
export async function resolveCardId(input: string, projectScope?: string | null): Promise<string | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // If it parses as a key, do the key lookup first.
  const parsed = parseCardKey(trimmed);
  if (parsed) {
    const where = projectScope
      ? { projectId: projectScope, number: parsed.number }
      : { number: parsed.number };
    const matches = await prisma.card.findMany({
      where: {
        ...where,
        // Verify the project's prefix matches the key prefix. This filters out
        // (number=N) collisions across projects when projectScope is unset.
        project: { is: { cardKeyPrefix: parsed.prefix } },
      },
      select: { id: true },
      take: 2,
    });
    if (matches.length === 1) return matches[0].id;
    if (matches.length > 1) return null; // ambiguous — caller must scope
    return null;
  }

  // Otherwise treat as a cuid.
  const card = await prisma.card.findUnique({ where: { id: trimmed }, select: { id: true } });
  return card?.id ?? null;
}

/**
 * `cardKey` look-up shortcut for the canonical /c/[cardKey] route — given a
 * project + key string, returns the card with the fields needed to redirect
 * (id + boardId).
 */
export async function findCardByKey(projectId: string, key: string): Promise<{ id: string; columnId: string; boardId: string } | null> {
  const parsed = parseCardKey(key);
  if (!parsed) return null;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { cardKeyPrefix: true },
  });
  if (!project || project.cardKeyPrefix !== parsed.prefix) return null;
  const card = await prisma.card.findFirst({
    where: { projectId, number: parsed.number },
    select: { id: true, columnId: true, column: { select: { boardId: true } } },
  });
  if (!card) return null;
  return { id: card.id, columnId: card.columnId, boardId: card.column.boardId };
}
