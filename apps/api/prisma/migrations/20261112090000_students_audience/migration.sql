-- Campus codes in the student database
ALTER TABLE "Campus" ADD COLUMN "externalCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Event audience and notification settings
ALTER TABLE "Event" ADD COLUMN "audienceBatches" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "Event" ADD COLUMN "audiencePrograms" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Event" ADD COLUMN "notifyOnAnnounce" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Event" ADD COLUMN "remindersEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Event" ADD COLUMN "announcedNotifiedAt" TIMESTAMP(3);
-- Events already public or finished don't send a "new event" email now
UPDATE "Event" SET "announcedNotifiedAt" = NOW() WHERE "status" NOT IN ('DRAFT', 'PLANNING');

-- Students
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "campusCode" TEXT,
    "campusName" TEXT,
    "campusId" TEXT,
    "program" TEXT,
    "batch" INTEGER,
    "passingYear" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Student_tenantId_source_externalId_key" ON "Student"("tenantId", "source", "externalId");
CREATE INDEX "Student_tenantId_email_idx" ON "Student"("tenantId", "email");
CREATE INDEX "Student_tenantId_active_campusId_batch_idx" ON "Student"("tenantId", "active", "campusId", "batch");
ALTER TABLE "Student" ADD CONSTRAINT "Student_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Student" ADD CONSTRAINT "Student_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
