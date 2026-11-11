-- CreateTable
CREATE TABLE "AiUsage" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'write',
    "tenantId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("userId","day","kind")
);

-- CreateIndex
CREATE INDEX "AiUsage_tenantId_day_idx" ON "AiUsage"("tenantId", "day");
