-- Add threading to comments so users and agents can reply to individual comments.
ALTER TABLE "Comment" ADD COLUMN "parentCommentId" TEXT;
CREATE INDEX "Comment_parentCommentId_idx" ON "Comment"("parentCommentId");
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentCommentId_fkey"
  FOREIGN KEY ("parentCommentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
