-- CreateEnum
CREATE TYPE "JudgingPresetKind" AS ENUM ('CRITERION', 'COMMENT');

-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('PER_PERSON', 'PER_TEAM');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('RAZORPAY', 'MANUAL', 'DEV');

-- AlterEnum
ALTER TYPE "CertificateType" ADD VALUE 'FINALIST';

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'TECH_FEST';

-- AlterEnum
ALTER TYPE "RegistrationStatus" ADD VALUE 'PENDING_PAYMENT';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "earlyBirdAmount" INTEGER,
ADD COLUMN     "earlyBirdEndsAt" TIMESTAMP(3),
ADD COLUMN     "feeAmount" INTEGER,
ADD COLUMN     "feeType" "FeeType" NOT NULL DEFAULT 'PER_PERSON',
ADD COLUMN     "pageSections" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "parentEventId" TEXT,
ADD COLUMN     "submissionsCloseAt" TIMESTAMP(3),
ADD COLUMN     "submissionsOpenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "JudgingRound" ADD COLUMN     "closesAt" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "opensAt" TIMESTAMP(3),
ADD COLUMN     "restrictTeams" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shareFeedback" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "addedById" TEXT,
ADD COLUMN     "paymentId" TEXT;

-- AlterTable
ALTER TABLE "RubricCriterion" ADD COLUMN     "roundId" TEXT;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "attachments" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "problemStatementId" TEXT,
ADD COLUMN     "registeredAsTeam" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "techStack" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "RoundTeam" (
    "roundId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundTeam_pkey" PRIMARY KEY ("roundId","teamId")
);

-- CreateTable
CREATE TABLE "JudgeReview" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "judgeId" TEXT NOT NULL,
    "comment" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recommend" BOOLEAN,
    "submittedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JudgeReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JudgingPreset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "JudgingPresetKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "maxScore" INTEGER,
    "weight" DOUBLE PRECISION,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JudgingPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemStatement" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "trackId" TEXT,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "html" TEXT NOT NULL DEFAULT '',
    "difficulty" TEXT,
    "sponsorName" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "releaseAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'RAZORPAY',
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "couponId" TEXT,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "receiptNo" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "percentOff" INTEGER,
    "amountOff" INTEGER,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JudgeReview_roundId_teamId_judgeId_key" ON "JudgeReview"("roundId", "teamId", "judgeId");

-- CreateIndex
CREATE INDEX "JudgingPreset_tenantId_kind_idx" ON "JudgingPreset"("tenantId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerOrderId_key" ON "Payment"("providerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_receiptNo_key" ON "Payment"("receiptNo");

-- CreateIndex
CREATE INDEX "Payment_eventId_status_idx" ON "Payment"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_eventId_code_key" ON "Coupon"("eventId", "code");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_parentEventId_fkey" FOREIGN KEY ("parentEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_problemStatementId_fkey" FOREIGN KEY ("problemStatementId") REFERENCES "ProblemStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricCriterion" ADD CONSTRAINT "RubricCriterion_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "JudgingRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundTeam" ADD CONSTRAINT "RoundTeam_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "JudgingRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundTeam" ADD CONSTRAINT "RoundTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeReview" ADD CONSTRAINT "JudgeReview_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeReview" ADD CONSTRAINT "JudgeReview_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "JudgingRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeReview" ADD CONSTRAINT "JudgeReview_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeReview" ADD CONSTRAINT "JudgeReview_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgingPreset" ADD CONSTRAINT "JudgingPreset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemStatement" ADD CONSTRAINT "ProblemStatement_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
