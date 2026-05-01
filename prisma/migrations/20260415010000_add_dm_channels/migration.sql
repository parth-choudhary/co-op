ALTER TABLE "ChatChannel" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'channel';
CREATE INDEX IF NOT EXISTS "ChatChannel_kind_idx" ON "ChatChannel"("kind");
CREATE TABLE IF NOT EXISTS "ChatChannelMember" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "channelId" TEXT NOT NULL,
  "userId" TEXT,
  "agentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatChannelMember_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChatChannelMember_channelId_userId_key" ON "ChatChannelMember"("channelId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ChatChannelMember_channelId_agentId_key" ON "ChatChannelMember"("channelId", "agentId");
CREATE INDEX IF NOT EXISTS "ChatChannelMember_channelId_idx" ON "ChatChannelMember"("channelId");
CREATE INDEX IF NOT EXISTS "ChatChannelMember_userId_idx" ON "ChatChannelMember"("userId");
CREATE INDEX IF NOT EXISTS "ChatChannelMember_agentId_idx" ON "ChatChannelMember"("agentId");

-- Add explicit FKs so Prisma relations work
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatChannelMember_userId_fkey') THEN
    ALTER TABLE "ChatChannelMember" ADD CONSTRAINT "ChatChannelMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatChannelMember_agentId_fkey') THEN
    ALTER TABLE "ChatChannelMember" ADD CONSTRAINT "ChatChannelMember_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AIAgent"("id") ON DELETE CASCADE;
  END IF;
END$$;
