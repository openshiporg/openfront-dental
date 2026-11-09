-- CreateTable
CREATE TABLE "DepositBatch" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "location" TEXT,
    "businessDate" DATE,
    "dayClose" TEXT,
    "totalMinor" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositLine" (
    "id" TEXT NOT NULL,
    "batch" TEXT,
    "payment" TEXT,
    "tender" TEXT NOT NULL DEFAULT '',
    "amountMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipAgreement" (
    "id" TEXT NOT NULL,
    "membership" TEXT,
    "termsHash" TEXT NOT NULL DEFAULT '',
    "priceSnapshotMinor" BIGINT NOT NULL,
    "disclosures" JSONB DEFAULT '{}',
    "affirmativeConsentHash" TEXT NOT NULL DEFAULT '',
    "signerName" TEXT NOT NULL DEFAULT '',
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipLedgerEntry" (
    "id" TEXT NOT NULL,
    "membership" TEXT,
    "kind" TEXT NOT NULL,
    "codeFamily" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER,
    "chartEntry" TEXT,
    "ledgerEntry" TEXT,
    "at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "ageBand" TEXT NOT NULL,
    "priceMinor" BIGINT NOT NULL,
    "interval" TEXT NOT NULL,
    "includedBenefits" JSONB DEFAULT '[]',
    "discountPct" DECIMAL(9,4) NOT NULL,
    "termsText" TEXT NOT NULL DEFAULT '',
    "termsHash" TEXT NOT NULL DEFAULT '',
    "renewalNoticeDays" INTEGER DEFAULT 30,
    "cancellationPolicy" JSONB DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientMembership" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "patient" TEXT,
    "plan" TEXT,
    "location" TEXT,
    "payer" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_agreement',
    "currentPeriodStart" DATE,
    "currentPeriodEnd" DATE,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "agreement" TEXT,
    "cancelledReason" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryLicence" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL DEFAULT '',
    "number" TEXT NOT NULL DEFAULT '',
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "evidence" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulatoryLicence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_MembershipPlan_locations" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MembershipPlan_locations_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepositBatch_ref_key" ON "DepositBatch"("ref");

-- CreateIndex
CREATE INDEX "DepositBatch_location_idx" ON "DepositBatch"("location");

-- CreateIndex
CREATE INDEX "DepositBatch_dayClose_idx" ON "DepositBatch"("dayClose");

-- CreateIndex
CREATE INDEX "DepositLine_batch_idx" ON "DepositLine"("batch");

-- CreateIndex
CREATE INDEX "DepositLine_payment_idx" ON "DepositLine"("payment");

-- CreateIndex
CREATE INDEX "MembershipAgreement_membership_idx" ON "MembershipAgreement"("membership");

-- CreateIndex
CREATE INDEX "MembershipLedgerEntry_membership_idx" ON "MembershipLedgerEntry"("membership");

-- CreateIndex
CREATE INDEX "MembershipLedgerEntry_chartEntry_idx" ON "MembershipLedgerEntry"("chartEntry");

-- CreateIndex
CREATE INDEX "MembershipLedgerEntry_ledgerEntry_idx" ON "MembershipLedgerEntry"("ledgerEntry");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPlan_name_key" ON "MembershipPlan"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PatientMembership_ref_key" ON "PatientMembership"("ref");

-- CreateIndex
CREATE INDEX "PatientMembership_patient_idx" ON "PatientMembership"("patient");

-- CreateIndex
CREATE INDEX "PatientMembership_plan_idx" ON "PatientMembership"("plan");

-- CreateIndex
CREATE INDEX "PatientMembership_location_idx" ON "PatientMembership"("location");

-- CreateIndex
CREATE INDEX "PatientMembership_payer_idx" ON "PatientMembership"("payer");

-- CreateIndex
CREATE INDEX "PatientMembership_agreement_idx" ON "PatientMembership"("agreement");

-- CreateIndex

-- CreateIndex
CREATE INDEX "_MembershipPlan_locations_B_index" ON "_MembershipPlan_locations"("B");

-- AddForeignKey
ALTER TABLE "DepositBatch" ADD CONSTRAINT "DepositBatch_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositBatch" ADD CONSTRAINT "DepositBatch_dayClose_fkey" FOREIGN KEY ("dayClose") REFERENCES "DayClose"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositLine" ADD CONSTRAINT "DepositLine_batch_fkey" FOREIGN KEY ("batch") REFERENCES "DepositBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositLine" ADD CONSTRAINT "DepositLine_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipAgreement" ADD CONSTRAINT "MembershipAgreement_membership_fkey" FOREIGN KEY ("membership") REFERENCES "PatientMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipLedgerEntry" ADD CONSTRAINT "MembershipLedgerEntry_membership_fkey" FOREIGN KEY ("membership") REFERENCES "PatientMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipLedgerEntry" ADD CONSTRAINT "MembershipLedgerEntry_chartEntry_fkey" FOREIGN KEY ("chartEntry") REFERENCES "ChartEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipLedgerEntry" ADD CONSTRAINT "MembershipLedgerEntry_ledgerEntry_fkey" FOREIGN KEY ("ledgerEntry") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMembership" ADD CONSTRAINT "PatientMembership_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMembership" ADD CONSTRAINT "PatientMembership_plan_fkey" FOREIGN KEY ("plan") REFERENCES "MembershipPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMembership" ADD CONSTRAINT "PatientMembership_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMembership" ADD CONSTRAINT "PatientMembership_payer_fkey" FOREIGN KEY ("payer") REFERENCES "GuarantorAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMembership" ADD CONSTRAINT "PatientMembership_agreement_fkey" FOREIGN KEY ("agreement") REFERENCES "MembershipAgreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

-- AddForeignKey
ALTER TABLE "_MembershipPlan_locations" ADD CONSTRAINT "_MembershipPlan_locations_A_fkey" FOREIGN KEY ("A") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MembershipPlan_locations" ADD CONSTRAINT "_MembershipPlan_locations_B_fkey" FOREIGN KEY ("B") REFERENCES "MembershipPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══ Membership, deposit and close invariants (SCHEMA §10.11, §11; STATE-MACHINES §6.8, §8; DOMAIN I-L2, I-M1, I-M2) ═══
ALTER TABLE "MembershipPlan" ADD CONSTRAINT "MembershipPlan_priceMinor_bound" CHECK (abs("priceMinor") <= 1000000000);
ALTER TABLE "MembershipAgreement" ADD CONSTRAINT "MembershipAgreement_priceSnapshotMinor_bound" CHECK (abs("priceSnapshotMinor") <= 1000000000);
ALTER TABLE "DepositBatch" ADD CONSTRAINT "DepositBatch_totalMinor_bound" CHECK (abs("totalMinor") <= 1000000000);
ALTER TABLE "DepositLine" ADD CONSTRAINT "DepositLine_amountMinor_bound" CHECK (abs("amountMinor") <= 1000000000);
ALTER TABLE "MembershipPlan" ADD CONSTRAINT "MembershipPlan_price_and_discount" CHECK ("priceMinor" > 0 AND "discountPct" >= 0 AND "discountPct" <= 100 AND "renewalNoticeDays" >= 0);
ALTER TABLE "MembershipAgreement" ADD CONSTRAINT "MembershipAgreement_signed" CHECK ("priceSnapshotMinor" > 0 AND "termsHash" <> '' AND "affirmativeConsentHash" <> '' AND "signerName" <> '' AND "signedAt" IS NOT NULL);
ALTER TABLE "DepositBatch" ADD CONSTRAINT "DepositBatch_total_positive" CHECK ("totalMinor" > 0);
ALTER TABLE "DepositLine" ADD CONSTRAINT "DepositLine_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "RegulatoryLicence" ADD CONSTRAINT "RegulatoryLicence_dates" CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" >= "effectiveFrom");
-- A membership past the agreement step has a signed agreement and a period; a period ends after it starts.
ALTER TABLE "PatientMembership" ADD CONSTRAINT "PatientMembership_active_has_agreement" CHECK ("status" IN ('pending_agreement','cancelled') OR ("agreement" IS NOT NULL AND "currentPeriodStart" IS NOT NULL AND "currentPeriodEnd" IS NOT NULL AND "currentPeriodEnd" > "currentPeriodStart"));
-- One live membership per patient and plan; one membership per first payment; one banking per payment; one deposit per office and day.
CREATE UNIQUE INDEX "PatientMembership_one_live" ON "PatientMembership"("patient", "plan") WHERE "status" IN ('pending_agreement','active','past_due','frozen');
CREATE UNIQUE INDEX "DepositLine_payment_once" ON "DepositLine"("payment") WHERE "payment" IS NOT NULL;
CREATE UNIQUE INDEX "DepositBatch_location_businessDate_key" ON "DepositBatch"("location", "businessDate");
CREATE UNIQUE INDEX "RegulatoryLicence_number_key" ON "RegulatoryLicence"("jurisdiction", "number");
-- Agreements and the membership ledger only grow.
CREATE TRIGGER "MembershipAgreement_append_only" BEFORE UPDATE OR DELETE ON "MembershipAgreement" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "MembershipLedgerEntry_append_only" BEFORE UPDATE OR DELETE ON "MembershipLedgerEntry" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "DepositLine_append_only" BEFORE UPDATE OR DELETE ON "DepositLine" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
-- A banked deposit is frozen.
CREATE OR REPLACE FUNCTION dental_deposit_freeze() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A deposit cannot be deleted.' USING ERRCODE = 'check_violation'; END IF;
  IF OLD."status" = 'banked' AND (NEW."status" <> 'banked' OR NEW."totalMinor" <> OLD."totalMinor" OR NEW."businessDate" IS DISTINCT FROM OLD."businessDate" OR NEW."location" IS DISTINCT FROM OLD."location") THEN
    RAISE EXCEPTION 'A banked deposit cannot be changed.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "DepositBatch_freeze" BEFORE UPDATE OR DELETE ON "DepositBatch" FOR EACH ROW EXECUTE FUNCTION dental_deposit_freeze();
