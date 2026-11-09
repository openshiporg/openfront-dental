-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "adjustment" TEXT,
ADD COLUMN     "dayClose" TEXT,
ADD COLUMN     "restatement" TEXT;
-- CreateTable
CREATE TABLE "AdjustmentRequest" (
    "id" TEXT NOT NULL,
    "account" TEXT,
    "patient" TEXT,
    "location" TEXT,
    "type" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "relatedEntry" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "approval" TEXT,
    "postedEntry" TEXT,
    "requestedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdjustmentRequest_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AdjustmentType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "direction" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "approvalThresholdMinor" BIGINT NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdjustmentType_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "DayClose" (
    "id" TEXT NOT NULL,
    "location" TEXT,
    "businessDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'open',
    "daySheet" JSONB DEFAULT '{}',
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DayClose_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "PeriodClose" (
    "id" TEXT NOT NULL,
    "location" TEXT,
    "period" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "approval" TEXT,
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PeriodClose_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Restatement" (
    "id" TEXT NOT NULL,
    "periodClose" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Restatement_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "AdjustmentRequest_account_idx" ON "AdjustmentRequest"("account");
-- CreateIndex
CREATE INDEX "AdjustmentRequest_patient_idx" ON "AdjustmentRequest"("patient");
-- CreateIndex
CREATE INDEX "AdjustmentRequest_location_idx" ON "AdjustmentRequest"("location");
-- CreateIndex
CREATE INDEX "AdjustmentRequest_type_idx" ON "AdjustmentRequest"("type");
-- CreateIndex
CREATE INDEX "AdjustmentRequest_relatedEntry_idx" ON "AdjustmentRequest"("relatedEntry");
-- CreateIndex
CREATE INDEX "AdjustmentRequest_approval_idx" ON "AdjustmentRequest"("approval");
-- CreateIndex
CREATE INDEX "AdjustmentRequest_postedEntry_idx" ON "AdjustmentRequest"("postedEntry");
-- CreateIndex
CREATE INDEX "AdjustmentRequest_requestedBy_idx" ON "AdjustmentRequest"("requestedBy");
-- CreateIndex
CREATE UNIQUE INDEX "AdjustmentType_code_key" ON "AdjustmentType"("code");
-- CreateIndex
CREATE INDEX "DayClose_location_idx" ON "DayClose"("location");
-- CreateIndex
CREATE INDEX "DayClose_closedBy_idx" ON "DayClose"("closedBy");
-- CreateIndex
CREATE INDEX "PeriodClose_location_idx" ON "PeriodClose"("location");
-- CreateIndex
CREATE INDEX "PeriodClose_approval_idx" ON "PeriodClose"("approval");
-- CreateIndex
CREATE INDEX "PeriodClose_closedBy_idx" ON "PeriodClose"("closedBy");
-- CreateIndex
CREATE INDEX "Restatement_periodClose_idx" ON "Restatement"("periodClose");
-- CreateIndex
CREATE INDEX "Restatement_approvedBy_idx" ON "Restatement"("approvedBy");
-- CreateIndex
CREATE INDEX "LedgerEntry_adjustment_idx" ON "LedgerEntry"("adjustment");
-- CreateIndex
CREATE INDEX "LedgerEntry_dayClose_idx" ON "LedgerEntry"("dayClose");
-- CreateIndex
CREATE INDEX "LedgerEntry_restatement_idx" ON "LedgerEntry"("restatement");
-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_adjustment_fkey" FOREIGN KEY ("adjustment") REFERENCES "AdjustmentRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_dayClose_fkey" FOREIGN KEY ("dayClose") REFERENCES "DayClose"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_restatement_fkey" FOREIGN KEY ("restatement") REFERENCES "Restatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AdjustmentRequest" ADD CONSTRAINT "AdjustmentRequest_account_fkey" FOREIGN KEY ("account") REFERENCES "GuarantorAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AdjustmentRequest" ADD CONSTRAINT "AdjustmentRequest_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AdjustmentRequest" ADD CONSTRAINT "AdjustmentRequest_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AdjustmentRequest" ADD CONSTRAINT "AdjustmentRequest_type_fkey" FOREIGN KEY ("type") REFERENCES "AdjustmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AdjustmentRequest" ADD CONSTRAINT "AdjustmentRequest_relatedEntry_fkey" FOREIGN KEY ("relatedEntry") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AdjustmentRequest" ADD CONSTRAINT "AdjustmentRequest_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AdjustmentRequest" ADD CONSTRAINT "AdjustmentRequest_postedEntry_fkey" FOREIGN KEY ("postedEntry") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AdjustmentRequest" ADD CONSTRAINT "AdjustmentRequest_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "DayClose" ADD CONSTRAINT "DayClose_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "DayClose" ADD CONSTRAINT "DayClose_closedBy_fkey" FOREIGN KEY ("closedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "PeriodClose" ADD CONSTRAINT "PeriodClose_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "PeriodClose" ADD CONSTRAINT "PeriodClose_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "PeriodClose" ADD CONSTRAINT "PeriodClose_closedBy_fkey" FOREIGN KEY ("closedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Restatement" ADD CONSTRAINT "Restatement_periodClose_fkey" FOREIGN KEY ("periodClose") REFERENCES "PeriodClose"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Restatement" ADD CONSTRAINT "Restatement_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══ Ledger invariants (SCHEMA §10.2, §10.6, §10.11; DOMAIN I-L1, I-L2) ═══
-- Bounds on the new money columns, like every other *Minor column.
ALTER TABLE "AdjustmentRequest" ADD CONSTRAINT "AdjustmentRequest_amountMinor_bound" CHECK (abs("amountMinor") <= 1000000000);
ALTER TABLE "AdjustmentType" ADD CONSTRAINT "AdjustmentType_approvalThresholdMinor_bound" CHECK (abs("approvalThresholdMinor") <= 1000000000);
-- A ledger row is never zero, always has an account, a business date, a location and a currency. NOT VALID: rows posted before this migration are not re-checked.
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_complete" CHECK ("amountMinor" <> 0 AND "account" IS NOT NULL AND "businessDate" IS NOT NULL AND "originalBusinessDate" IS NOT NULL AND "location" IS NOT NULL AND "currencyCode" ~ '^[A-Z]{3}$') NOT VALID;
ALTER TABLE "AdjustmentType" ADD CONSTRAINT "AdjustmentType_threshold_nonnegative" CHECK ("approvalThresholdMinor" >= 0 AND "direction" IN ('credit','debit'));
ALTER TABLE "AdjustmentRequest" ADD CONSTRAINT "AdjustmentRequest_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "AdjustmentRequest" ADD CONSTRAINT "AdjustmentRequest_posted_has_entry" CHECK (("status" = 'posted') = ("postedEntry" IS NOT NULL));
CREATE UNIQUE INDEX "DayClose_location_businessDate_key" ON "DayClose"("location", "businessDate");
CREATE UNIQUE INDEX "PeriodClose_location_period_key" ON "PeriodClose"("location", "period");
ALTER TABLE "PeriodClose" ADD CONSTRAINT "PeriodClose_period_format" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "DayClose" ADD CONSTRAINT "DayClose_closed_has_closer" CHECK ("status" <> 'closed' OR ("closedAt" IS NOT NULL AND "closedBy" IS NOT NULL));
ALTER TABLE "PeriodClose" ADD CONSTRAINT "PeriodClose_closed_has_closer" CHECK ("status" NOT IN ('closed','reopen_requested') OR ("closedAt" IS NOT NULL AND "closedBy" IS NOT NULL));
CREATE OR REPLACE FUNCTION dental_ledger_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE orig RECORD; blocked RECORD;
BEGIN
  IF NEW."kind" = 'reversal' THEN
    SELECT * INTO orig FROM "LedgerEntry" WHERE "id" = NEW."reverses";
    IF NOT FOUND THEN RAISE EXCEPTION 'A reversal must point at the entry it reverses.' USING ERRCODE = 'check_violation'; END IF;
    IF orig."kind" = 'reversal' THEN RAISE EXCEPTION 'A reversal cannot itself be reversed; post a new entry.' USING ERRCODE = 'check_violation'; END IF;
    IF NEW."amountMinor" <> -orig."amountMinor" THEN RAISE EXCEPTION 'A reversal must be exactly the opposite amount of the entry it reverses.' USING ERRCODE = 'check_violation'; END IF;
    IF NEW."account" IS DISTINCT FROM orig."account" OR NEW."patient" IS DISTINCT FROM orig."patient" OR NEW."location" IS DISTINCT FROM orig."location"
       OR NEW."provider" IS DISTINCT FROM orig."provider" OR NEW."chartEntry" IS DISTINCT FROM orig."chartEntry" OR NEW."adjustment" IS DISTINCT FROM orig."adjustment" THEN
      RAISE EXCEPTION 'A reversal must carry the same account, patient, location, provider and source as the entry it reverses.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  -- I-L2: nothing posts into a closed period. A reopened period accepts only restatement entries.
  IF NEW."businessDate" IS NOT NULL THEN
    SELECT "status" INTO blocked FROM "PeriodClose" WHERE "location" IS NOT DISTINCT FROM NEW."location" AND "period" = to_char(NEW."businessDate", 'YYYY-MM') AND "status" IN ('closing','closed','reopen_requested','reopened') LIMIT 1;
    IF FOUND AND NOT (blocked."status" = 'reopened' AND NEW."restatement" IS NOT NULL) THEN
      RAISE EXCEPTION 'That month is closed. Post the correction dated in an open month, or ask for the month to be reopened.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "LedgerEntry_guard" BEFORE INSERT ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION dental_ledger_guard();
-- A closed day sheet is frozen.
CREATE OR REPLACE FUNCTION dental_day_close_freeze() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF OLD."status" = 'closed' AND (NEW."status" <> 'closed' OR NEW."daySheet" IS DISTINCT FROM OLD."daySheet" OR NEW."businessDate" IS DISTINCT FROM OLD."businessDate" OR NEW."location" IS DISTINCT FROM OLD."location") THEN
    RAISE EXCEPTION 'A closed day cannot be changed.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "DayClose_freeze" BEFORE UPDATE ON "DayClose" FOR EACH ROW EXECUTE FUNCTION dental_day_close_freeze();
CREATE TRIGGER "DayClose_no_delete" BEFORE DELETE ON "DayClose" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "PeriodClose_no_delete" BEFORE DELETE ON "PeriodClose" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "Restatement_append_only" BEFORE UPDATE OR DELETE ON "Restatement" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
