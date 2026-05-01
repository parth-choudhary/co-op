-- Card keys: per-project prefix + monotonic counter, e.g. "COOP-123".
-- Adds columns, backfills existing data, then adds the unique constraint.

-- 1. Project: prefix + next-number counter.
ALTER TABLE "Project"
  ADD COLUMN "cardKeyPrefix" TEXT,
  ADD COLUMN "nextCardNumber" INTEGER NOT NULL DEFAULT 1;

-- 2. Card: number + denormalized projectId (the unique constraint can't traverse Column→Board→Project).
ALTER TABLE "Card"
  ADD COLUMN "number" INTEGER,
  ADD COLUMN "projectId" TEXT;

-- 3. Backfill Card.projectId from the column→board chain.
UPDATE "Card" c
SET "projectId" = b."projectId"
FROM "Column" col
JOIN "Board" b ON b.id = col."boardId"
WHERE c."columnId" = col.id;

-- 4. Backfill Project.cardKeyPrefix.
--    Strategy: take the first 4 alphanumeric characters of project name, uppercased.
--    If that yields nothing usable, fall back to "P" + first 4 of project id.
--    Collisions across projects within a company are *fine* — keys are scoped per-project.
UPDATE "Project"
SET "cardKeyPrefix" = COALESCE(
  NULLIF(UPPER(SUBSTRING(REGEXP_REPLACE("name", '[^A-Za-z0-9]', '', 'g') FROM 1 FOR 4)), ''),
  'P' || SUBSTRING(id FROM 1 FOR 4)
);

-- 5. Backfill Card.number per project, ordered by createdAt then id (id breaks ties deterministically).
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "createdAt", id) AS rn
  FROM "Card"
  WHERE "projectId" IS NOT NULL
)
UPDATE "Card" c
SET "number" = n.rn
FROM numbered n
WHERE c.id = n.id;

-- 6. Set each Project.nextCardNumber to max(card.number) + 1.
UPDATE "Project" p
SET "nextCardNumber" = COALESCE(
  (SELECT MAX("number") + 1 FROM "Card" WHERE "projectId" = p.id),
  1
);

-- 7. Indexes + unique constraint.
CREATE UNIQUE INDEX "Card_projectId_number_key" ON "Card"("projectId", "number");
CREATE INDEX "Card_projectId_idx" ON "Card"("projectId");