-- I-L2: a closed day takes no new entries; late entries are dated the next open day and keep originalBusinessDate.
CREATE OR REPLACE FUNCTION dental_ledger_day_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW."businessDate" IS NOT NULL AND NEW."restatement" IS NULL AND EXISTS (SELECT 1 FROM "DayClose" WHERE "location" IS NOT DISTINCT FROM NEW."location" AND "businessDate" = NEW."businessDate" AND "status" = 'closed') THEN
    RAISE EXCEPTION 'That day is closed. Late entries are dated on the next open day.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "LedgerEntry_day_guard" BEFORE INSERT ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION dental_ledger_day_guard();
-- Period status moves only along the plan: closing -> closed -> reopen_requested -> (reopened | closed) -> closed.
CREATE OR REPLACE FUNCTION dental_period_close_path() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
       (OLD."status" = 'open' AND NEW."status" IN ('closing','closed'))
    OR (OLD."status" = 'closing' AND NEW."status" = 'closed')
    OR (OLD."status" = 'closed' AND NEW."status" = 'reopen_requested')
    OR (OLD."status" = 'reopen_requested' AND NEW."status" IN ('reopened','closed'))
    OR (OLD."status" = 'reopened' AND NEW."status" = 'closed')) THEN
    RAISE EXCEPTION 'A month cannot move from % to % that way.', OLD."status", NEW."status" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "PeriodClose_path" BEFORE UPDATE ON "PeriodClose" FOR EACH ROW EXECUTE FUNCTION dental_period_close_path();
