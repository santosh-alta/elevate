-- ALTA instructors (synced) vs external guests
ALTER TABLE "GuestProfile" ADD COLUMN "affiliation" TEXT NOT NULL DEFAULT 'EXTERNAL';
ALTER TABLE "GuestProfile" ADD COLUMN "source" TEXT;
ALTER TABLE "GuestProfile" ADD COLUMN "externalId" TEXT;
ALTER TABLE "GuestProfile" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GuestProfile" ADD COLUMN "campuses" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "GuestProfile" ADD COLUMN "contractType" TEXT;
CREATE UNIQUE INDEX "GuestProfile_tenantId_source_externalId_key" ON "GuestProfile"("tenantId", "source", "externalId");

-- Run the student + instructor sync right after this deploy (instead of waiting a month)
UPDATE "Tenant" SET "settings" = "settings" #- '{studentSync,lastSyncAt}' WHERE "slug" = 'altaschool' AND "settings" ? 'studentSync';
