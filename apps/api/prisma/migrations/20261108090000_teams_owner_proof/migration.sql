-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "teams" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "ownerId" TEXT;

-- AlterTable
ALTER TABLE "TaskTemplate" ADD COLUMN     "proofRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "team" TEXT;

-- AlterTable
ALTER TABLE "EventTask" ADD COLUMN     "proofRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "team" TEXT;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Existing events: the creator is the owner.
UPDATE "Event" SET "ownerId" = "createdById" WHERE "ownerId" IS NULL AND "createdById" IS NOT NULL;
