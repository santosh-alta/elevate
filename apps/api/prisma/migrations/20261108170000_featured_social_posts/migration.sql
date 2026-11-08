-- AlterTable
ALTER TABLE "SocialPost" ADD COLUMN     "authorName" TEXT,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false;

