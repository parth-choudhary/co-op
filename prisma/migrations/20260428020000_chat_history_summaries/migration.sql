-- Rolling per-room chat history summary, fed to agents alongside the recent message window.
-- One row per ChatChannel; shared across all agents in the room.
CREATE TABLE "RoomSummary" (
  "channelId"      TEXT      NOT NULL,
  "summary"        TEXT      NOT NULL,
  "upToEventId"    TEXT,
  "upToTimestamp"  TIMESTAMP(3),
  "messageCount"   INTEGER   NOT NULL DEFAULT 0,
  "modelUsed"      TEXT,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RoomSummary_pkey" PRIMARY KEY ("channelId")
);

ALTER TABLE "RoomSummary" ADD CONSTRAINT "RoomSummary_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rolling per-card comment-thread summary. One row per Card; shared across agents.
CREATE TABLE "CardThreadSummary" (
  "cardId"         TEXT      NOT NULL,
  "summary"        TEXT      NOT NULL,
  "upToCommentId"  TEXT,
  "upToTimestamp"  TIMESTAMP(3),
  "messageCount"   INTEGER   NOT NULL DEFAULT 0,
  "modelUsed"      TEXT,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CardThreadSummary_pkey" PRIMARY KEY ("cardId")
);

ALTER TABLE "CardThreadSummary" ADD CONSTRAINT "CardThreadSummary_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
