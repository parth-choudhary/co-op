-- Support multiple trigger columns per project (e.g. one per board).
ALTER TABLE "ProjectCodeConfig" ADD COLUMN "triggerColumnIds" TEXT[] NOT NULL DEFAULT '{}';
UPDATE "ProjectCodeConfig" SET "triggerColumnIds" = ARRAY["triggerColumnId"]
  WHERE "triggerColumnId" IS NOT NULL;
ALTER TABLE "ProjectCodeConfig" DROP COLUMN "triggerColumnId";
