import prisma from './db';

// M1 Phase 1 / Plan 01-01.3 — entity snapshot helpers for the RunDiff ledger.
//
// snapshotEntity loads an entity with the associations the audit UI (Phase 3)
// will render. commitRunDiff persists the structured before/after pair.
// `before: null` ⇒ entity created in this run; `after: null` ⇒ entity deleted.
// Both populated ⇒ update.

const ENTITY_LOADERS = {
  card: async (id: string) =>
    prisma.card.findUnique({
      where: { id },
      include: {
        members: true,
        checklists: { include: { items: true } },
      },
    }),
  comment: async (id: string) => prisma.comment.findUnique({ where: { id } }),
  attachment: async (id: string) => prisma.attachment.findUnique({ where: { id } }),
  cardMember: async (id: string) => prisma.cardMember.findUnique({ where: { id } }),
  chatChannel: async (id: string) => prisma.chatChannel.findUnique({ where: { id } }),
} as const;

export type DiffableEntity = keyof typeof ENTITY_LOADERS;

export async function snapshotEntity(entity: DiffableEntity, id: string): Promise<any> {
  const loader = ENTITY_LOADERS[entity];
  if (!loader) throw new Error(`No diff loader for entity: ${entity}`);
  return loader(id);
}

export interface CommitRunDiffOptions {
  runId: string;
  entity: DiffableEntity;
  entityId: string;
  before: any | null;
  after: any | null;
}

export async function commitRunDiff(opts: CommitRunDiffOptions) {
  return prisma.runDiff.create({
    data: {
      runId: opts.runId,
      entity: opts.entity,
      entityId: opts.entityId,
      before: opts.before,
      after: opts.after,
    },
  });
}
