-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'IN_APP', 'PUSH', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventType" ADD VALUE 'ENTREPRENEURSHIP';
ALTER TYPE "EventType" ADD VALUE 'STARTUP_PITCH';
ALTER TYPE "EventType" ADD VALUE 'CONFERENCE';
ALTER TYPE "EventType" ADD VALUE 'PANEL_DISCUSSION';
ALTER TYPE "EventType" ADD VALUE 'MEETUP';
ALTER TYPE "EventType" ADD VALUE 'CAREER_FAIR';
ALTER TYPE "EventType" ADD VALUE 'INDUSTRY_VISIT';
ALTER TYPE "EventType" ADD VALUE 'ORIENTATION';
ALTER TYPE "EventType" ADD VALUE 'ALUMNI_MEET';
ALTER TYPE "EventType" ADD VALUE 'SPORTS';

-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "guestId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "clonedFromId" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "faqs" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "livestreamUrl" TEXT,
ADD COLUMN     "previewToken" TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
ADD COLUMN     "venueMapUrl" TEXT;

-- AlterTable
ALTER TABLE "EventGuest" ADD COLUMN     "arrivalAt" TIMESTAMP(3),
ADD COLUMN     "avRequirements" TEXT,
ADD COLUMN     "consentRecording" BOOLEAN,
ADD COLUMN     "departureAt" TIMESTAMP(3),
ADD COLUMN     "dietary" TEXT,
ADD COLUMN     "documents" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "hostUserId" TEXT,
ADD COLUMN     "invitedAt" TIMESTAMP(3),
ADD COLUMN     "invoiceUrl" TEXT,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "paymentStatus" TEXT,
ADD COLUMN     "portalToken" TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
ADD COLUMN     "profileId" TEXT,
ADD COLUMN     "profileSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "sessionAt" TIMESTAMP(3),
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stayDetails" TEXT,
ADD COLUMN     "talkAbstract" TEXT,
ADD COLUMN     "talkTitle" TEXT;

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "approvedForSocial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "caption" TEXT,
ADD COLUMN     "isHighlight" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "sizeBytes" INTEGER,
ADD COLUMN     "storageKey" TEXT;

-- AlterTable
ALTER TABLE "SocialPost" ADD COLUMN     "generatedBy" TEXT;

-- CreateTable
CREATE TABLE "GuestProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "designation" TEXT,
    "organization" TEXT,
    "bio" TEXT,
    "photoUrl" TEXT,
    "linkedinUrl" TEXT,
    "websiteUrl" TEXT,
    "city" TEXT,
    "expertise" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sponsor" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "website" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'PARTNER',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Sponsor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT,
    "userId" TEXT,
    "toEmail" TEXT,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "dedupKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuestProfile_tenantId_name_idx" ON "GuestProfile"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupKey_key" ON "Notification"("dedupKey");

-- CreateIndex
CREATE INDEX "Notification_status_scheduledFor_idx" ON "Notification"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "Notification_userId_channel_createdAt_idx" ON "Notification"("userId", "channel", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_eventId_guestId_type_key" ON "Certificate"("eventId", "guestId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Event_previewToken_key" ON "Event"("previewToken");

-- CreateIndex
CREATE UNIQUE INDEX "EventGuest_portalToken_key" ON "EventGuest"("portalToken");

-- AddForeignKey
ALTER TABLE "GuestProfile" ADD CONSTRAINT "GuestProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventGuest" ADD CONSTRAINT "EventGuest_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "GuestProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventGuest" ADD CONSTRAINT "EventGuest_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sponsor" ADD CONSTRAINT "Sponsor_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "EventGuest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing rows got random tokens above; new rows get tokens from the application.
ALTER TABLE "Event" ALTER COLUMN "previewToken" DROP DEFAULT;
ALTER TABLE "EventGuest" ALTER COLUMN "portalToken" DROP DEFAULT;
