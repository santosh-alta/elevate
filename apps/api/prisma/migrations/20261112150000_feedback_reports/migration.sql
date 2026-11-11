-- Richer feedback: ratings per area and two open questions
ALTER TABLE "Feedback" ADD COLUMN "aspects" JSONB;
ALTER TABLE "Feedback" ADD COLUMN "liked" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "improve" TEXT;

-- After-event emails are sent once per event
ALTER TABLE "Event" ADD COLUMN "feedbackRequestedAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN "reportSentAt" TIMESTAMP(3);
-- Events that already ended don't send these now
UPDATE "Event" SET "feedbackRequestedAt" = NOW(), "reportSentAt" = NOW() WHERE "endsAt" < NOW();

-- Default recipients of the outcome report for ALTA (changeable in Settings → Students & notifications)
UPDATE "Tenant"
SET "settings" = jsonb_set(COALESCE("settings", '{}'::jsonb), '{eventReport}',
  '{"to": ["harshit@sunstone.in"], "cc": ["santosh@altaschool.tech", "yaman.dhingra@altaschool.tech", "nawal.pathak@sunstone.in", "navdeep.sandhu@altaschool.tech"], "afterDays": 7}'::jsonb, true)
WHERE "slug" = 'altaschool' AND NOT (COALESCE("settings", '{}'::jsonb) ? 'eventReport');
