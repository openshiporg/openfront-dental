-- CreateTable
CREATE TABLE "CodeImportBatch" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "codeSystem" TEXT,
    "editionYear" INTEGER,
    "fileName" TEXT NOT NULL DEFAULT '',
    "fileSha256" TEXT NOT NULL DEFAULT '',
    "rows" JSONB DEFAULT '[]',
    "columnMap" JSONB DEFAULT '{}',
    "rowCount" INTEGER DEFAULT 0,
    "validationReport" JSONB DEFAULT '{}',
    "attestation" JSONB DEFAULT '{}',
    "attestedBy" TEXT,
    "attestedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "approval" TEXT,
    "uploadedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeSystem" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "isLicensed" BOOLEAN NOT NULL DEFAULT false,
    "activeImport" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExplosionCode" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "items" JSONB DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExplosionCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fee" (
    "id" TEXT NOT NULL,
    "feeVersion" TEXT,
    "code" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "copayMinor" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeSchedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeScheduleVersion" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "schedule" TEXT,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "approval" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeScheduleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuarantorAccount" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "guarantor" TEXT,
    "balanceCache" JSONB DEFAULT '{}',
    "balanceRebuiltAt" TIMESTAMP(3),
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuarantorAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "account" TEXT,
    "patient" TEXT,
    "kind" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT '',
    "businessDate" DATE,
    "originalBusinessDate" DATE,
    "location" TEXT,
    "provider" TEXT,
    "chartEntry" TEXT,
    "reverses" TEXT,
    "memo" TEXT NOT NULL DEFAULT '',
    "postedBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcedureCode" (
    "id" TEXT NOT NULL,
    "codeSystem" TEXT,
    "code" TEXT NOT NULL DEFAULT '',
    "nomenclature" TEXT NOT NULL DEFAULT '',
    "patientFriendlyName" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "estimatingCategory" TEXT NOT NULL DEFAULT '',
    "areaRule" TEXT NOT NULL,
    "requiresSurfaces" BOOLEAN NOT NULL DEFAULT false,
    "maxSurfaces" INTEGER,
    "isLabMade" BOOLEAN NOT NULL DEFAULT false,
    "isPreventiveRecallTrigger" BOOLEAN NOT NULL DEFAULT false,
    "defaultUnitsMinutes" INTEGER,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "importBatch" TEXT,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcedureCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcedureCodeCrosswalk" (
    "id" TEXT NOT NULL,
    "localCode" TEXT,
    "targetCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "proposedBasis" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT,
    "confirmedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcedureCodeCrosswalk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnestheticLog" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "appointment" TEXT,
    "drug" TEXT NOT NULL DEFAULT '',
    "concentration" TEXT NOT NULL DEFAULT '',
    "vasoconstrictor" TEXT NOT NULL DEFAULT '',
    "carpules" DECIMAL(6,2),
    "injectionSites" JSONB DEFAULT '[]',
    "administeredBy" TEXT,
    "at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnestheticLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartEntry" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "kind" TEXT NOT NULL,
    "code" TEXT,
    "condition" TEXT,
    "tooth" TEXT NOT NULL DEFAULT '',
    "surfaces" TEXT NOT NULL DEFAULT '',
    "area" TEXT NOT NULL,
    "quadrant" TEXT NOT NULL DEFAULT '',
    "sextant" INTEGER,
    "arch" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'diagnosed',
    "conditionStatus" TEXT NOT NULL DEFAULT '',
    "dateOfService" DATE,
    "originalServiceDate" DATE,
    "provider" TEXT,
    "location" TEXT,
    "appointment" TEXT,
    "feeMinor" BIGINT,
    "feeScheduleVersion" TEXT,
    "units" INTEGER DEFAULT 1,
    "ledgerEntry" TEXT,
    "correctedBy" TEXT,
    "corrects" TEXT,
    "diagnosisCodes" JSONB DEFAULT '[]',
    "note" TEXT,
    "externalFinding" TEXT,
    "source" TEXT NOT NULL,
    "acceptedVia" TEXT NOT NULL DEFAULT '',
    "deletedReason" TEXT NOT NULL DEFAULT '',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChartEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalNote" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "appointment" TEXT,
    "author" TEXT,
    "provider" TEXT,
    "template" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "bodyHash" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "amends" TEXT,
    "isLateEntry" BOOLEAN NOT NULL DEFAULT false,
    "refersToAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signatureMethod" TEXT NOT NULL DEFAULT '',
    "errorReason" TEXT NOT NULL DEFAULT '',
    "draftedByProposal" TEXT,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConditionType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "label" TEXT NOT NULL DEFAULT '',
    "chartSymbol" TEXT NOT NULL DEFAULT '',
    "areaRule" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConditionType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalFinding" (
    "id" TEXT NOT NULL,
    "study" TEXT,
    "patient" TEXT,
    "vendor" TEXT NOT NULL DEFAULT '',
    "device" TEXT NOT NULL DEFAULT '',
    "modelVersion" TEXT NOT NULL DEFAULT '',
    "clearanceRef" TEXT NOT NULL DEFAULT '',
    "findingType" TEXT NOT NULL DEFAULT '',
    "tooth" TEXT NOT NULL DEFAULT '',
    "surfaces" TEXT NOT NULL DEFAULT '',
    "confidence" DECIMAL(9,4),
    "status" TEXT NOT NULL DEFAULT 'received',
    "decidedBy" TEXT,
    "dismissReason" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImagingStudy" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "modality" TEXT NOT NULL,
    "teeth" JSONB DEFAULT '[]',
    "acquiredAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "bridgeRef" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'requested',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImagingStudy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InformedRefusal" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "planVersion" TEXT,
    "risksExplained" TEXT NOT NULL DEFAULT '',
    "signedBy" TEXT NOT NULL,
    "signerName" TEXT NOT NULL DEFAULT '',
    "signatureEvidence" JSONB DEFAULT '{}',
    "witness" TEXT,
    "signedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "withdrawnReason" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InformedRefusal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalHistoryForm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "formVersion" INTEGER DEFAULT 1,
    "questions" JSONB DEFAULT '[]',
    "jurisdictionTags" JSONB DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'published',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalHistoryForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalHistoryResponse" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "form" TEXT,
    "answers" JSONB DEFAULT '{}',
    "submittedVia" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalHistoryResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalHistoryReview" (
    "id" TEXT NOT NULL,
    "response" TEXT,
    "patient" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "changesAcknowledged" JSONB DEFAULT '[]',
    "alertsCreated" JSONB DEFAULT '[]',
    "signatureHash" TEXT NOT NULL DEFAULT '',
    "overrideReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalHistoryReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationEntry" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "dose" TEXT NOT NULL DEFAULT '',
    "frequency" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "activeFrom" DATE,
    "endedAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "appliesToCategories" JSONB DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'published',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteTemplateVersion" (
    "id" TEXT NOT NULL,
    "template" TEXT,
    "number" INTEGER DEFAULT 1,
    "body" TEXT NOT NULL DEFAULT '',
    "prompts" JSONB DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'published',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerioClassification" (
    "id" TEXT NOT NULL,
    "exam" TEXT,
    "suggestedStage" TEXT NOT NULL DEFAULT '',
    "suggestedGrade" TEXT NOT NULL DEFAULT '',
    "extent" TEXT NOT NULL DEFAULT '',
    "inputs" JSONB DEFAULT '{}',
    "confirmedStage" TEXT NOT NULL DEFAULT '',
    "confirmedGrade" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'suggested',
    "signedBy" TEXT,
    "signedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerioClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerioExam" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "examDate" DATE,
    "examiner" TEXT,
    "revision" INTEGER DEFAULT 1,
    "revisionOf" TEXT,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "location" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedBy" TEXT,
    "signatureHash" TEXT NOT NULL DEFAULT '',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerioExam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerioSiteMeasurement" (
    "id" TEXT NOT NULL,
    "exam" TEXT,
    "tooth" TEXT NOT NULL DEFAULT '',
    "site" TEXT NOT NULL,
    "probingDepthMm" INTEGER,
    "gingivalMarginMm" INTEGER,
    "bleeding" BOOLEAN NOT NULL DEFAULT false,
    "suppuration" BOOLEAN NOT NULL DEFAULT false,
    "plaque" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerioSiteMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerioToothFinding" (
    "id" TEXT NOT NULL,
    "exam" TEXT,
    "tooth" TEXT NOT NULL DEFAULT '',
    "mobility" INTEGER,
    "furcation" JSONB DEFAULT '{}',
    "missing" BOOLEAN NOT NULL DEFAULT false,
    "implant" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerioToothFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "prescriber" TEXT,
    "drug" TEXT NOT NULL DEFAULT '',
    "strength" TEXT NOT NULL DEFAULT '',
    "form" TEXT NOT NULL DEFAULT '',
    "sig" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(10,3),
    "refills" INTEGER DEFAULT 0,
    "isControlled" BOOLEAN NOT NULL DEFAULT false,
    "schedule" TEXT NOT NULL,
    "pharmacy" JSONB DEFAULT '{}',
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "signedAt" TIMESTAMP(3),
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VitalsReading" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "appointment" TEXT,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "pulse" INTEGER,
    "asaClass" TEXT NOT NULL DEFAULT '',
    "takenBy" TEXT,
    "at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VitalsReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentAction" (
    "id" TEXT NOT NULL,
    "record" TEXT,
    "kind" TEXT NOT NULL,
    "at" TIMESTAMP(3),
    "by" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "templateVersion" TEXT,
    "signerName" TEXT NOT NULL DEFAULT '',
    "signerRole" TEXT NOT NULL,
    "signatureEvidence" JSONB DEFAULT '{}',
    "witness" TEXT,
    "signedAt" TIMESTAMP(3),
    "scope" JSONB DEFAULT '{}',
    "effectiveUntil" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormRequest" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "template" TEXT,
    "medicalHistoryForm" TEXT,
    "channel" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'requested',
    "requestedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSubmission" (
    "id" TEXT NOT NULL,
    "request" TEXT,
    "data" JSONB DEFAULT '{}',
    "submittedAt" TIMESTAMP(3),
    "submitterRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormTemplateVersion" (
    "id" TEXT NOT NULL,
    "template" TEXT,
    "number" INTEGER DEFAULT 1,
    "body" TEXT NOT NULL DEFAULT '',
    "fields" JSONB DEFAULT '[]',
    "jurisdictionTags" JSONB DEFAULT '[]',
    "requiresWitness" BOOLEAN NOT NULL DEFAULT false,
    "contentHash" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'published',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodFaithEstimate" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "planVersion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'required',
    "dueBy" TIMESTAMP(3),
    "deliveredVia" TEXT NOT NULL DEFAULT '',
    "deliveredAt" TIMESTAMP(3),
    "itemsSnapshot" JSONB DEFAULT '[]',
    "totalMinor" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoodFaithEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanAcceptance" (
    "id" TEXT NOT NULL,
    "planVersion" TEXT,
    "versionHash" TEXT NOT NULL DEFAULT '',
    "signer" TEXT NOT NULL,
    "signerName" TEXT NOT NULL DEFAULT '',
    "signatureEvidence" JSONB DEFAULT '{}',
    "estimateSnapshot" JSONB DEFAULT '{}',
    "financingSelection" JSONB DEFAULT '{}',
    "at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanPresentation" (
    "id" TEXT NOT NULL,
    "planVersion" TEXT,
    "presentedBy" TEXT,
    "channel" TEXT NOT NULL,
    "at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanPresentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentPlan" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "ref" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currentVersion" TEXT,
    "coordinator" TEXT,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreatmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentPlanItem" (
    "id" TEXT NOT NULL,
    "planVersion" TEXT,
    "chartEntry" TEXT,
    "phaseKey" TEXT NOT NULL DEFAULT '',
    "alternateGroup" TEXT NOT NULL DEFAULT '',
    "priority" TEXT NOT NULL,
    "feeMinor" BIGINT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "refused" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreatmentPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentPlanVersion" (
    "id" TEXT NOT NULL,
    "plan" TEXT,
    "number" INTEGER DEFAULT 1,
    "phases" JSONB DEFAULT '[]',
    "totalsMinor" JSONB DEFAULT '{}',
    "contentHash" TEXT NOT NULL DEFAULT '',
    "frozenAt" TIMESTAMP(3),
    "presentedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreatmentPlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_InformedRefusal_items" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_PlanAcceptance_selectedItems" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "CodeImportBatch_codeSystem_idx" ON "CodeImportBatch"("codeSystem");

-- CreateIndex
CREATE INDEX "CodeImportBatch_attestedBy_idx" ON "CodeImportBatch"("attestedBy");

-- CreateIndex
CREATE INDEX "CodeImportBatch_approval_idx" ON "CodeImportBatch"("approval");

-- CreateIndex
CREATE INDEX "CodeImportBatch_uploadedBy_idx" ON "CodeImportBatch"("uploadedBy");

-- CreateIndex
CREATE UNIQUE INDEX "CodeSystem_key_key" ON "CodeSystem"("key");

-- CreateIndex
CREATE INDEX "CodeSystem_activeImport_idx" ON "CodeSystem"("activeImport");

-- CreateIndex
CREATE INDEX "Fee_feeVersion_idx" ON "Fee"("feeVersion");

-- CreateIndex
CREATE INDEX "Fee_code_idx" ON "Fee"("code");

-- CreateIndex
CREATE INDEX "FeeScheduleVersion_schedule_idx" ON "FeeScheduleVersion"("schedule");

-- CreateIndex
CREATE INDEX "FeeScheduleVersion_publishedBy_idx" ON "FeeScheduleVersion"("publishedBy");

-- CreateIndex
CREATE INDEX "FeeScheduleVersion_approval_idx" ON "FeeScheduleVersion"("approval");

-- CreateIndex
CREATE UNIQUE INDEX "GuarantorAccount_ref_key" ON "GuarantorAccount"("ref");

-- CreateIndex
CREATE INDEX "GuarantorAccount_guarantor_idx" ON "GuarantorAccount"("guarantor");

-- CreateIndex
CREATE INDEX "LedgerEntry_account_idx" ON "LedgerEntry"("account");

-- CreateIndex
CREATE INDEX "LedgerEntry_patient_idx" ON "LedgerEntry"("patient");

-- CreateIndex
CREATE INDEX "LedgerEntry_location_idx" ON "LedgerEntry"("location");

-- CreateIndex
CREATE INDEX "LedgerEntry_provider_idx" ON "LedgerEntry"("provider");

-- CreateIndex
CREATE INDEX "LedgerEntry_chartEntry_idx" ON "LedgerEntry"("chartEntry");

-- CreateIndex
CREATE INDEX "LedgerEntry_reverses_idx" ON "LedgerEntry"("reverses");

-- CreateIndex
CREATE INDEX "LedgerEntry_postedBy_idx" ON "LedgerEntry"("postedBy");

-- CreateIndex
CREATE INDEX "ProcedureCode_codeSystem_idx" ON "ProcedureCode"("codeSystem");

-- CreateIndex
CREATE INDEX "ProcedureCode_code_idx" ON "ProcedureCode"("code");

-- CreateIndex
CREATE INDEX "ProcedureCode_importBatch_idx" ON "ProcedureCode"("importBatch");

-- CreateIndex
CREATE INDEX "ProcedureCodeCrosswalk_localCode_idx" ON "ProcedureCodeCrosswalk"("localCode");

-- CreateIndex
CREATE INDEX "ProcedureCodeCrosswalk_targetCode_idx" ON "ProcedureCodeCrosswalk"("targetCode");

-- CreateIndex
CREATE INDEX "ProcedureCodeCrosswalk_createdBy_idx" ON "ProcedureCodeCrosswalk"("createdBy");

-- CreateIndex
CREATE INDEX "ProcedureCodeCrosswalk_confirmedBy_idx" ON "ProcedureCodeCrosswalk"("confirmedBy");

-- CreateIndex
CREATE INDEX "AnestheticLog_patient_idx" ON "AnestheticLog"("patient");

-- CreateIndex
CREATE INDEX "AnestheticLog_appointment_idx" ON "AnestheticLog"("appointment");

-- CreateIndex
CREATE INDEX "AnestheticLog_administeredBy_idx" ON "AnestheticLog"("administeredBy");

-- CreateIndex
CREATE INDEX "ChartEntry_patient_idx" ON "ChartEntry"("patient");

-- CreateIndex
CREATE INDEX "ChartEntry_code_idx" ON "ChartEntry"("code");

-- CreateIndex
CREATE INDEX "ChartEntry_condition_idx" ON "ChartEntry"("condition");

-- CreateIndex
CREATE INDEX "ChartEntry_provider_idx" ON "ChartEntry"("provider");

-- CreateIndex
CREATE INDEX "ChartEntry_location_idx" ON "ChartEntry"("location");

-- CreateIndex
CREATE INDEX "ChartEntry_appointment_idx" ON "ChartEntry"("appointment");

-- CreateIndex
CREATE INDEX "ChartEntry_feeScheduleVersion_idx" ON "ChartEntry"("feeScheduleVersion");

-- CreateIndex
CREATE INDEX "ChartEntry_ledgerEntry_idx" ON "ChartEntry"("ledgerEntry");

-- CreateIndex
CREATE INDEX "ChartEntry_correctedBy_idx" ON "ChartEntry"("correctedBy");

-- CreateIndex
CREATE INDEX "ChartEntry_corrects_idx" ON "ChartEntry"("corrects");

-- CreateIndex
CREATE INDEX "ChartEntry_note_idx" ON "ChartEntry"("note");

-- CreateIndex
CREATE INDEX "ChartEntry_externalFinding_idx" ON "ChartEntry"("externalFinding");

-- CreateIndex
CREATE INDEX "ClinicalNote_patient_idx" ON "ClinicalNote"("patient");

-- CreateIndex
CREATE INDEX "ClinicalNote_appointment_idx" ON "ClinicalNote"("appointment");

-- CreateIndex
CREATE INDEX "ClinicalNote_author_idx" ON "ClinicalNote"("author");

-- CreateIndex
CREATE INDEX "ClinicalNote_provider_idx" ON "ClinicalNote"("provider");

-- CreateIndex
CREATE INDEX "ClinicalNote_template_idx" ON "ClinicalNote"("template");

-- CreateIndex
CREATE INDEX "ClinicalNote_amends_idx" ON "ClinicalNote"("amends");

-- CreateIndex
CREATE INDEX "ClinicalNote_draftedByProposal_idx" ON "ClinicalNote"("draftedByProposal");

-- CreateIndex
CREATE UNIQUE INDEX "ConditionType_code_key" ON "ConditionType"("code");

-- CreateIndex
CREATE INDEX "ExternalFinding_study_idx" ON "ExternalFinding"("study");

-- CreateIndex
CREATE INDEX "ExternalFinding_patient_idx" ON "ExternalFinding"("patient");

-- CreateIndex
CREATE INDEX "ExternalFinding_decidedBy_idx" ON "ExternalFinding"("decidedBy");

-- CreateIndex
CREATE INDEX "ImagingStudy_patient_idx" ON "ImagingStudy"("patient");

-- CreateIndex
CREATE INDEX "InformedRefusal_patient_idx" ON "InformedRefusal"("patient");

-- CreateIndex
CREATE INDEX "InformedRefusal_planVersion_idx" ON "InformedRefusal"("planVersion");

-- CreateIndex
CREATE INDEX "InformedRefusal_witness_idx" ON "InformedRefusal"("witness");

-- CreateIndex
CREATE INDEX "MedicalHistoryResponse_patient_idx" ON "MedicalHistoryResponse"("patient");

-- CreateIndex
CREATE INDEX "MedicalHistoryResponse_form_idx" ON "MedicalHistoryResponse"("form");

-- CreateIndex
CREATE INDEX "MedicalHistoryReview_response_idx" ON "MedicalHistoryReview"("response");

-- CreateIndex
CREATE INDEX "MedicalHistoryReview_patient_idx" ON "MedicalHistoryReview"("patient");

-- CreateIndex
CREATE INDEX "MedicalHistoryReview_reviewedBy_idx" ON "MedicalHistoryReview"("reviewedBy");

-- CreateIndex
CREATE INDEX "MedicationEntry_patient_idx" ON "MedicationEntry"("patient");

-- CreateIndex
CREATE INDEX "NoteTemplateVersion_template_idx" ON "NoteTemplateVersion"("template");

-- CreateIndex
CREATE INDEX "PerioClassification_exam_idx" ON "PerioClassification"("exam");

-- CreateIndex
CREATE INDEX "PerioClassification_signedBy_idx" ON "PerioClassification"("signedBy");

-- CreateIndex
CREATE INDEX "PerioExam_patient_idx" ON "PerioExam"("patient");

-- CreateIndex
CREATE INDEX "PerioExam_examiner_idx" ON "PerioExam"("examiner");

-- CreateIndex
CREATE INDEX "PerioExam_revisionOf_idx" ON "PerioExam"("revisionOf");

-- CreateIndex
CREATE INDEX "PerioExam_location_idx" ON "PerioExam"("location");

-- CreateIndex
CREATE INDEX "PerioExam_signedBy_idx" ON "PerioExam"("signedBy");

-- CreateIndex
CREATE INDEX "PerioSiteMeasurement_exam_idx" ON "PerioSiteMeasurement"("exam");

-- CreateIndex
CREATE INDEX "PerioToothFinding_exam_idx" ON "PerioToothFinding"("exam");

-- CreateIndex
CREATE INDEX "Prescription_patient_idx" ON "Prescription"("patient");

-- CreateIndex
CREATE INDEX "Prescription_prescriber_idx" ON "Prescription"("prescriber");

-- CreateIndex
CREATE INDEX "VitalsReading_patient_idx" ON "VitalsReading"("patient");

-- CreateIndex
CREATE INDEX "VitalsReading_appointment_idx" ON "VitalsReading"("appointment");

-- CreateIndex
CREATE INDEX "VitalsReading_takenBy_idx" ON "VitalsReading"("takenBy");

-- CreateIndex
CREATE INDEX "ConsentAction_record_idx" ON "ConsentAction"("record");

-- CreateIndex
CREATE INDEX "ConsentAction_by_idx" ON "ConsentAction"("by");

-- CreateIndex
CREATE INDEX "ConsentRecord_patient_idx" ON "ConsentRecord"("patient");

-- CreateIndex
CREATE INDEX "ConsentRecord_templateVersion_idx" ON "ConsentRecord"("templateVersion");

-- CreateIndex
CREATE INDEX "ConsentRecord_witness_idx" ON "ConsentRecord"("witness");

-- CreateIndex
CREATE INDEX "FormRequest_patient_idx" ON "FormRequest"("patient");

-- CreateIndex
CREATE INDEX "FormRequest_template_idx" ON "FormRequest"("template");

-- CreateIndex
CREATE INDEX "FormRequest_medicalHistoryForm_idx" ON "FormRequest"("medicalHistoryForm");

-- CreateIndex
CREATE INDEX "FormRequest_requestedBy_idx" ON "FormRequest"("requestedBy");

-- CreateIndex
CREATE INDEX "FormSubmission_request_idx" ON "FormSubmission"("request");

-- CreateIndex
CREATE UNIQUE INDEX "FormTemplate_key_key" ON "FormTemplate"("key");

-- CreateIndex
CREATE INDEX "FormTemplateVersion_template_idx" ON "FormTemplateVersion"("template");

-- CreateIndex
CREATE INDEX "GoodFaithEstimate_patient_idx" ON "GoodFaithEstimate"("patient");

-- CreateIndex
CREATE INDEX "GoodFaithEstimate_planVersion_idx" ON "GoodFaithEstimate"("planVersion");

-- CreateIndex
CREATE INDEX "PlanAcceptance_planVersion_idx" ON "PlanAcceptance"("planVersion");

-- CreateIndex
CREATE INDEX "PlanPresentation_planVersion_idx" ON "PlanPresentation"("planVersion");

-- CreateIndex
CREATE INDEX "PlanPresentation_presentedBy_idx" ON "PlanPresentation"("presentedBy");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentPlan_ref_key" ON "TreatmentPlan"("ref");

-- CreateIndex
CREATE INDEX "TreatmentPlan_patient_idx" ON "TreatmentPlan"("patient");

-- CreateIndex
CREATE INDEX "TreatmentPlan_currentVersion_idx" ON "TreatmentPlan"("currentVersion");

-- CreateIndex
CREATE INDEX "TreatmentPlan_coordinator_idx" ON "TreatmentPlan"("coordinator");

-- CreateIndex
CREATE INDEX "TreatmentPlanItem_planVersion_idx" ON "TreatmentPlanItem"("planVersion");

-- CreateIndex
CREATE INDEX "TreatmentPlanItem_chartEntry_idx" ON "TreatmentPlanItem"("chartEntry");

-- CreateIndex
CREATE INDEX "TreatmentPlanVersion_plan_idx" ON "TreatmentPlanVersion"("plan");

-- CreateIndex
CREATE INDEX "TreatmentPlanVersion_presentedBy_idx" ON "TreatmentPlanVersion"("presentedBy");

-- CreateIndex
CREATE UNIQUE INDEX "_InformedRefusal_items_AB_unique" ON "_InformedRefusal_items"("A", "B");

-- CreateIndex
CREATE INDEX "_InformedRefusal_items_B_index" ON "_InformedRefusal_items"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_PlanAcceptance_selectedItems_AB_unique" ON "_PlanAcceptance_selectedItems"("A", "B");

-- CreateIndex
CREATE INDEX "_PlanAcceptance_selectedItems_B_index" ON "_PlanAcceptance_selectedItems"("B");

-- AddForeignKey
ALTER TABLE "CodeImportBatch" ADD CONSTRAINT "CodeImportBatch_codeSystem_fkey" FOREIGN KEY ("codeSystem") REFERENCES "CodeSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeImportBatch" ADD CONSTRAINT "CodeImportBatch_attestedBy_fkey" FOREIGN KEY ("attestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeImportBatch" ADD CONSTRAINT "CodeImportBatch_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeImportBatch" ADD CONSTRAINT "CodeImportBatch_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeSystem" ADD CONSTRAINT "CodeSystem_activeImport_fkey" FOREIGN KEY ("activeImport") REFERENCES "CodeImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_feeVersion_fkey" FOREIGN KEY ("feeVersion") REFERENCES "FeeScheduleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_code_fkey" FOREIGN KEY ("code") REFERENCES "ProcedureCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeScheduleVersion" ADD CONSTRAINT "FeeScheduleVersion_schedule_fkey" FOREIGN KEY ("schedule") REFERENCES "FeeSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeScheduleVersion" ADD CONSTRAINT "FeeScheduleVersion_publishedBy_fkey" FOREIGN KEY ("publishedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeScheduleVersion" ADD CONSTRAINT "FeeScheduleVersion_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuarantorAccount" ADD CONSTRAINT "GuarantorAccount_guarantor_fkey" FOREIGN KEY ("guarantor") REFERENCES "Guarantor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_account_fkey" FOREIGN KEY ("account") REFERENCES "GuarantorAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_provider_fkey" FOREIGN KEY ("provider") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_chartEntry_fkey" FOREIGN KEY ("chartEntry") REFERENCES "ChartEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_reverses_fkey" FOREIGN KEY ("reverses") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_postedBy_fkey" FOREIGN KEY ("postedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureCode" ADD CONSTRAINT "ProcedureCode_codeSystem_fkey" FOREIGN KEY ("codeSystem") REFERENCES "CodeSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureCode" ADD CONSTRAINT "ProcedureCode_importBatch_fkey" FOREIGN KEY ("importBatch") REFERENCES "CodeImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureCodeCrosswalk" ADD CONSTRAINT "ProcedureCodeCrosswalk_localCode_fkey" FOREIGN KEY ("localCode") REFERENCES "ProcedureCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureCodeCrosswalk" ADD CONSTRAINT "ProcedureCodeCrosswalk_targetCode_fkey" FOREIGN KEY ("targetCode") REFERENCES "ProcedureCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureCodeCrosswalk" ADD CONSTRAINT "ProcedureCodeCrosswalk_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureCodeCrosswalk" ADD CONSTRAINT "ProcedureCodeCrosswalk_confirmedBy_fkey" FOREIGN KEY ("confirmedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnestheticLog" ADD CONSTRAINT "AnestheticLog_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnestheticLog" ADD CONSTRAINT "AnestheticLog_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnestheticLog" ADD CONSTRAINT "AnestheticLog_administeredBy_fkey" FOREIGN KEY ("administeredBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_code_fkey" FOREIGN KEY ("code") REFERENCES "ProcedureCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_condition_fkey" FOREIGN KEY ("condition") REFERENCES "ConditionType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_provider_fkey" FOREIGN KEY ("provider") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_feeScheduleVersion_fkey" FOREIGN KEY ("feeScheduleVersion") REFERENCES "FeeScheduleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_ledgerEntry_fkey" FOREIGN KEY ("ledgerEntry") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_correctedBy_fkey" FOREIGN KEY ("correctedBy") REFERENCES "ChartEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_corrects_fkey" FOREIGN KEY ("corrects") REFERENCES "ChartEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_note_fkey" FOREIGN KEY ("note") REFERENCES "ClinicalNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_externalFinding_fkey" FOREIGN KEY ("externalFinding") REFERENCES "ExternalFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_author_fkey" FOREIGN KEY ("author") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_provider_fkey" FOREIGN KEY ("provider") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_template_fkey" FOREIGN KEY ("template") REFERENCES "NoteTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_amends_fkey" FOREIGN KEY ("amends") REFERENCES "ClinicalNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_draftedByProposal_fkey" FOREIGN KEY ("draftedByProposal") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalFinding" ADD CONSTRAINT "ExternalFinding_study_fkey" FOREIGN KEY ("study") REFERENCES "ImagingStudy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalFinding" ADD CONSTRAINT "ExternalFinding_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalFinding" ADD CONSTRAINT "ExternalFinding_decidedBy_fkey" FOREIGN KEY ("decidedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagingStudy" ADD CONSTRAINT "ImagingStudy_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformedRefusal" ADD CONSTRAINT "InformedRefusal_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformedRefusal" ADD CONSTRAINT "InformedRefusal_planVersion_fkey" FOREIGN KEY ("planVersion") REFERENCES "TreatmentPlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformedRefusal" ADD CONSTRAINT "InformedRefusal_witness_fkey" FOREIGN KEY ("witness") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalHistoryResponse" ADD CONSTRAINT "MedicalHistoryResponse_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalHistoryResponse" ADD CONSTRAINT "MedicalHistoryResponse_form_fkey" FOREIGN KEY ("form") REFERENCES "MedicalHistoryForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalHistoryReview" ADD CONSTRAINT "MedicalHistoryReview_response_fkey" FOREIGN KEY ("response") REFERENCES "MedicalHistoryResponse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalHistoryReview" ADD CONSTRAINT "MedicalHistoryReview_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalHistoryReview" ADD CONSTRAINT "MedicalHistoryReview_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationEntry" ADD CONSTRAINT "MedicationEntry_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteTemplateVersion" ADD CONSTRAINT "NoteTemplateVersion_template_fkey" FOREIGN KEY ("template") REFERENCES "NoteTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerioClassification" ADD CONSTRAINT "PerioClassification_exam_fkey" FOREIGN KEY ("exam") REFERENCES "PerioExam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerioClassification" ADD CONSTRAINT "PerioClassification_signedBy_fkey" FOREIGN KEY ("signedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerioExam" ADD CONSTRAINT "PerioExam_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerioExam" ADD CONSTRAINT "PerioExam_examiner_fkey" FOREIGN KEY ("examiner") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerioExam" ADD CONSTRAINT "PerioExam_revisionOf_fkey" FOREIGN KEY ("revisionOf") REFERENCES "PerioExam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerioExam" ADD CONSTRAINT "PerioExam_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerioExam" ADD CONSTRAINT "PerioExam_signedBy_fkey" FOREIGN KEY ("signedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerioSiteMeasurement" ADD CONSTRAINT "PerioSiteMeasurement_exam_fkey" FOREIGN KEY ("exam") REFERENCES "PerioExam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerioToothFinding" ADD CONSTRAINT "PerioToothFinding_exam_fkey" FOREIGN KEY ("exam") REFERENCES "PerioExam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_prescriber_fkey" FOREIGN KEY ("prescriber") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalsReading" ADD CONSTRAINT "VitalsReading_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalsReading" ADD CONSTRAINT "VitalsReading_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalsReading" ADD CONSTRAINT "VitalsReading_takenBy_fkey" FOREIGN KEY ("takenBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentAction" ADD CONSTRAINT "ConsentAction_record_fkey" FOREIGN KEY ("record") REFERENCES "ConsentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentAction" ADD CONSTRAINT "ConsentAction_by_fkey" FOREIGN KEY ("by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_templateVersion_fkey" FOREIGN KEY ("templateVersion") REFERENCES "FormTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_witness_fkey" FOREIGN KEY ("witness") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormRequest" ADD CONSTRAINT "FormRequest_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormRequest" ADD CONSTRAINT "FormRequest_template_fkey" FOREIGN KEY ("template") REFERENCES "FormTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormRequest" ADD CONSTRAINT "FormRequest_medicalHistoryForm_fkey" FOREIGN KEY ("medicalHistoryForm") REFERENCES "MedicalHistoryForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormRequest" ADD CONSTRAINT "FormRequest_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_request_fkey" FOREIGN KEY ("request") REFERENCES "FormRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormTemplateVersion" ADD CONSTRAINT "FormTemplateVersion_template_fkey" FOREIGN KEY ("template") REFERENCES "FormTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodFaithEstimate" ADD CONSTRAINT "GoodFaithEstimate_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodFaithEstimate" ADD CONSTRAINT "GoodFaithEstimate_planVersion_fkey" FOREIGN KEY ("planVersion") REFERENCES "TreatmentPlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanAcceptance" ADD CONSTRAINT "PlanAcceptance_planVersion_fkey" FOREIGN KEY ("planVersion") REFERENCES "TreatmentPlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanPresentation" ADD CONSTRAINT "PlanPresentation_planVersion_fkey" FOREIGN KEY ("planVersion") REFERENCES "TreatmentPlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanPresentation" ADD CONSTRAINT "PlanPresentation_presentedBy_fkey" FOREIGN KEY ("presentedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_currentVersion_fkey" FOREIGN KEY ("currentVersion") REFERENCES "TreatmentPlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_coordinator_fkey" FOREIGN KEY ("coordinator") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlanItem" ADD CONSTRAINT "TreatmentPlanItem_planVersion_fkey" FOREIGN KEY ("planVersion") REFERENCES "TreatmentPlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlanItem" ADD CONSTRAINT "TreatmentPlanItem_chartEntry_fkey" FOREIGN KEY ("chartEntry") REFERENCES "ChartEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlanVersion" ADD CONSTRAINT "TreatmentPlanVersion_plan_fkey" FOREIGN KEY ("plan") REFERENCES "TreatmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlanVersion" ADD CONSTRAINT "TreatmentPlanVersion_presentedBy_fkey" FOREIGN KEY ("presentedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InformedRefusal_items" ADD CONSTRAINT "_InformedRefusal_items_A_fkey" FOREIGN KEY ("A") REFERENCES "InformedRefusal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InformedRefusal_items" ADD CONSTRAINT "_InformedRefusal_items_B_fkey" FOREIGN KEY ("B") REFERENCES "TreatmentPlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlanAcceptance_selectedItems" ADD CONSTRAINT "_PlanAcceptance_selectedItems_A_fkey" FOREIGN KEY ("A") REFERENCES "PlanAcceptance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlanAcceptance_selectedItems" ADD CONSTRAINT "_PlanAcceptance_selectedItems_B_fkey" FOREIGN KEY ("B") REFERENCES "TreatmentPlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══ Compound uniques and indexes (features/keystone/prismaConstraints.ts) ═══
CREATE UNIQUE INDEX "ProcedureCode_system_code_from_key" ON "ProcedureCode"("codeSystem", "code", "effectiveFrom");
CREATE UNIQUE INDEX "ProcedureCodeCrosswalk_pair_key" ON "ProcedureCodeCrosswalk"("localCode", "targetCode");
CREATE UNIQUE INDEX "Fee_version_code_key" ON "Fee"("feeVersion", "code");
CREATE UNIQUE INDEX "PerioExam_patient_date_examiner_rev_key" ON "PerioExam"("patient", "examDate", "examiner", "revision");
CREATE UNIQUE INDEX "PerioSiteMeasurement_exam_tooth_site_key" ON "PerioSiteMeasurement"("exam", "tooth", "site");
CREATE UNIQUE INDEX "PerioToothFinding_exam_tooth_key" ON "PerioToothFinding"("exam", "tooth");
CREATE UNIQUE INDEX "TreatmentPlanVersion_plan_number_key" ON "TreatmentPlanVersion"("plan", "number");
CREATE UNIQUE INDEX "TreatmentPlanItem_version_entry_key" ON "TreatmentPlanItem"("planVersion", "chartEntry");
CREATE INDEX "ChartEntry_patient_status_idx" ON "ChartEntry"("patient", "status");
CREATE INDEX "ChartEntry_patient_tooth_idx" ON "ChartEntry"("patient", "tooth");
CREATE INDEX "ChartEntry_service_location_idx" ON "ChartEntry"("dateOfService", "location");
CREATE INDEX "ClinicalNote_patient_status_idx" ON "ClinicalNote"("patient", "status");

-- ═══ Partial uniques ═══
-- A procedure is charged exactly once (I-C2): one charge row per chart entry, whatever the application does.
CREATE UNIQUE INDEX "LedgerEntry_one_charge_per_entry" ON "LedgerEntry"("chartEntry") WHERE "kind" = 'charge' AND "chartEntry" IS NOT NULL;
-- One reversal per ledger entry.
CREATE UNIQUE INDEX "LedgerEntry_one_reversal" ON "LedgerEntry"("reverses") WHERE "kind" = 'reversal' AND "reverses" IS NOT NULL;
-- One active CDT (or other) import per code system.
CREATE UNIQUE INDEX "CodeImportBatch_one_active" ON "CodeImportBatch"("codeSystem") WHERE "status" = 'active';
CREATE UNIQUE INDEX "FeeSchedule_one_default" ON "FeeSchedule"("isDefault") WHERE "isDefault";
-- One current plan version number per plan is covered above; one open plan per title is not required.

-- ═══ CHECK constraints ═══
-- Perio bounds (I-C5). CAL is derived and never stored.
ALTER TABLE "PerioSiteMeasurement" ADD CONSTRAINT "PerioSiteMeasurement_pd_range" CHECK ("probingDepthMm" IS NULL OR "probingDepthMm" BETWEEN 0 AND 15);
ALTER TABLE "PerioSiteMeasurement" ADD CONSTRAINT "PerioSiteMeasurement_gm_range" CHECK ("gingivalMarginMm" IS NULL OR "gingivalMarginMm" BETWEEN -10 AND 15);
ALTER TABLE "PerioSiteMeasurement" ADD CONSTRAINT "PerioSiteMeasurement_site" CHECK ("site" IN ('MB','B','DB','ML','L','DL'));
ALTER TABLE "PerioToothFinding" ADD CONSTRAINT "PerioToothFinding_mobility_range" CHECK ("mobility" IS NULL OR "mobility" BETWEEN 0 AND 3);
-- Completed work carries its date, provider and frozen fee (SCHEMA §5.1).
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_completed_fields" CHECK ("status" NOT IN ('completed','posted') OR ("dateOfService" IS NOT NULL AND "provider" IS NOT NULL AND "feeMinor" IS NOT NULL));
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_units_positive" CHECK ("units" >= 1);
ALTER TABLE "ChartEntry" ADD CONSTRAINT "ChartEntry_fee_nonnegative" CHECK ("feeMinor" IS NULL OR "feeMinor" >= 0);
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_amount_nonnegative" CHECK ("amountMinor" >= 0 AND ("copayMinor" IS NULL OR "copayMinor" >= 0));
ALTER TABLE "TreatmentPlanItem" ADD CONSTRAINT "TreatmentPlanItem_fee_nonnegative" CHECK ("feeMinor" >= 0);
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_controlled_not_erx_unreceipted" CHECK (NOT ("isControlled" AND "status" IN ('transmitted','transmitted_pending') AND "mode" <> 'erx'));
-- Ledger sign by kind and reversals (SCHEMA §10.2).
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_sign_by_kind" CHECK (
  CASE "kind"
    WHEN 'charge' THEN "amountMinor" > 0
    WHEN 'finance_charge' THEN "amountMinor" > 0
    WHEN 'insurance_payment' THEN "amountMinor" < 0
    WHEN 'insurance_writeoff' THEN "amountMinor" < 0
    WHEN 'patient_payment' THEN "amountMinor" < 0
    WHEN 'refund' THEN "amountMinor" > 0
    ELSE TRUE
  END);
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_reversal_references" CHECK (("kind" = 'reversal') = ("reverses" IS NOT NULL));

-- ═══ Triggers ═══
-- Append-only: the ledger, plan acceptances and presentations, form submissions, consent records and history reviews.
CREATE TRIGGER "LedgerEntry_append_only" BEFORE UPDATE OR DELETE ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "PlanAcceptance_append_only" BEFORE UPDATE OR DELETE ON "PlanAcceptance" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "PlanPresentation_append_only" BEFORE UPDATE OR DELETE ON "PlanPresentation" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "FormSubmission_append_only" BEFORE UPDATE OR DELETE ON "FormSubmission" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "ConsentRecord_append_only" BEFORE UPDATE OR DELETE ON "ConsentRecord" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "ConsentAction_append_only" BEFORE UPDATE OR DELETE ON "ConsentAction" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "MedicalHistoryReview_append_only" BEFORE UPDATE OR DELETE ON "MedicalHistoryReview" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();

-- A signed note's content never changes (I-C3). Its status may move to entered_in_error, with a reason.
CREATE OR REPLACE FUNCTION dental_clinical_note_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'draft' THEN RAISE EXCEPTION 'A signed clinical note cannot be deleted' USING ERRCODE = 'check_violation'; END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" IN ('signed','entered_in_error') THEN
    IF NEW."body" IS DISTINCT FROM OLD."body" OR NEW."bodyHash" IS DISTINCT FROM OLD."bodyHash" OR NEW."title" IS DISTINCT FROM OLD."title"
       OR NEW."patient" IS DISTINCT FROM OLD."patient" OR NEW."author" IS DISTINCT FROM OLD."author" OR NEW."provider" IS DISTINCT FROM OLD."provider"
       OR NEW."signedAt" IS DISTINCT FROM OLD."signedAt" OR NEW."amends" IS DISTINCT FROM OLD."amends" OR NEW."appointment" IS DISTINCT FROM OLD."appointment"
       OR NEW."refersToAt" IS DISTINCT FROM OLD."refersToAt" OR NEW."isLateEntry" IS DISTINCT FROM OLD."isLateEntry" THEN
      RAISE EXCEPTION 'A signed clinical note cannot be changed; add an amendment' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (OLD."status" = 'signed' AND NEW."status" = 'entered_in_error' AND coalesce(NEW."errorReason", '') <> '') THEN
      RAISE EXCEPTION 'A signed clinical note can only be marked entered in error, with a reason' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW."status" = 'signed' AND (NEW."bodyHash" = '' OR NEW."signedAt" IS NULL) THEN
    RAISE EXCEPTION 'A signed clinical note needs its content hash and signing time' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ClinicalNote_signed_guard" BEFORE UPDATE OR DELETE ON "ClinicalNote" FOR EACH ROW EXECUTE FUNCTION dental_clinical_note_guard();
CREATE TRIGGER "ClinicalNote_signed_insert_guard" BEFORE INSERT ON "ClinicalNote" FOR EACH ROW EXECUTE FUNCTION dental_clinical_note_guard();

-- A completed perio exam is read-only; measurements change only while the exam is in progress (I-C5).
CREATE OR REPLACE FUNCTION dental_perio_exam_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'in_progress' THEN RAISE EXCEPTION 'A completed perio exam cannot be deleted' USING ERRCODE = 'check_violation'; END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" IN ('completed','revised') THEN
    IF NEW."examDate" IS DISTINCT FROM OLD."examDate" OR NEW."examiner" IS DISTINCT FROM OLD."examiner" OR NEW."patient" IS DISTINCT FROM OLD."patient"
       OR NEW."revision" IS DISTINCT FROM OLD."revision" OR NEW."signatureHash" IS DISTINCT FROM OLD."signatureHash" OR NEW."signedAt" IS DISTINCT FROM OLD."signedAt" THEN
      RAISE EXCEPTION 'A completed perio exam cannot be changed; record a revision' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (OLD."status" = 'completed' AND NEW."status" = 'revised') THEN
      RAISE EXCEPTION 'A completed perio exam can only become revised' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PerioExam_completed_guard" BEFORE UPDATE OR DELETE ON "PerioExam" FOR EACH ROW EXECUTE FUNCTION dental_perio_exam_guard();

CREATE OR REPLACE FUNCTION dental_perio_children_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE exam_id TEXT; exam_status TEXT;
BEGIN
  exam_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."exam" ELSE NEW."exam" END;
  SELECT "status" INTO exam_status FROM "PerioExam" WHERE "id" = exam_id;
  IF exam_status IS NOT NULL AND exam_status <> 'in_progress' THEN
    RAISE EXCEPTION 'Perio measurements are read-only once the exam is signed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER "PerioSiteMeasurement_exam_open" BEFORE INSERT OR UPDATE OR DELETE ON "PerioSiteMeasurement" FOR EACH ROW EXECUTE FUNCTION dental_perio_children_guard();
CREATE TRIGGER "PerioToothFinding_exam_open" BEFORE INSERT OR UPDATE OR DELETE ON "PerioToothFinding" FOR EACH ROW EXECUTE FUNCTION dental_perio_children_guard();

-- A presented plan version is frozen (I-T1): the version, and its items except the acceptance flags.
CREATE OR REPLACE FUNCTION dental_plan_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."frozenAt" IS NOT NULL THEN
    RAISE EXCEPTION 'A presented treatment plan version is frozen; create a new version' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "TreatmentPlanVersion_frozen" BEFORE UPDATE OR DELETE ON "TreatmentPlanVersion" FOR EACH ROW EXECUTE FUNCTION dental_plan_version_guard();

CREATE OR REPLACE FUNCTION dental_plan_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_id TEXT; frozen TIMESTAMP;
BEGIN
  version_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."planVersion" ELSE NEW."planVersion" END;
  SELECT "frozenAt" INTO frozen FROM "TreatmentPlanVersion" WHERE "id" = version_id;
  IF frozen IS NULL THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP = 'UPDATE' AND NEW."planVersion" = OLD."planVersion" AND NEW."chartEntry" IS NOT DISTINCT FROM OLD."chartEntry" AND NEW."feeMinor" = OLD."feeMinor"
     AND NEW."priority" = OLD."priority" AND NEW."phaseKey" = OLD."phaseKey" AND NEW."alternateGroup" = OLD."alternateGroup" AND NEW."sortOrder" = OLD."sortOrder" THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'The items of a presented treatment plan version are frozen' USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER "TreatmentPlanItem_frozen" BEFORE INSERT OR UPDATE OR DELETE ON "TreatmentPlanItem" FOR EACH ROW EXECUTE FUNCTION dental_plan_item_guard();

-- Published form and fee versions are frozen as well.
CREATE OR REPLACE FUNCTION dental_published_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'draft' THEN RAISE EXCEPTION '% is published and cannot be deleted', TG_TABLE_NAME USING ERRCODE = 'check_violation'; END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" <> 'draft' AND to_jsonb(NEW) - 'status' - 'updatedAt' - 'version' - 'publishedBy' - 'publishedAt' - 'effectiveTo' - 'approval'
     IS DISTINCT FROM to_jsonb(OLD) - 'status' - 'updatedAt' - 'version' - 'publishedBy' - 'publishedAt' - 'effectiveTo' - 'approval' THEN
    RAISE EXCEPTION '% is published; create a new version', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "FormTemplateVersion_published" BEFORE UPDATE OR DELETE ON "FormTemplateVersion" FOR EACH ROW EXECUTE FUNCTION dental_published_version_guard();
CREATE TRIGGER "FeeScheduleVersion_published" BEFORE UPDATE OR DELETE ON "FeeScheduleVersion" FOR EACH ROW EXECUTE FUNCTION dental_published_version_guard();

CREATE OR REPLACE FUNCTION dental_fee_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_id TEXT; version_status TEXT;
BEGIN
  version_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."feeVersion" ELSE NEW."feeVersion" END;
  SELECT "status" INTO version_status FROM "FeeScheduleVersion" WHERE "id" = version_id;
  IF version_status IS NOT NULL AND version_status <> 'draft' THEN
    RAISE EXCEPTION 'Fees of a published fee schedule version cannot change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER "Fee_version_draft" BEFORE INSERT OR UPDATE OR DELETE ON "Fee" FOR EACH ROW EXECUTE FUNCTION dental_fee_guard();

-- A posted procedure is locked (I-C2): only the move to corrected is allowed, and the priced facts never change.
CREATE OR REPLACE FUNCTION dental_chart_entry_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" IN ('completed','posted','corrected') THEN RAISE EXCEPTION 'A completed procedure cannot be deleted' USING ERRCODE = 'check_violation'; END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" IN ('completed','posted','corrected') AND OLD."kind" = 'procedure' THEN
    IF NEW."feeMinor" IS DISTINCT FROM OLD."feeMinor" OR NEW."dateOfService" IS DISTINCT FROM OLD."dateOfService" OR NEW."provider" IS DISTINCT FROM OLD."provider"
       OR NEW."code" IS DISTINCT FROM OLD."code" OR NEW."tooth" IS DISTINCT FROM OLD."tooth" OR NEW."surfaces" IS DISTINCT FROM OLD."surfaces"
       OR NEW."patient" IS DISTINCT FROM OLD."patient" OR NEW."location" IS DISTINCT FROM OLD."location" OR NEW."units" IS DISTINCT FROM OLD."units"
       OR NEW."feeScheduleVersion" IS DISTINCT FROM OLD."feeScheduleVersion" THEN
      RAISE EXCEPTION 'A completed procedure is locked; use a correction' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ChartEntry_completed_lock" BEFORE UPDATE OR DELETE ON "ChartEntry" FOR EACH ROW EXECUTE FUNCTION dental_chart_entry_guard();
