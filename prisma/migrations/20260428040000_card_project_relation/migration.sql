-- Declare the Card → Project FK that the card_keys migration omitted.
-- The Prisma schema has been using `project: { select: { cardKeyPrefix: ... } }`
-- joins on Card since 20260428030000_card_keys, but the relation was never
-- defined in schema.prisma — so Prisma rejected the queries at runtime.
--
-- Defensive: clear any Card.projectId values that don't point at an existing
-- Project (shouldn't happen given the backfill, but FK creation will fail
-- otherwise, so this is cheap insurance).
UPDATE "Card" c
SET "projectId" = NULL
WHERE "projectId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Project" p WHERE p.id = c."projectId");

ALTER TABLE "Card"
  ADD CONSTRAINT "Card_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
