-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "leadTeams" TEXT[] DEFAULT ARRAY[]::TEXT[];

