-- Subtasks: a Card may have a parent Card. Deleting the parent cascades to subtasks.

ALTER TABLE "Card" ADD COLUMN "parentCardId" TEXT;

CREATE INDEX "Card_parentCardId_idx" ON "Card"("parentCardId");

ALTER TABLE "Card" ADD CONSTRAINT "Card_parentCardId_fkey"
  FOREIGN KEY ("parentCardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
