-- CreateTable
CREATE TABLE "SiteFeedback" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT,
    "email" TEXT,
    "campus" TEXT,
    "rating" INTEGER,
    "liked" TEXT,
    "confusing" TEXT,
    "missing" TEXT,
    "broken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteFeedback_tenantId_createdAt_idx" ON "SiteFeedback"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "SiteFeedback" ADD CONSTRAINT "SiteFeedback_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

