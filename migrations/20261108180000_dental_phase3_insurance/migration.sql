-- AlterTable
ALTER TABLE "_InformedRefusal_items" ADD CONSTRAINT "_InformedRefusal_items_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_InformedRefusal_items_AB_unique";

-- AlterTable
ALTER TABLE "_OnlineBookingPolicy_appointmentTypes" ADD CONSTRAINT "_OnlineBookingPolicy_appointmentTypes_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_OnlineBookingPolicy_appointmentTypes_AB_unique";

-- AlterTable
ALTER TABLE "_PlanAcceptance_selectedItems" ADD CONSTRAINT "_PlanAcceptance_selectedItems_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_PlanAcceptance_selectedItems_AB_unique";

-- AlterTable
ALTER TABLE "_StorefrontSite_providersShown" ADD CONSTRAINT "_StorefrontSite_providersShown_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_StorefrontSite_providersShown_AB_unique";

-- AlterTable
ALTER TABLE "_TemplateBlock_allowedTypes" ADD CONSTRAINT "_TemplateBlock_allowedTypes_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_TemplateBlock_allowedTypes_AB_unique";

-- CreateTable
CREATE TABLE "BenefitFact" (
    "id" TEXT NOT NULL,
    "verification" TEXT,
    "coverage" TEXT,
    "field" TEXT NOT NULL,
    "appliesTo" JSONB DEFAULT '{}',
    "valueJson" JSONB DEFAULT '{}',
    "isUnknown" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3),
    "observedBy" TEXT,
    "evidence" TEXT,
    "rawObservation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenefitFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitRule" (
    "id" TEXT NOT NULL,
    "plan" TEXT,
    "kind" TEXT NOT NULL,
    "appliesTo" JSONB DEFAULT '{}',
    "pct" DECIMAL(9,4),
    "frequency" JSONB,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "waitingMonths" INTEGER,
    "downgradeToCode" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3),
    "observedBy" TEXT,
    "evidence" TEXT,
    "supersededBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenefitRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitUsage" (
    "id" TEXT NOT NULL,
    "coverage" TEXT,
    "benefitYear" TEXT NOT NULL DEFAULT '',
    "maxUsedMinor" BIGINT NOT NULL DEFAULT 0,
    "deductibleUsedMinor" BIGINT NOT NULL DEFAULT 0,
    "pendingMinor" BIGINT NOT NULL DEFAULT 0,
    "frequencyUse" JSONB DEFAULT '[]',
    "rebuiltAt" TIMESTAMP(3),
    "sourceHash" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenefitUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitVerification" (
    "id" TEXT NOT NULL,
    "coverage" TEXT,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "completeness" TEXT,
    "failureNote" TEXT NOT NULL DEFAULT '',
    "requestedBy" TEXT,
    "completedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenefitVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coverage" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "subscriber" TEXT,
    "ordinal" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_verification',
    "verificationLevel" TEXT NOT NULL DEFAULT 'unverified',
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "lastVerification" TEXT,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EligibilityCheck" (
    "id" TEXT NOT NULL,
    "verification" TEXT,
    "coverage" TEXT,
    "adapterKey" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "rejectionCodes" JSONB DEFAULT '[]',
    "resultNote" TEXT NOT NULL DEFAULT '',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "observation" TEXT,
    "respondedAt" TIMESTAMP(3),
    "outboxEvent" TEXT,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EligibilityCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "address" JSONB DEFAULT '{}',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Employer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "subjectKind" TEXT NOT NULL,
    "planItem" TEXT,
    "appointment" TEXT,
    "coverage" TEXT,
    "ordinal" TEXT NOT NULL,
    "inputs" JSONB DEFAULT '{}',
    "feeMinor" BIGINT NOT NULL,
    "allowedMinor" BIGINT NOT NULL,
    "writeOffMinor" BIGINT NOT NULL,
    "insuranceMinor" BIGINT NOT NULL,
    "patientMinor" BIGINT NOT NULL,
    "deductibleAppliedMinor" BIGINT NOT NULL,
    "maxAppliedMinor" BIGINT NOT NULL,
    "secondaryInsuranceMinor" BIGINT NOT NULL,
    "coverageStatus" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "reasons" JSONB DEFAULT '[]',
    "estimatorVersion" TEXT NOT NULL DEFAULT '',
    "computedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurancePlan" (
    "id" TEXT NOT NULL,
    "payer" TEXT,
    "employer" TEXT,
    "groupName" TEXT NOT NULL DEFAULT '',
    "groupNumber" TEXT NOT NULL DEFAULT '',
    "planType" TEXT NOT NULL,
    "networkStatus" TEXT NOT NULL,
    "feeSchedule" TEXT,
    "ucrSchedule" TEXT,
    "benefitYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "annualMaxMinor" BIGINT,
    "orthoLifetimeMaxMinor" BIGINT,
    "deductibleIndividualMinor" BIGINT,
    "deductibleFamilyMinor" BIGINT,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "cobMethod" TEXT NOT NULL,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsurancePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutsideHistory" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "code" TEXT,
    "codeText" TEXT NOT NULL DEFAULT '',
    "frequencyGroup" TEXT NOT NULL DEFAULT '',
    "tooth" TEXT NOT NULL DEFAULT '',
    "surfaces" TEXT NOT NULL DEFAULT '',
    "dateOfService" DATE,
    "providerName" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutsideHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "adapterPayerIds" JSONB DEFAULT '{}',
    "phone" TEXT NOT NULL DEFAULT '',
    "portalUrl" TEXT NOT NULL DEFAULT '',
    "timelyFilingDays" INTEGER DEFAULT 365,
    "attachmentNetwork" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscriber" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "personName" JSONB DEFAULT '{}',
    "dateOfBirth" DATE,
    "plan" TEXT,
    "memberIdSecret" TEXT,
    "memberIdHash" TEXT NOT NULL DEFAULT '',
    "memberIdLast4" TEXT NOT NULL DEFAULT '',
    "employer" TEXT,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTask" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "taskKey" TEXT NOT NULL DEFAULT '',
    "subjectType" TEXT NOT NULL DEFAULT '',
    "subjectId" TEXT NOT NULL DEFAULT '',
    "verification" TEXT,
    "assignee" TEXT,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "checklist" JSONB DEFAULT '{}',
    "result" JSONB DEFAULT '{}',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BenefitFact_verification_idx" ON "BenefitFact"("verification");

-- CreateIndex
CREATE INDEX "BenefitFact_coverage_idx" ON "BenefitFact"("coverage");

-- CreateIndex
CREATE INDEX "BenefitFact_observedBy_idx" ON "BenefitFact"("observedBy");

-- CreateIndex
CREATE INDEX "BenefitFact_evidence_idx" ON "BenefitFact"("evidence");

-- CreateIndex
CREATE INDEX "BenefitFact_rawObservation_idx" ON "BenefitFact"("rawObservation");

-- CreateIndex
CREATE INDEX "BenefitRule_plan_idx" ON "BenefitRule"("plan");

-- CreateIndex
CREATE INDEX "BenefitRule_downgradeToCode_idx" ON "BenefitRule"("downgradeToCode");

-- CreateIndex
CREATE INDEX "BenefitRule_observedBy_idx" ON "BenefitRule"("observedBy");

-- CreateIndex
CREATE INDEX "BenefitRule_evidence_idx" ON "BenefitRule"("evidence");

-- CreateIndex
CREATE INDEX "BenefitRule_supersededBy_idx" ON "BenefitRule"("supersededBy");

-- CreateIndex
CREATE INDEX "BenefitUsage_coverage_idx" ON "BenefitUsage"("coverage");

-- CreateIndex
CREATE INDEX "BenefitVerification_coverage_idx" ON "BenefitVerification"("coverage");

-- CreateIndex
CREATE INDEX "BenefitVerification_requestedBy_idx" ON "BenefitVerification"("requestedBy");

-- CreateIndex
CREATE INDEX "BenefitVerification_completedBy_idx" ON "BenefitVerification"("completedBy");

-- CreateIndex
CREATE INDEX "Coverage_patient_idx" ON "Coverage"("patient");

-- CreateIndex
CREATE INDEX "Coverage_subscriber_idx" ON "Coverage"("subscriber");

-- CreateIndex
CREATE INDEX "Coverage_lastVerification_idx" ON "Coverage"("lastVerification");

-- CreateIndex
CREATE INDEX "EligibilityCheck_verification_idx" ON "EligibilityCheck"("verification");

-- CreateIndex
CREATE INDEX "EligibilityCheck_coverage_idx" ON "EligibilityCheck"("coverage");

-- CreateIndex
CREATE INDEX "EligibilityCheck_requestHash_idx" ON "EligibilityCheck"("requestHash");

-- CreateIndex
CREATE INDEX "EligibilityCheck_observation_idx" ON "EligibilityCheck"("observation");

-- CreateIndex
CREATE INDEX "EligibilityCheck_outboxEvent_idx" ON "EligibilityCheck"("outboxEvent");

-- CreateIndex
CREATE INDEX "Estimate_patient_idx" ON "Estimate"("patient");

-- CreateIndex
CREATE INDEX "Estimate_planItem_idx" ON "Estimate"("planItem");

-- CreateIndex
CREATE INDEX "Estimate_appointment_idx" ON "Estimate"("appointment");

-- CreateIndex
CREATE INDEX "Estimate_coverage_idx" ON "Estimate"("coverage");

-- CreateIndex
CREATE INDEX "InsurancePlan_payer_idx" ON "InsurancePlan"("payer");

-- CreateIndex
CREATE INDEX "InsurancePlan_employer_idx" ON "InsurancePlan"("employer");

-- CreateIndex
CREATE INDEX "InsurancePlan_groupNumber_idx" ON "InsurancePlan"("groupNumber");

-- CreateIndex
CREATE INDEX "InsurancePlan_feeSchedule_idx" ON "InsurancePlan"("feeSchedule");

-- CreateIndex
CREATE INDEX "InsurancePlan_ucrSchedule_idx" ON "InsurancePlan"("ucrSchedule");

-- CreateIndex
CREATE INDEX "OutsideHistory_patient_idx" ON "OutsideHistory"("patient");

-- CreateIndex
CREATE INDEX "OutsideHistory_code_idx" ON "OutsideHistory"("code");

-- CreateIndex
CREATE INDEX "OutsideHistory_evidence_idx" ON "OutsideHistory"("evidence");

-- CreateIndex
CREATE INDEX "Subscriber_patient_idx" ON "Subscriber"("patient");

-- CreateIndex
CREATE INDEX "Subscriber_plan_idx" ON "Subscriber"("plan");

-- CreateIndex
CREATE INDEX "Subscriber_memberIdSecret_idx" ON "Subscriber"("memberIdSecret");

-- CreateIndex
CREATE INDEX "Subscriber_memberIdHash_idx" ON "Subscriber"("memberIdHash");

-- CreateIndex
CREATE INDEX "Subscriber_employer_idx" ON "Subscriber"("employer");

-- CreateIndex
CREATE INDEX "WorkTask_subjectId_idx" ON "WorkTask"("subjectId");

-- CreateIndex
CREATE INDEX "WorkTask_verification_idx" ON "WorkTask"("verification");

-- CreateIndex
CREATE INDEX "WorkTask_assignee_idx" ON "WorkTask"("assignee");

-- AddForeignKey
ALTER TABLE "BenefitFact" ADD CONSTRAINT "BenefitFact_verification_fkey" FOREIGN KEY ("verification") REFERENCES "BenefitVerification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitFact" ADD CONSTRAINT "BenefitFact_coverage_fkey" FOREIGN KEY ("coverage") REFERENCES "Coverage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitFact" ADD CONSTRAINT "BenefitFact_observedBy_fkey" FOREIGN KEY ("observedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitFact" ADD CONSTRAINT "BenefitFact_evidence_fkey" FOREIGN KEY ("evidence") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitFact" ADD CONSTRAINT "BenefitFact_rawObservation_fkey" FOREIGN KEY ("rawObservation") REFERENCES "InboundObservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitRule" ADD CONSTRAINT "BenefitRule_plan_fkey" FOREIGN KEY ("plan") REFERENCES "InsurancePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitRule" ADD CONSTRAINT "BenefitRule_downgradeToCode_fkey" FOREIGN KEY ("downgradeToCode") REFERENCES "ProcedureCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitRule" ADD CONSTRAINT "BenefitRule_observedBy_fkey" FOREIGN KEY ("observedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitRule" ADD CONSTRAINT "BenefitRule_evidence_fkey" FOREIGN KEY ("evidence") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitRule" ADD CONSTRAINT "BenefitRule_supersededBy_fkey" FOREIGN KEY ("supersededBy") REFERENCES "BenefitRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitUsage" ADD CONSTRAINT "BenefitUsage_coverage_fkey" FOREIGN KEY ("coverage") REFERENCES "Coverage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitVerification" ADD CONSTRAINT "BenefitVerification_coverage_fkey" FOREIGN KEY ("coverage") REFERENCES "Coverage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitVerification" ADD CONSTRAINT "BenefitVerification_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitVerification" ADD CONSTRAINT "BenefitVerification_completedBy_fkey" FOREIGN KEY ("completedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coverage" ADD CONSTRAINT "Coverage_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coverage" ADD CONSTRAINT "Coverage_subscriber_fkey" FOREIGN KEY ("subscriber") REFERENCES "Subscriber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coverage" ADD CONSTRAINT "Coverage_lastVerification_fkey" FOREIGN KEY ("lastVerification") REFERENCES "BenefitVerification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EligibilityCheck" ADD CONSTRAINT "EligibilityCheck_verification_fkey" FOREIGN KEY ("verification") REFERENCES "BenefitVerification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EligibilityCheck" ADD CONSTRAINT "EligibilityCheck_coverage_fkey" FOREIGN KEY ("coverage") REFERENCES "Coverage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EligibilityCheck" ADD CONSTRAINT "EligibilityCheck_observation_fkey" FOREIGN KEY ("observation") REFERENCES "InboundObservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EligibilityCheck" ADD CONSTRAINT "EligibilityCheck_outboxEvent_fkey" FOREIGN KEY ("outboxEvent") REFERENCES "OutboxEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_planItem_fkey" FOREIGN KEY ("planItem") REFERENCES "TreatmentPlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_coverage_fkey" FOREIGN KEY ("coverage") REFERENCES "Coverage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePlan" ADD CONSTRAINT "InsurancePlan_payer_fkey" FOREIGN KEY ("payer") REFERENCES "Payer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePlan" ADD CONSTRAINT "InsurancePlan_employer_fkey" FOREIGN KEY ("employer") REFERENCES "Employer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePlan" ADD CONSTRAINT "InsurancePlan_feeSchedule_fkey" FOREIGN KEY ("feeSchedule") REFERENCES "FeeSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePlan" ADD CONSTRAINT "InsurancePlan_ucrSchedule_fkey" FOREIGN KEY ("ucrSchedule") REFERENCES "FeeSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutsideHistory" ADD CONSTRAINT "OutsideHistory_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutsideHistory" ADD CONSTRAINT "OutsideHistory_code_fkey" FOREIGN KEY ("code") REFERENCES "ProcedureCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutsideHistory" ADD CONSTRAINT "OutsideHistory_evidence_fkey" FOREIGN KEY ("evidence") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_plan_fkey" FOREIGN KEY ("plan") REFERENCES "InsurancePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_memberIdSecret_fkey" FOREIGN KEY ("memberIdSecret") REFERENCES "SecretBox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_employer_fkey" FOREIGN KEY ("employer") REFERENCES "Employer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_verification_fkey" FOREIGN KEY ("verification") REFERENCES "BenefitVerification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_assignee_fkey" FOREIGN KEY ("assignee") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Phase 3 database invariants (insurance, benefits, estimates) ────────────────────────────────

-- Money and percentages.
ALTER TABLE "InsurancePlan" ADD CONSTRAINT "InsurancePlan_money_nonneg" CHECK (
  COALESCE("annualMaxMinor",0) >= 0 AND COALESCE("orthoLifetimeMaxMinor",0) >= 0 AND COALESCE("deductibleIndividualMinor",0) >= 0 AND COALESCE("deductibleFamilyMinor",0) >= 0);
ALTER TABLE "InsurancePlan" ADD CONSTRAINT "InsurancePlan_benefit_year_month" CHECK ("benefitYearStartMonth" BETWEEN 1 AND 12);
ALTER TABLE "InsurancePlan" ADD CONSTRAINT "InsurancePlan_enums" CHECK (
  "planType" IN ('ppo','indemnity','dhmo','medicaid','ma_dental','discount','other') AND "networkStatus" IN ('in_network','out_of_network') AND "cobMethod" IN ('standard','non_duplication','carve_out','unknown'));
ALTER TABLE "Payer" ADD CONSTRAINT "Payer_filing_days" CHECK ("timelyFilingDays" > 0);

ALTER TABLE "BenefitRule" ADD CONSTRAINT "BenefitRule_pct_range" CHECK ("pct" IS NULL OR ("pct" >= 0 AND "pct" <= 100));
ALTER TABLE "BenefitRule" ADD CONSTRAINT "BenefitRule_kind_values" CHECK (
  ("kind" <> 'coverage_pct' OR "pct" IS NOT NULL)
  AND ("kind" <> 'waiting_period' OR COALESCE("waitingMonths",-1) >= 0)
  AND ("kind" <> 'frequency' OR "frequency" IS NOT NULL)
  AND ("ageMin" IS NULL OR "ageMax" IS NULL OR "ageMin" <= "ageMax"));
ALTER TABLE "BenefitRule" ADD CONSTRAINT "BenefitRule_provenance" CHECK ("source" IN ('eligibility_271','payer_portal','payer_phone','fax_breakdown','prior_eob','patient_reported','practice_default') AND "observedAt" IS NOT NULL);

ALTER TABLE "BenefitFact" ADD CONSTRAINT "BenefitFact_provenance" CHECK ("source" IN ('eligibility_271','payer_portal','payer_phone','fax_breakdown','prior_eob','patient_reported','practice_default') AND "observedAt" IS NOT NULL);
-- An unknown fact carries no value, so it can never be read as a benefit.
ALTER TABLE "BenefitFact" ADD CONSTRAINT "BenefitFact_unknown_has_no_value" CHECK (NOT "isUnknown" OR "valueJson" IS NULL OR "valueJson" = '{}'::jsonb);
-- A fact from a 271 must point at the stored response it came from.
ALTER TABLE "BenefitFact" ADD CONSTRAINT "BenefitFact_271_has_observation" CHECK ("source" <> 'eligibility_271' OR "rawObservation" IS NOT NULL);

ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_dates" CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" >= "effectiveFrom");
ALTER TABLE "Coverage" ADD CONSTRAINT "Coverage_dates" CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" >= "effectiveFrom");
ALTER TABLE "Coverage" ADD CONSTRAINT "Coverage_enums" CHECK (
  "ordinal" IN ('primary','secondary','tertiary') AND "status" IN ('pending_verification','active','terminated','invalid') AND "verificationLevel" IN ('unverified','verified_partial','verified_full'));
-- A verified coverage has a verification behind it.
ALTER TABLE "Coverage" ADD CONSTRAINT "Coverage_verified_has_verification" CHECK ("verificationLevel" = 'unverified' OR "lastVerification" IS NOT NULL);
-- I-I2: at most one open coverage per patient and ordinal.
CREATE UNIQUE INDEX "Coverage_patient_ordinal_open" ON "Coverage" ("patient","ordinal") WHERE "status" IN ('pending_verification','active');

-- One verification in flight per coverage; a finished one says when and how complete.
CREATE UNIQUE INDEX "BenefitVerification_coverage_in_flight" ON "BenefitVerification" ("coverage") WHERE "status" IN ('requested','in_progress');
ALTER TABLE "BenefitVerification" ADD CONSTRAINT "BenefitVerification_completed" CHECK ("status" <> 'completed' OR ("completedAt" IS NOT NULL AND "completeness" IS NOT NULL));

-- Never two checks in flight for the same coverage and request: a retry reuses the row (no duplicate).
CREATE UNIQUE INDEX "EligibilityCheck_in_flight" ON "EligibilityCheck" ("coverage","requestHash") WHERE "status" IN ('queued','sent','unknown');
ALTER TABLE "EligibilityCheck" ADD CONSTRAINT "EligibilityCheck_attempts" CHECK ("attempts" >= 0);
ALTER TABLE "EligibilityCheck" ADD CONSTRAINT "EligibilityCheck_responded" CHECK ("status" <> 'responded' OR ("respondedAt" IS NOT NULL AND "observation" IS NOT NULL));

-- One open task per subject and key.
CREATE UNIQUE INDEX "WorkTask_open_key" ON "WorkTask" ("kind","subjectType","subjectId","taskKey") WHERE "status" IN ('open','in_progress');

CREATE UNIQUE INDEX "BenefitUsage_coverage_year" ON "BenefitUsage" ("coverage","benefitYear");
ALTER TABLE "BenefitUsage" ADD CONSTRAINT "BenefitUsage_nonneg" CHECK (COALESCE("maxUsedMinor",0) >= 0 AND COALESCE("deductibleUsedMinor",0) >= 0 AND COALESCE("pendingMinor",0) >= 0);

-- Estimates: exact arithmetic bounds, and unknown or not-covered lines never carry insurance.
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_amounts" CHECK (
  "feeMinor" >= 0 AND "allowedMinor" >= 0 AND "writeOffMinor" >= 0 AND "insuranceMinor" >= 0 AND "patientMinor" >= 0
  AND "deductibleAppliedMinor" >= 0 AND "maxAppliedMinor" >= 0 AND "secondaryInsuranceMinor" >= 0
  AND "allowedMinor" <= "feeMinor" AND "writeOffMinor" <= "feeMinor" AND "insuranceMinor" <= "feeMinor" AND "patientMinor" <= "feeMinor"
  AND "secondaryInsuranceMinor" <= "patientMinor");
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_unknown_pays_nothing" CHECK ("coverageStatus" = 'covered' OR ("insuranceMinor" = 0 AND "secondaryInsuranceMinor" = 0));
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_unknown_is_assumed" CHECK ("coverageStatus" <> 'unknown' OR "confidence" = 'assumed');
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_subject" CHECK (
  ("subjectKind" = 'plan_item' AND "planItem" IS NOT NULL) OR ("subjectKind" = 'appointment' AND "appointment" IS NOT NULL) OR "subjectKind" = 'claim_line');
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_enums" CHECK ("confidence" IN ('verified','partially_verified','assumed') AND "coverageStatus" IN ('covered','not_covered','unknown') AND "ordinal" IN ('primary','secondary','tertiary'));

-- Append-only: facts and estimates are corrected by new rows, never edited.
CREATE TRIGGER "BenefitFact_append_only" BEFORE UPDATE OR DELETE ON "BenefitFact" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "BenefitFact_no_truncate" BEFORE TRUNCATE ON "BenefitFact" FOR EACH STATEMENT EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "Estimate_append_only" BEFORE UPDATE OR DELETE ON "Estimate" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "Estimate_no_truncate" BEFORE TRUNCATE ON "Estimate" FOR EACH STATEMENT EXECUTE FUNCTION dental_deny_update_delete();

-- A benefit rule is immutable except that a newer rule may be linked as its replacement (once).
CREATE OR REPLACE FUNCTION dental_benefit_rule_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'BenefitRule rows are append-only' USING ERRCODE = 'check_violation'; END IF;
  IF OLD."supersededBy" IS NULL AND NEW."supersededBy" IS NOT NULL
     AND to_jsonb(NEW) - 'supersededBy' - 'updatedAt' IS NOT DISTINCT FROM to_jsonb(OLD) - 'supersededBy' - 'updatedAt' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'BenefitRule rows are immutable; add a superseding rule' USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER "BenefitRule_immutable" BEFORE UPDATE OR DELETE ON "BenefitRule" FOR EACH ROW EXECUTE FUNCTION dental_benefit_rule_guard();
