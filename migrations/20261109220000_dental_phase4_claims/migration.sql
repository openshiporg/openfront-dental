-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "claim" TEXT,
ADD COLUMN     "paymentPosting" TEXT;

-- CreateTable
CREATE TABLE "Appeal" (
    "id" TEXT NOT NULL,
    "denial" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "letter" TEXT NOT NULL DEFAULT '',
    "submittedVia" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "outcome" TEXT NOT NULL DEFAULT 'pending',
    "decidedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "patient" TEXT,
    "coverage" TEXT,
    "location" TEXT,
    "billingEntity" TEXT,
    "renderingProvider" TEXT,
    "placeOfServiceCode" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "adjudicationOutcome" TEXT NOT NULL DEFAULT '',
    "currentVersion" TEXT,
    "payerClaimControlNumber" TEXT NOT NULL DEFAULT '',
    "patientControlNumber" TEXT NOT NULL DEFAULT '',
    "clearinghouseRefs" JSONB DEFAULT '{}',
    "totalChargeMinor" BIGINT NOT NULL DEFAULT 0,
    "timelyFilingDeadline" DATE,
    "submittedAt" TIMESTAMP(3),
    "adjudicatedAt" TIMESTAMP(3),
    "recouped" BOOLEAN NOT NULL DEFAULT false,
    "primaryClaim" TEXT,
    "primaryAdjudicationSnapshot" JSONB DEFAULT '{}',
    "narrative" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimAcknowledgement" (
    "id" TEXT NOT NULL,
    "claim" TEXT,
    "versionNumber" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,
    "senderName" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT NOT NULL,
    "statusCodes" JSONB DEFAULT '[]',
    "errors" JSONB DEFAULT '[]',
    "observation" TEXT,
    "at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimAttachment" (
    "id" TEXT NOT NULL,
    "claim" TEXT,
    "kind" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "externalAttachmentId" TEXT NOT NULL DEFAULT '',
    "trackingNumber" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimLine" (
    "id" TEXT NOT NULL,
    "claim" TEXT,
    "chartEntry" TEXT,
    "code" TEXT,
    "localCode" TEXT,
    "tooth" TEXT NOT NULL DEFAULT '',
    "surfaces" TEXT NOT NULL DEFAULT '',
    "dateOfService" DATE,
    "units" INTEGER NOT NULL DEFAULT 1,
    "feeMinor" BIGINT NOT NULL DEFAULT 0,
    "allowedMinor" BIGINT NOT NULL DEFAULT 0,
    "paidMinor" BIGINT NOT NULL DEFAULT 0,
    "patientRespMinor" BIGINT NOT NULL DEFAULT 0,
    "lineControlNumber" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimScrubResult" (
    "id" TEXT NOT NULL,
    "claim" TEXT,
    "versionNumber" INTEGER NOT NULL DEFAULT 0,
    "rulesetVersion" TEXT NOT NULL DEFAULT '',
    "ranAt" TIMESTAMP(3),
    "findings" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimScrubResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimStatusInquiry" (
    "id" TEXT NOT NULL,
    "claim" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "responseSummary" JSONB DEFAULT '{}',
    "observation" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimStatusInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimVersion" (
    "id" TEXT NOT NULL,
    "claim" TEXT,
    "number" INTEGER NOT NULL,
    "frequency" TEXT NOT NULL,
    "payload" JSONB DEFAULT '{}',
    "payloadHash" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "releasedBy" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Denial" (
    "id" TEXT NOT NULL,
    "claim" TEXT,
    "claimLine" TEXT,
    "remittanceLine" TEXT,
    "carc" TEXT NOT NULL DEFAULT '',
    "rarc" JSONB DEFAULT '[]',
    "preventableClass" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "assignedTo" TEXT,
    "amountMinor" BIGINT NOT NULL DEFAULT 0,
    "resolutionNote" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Denial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DenialReasonMap" (
    "id" TEXT NOT NULL,
    "carc" TEXT NOT NULL DEFAULT '',
    "rarc" TEXT NOT NULL DEFAULT '',
    "preventableClass" TEXT NOT NULL,
    "suggestedAction" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DenialReasonMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayerEnrollment" (
    "id" TEXT NOT NULL,
    "billingEntity" TEXT,
    "provider" TEXT,
    "payer" TEXT,
    "adapterKey" TEXT NOT NULL DEFAULT '',
    "transaction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "externalId" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayerEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentPosting" (
    "id" TEXT NOT NULL,
    "remittance" TEXT,
    "remittanceClaim" TEXT,
    "postedBy" TEXT,
    "at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'posted',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Remittance" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "payer" TEXT,
    "source" TEXT NOT NULL,
    "adapterKey" TEXT NOT NULL DEFAULT '',
    "traceNumber" TEXT NOT NULL DEFAULT '',
    "paymentMethod" TEXT NOT NULL,
    "paymentDate" DATE,
    "totalPaidMinor" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'received',
    "postedCompleteness" TEXT NOT NULL DEFAULT '',
    "exceptionNote" TEXT NOT NULL DEFAULT '',
    "duplicateOf" TEXT,
    "observation" TEXT,
    "providerAdjustments" JSONB DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Remittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemittanceClaim" (
    "id" TEXT NOT NULL,
    "remittance" TEXT,
    "claim" TEXT,
    "patientControlNumber" TEXT NOT NULL DEFAULT '',
    "payerClaimControlNumber" TEXT NOT NULL DEFAULT '',
    "claimStatusCode" TEXT NOT NULL DEFAULT '',
    "chargeMinor" BIGINT NOT NULL DEFAULT 0,
    "paidMinor" BIGINT NOT NULL DEFAULT 0,
    "patientRespMinor" BIGINT NOT NULL DEFAULT 0,
    "crossoverCarrier" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemittanceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemittanceLine" (
    "id" TEXT NOT NULL,
    "remittanceClaim" TEXT,
    "claimLine" TEXT,
    "code" TEXT NOT NULL DEFAULT '',
    "tooth" TEXT NOT NULL DEFAULT '',
    "dateOfService" DATE,
    "lineControlNumber" TEXT NOT NULL DEFAULT '',
    "chargeMinor" BIGINT NOT NULL DEFAULT 0,
    "allowedMinor" BIGINT NOT NULL DEFAULT 0,
    "paidMinor" BIGINT NOT NULL DEFAULT 0,
    "adjustmentsTotalMinor" BIGINT NOT NULL DEFAULT 0,
    "adjustments" JSONB DEFAULT '[]',
    "rarc" JSONB DEFAULT '[]',
    "conservationOk" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemittanceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrubRule" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "appliesTo" JSONB DEFAULT '{}',
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rulesetVersion" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrubRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Appeal_denial_idx" ON "Appeal"("denial");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_ref_key" ON "Claim"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_patientControlNumber_key" ON "Claim"("patientControlNumber");

-- CreateIndex
CREATE INDEX "Claim_patient_idx" ON "Claim"("patient");

-- CreateIndex
CREATE INDEX "Claim_coverage_idx" ON "Claim"("coverage");

-- CreateIndex
CREATE INDEX "Claim_location_idx" ON "Claim"("location");

-- CreateIndex
CREATE INDEX "Claim_billingEntity_idx" ON "Claim"("billingEntity");

-- CreateIndex
CREATE INDEX "Claim_renderingProvider_idx" ON "Claim"("renderingProvider");

-- CreateIndex
CREATE INDEX "Claim_currentVersion_idx" ON "Claim"("currentVersion");

-- CreateIndex
CREATE INDEX "Claim_primaryClaim_idx" ON "Claim"("primaryClaim");

-- CreateIndex
CREATE INDEX "ClaimAcknowledgement_claim_idx" ON "ClaimAcknowledgement"("claim");

-- CreateIndex
CREATE INDEX "ClaimAcknowledgement_observation_idx" ON "ClaimAcknowledgement"("observation");

-- CreateIndex
CREATE INDEX "ClaimAttachment_claim_idx" ON "ClaimAttachment"("claim");

-- CreateIndex
CREATE INDEX "ClaimLine_claim_idx" ON "ClaimLine"("claim");

-- CreateIndex
CREATE INDEX "ClaimLine_chartEntry_idx" ON "ClaimLine"("chartEntry");

-- CreateIndex
CREATE INDEX "ClaimLine_code_idx" ON "ClaimLine"("code");

-- CreateIndex
CREATE INDEX "ClaimLine_localCode_idx" ON "ClaimLine"("localCode");

-- CreateIndex
CREATE INDEX "ClaimScrubResult_claim_idx" ON "ClaimScrubResult"("claim");

-- CreateIndex
CREATE INDEX "ClaimStatusInquiry_claim_idx" ON "ClaimStatusInquiry"("claim");

-- CreateIndex
CREATE INDEX "ClaimStatusInquiry_observation_idx" ON "ClaimStatusInquiry"("observation");

-- CreateIndex
CREATE INDEX "ClaimVersion_claim_idx" ON "ClaimVersion"("claim");

-- CreateIndex
CREATE INDEX "ClaimVersion_releasedBy_idx" ON "ClaimVersion"("releasedBy");

-- CreateIndex
CREATE INDEX "Denial_claim_idx" ON "Denial"("claim");

-- CreateIndex
CREATE INDEX "Denial_claimLine_idx" ON "Denial"("claimLine");

-- CreateIndex
CREATE INDEX "Denial_remittanceLine_idx" ON "Denial"("remittanceLine");

-- CreateIndex
CREATE INDEX "Denial_assignedTo_idx" ON "Denial"("assignedTo");

-- CreateIndex
CREATE INDEX "PayerEnrollment_billingEntity_idx" ON "PayerEnrollment"("billingEntity");

-- CreateIndex
CREATE INDEX "PayerEnrollment_provider_idx" ON "PayerEnrollment"("provider");

-- CreateIndex
CREATE INDEX "PayerEnrollment_payer_idx" ON "PayerEnrollment"("payer");

-- CreateIndex
CREATE INDEX "PaymentPosting_remittance_idx" ON "PaymentPosting"("remittance");

-- CreateIndex
CREATE INDEX "PaymentPosting_remittanceClaim_idx" ON "PaymentPosting"("remittanceClaim");

-- CreateIndex
CREATE INDEX "PaymentPosting_postedBy_idx" ON "PaymentPosting"("postedBy");

-- CreateIndex
CREATE UNIQUE INDEX "Remittance_ref_key" ON "Remittance"("ref");

-- CreateIndex
CREATE INDEX "Remittance_payer_idx" ON "Remittance"("payer");

-- CreateIndex
CREATE INDEX "Remittance_duplicateOf_idx" ON "Remittance"("duplicateOf");

-- CreateIndex
CREATE INDEX "Remittance_observation_idx" ON "Remittance"("observation");

-- CreateIndex
CREATE INDEX "RemittanceClaim_remittance_idx" ON "RemittanceClaim"("remittance");

-- CreateIndex
CREATE INDEX "RemittanceClaim_claim_idx" ON "RemittanceClaim"("claim");

-- CreateIndex
CREATE INDEX "RemittanceLine_remittanceClaim_idx" ON "RemittanceLine"("remittanceClaim");

-- CreateIndex
CREATE INDEX "RemittanceLine_claimLine_idx" ON "RemittanceLine"("claimLine");

-- CreateIndex
CREATE UNIQUE INDEX "ScrubRule_key_key" ON "ScrubRule"("key");

-- CreateIndex
CREATE INDEX "LedgerEntry_paymentPosting_idx" ON "LedgerEntry"("paymentPosting");

-- CreateIndex
CREATE INDEX "LedgerEntry_claim_idx" ON "LedgerEntry"("claim");

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_paymentPosting_fkey" FOREIGN KEY ("paymentPosting") REFERENCES "PaymentPosting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_claim_fkey" FOREIGN KEY ("claim") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_denial_fkey" FOREIGN KEY ("denial") REFERENCES "Denial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_coverage_fkey" FOREIGN KEY ("coverage") REFERENCES "Coverage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_billingEntity_fkey" FOREIGN KEY ("billingEntity") REFERENCES "BillingEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_renderingProvider_fkey" FOREIGN KEY ("renderingProvider") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_currentVersion_fkey" FOREIGN KEY ("currentVersion") REFERENCES "ClaimVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_primaryClaim_fkey" FOREIGN KEY ("primaryClaim") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimAcknowledgement" ADD CONSTRAINT "ClaimAcknowledgement_claim_fkey" FOREIGN KEY ("claim") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimAcknowledgement" ADD CONSTRAINT "ClaimAcknowledgement_observation_fkey" FOREIGN KEY ("observation") REFERENCES "InboundObservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimAttachment" ADD CONSTRAINT "ClaimAttachment_claim_fkey" FOREIGN KEY ("claim") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimLine" ADD CONSTRAINT "ClaimLine_claim_fkey" FOREIGN KEY ("claim") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimLine" ADD CONSTRAINT "ClaimLine_chartEntry_fkey" FOREIGN KEY ("chartEntry") REFERENCES "ChartEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimLine" ADD CONSTRAINT "ClaimLine_code_fkey" FOREIGN KEY ("code") REFERENCES "ProcedureCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimLine" ADD CONSTRAINT "ClaimLine_localCode_fkey" FOREIGN KEY ("localCode") REFERENCES "ProcedureCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimScrubResult" ADD CONSTRAINT "ClaimScrubResult_claim_fkey" FOREIGN KEY ("claim") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimStatusInquiry" ADD CONSTRAINT "ClaimStatusInquiry_claim_fkey" FOREIGN KEY ("claim") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimStatusInquiry" ADD CONSTRAINT "ClaimStatusInquiry_observation_fkey" FOREIGN KEY ("observation") REFERENCES "InboundObservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimVersion" ADD CONSTRAINT "ClaimVersion_claim_fkey" FOREIGN KEY ("claim") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimVersion" ADD CONSTRAINT "ClaimVersion_releasedBy_fkey" FOREIGN KEY ("releasedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Denial" ADD CONSTRAINT "Denial_claim_fkey" FOREIGN KEY ("claim") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Denial" ADD CONSTRAINT "Denial_claimLine_fkey" FOREIGN KEY ("claimLine") REFERENCES "ClaimLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Denial" ADD CONSTRAINT "Denial_remittanceLine_fkey" FOREIGN KEY ("remittanceLine") REFERENCES "RemittanceLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Denial" ADD CONSTRAINT "Denial_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayerEnrollment" ADD CONSTRAINT "PayerEnrollment_billingEntity_fkey" FOREIGN KEY ("billingEntity") REFERENCES "BillingEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayerEnrollment" ADD CONSTRAINT "PayerEnrollment_provider_fkey" FOREIGN KEY ("provider") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayerEnrollment" ADD CONSTRAINT "PayerEnrollment_payer_fkey" FOREIGN KEY ("payer") REFERENCES "Payer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPosting" ADD CONSTRAINT "PaymentPosting_remittance_fkey" FOREIGN KEY ("remittance") REFERENCES "Remittance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPosting" ADD CONSTRAINT "PaymentPosting_remittanceClaim_fkey" FOREIGN KEY ("remittanceClaim") REFERENCES "RemittanceClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPosting" ADD CONSTRAINT "PaymentPosting_postedBy_fkey" FOREIGN KEY ("postedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_payer_fkey" FOREIGN KEY ("payer") REFERENCES "Payer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_duplicateOf_fkey" FOREIGN KEY ("duplicateOf") REFERENCES "Remittance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_observation_fkey" FOREIGN KEY ("observation") REFERENCES "InboundObservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittanceClaim" ADD CONSTRAINT "RemittanceClaim_remittance_fkey" FOREIGN KEY ("remittance") REFERENCES "Remittance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittanceClaim" ADD CONSTRAINT "RemittanceClaim_claim_fkey" FOREIGN KEY ("claim") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittanceLine" ADD CONSTRAINT "RemittanceLine_remittanceClaim_fkey" FOREIGN KEY ("remittanceClaim") REFERENCES "RemittanceClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittanceLine" ADD CONSTRAINT "RemittanceLine_claimLine_fkey" FOREIGN KEY ("claimLine") REFERENCES "ClaimLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Phase 4 slice 2 invariants (SCHEMA §9). Money is bounded, conservation is arithmetic, evidence is append-only.
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_totalChargeMinor_bound" CHECK (abs("totalChargeMinor") <= 1000000000);
ALTER TABLE "ClaimLine" ADD CONSTRAINT "ClaimLine_feeMinor_bound" CHECK (abs("feeMinor") <= 1000000000);
ALTER TABLE "ClaimLine" ADD CONSTRAINT "ClaimLine_allowedMinor_bound" CHECK (abs("allowedMinor") <= 1000000000);
ALTER TABLE "ClaimLine" ADD CONSTRAINT "ClaimLine_paidMinor_bound" CHECK (abs("paidMinor") <= 1000000000);
ALTER TABLE "ClaimLine" ADD CONSTRAINT "ClaimLine_patientRespMinor_bound" CHECK (abs("patientRespMinor") <= 1000000000);
ALTER TABLE "Denial" ADD CONSTRAINT "Denial_amountMinor_bound" CHECK (abs("amountMinor") <= 1000000000);
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_totalPaidMinor_bound" CHECK (abs("totalPaidMinor") <= 1000000000);
ALTER TABLE "RemittanceClaim" ADD CONSTRAINT "RemittanceClaim_chargeMinor_bound" CHECK (abs("chargeMinor") <= 1000000000);
ALTER TABLE "RemittanceClaim" ADD CONSTRAINT "RemittanceClaim_paidMinor_bound" CHECK (abs("paidMinor") <= 1000000000);
ALTER TABLE "RemittanceClaim" ADD CONSTRAINT "RemittanceClaim_patientRespMinor_bound" CHECK (abs("patientRespMinor") <= 1000000000);
ALTER TABLE "RemittanceLine" ADD CONSTRAINT "RemittanceLine_chargeMinor_bound" CHECK (abs("chargeMinor") <= 1000000000);
ALTER TABLE "RemittanceLine" ADD CONSTRAINT "RemittanceLine_allowedMinor_bound" CHECK (abs("allowedMinor") <= 1000000000);
ALTER TABLE "RemittanceLine" ADD CONSTRAINT "RemittanceLine_paidMinor_bound" CHECK (abs("paidMinor") <= 1000000000);
ALTER TABLE "RemittanceLine" ADD CONSTRAINT "RemittanceLine_adjustmentsTotalMinor_bound" CHECK (abs("adjustmentsTotalMinor") <= 1000000000);

ALTER TABLE "Claim" ADD CONSTRAINT "Claim_amounts_sane" CHECK ("totalChargeMinor" >= 0);
ALTER TABLE "ClaimLine" ADD CONSTRAINT "ClaimLine_amounts_sane" CHECK ("feeMinor" >= 0 AND "paidMinor" >= 0 AND "allowedMinor" >= 0 AND "patientRespMinor" >= 0 AND "units" >= 1);
-- A claim past the draft and scrubbed states has a frozen version to point at.
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_frozen_version" CHECK ("status" IN ('draft', 'scrubbed', 'ready', 'rejected', 'correction_required', 'voided') OR "currentVersion" IS NOT NULL);
-- The conservation flag must be true to the arithmetic: charge = paid + the signed sum of adjustments.
ALTER TABLE "RemittanceLine" ADD CONSTRAINT "RemittanceLine_conservation" CHECK ("conservationOk" = ("chargeMinor" = "paidMinor" + "adjustmentsTotalMinor"));

CREATE UNIQUE INDEX "ClaimVersion_claim_number_key" ON "ClaimVersion" ("claim", "number");
CREATE UNIQUE INDEX "ClaimLine_claim_control_key" ON "ClaimLine" ("claim", "lineControlNumber");
-- One ERA per payer trace number posts; a repeat is kept as a 'duplicate' row that never posts.
CREATE UNIQUE INDEX "Remittance_payer_trace_key" ON "Remittance" ("payer", "traceNumber") WHERE "status" <> 'duplicate';
-- A remittance claim posts once.
CREATE UNIQUE INDEX "PaymentPosting_once_key" ON "PaymentPosting" ("remittanceClaim") WHERE "status" = 'posted';
-- One open denial per line and reason.
CREATE UNIQUE INDEX "Denial_open_line_reason_key" ON "Denial" ("claimLine", "carc") WHERE "status" IN ('open', 'working', 'appealed');
CREATE UNIQUE INDEX "ClaimAcknowledgement_observation_key" ON "ClaimAcknowledgement" ("observation") WHERE "observation" IS NOT NULL;

-- Frozen and received evidence is append-only.
CREATE TRIGGER "ClaimVersion_append_only" BEFORE UPDATE OR DELETE ON "ClaimVersion" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "ClaimScrubResult_append_only" BEFORE UPDATE OR DELETE ON "ClaimScrubResult" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "ClaimAcknowledgement_append_only" BEFORE UPDATE OR DELETE ON "ClaimAcknowledgement" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
-- A received remittance line is evidence: the only change allowed is linking it, once, to the claim it belongs to.
CREATE OR REPLACE FUNCTION dental_remittance_link_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE link TEXT := TG_ARGV[0];
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation'; END IF;
  IF (to_jsonb(OLD) -> link) <> 'null'::jsonb OR (to_jsonb(NEW) - link - 'updatedAt') IS DISTINCT FROM (to_jsonb(OLD) - link - 'updatedAt') THEN
    RAISE EXCEPTION '% rows are append-only; only the first link to a claim can be set', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "RemittanceClaim_link_only" BEFORE UPDATE OR DELETE ON "RemittanceClaim" FOR EACH ROW EXECUTE FUNCTION dental_remittance_link_only('claim');
CREATE TRIGGER "RemittanceLine_link_only" BEFORE UPDATE OR DELETE ON "RemittanceLine" FOR EACH ROW EXECUTE FUNCTION dental_remittance_link_only('claimLine');
CREATE TRIGGER "Claim_no_delete" BEFORE DELETE ON "Claim" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "Remittance_no_delete" BEFORE DELETE ON "Remittance" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
