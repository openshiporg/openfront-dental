-- Remove the invented outbox. Nothing else reads it: the only reference is an unused column on EligibilityCheck (all null).
ALTER TABLE "EligibilityCheck" DROP CONSTRAINT "EligibilityCheck_outboxEvent_fkey";
DROP INDEX IF EXISTS "EligibilityCheck_outboxEvent_idx";
ALTER TABLE "EligibilityCheck" DROP COLUMN "outboxEvent";
DROP TABLE "OutboxEvent";
