-- CreateTable
CREATE TABLE "AccountingOfDisclosure" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "disclosedOn" DATE,
    "recipient" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingOfDisclosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallRecord" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "location" TEXT,
    "direction" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "summary" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "dueOn" DATE,
    "repeatMonths" INTEGER,
    "owner" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "patient" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "sha256" TEXT NOT NULL DEFAULT '',
    "byteCount" INTEGER,
    "counts" JSONB DEFAULT '{}',
    "requestedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "fileName" TEXT NOT NULL DEFAULT '',
    "fileSha256" TEXT NOT NULL DEFAULT '',
    "location" TEXT,
    "rows" JSONB DEFAULT '{}',
    "preview" JSONB DEFAULT '{}',
    "reconciliation" JSONB DEFAULT '{}',
    "cursor" INTEGER DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'previewed',
    "approval" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRecordMap" (
    "id" TEXT NOT NULL,
    "batch" TEXT,
    "source" TEXT NOT NULL DEFAULT '',
    "entity" TEXT NOT NULL DEFAULT '',
    "externalId" TEXT NOT NULL DEFAULT '',
    "internalId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRecordMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentReport" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "discoveredAt" TIMESTAMP(3),
    "affectedCount" INTEGER DEFAULT 0,
    "riskAssessment" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'reported',
    "notifiedAt" TIMESTAMP(3),
    "reportedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lab" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "contactName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "turnaroundDays" INTEGER DEFAULT 10,
    "bufferDays" INTEGER DEFAULT 2,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabCase" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "patient" TEXT,
    "lab" TEXT,
    "location" TEXT,
    "seatAppointment" TEXT,
    "prescriber" TEXT,
    "remakeOf" TEXT,
    "workType" TEXT NOT NULL DEFAULT '',
    "tooth" TEXT NOT NULL DEFAULT '',
    "shade" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "files" JSONB DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "dueDate" DATE,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "lastChasedAt" TIMESTAMP(3),
    "qcNote" TEXT NOT NULL DEFAULT '',
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientRecall" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "type" TEXT,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled_due',
    "dueOn" DATE,
    "lastCompletedOn" DATE,
    "disabledReason" TEXT NOT NULL DEFAULT '',
    "lastOutreachPreparedAt" TIMESTAMP(3),
    "outreachCount" INTEGER DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientRecall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientRightsRequest" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "patient" TEXT,
    "kind" TEXT NOT NULL,
    "receivedOn" DATE,
    "dueOn" DATE,
    "status" TEXT NOT NULL DEFAULT 'open',
    "extendedOnce" BOOLEAN NOT NULL DEFAULT false,
    "resolution" TEXT NOT NULL DEFAULT '',
    "resolvedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientRightsRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdmpCheck" (
    "id" TEXT NOT NULL,
    "prescription" TEXT,
    "patient" TEXT,
    "checkedAt" TIMESTAMP(3),
    "checkedBy" TEXT,
    "result" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "evidenceDocument" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdmpCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecallRule" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "trigger" TEXT NOT NULL,
    "fromType" TEXT,
    "toType" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecallRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecallType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "intervalMonths" INTEGER NOT NULL,
    "ageMinYears" INTEGER DEFAULT 0,
    "ageMaxYears" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecallType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordHold" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "placedBy" TEXT,
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionDisposition" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "eligibleOn" DATE,
    "status" TEXT NOT NULL DEFAULT 'eligible',
    "approval" TEXT,
    "blockedReason" TEXT NOT NULL DEFAULT '',
    "executedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionDisposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL,
    "recordType" TEXT NOT NULL DEFAULT '',
    "years" INTEGER NOT NULL,
    "minorsUntilAge" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewReply" (
    "id" TEXT NOT NULL,
    "location" TEXT,
    "platform" TEXT NOT NULL,
    "reviewerName" TEXT NOT NULL DEFAULT '',
    "rating" INTEGER,
    "reviewText" TEXT NOT NULL DEFAULT '',
    "draft" TEXT NOT NULL DEFAULT '',
    "policyFindings" JSONB DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "approvedBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewRequest" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "location" TEXT,
    "appointment" TEXT,
    "channel" TEXT NOT NULL,
    "consentCheckedAt" TIMESTAMP(3),
    "consentGrant" TEXT,
    "copiedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'copied',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountingOfDisclosure_patient_idx" ON "AccountingOfDisclosure"("patient");

-- CreateIndex
CREATE INDEX "AccountingOfDisclosure_recordedBy_idx" ON "AccountingOfDisclosure"("recordedBy");

-- CreateIndex
CREATE INDEX "CallRecord_patient_idx" ON "CallRecord"("patient");

-- CreateIndex
CREATE INDEX "CallRecord_location_idx" ON "CallRecord"("location");

-- CreateIndex
CREATE INDEX "ComplianceTask_dueOn_idx" ON "ComplianceTask"("dueOn");

-- CreateIndex
CREATE INDEX "ComplianceTask_owner_idx" ON "ComplianceTask"("owner");

-- CreateIndex
CREATE INDEX "ComplianceTask_completedBy_idx" ON "ComplianceTask"("completedBy");

-- CreateIndex
CREATE UNIQUE INDEX "ExportJob_ref_key" ON "ExportJob"("ref");

-- CreateIndex
CREATE INDEX "ExportJob_patient_idx" ON "ExportJob"("patient");

-- CreateIndex
CREATE INDEX "ExportJob_requestedBy_idx" ON "ExportJob"("requestedBy");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_ref_key" ON "ImportBatch"("ref");

-- CreateIndex
CREATE INDEX "ImportBatch_location_idx" ON "ImportBatch"("location");

-- CreateIndex
CREATE INDEX "ImportBatch_approval_idx" ON "ImportBatch"("approval");

-- CreateIndex
CREATE INDEX "ImportBatch_createdBy_idx" ON "ImportBatch"("createdBy");

-- CreateIndex
CREATE INDEX "ImportRecordMap_batch_idx" ON "ImportRecordMap"("batch");

-- CreateIndex
CREATE INDEX "IncidentReport_reportedBy_idx" ON "IncidentReport"("reportedBy");

-- CreateIndex
CREATE UNIQUE INDEX "Lab_name_key" ON "Lab"("name");

-- CreateIndex
CREATE UNIQUE INDEX "LabCase_ref_key" ON "LabCase"("ref");

-- CreateIndex
CREATE INDEX "LabCase_patient_idx" ON "LabCase"("patient");

-- CreateIndex
CREATE INDEX "LabCase_lab_idx" ON "LabCase"("lab");

-- CreateIndex
CREATE INDEX "LabCase_location_idx" ON "LabCase"("location");

-- CreateIndex
CREATE INDEX "LabCase_seatAppointment_idx" ON "LabCase"("seatAppointment");

-- CreateIndex
CREATE INDEX "LabCase_prescriber_idx" ON "LabCase"("prescriber");

-- CreateIndex
CREATE INDEX "LabCase_remakeOf_idx" ON "LabCase"("remakeOf");

-- CreateIndex
CREATE INDEX "PatientRecall_patient_idx" ON "PatientRecall"("patient");

-- CreateIndex
CREATE INDEX "PatientRecall_type_idx" ON "PatientRecall"("type");

-- CreateIndex
CREATE INDEX "PatientRecall_location_idx" ON "PatientRecall"("location");

-- CreateIndex
CREATE INDEX "PatientRecall_dueOn_idx" ON "PatientRecall"("dueOn");

-- CreateIndex
CREATE UNIQUE INDEX "PatientRightsRequest_ref_key" ON "PatientRightsRequest"("ref");

-- CreateIndex
CREATE INDEX "PatientRightsRequest_patient_idx" ON "PatientRightsRequest"("patient");

-- CreateIndex
CREATE INDEX "PdmpCheck_prescription_idx" ON "PdmpCheck"("prescription");

-- CreateIndex
CREATE INDEX "PdmpCheck_patient_idx" ON "PdmpCheck"("patient");

-- CreateIndex
CREATE INDEX "PdmpCheck_checkedBy_idx" ON "PdmpCheck"("checkedBy");

-- CreateIndex
CREATE INDEX "PdmpCheck_evidenceDocument_idx" ON "PdmpCheck"("evidenceDocument");

-- CreateIndex
CREATE UNIQUE INDEX "RecallRule_key_key" ON "RecallRule"("key");

-- CreateIndex
CREATE INDEX "RecallRule_fromType_idx" ON "RecallRule"("fromType");

-- CreateIndex
CREATE INDEX "RecallRule_toType_idx" ON "RecallRule"("toType");

-- CreateIndex
CREATE UNIQUE INDEX "RecallType_key_key" ON "RecallType"("key");

-- CreateIndex
CREATE INDEX "RecordHold_patient_idx" ON "RecordHold"("patient");

-- CreateIndex
CREATE INDEX "RecordHold_placedBy_idx" ON "RecordHold"("placedBy");

-- CreateIndex
CREATE INDEX "RetentionDisposition_patient_idx" ON "RetentionDisposition"("patient");

-- CreateIndex
CREATE INDEX "RetentionDisposition_approval_idx" ON "RetentionDisposition"("approval");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPolicy_recordType_key" ON "RetentionPolicy"("recordType");

-- CreateIndex
CREATE INDEX "ReviewReply_location_idx" ON "ReviewReply"("location");

-- CreateIndex
CREATE INDEX "ReviewReply_approvedBy_idx" ON "ReviewReply"("approvedBy");

-- CreateIndex
CREATE INDEX "ReviewRequest_patient_idx" ON "ReviewRequest"("patient");

-- CreateIndex
CREATE INDEX "ReviewRequest_location_idx" ON "ReviewRequest"("location");

-- CreateIndex
CREATE INDEX "ReviewRequest_appointment_idx" ON "ReviewRequest"("appointment");

-- CreateIndex
CREATE INDEX "ReviewRequest_consentGrant_idx" ON "ReviewRequest"("consentGrant");

-- CreateIndex
CREATE INDEX "ReviewRequest_copiedBy_idx" ON "ReviewRequest"("copiedBy");

-- AddForeignKey
ALTER TABLE "AccountingOfDisclosure" ADD CONSTRAINT "AccountingOfDisclosure_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingOfDisclosure" ADD CONSTRAINT "AccountingOfDisclosure_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRecord" ADD CONSTRAINT "CallRecord_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRecord" ADD CONSTRAINT "CallRecord_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceTask" ADD CONSTRAINT "ComplianceTask_owner_fkey" FOREIGN KEY ("owner") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceTask" ADD CONSTRAINT "ComplianceTask_completedBy_fkey" FOREIGN KEY ("completedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRecordMap" ADD CONSTRAINT "ImportRecordMap_batch_fkey" FOREIGN KEY ("batch") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_reportedBy_fkey" FOREIGN KEY ("reportedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabCase" ADD CONSTRAINT "LabCase_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabCase" ADD CONSTRAINT "LabCase_lab_fkey" FOREIGN KEY ("lab") REFERENCES "Lab"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabCase" ADD CONSTRAINT "LabCase_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabCase" ADD CONSTRAINT "LabCase_seatAppointment_fkey" FOREIGN KEY ("seatAppointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabCase" ADD CONSTRAINT "LabCase_prescriber_fkey" FOREIGN KEY ("prescriber") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabCase" ADD CONSTRAINT "LabCase_remakeOf_fkey" FOREIGN KEY ("remakeOf") REFERENCES "LabCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientRecall" ADD CONSTRAINT "PatientRecall_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientRecall" ADD CONSTRAINT "PatientRecall_type_fkey" FOREIGN KEY ("type") REFERENCES "RecallType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientRecall" ADD CONSTRAINT "PatientRecall_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientRightsRequest" ADD CONSTRAINT "PatientRightsRequest_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdmpCheck" ADD CONSTRAINT "PdmpCheck_prescription_fkey" FOREIGN KEY ("prescription") REFERENCES "Prescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdmpCheck" ADD CONSTRAINT "PdmpCheck_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdmpCheck" ADD CONSTRAINT "PdmpCheck_checkedBy_fkey" FOREIGN KEY ("checkedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdmpCheck" ADD CONSTRAINT "PdmpCheck_evidenceDocument_fkey" FOREIGN KEY ("evidenceDocument") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecallRule" ADD CONSTRAINT "RecallRule_fromType_fkey" FOREIGN KEY ("fromType") REFERENCES "RecallType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecallRule" ADD CONSTRAINT "RecallRule_toType_fkey" FOREIGN KEY ("toType") REFERENCES "RecallType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordHold" ADD CONSTRAINT "RecordHold_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordHold" ADD CONSTRAINT "RecordHold_placedBy_fkey" FOREIGN KEY ("placedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionDisposition" ADD CONSTRAINT "RetentionDisposition_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionDisposition" ADD CONSTRAINT "RetentionDisposition_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReply" ADD CONSTRAINT "ReviewReply_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReply" ADD CONSTRAINT "ReviewReply_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_consentGrant_fkey" FOREIGN KEY ("consentGrant") REFERENCES "ConsentGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_copiedBy_fkey" FOREIGN KEY ("copiedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Hand-written guards (Phase 6)
CREATE UNIQUE INDEX "PatientRecall_patient_type_key" ON "PatientRecall"("patient", "type");
CREATE UNIQUE INDEX "ImportRecordMap_source_entity_externalId_key" ON "ImportRecordMap"("source", "entity", "externalId");
CREATE UNIQUE INDEX "ImportBatch_fileSha256_location_key" ON "ImportBatch"("fileSha256", "location");
CREATE UNIQUE INDEX "RecordHold_one_active_per_patient" ON "RecordHold"("patient") WHERE "status" = 'active';
ALTER TABLE "PatientRecall" ADD CONSTRAINT "PatientRecall_status" CHECK ("status" IN ('scheduled_due','due','overdue','scheduled','disabled'));
ALTER TABLE "LabCase" ADD CONSTRAINT "LabCase_status" CHECK ("status" IN ('draft','sent','in_production','shipped','received','qc_passed','seated','remake_requested','cancelled'));
ALTER TABLE "RetentionDisposition" ADD CONSTRAINT "RetentionDisposition_status" CHECK ("status" IN ('eligible','approval_requested','approved','executed','blocked'));
ALTER TABLE "PatientRightsRequest" ADD CONSTRAINT "PatientRightsRequest_due_after_received" CHECK ("dueOn" >= "receivedOn");

-- A disposition cannot be approved or executed while the patient has an active hold (the database backs the rule).
CREATE OR REPLACE FUNCTION dental_disposition_hold_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" IN ('approved','executed') AND EXISTS (SELECT 1 FROM "RecordHold" h WHERE h."patient" = NEW."patient" AND h."status" = 'active') THEN
    RAISE EXCEPTION 'A record under hold cannot be disposed of' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "RetentionDisposition_hold_guard" BEFORE INSERT OR UPDATE ON "RetentionDisposition" FOR EACH ROW EXECUTE FUNCTION dental_disposition_hold_guard();
