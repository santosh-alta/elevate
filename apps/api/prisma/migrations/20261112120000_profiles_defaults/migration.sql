-- Coding profiles on the user profile
ALTER TABLE "User" ADD COLUMN "leetcodeUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "gfgUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "codechefUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "hackerrankUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "codeforcesUrl" TEXT;

-- Verification codes for changing the email address
ALTER TABLE "OtpCode" ADD COLUMN "purpose" TEXT;
ALTER TABLE "OtpCode" ADD COLUMN "email" TEXT;

-- "Email the audience when announced" is off unless ticked
ALTER TABLE "Event" ALTER COLUMN "notifyOnAnnounce" SET DEFAULT false;
UPDATE "Event" SET "notifyOnAnnounce" = false WHERE "announcedNotifiedAt" IS NULL;
