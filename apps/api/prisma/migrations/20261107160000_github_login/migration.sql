-- AlterTable
ALTER TABLE "User" ADD COLUMN     "githubId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");
