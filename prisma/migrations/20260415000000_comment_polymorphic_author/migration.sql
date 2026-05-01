-- Allow Comment.authorId to reference either a User or an AIAgent (polymorphic via authorType).
ALTER TABLE "Comment" DROP CONSTRAINT IF EXISTS "Comment_authorId_fkey";
