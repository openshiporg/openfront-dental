-- CreateTable
CREATE TABLE "ContactPoint" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "guarantor" TEXT,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "valueNormalized" TEXT NOT NULL DEFAULT '',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "primaryAddress" JSONB DEFAULT '{}',
    "notes" TEXT NOT NULL DEFAULT '',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guarantor" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "personName" JSONB DEFAULT '{}',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guarantor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuarantorLink" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "guarantor" TEXT,
    "relationship" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startsOn" DATE,
    "endsOn" DATE,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuarantorLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MergeCase" (
    "id" TEXT NOT NULL,
    "survivor" TEXT,
    "merged" TEXT,
    "evidence" JSONB DEFAULT '{}',
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "approval" TEXT,
    "proposedBy" TEXT,
    "appliedAt" TIMESTAMP(3),
    "revertibleUntil" TIMESTAMP(3),
    "revertedAt" TIMESTAMP(3),
    "mergedStatusBefore" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MergeCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MergeMap" (
    "id" TEXT NOT NULL,
    "mergeCase" TEXT,
    "listKey" TEXT NOT NULL DEFAULT '',
    "rowId" TEXT NOT NULL DEFAULT '',
    "field" TEXT NOT NULL DEFAULT '',
    "fromId" TEXT NOT NULL DEFAULT '',
    "toId" TEXT NOT NULL DEFAULT '',
    "seq" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MergeMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "chartNumber" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'prospect',
    "mergedInto" TEXT,
    "firstName" TEXT NOT NULL DEFAULT '',
    "middleName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "preferredName" TEXT NOT NULL DEFAULT '',
    "suffix" TEXT NOT NULL DEFAULT '',
    "dateOfBirth" DATE NOT NULL,
    "sexAssignedAtBirth" TEXT NOT NULL,
    "genderIdentity" TEXT NOT NULL DEFAULT '',
    "pronouns" TEXT NOT NULL DEFAULT '',
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "address" JSONB DEFAULT '{}',
    "family" TEXT,
    "primaryProvider" TEXT,
    "primaryHygienist" TEXT,
    "homeLocation" TEXT,
    "referralSource" TEXT,
    "referredBy" TEXT NOT NULL DEFAULT '',
    "firstVisitOn" DATE,
    "lastVisitOn" DATE,
    "dateOfDeath" DATE,
    "statementHold" BOOLEAN NOT NULL DEFAULT false,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientAlert" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "activeFrom" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "recordedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientIdentifier" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "system" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'out',
    "toFrom" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "letter" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'marketing',
    "providerContact" JSONB DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "patient" TEXT,
    "location" TEXT,
    "operatory" TEXT,
    "type" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "localDate" DATE,
    "bufferAfterMinutes" INTEGER DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "confirmedAt" TIMESTAMP(3),
    "confirmationMethod" TEXT NOT NULL DEFAULT '',
    "arrivedAt" TIMESTAMP(3),
    "seatedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "brokenKind" TEXT NOT NULL DEFAULT '',
    "rescheduledTo" TEXT,
    "primaryProvider" TEXT,
    "supervisingDentist" TEXT,
    "alertAckBy" TEXT,
    "alertAckAt" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "warnings" JSONB DEFAULT '[]',
    "source" TEXT NOT NULL,
    "bookedViaHold" TEXT,
    "proposal" TEXT,
    "bookedBy" TEXT,
    "productionScheduledMinor" BIGINT NOT NULL DEFAULT 0,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentSegment" (
    "id" TEXT NOT NULL,
    "appointment" TEXT,
    "role" TEXT NOT NULL,
    "provider" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "concurrencyKind" TEXT NOT NULL,
    "overrideReason" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'other',
    "defaultPattern" JSONB DEFAULT '[{"role":"provider","units":6}]',
    "defaultDurationUnits" INTEGER NOT NULL DEFAULT 6,
    "onlineBookable" BOOLEAN NOT NULL DEFAULT false,
    "newPatientOnly" BOOLEAN NOT NULL DEFAULT false,
    "requiresDentistOnSite" BOOLEAN NOT NULL DEFAULT false,
    "requiresMedicalHistoryReview" BOOLEAN NOT NULL DEFAULT true,
    "defaultProductionMinor" BIGINT NOT NULL DEFAULT 0,
    "publicName" TEXT NOT NULL DEFAULT '',
    "colour" TEXT NOT NULL DEFAULT '#64748b',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsapEntry" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "location" TEXT,
    "appointmentType" TEXT,
    "provider" TEXT,
    "preferredWindows" JSONB DEFAULT '[]',
    "earliestDate" DATE,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "priority" INTEGER DEFAULT 0,
    "bookedAppointment" TEXT,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsapEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingHold" (
    "id" TEXT NOT NULL,
    "location" TEXT,
    "operatory" TEXT,
    "provider" TEXT,
    "type" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "segments" JSONB DEFAULT '[]',
    "holderKind" TEXT NOT NULL,
    "holderRef" TEXT NOT NULL DEFAULT '',
    "patient" TEXT,
    "asapEntry" TEXT,
    "status" TEXT NOT NULL DEFAULT 'held',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "convertedTo" TEXT,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokenAppointmentEvent" (
    "id" TEXT NOT NULL,
    "appointment" TEXT,
    "patient" TEXT,
    "kind" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "recordedBy" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokenAppointmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClosureDay" (
    "id" TEXT NOT NULL,
    "location" TEXT,
    "date" DATE NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "isHalfDay" BOOLEAN NOT NULL DEFAULT false,
    "startLocal" TEXT NOT NULL DEFAULT '',
    "endLocal" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClosureDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfirmationAttempt" (
    "id" TEXT NOT NULL,
    "appointment" TEXT,
    "channel" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "contactPoint" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "suppressedReason" TEXT NOT NULL DEFAULT '',
    "attemptedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfirmationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operatory" (
    "id" TEXT NOT NULL,
    "location" TEXT,
    "code" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'doctor',
    "equipmentTags" JSONB DEFAULT '[]',
    "sortOrder" INTEGER DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Operatory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionGoal" (
    "id" TEXT NOT NULL,
    "provider" TEXT,
    "location" TEXT,
    "weekday" INTEGER,
    "date" DATE,
    "goalMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleTemplate" (
    "id" TEXT NOT NULL,
    "location" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateBlock" (
    "id" TEXT NOT NULL,
    "template" TEXT,
    "weekday" INTEGER NOT NULL,
    "operatory" TEXT,
    "provider" TEXT,
    "startLocal" TEXT NOT NULL DEFAULT '',
    "endLocal" TEXT NOT NULL DEFAULT '',
    "label" TEXT NOT NULL DEFAULT '',
    "onlineBookable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentGrant" (
    "id" TEXT NOT NULL,
    "contactPoint" TEXT,
    "channel" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'granted',
    "source" TEXT NOT NULL,
    "evidence" JSONB DEFAULT '{}',
    "recordedBy" TEXT,
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT NOT NULL DEFAULT '',
    "needsReconfirmation" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "patient" TEXT,
    "contactPoint" TEXT,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "aiDisclosureAt" TIMESTAMP(3),
    "agent" TEXT,
    "assignedTo" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversation" TEXT,
    "direction" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "template" TEXT,
    "toAddress" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "suppressedReason" TEXT NOT NULL DEFAULT '',
    "adapterKey" TEXT NOT NULL DEFAULT '',
    "adapterMode" TEXT NOT NULL DEFAULT '',
    "providerMessageId" TEXT NOT NULL DEFAULT '',
    "proposal" TEXT,
    "sentAt" TIMESTAMP(3),
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "channel" TEXT NOT NULL DEFAULT 'email',
    "purpose" TEXT NOT NULL DEFAULT 'appointment_reminders',
    "phiLevel" TEXT NOT NULL DEFAULT 'minimal',
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "templateVersion" INTEGER DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeSession" (
    "id" TEXT NOT NULL,
    "portalAccount" TEXT,
    "publicBookingRequest" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "dueOn" DATE,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnlineBookingPolicy" (
    "id" TEXT NOT NULL,
    "location" TEXT,
    "newPatientAllowed" BOOLEAN NOT NULL DEFAULT true,
    "leadTimeHours" INTEGER NOT NULL DEFAULT 4,
    "horizonDays" INTEGER NOT NULL DEFAULT 60,
    "holdMinutes" INTEGER NOT NULL DEFAULT 10,
    "requireCardOnFile" BOOLEAN NOT NULL DEFAULT false,
    "depositMinor" BIGINT NOT NULL DEFAULT 0,
    "requireInsuranceCapture" BOOLEAN NOT NULL DEFAULT false,
    "rateLimit" JSONB DEFAULT '{"perClientPerHour":30,"perContactPerDay":5,"globalPerMinute":120}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnlineBookingPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'invited',
    "verifiedContact" TEXT,
    "identityVerifiedAt" TIMESTAMP(3),
    "invitedBy" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "codeHash" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "codeFailures" INTEGER DEFAULT 0,
    "authVersion" INTEGER DEFAULT 1,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalScope" (
    "id" TEXT NOT NULL,
    "account" TEXT,
    "patient" TEXT,
    "relationship" TEXT NOT NULL,
    "capabilities" JSONB DEFAULT '["appointments","preferences"]',
    "confidentialItemsHidden" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "grantedBy" TEXT,
    "expiresAt" TIMESTAMP(3),
    "validUntilMajority" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicBookingRequest" (
    "id" TEXT NOT NULL,
    "site" TEXT,
    "location" TEXT,
    "publicRef" TEXT NOT NULL DEFAULT '',
    "hold" TEXT,
    "contact" JSONB DEFAULT '{}',
    "patientMatch" TEXT,
    "matchStatus" TEXT NOT NULL,
    "matchEvidence" JSONB DEFAULT '{}',
    "intake" JSONB DEFAULT '{}',
    "insuranceCapture" JSONB DEFAULT '{}',
    "appointment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "ipHash" TEXT NOT NULL DEFAULT '',
    "userAgentHash" TEXT NOT NULL DEFAULT '',
    "captchaScore" TEXT NOT NULL DEFAULT '',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicBookingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontSite" (
    "id" TEXT NOT NULL,
    "location" TEXT,
    "slug" TEXT NOT NULL DEFAULT '',
    "headline" TEXT NOT NULL DEFAULT '',
    "about" TEXT NOT NULL DEFAULT '',
    "services" JSONB DEFAULT '[]',
    "seo" JSONB DEFAULT '{}',
    "brand" JSONB DEFAULT '{}',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorefrontSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_StorefrontSite_providersShown" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_TemplateBlock_allowedTypes" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_OnlineBookingPolicy_appointmentTypes" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "ContactPoint_patient_idx" ON "ContactPoint"("patient");

-- CreateIndex
CREATE INDEX "ContactPoint_guarantor_idx" ON "ContactPoint"("guarantor");

-- CreateIndex
CREATE INDEX "ContactPoint_valueNormalized_idx" ON "ContactPoint"("valueNormalized");

-- CreateIndex
CREATE INDEX "Guarantor_patient_idx" ON "Guarantor"("patient");

-- CreateIndex
CREATE INDEX "GuarantorLink_patient_idx" ON "GuarantorLink"("patient");

-- CreateIndex
CREATE INDEX "GuarantorLink_guarantor_idx" ON "GuarantorLink"("guarantor");

-- CreateIndex
CREATE INDEX "MergeCase_survivor_idx" ON "MergeCase"("survivor");

-- CreateIndex
CREATE INDEX "MergeCase_merged_idx" ON "MergeCase"("merged");

-- CreateIndex
CREATE INDEX "MergeCase_approval_idx" ON "MergeCase"("approval");

-- CreateIndex
CREATE INDEX "MergeCase_proposedBy_idx" ON "MergeCase"("proposedBy");

-- CreateIndex
CREATE INDEX "MergeMap_mergeCase_idx" ON "MergeMap"("mergeCase");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_chartNumber_key" ON "Patient"("chartNumber");

-- CreateIndex
CREATE INDEX "Patient_mergedInto_idx" ON "Patient"("mergedInto");

-- CreateIndex
CREATE INDEX "Patient_family_idx" ON "Patient"("family");

-- CreateIndex
CREATE INDEX "Patient_primaryProvider_idx" ON "Patient"("primaryProvider");

-- CreateIndex
CREATE INDEX "Patient_primaryHygienist_idx" ON "Patient"("primaryHygienist");

-- CreateIndex
CREATE INDEX "Patient_homeLocation_idx" ON "Patient"("homeLocation");

-- CreateIndex
CREATE INDEX "Patient_referralSource_idx" ON "Patient"("referralSource");

-- CreateIndex
CREATE INDEX "Patient_name_dob_idx" ON "Patient"("lastName", "firstName", "dateOfBirth");

-- CreateIndex
CREATE INDEX "PatientAlert_patient_idx" ON "PatientAlert"("patient");

-- CreateIndex
CREATE INDEX "PatientAlert_recordedBy_idx" ON "PatientAlert"("recordedBy");

-- CreateIndex
CREATE INDEX "PatientIdentifier_patient_idx" ON "PatientIdentifier"("patient");

-- CreateIndex
CREATE UNIQUE INDEX "PatientIdentifier_system_value_key" ON "PatientIdentifier"("system", "value");

-- CreateIndex
CREATE INDEX "Referral_patient_idx" ON "Referral"("patient");

-- CreateIndex
CREATE INDEX "Referral_toFrom_idx" ON "Referral"("toFrom");

-- CreateIndex
CREATE INDEX "Referral_letter_idx" ON "Referral"("letter");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralSource_name_key" ON "ReferralSource"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_ref_key" ON "Appointment"("ref");

-- CreateIndex
CREATE INDEX "Appointment_patient_idx" ON "Appointment"("patient");

-- CreateIndex
CREATE INDEX "Appointment_location_idx" ON "Appointment"("location");

-- CreateIndex
CREATE INDEX "Appointment_operatory_idx" ON "Appointment"("operatory");

-- CreateIndex
CREATE INDEX "Appointment_type_idx" ON "Appointment"("type");

-- CreateIndex
CREATE INDEX "Appointment_localDate_idx" ON "Appointment"("localDate");

-- CreateIndex
CREATE INDEX "Appointment_rescheduledTo_idx" ON "Appointment"("rescheduledTo");

-- CreateIndex
CREATE INDEX "Appointment_primaryProvider_idx" ON "Appointment"("primaryProvider");

-- CreateIndex
CREATE INDEX "Appointment_supervisingDentist_idx" ON "Appointment"("supervisingDentist");

-- CreateIndex
CREATE INDEX "Appointment_alertAckBy_idx" ON "Appointment"("alertAckBy");

-- CreateIndex
CREATE INDEX "Appointment_bookedViaHold_idx" ON "Appointment"("bookedViaHold");

-- CreateIndex
CREATE INDEX "Appointment_proposal_idx" ON "Appointment"("proposal");

-- CreateIndex
CREATE INDEX "Appointment_bookedBy_idx" ON "Appointment"("bookedBy");

-- CreateIndex
CREATE INDEX "Appointment_location_day_status_idx" ON "Appointment"("location", "localDate", "status");

-- CreateIndex
CREATE INDEX "Appointment_operatory_start_idx" ON "Appointment"("operatory", "startsAt");

-- CreateIndex
CREATE INDEX "AppointmentSegment_appointment_idx" ON "AppointmentSegment"("appointment");

-- CreateIndex
CREATE INDEX "AppointmentSegment_provider_idx" ON "AppointmentSegment"("provider");

-- CreateIndex
CREATE INDEX "AppointmentSegment_provider_start_idx" ON "AppointmentSegment"("provider", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentType_code_key" ON "AppointmentType"("code");

-- CreateIndex
CREATE INDEX "AsapEntry_patient_idx" ON "AsapEntry"("patient");

-- CreateIndex
CREATE INDEX "AsapEntry_location_idx" ON "AsapEntry"("location");

-- CreateIndex
CREATE INDEX "AsapEntry_appointmentType_idx" ON "AsapEntry"("appointmentType");

-- CreateIndex
CREATE INDEX "AsapEntry_provider_idx" ON "AsapEntry"("provider");

-- CreateIndex
CREATE INDEX "AsapEntry_bookedAppointment_idx" ON "AsapEntry"("bookedAppointment");

-- CreateIndex
CREATE INDEX "BookingHold_location_idx" ON "BookingHold"("location");

-- CreateIndex
CREATE INDEX "BookingHold_operatory_idx" ON "BookingHold"("operatory");

-- CreateIndex
CREATE INDEX "BookingHold_provider_idx" ON "BookingHold"("provider");

-- CreateIndex
CREATE INDEX "BookingHold_type_idx" ON "BookingHold"("type");

-- CreateIndex
CREATE INDEX "BookingHold_holderRef_idx" ON "BookingHold"("holderRef");

-- CreateIndex
CREATE INDEX "BookingHold_patient_idx" ON "BookingHold"("patient");

-- CreateIndex
CREATE INDEX "BookingHold_asapEntry_idx" ON "BookingHold"("asapEntry");

-- CreateIndex
CREATE INDEX "BookingHold_expiresAt_idx" ON "BookingHold"("expiresAt");

-- CreateIndex
CREATE INDEX "BookingHold_convertedTo_idx" ON "BookingHold"("convertedTo");

-- CreateIndex
CREATE INDEX "BookingHold_status_expiry_idx" ON "BookingHold"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "BrokenAppointmentEvent_appointment_idx" ON "BrokenAppointmentEvent"("appointment");

-- CreateIndex
CREATE INDEX "BrokenAppointmentEvent_patient_idx" ON "BrokenAppointmentEvent"("patient");

-- CreateIndex
CREATE INDEX "BrokenAppointmentEvent_recordedBy_idx" ON "BrokenAppointmentEvent"("recordedBy");

-- CreateIndex
CREATE INDEX "ClosureDay_location_idx" ON "ClosureDay"("location");

-- CreateIndex
CREATE INDEX "ConfirmationAttempt_appointment_idx" ON "ConfirmationAttempt"("appointment");

-- CreateIndex
CREATE INDEX "ConfirmationAttempt_scheduledFor_idx" ON "ConfirmationAttempt"("scheduledFor");

-- CreateIndex
CREATE INDEX "ConfirmationAttempt_contactPoint_idx" ON "ConfirmationAttempt"("contactPoint");

-- CreateIndex
CREATE INDEX "ConfirmationAttempt_message_idx" ON "ConfirmationAttempt"("message");

-- CreateIndex
CREATE INDEX "ConfirmationAttempt_status_due_idx" ON "ConfirmationAttempt"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "Operatory_location_idx" ON "Operatory"("location");

-- CreateIndex
CREATE UNIQUE INDEX "Operatory_location_code_key" ON "Operatory"("location", "code");

-- CreateIndex
CREATE INDEX "ProductionGoal_provider_idx" ON "ProductionGoal"("provider");

-- CreateIndex
CREATE INDEX "ProductionGoal_location_idx" ON "ProductionGoal"("location");

-- CreateIndex
CREATE INDEX "ScheduleTemplate_location_idx" ON "ScheduleTemplate"("location");

-- CreateIndex
CREATE INDEX "ScheduleTemplate_publishedBy_idx" ON "ScheduleTemplate"("publishedBy");

-- CreateIndex
CREATE INDEX "TemplateBlock_template_idx" ON "TemplateBlock"("template");

-- CreateIndex
CREATE INDEX "TemplateBlock_operatory_idx" ON "TemplateBlock"("operatory");

-- CreateIndex
CREATE INDEX "TemplateBlock_provider_idx" ON "TemplateBlock"("provider");

-- CreateIndex
CREATE INDEX "ConsentGrant_contactPoint_idx" ON "ConsentGrant"("contactPoint");

-- CreateIndex
CREATE INDEX "ConsentGrant_recordedBy_idx" ON "ConsentGrant"("recordedBy");

-- CreateIndex
CREATE INDEX "Conversation_patient_idx" ON "Conversation"("patient");

-- CreateIndex
CREATE INDEX "Conversation_contactPoint_idx" ON "Conversation"("contactPoint");

-- CreateIndex
CREATE INDEX "Conversation_agent_idx" ON "Conversation"("agent");

-- CreateIndex
CREATE INDEX "Conversation_assignedTo_idx" ON "Conversation"("assignedTo");

-- CreateIndex
CREATE INDEX "Message_conversation_idx" ON "Message"("conversation");

-- CreateIndex
CREATE INDEX "Message_template_idx" ON "Message"("template");

-- CreateIndex
CREATE INDEX "Message_providerMessageId_idx" ON "Message"("providerMessageId");

-- CreateIndex
CREATE INDEX "Message_proposal_idx" ON "Message"("proposal");

-- CreateIndex
CREATE INDEX "Message_conversation_created_idx" ON "Message"("conversation", "createdAt");

-- CreateIndex
CREATE INDEX "IntakeSession_portalAccount_idx" ON "IntakeSession"("portalAccount");

-- CreateIndex
CREATE INDEX "IntakeSession_publicBookingRequest_idx" ON "IntakeSession"("publicBookingRequest");

-- CreateIndex
CREATE INDEX "OnlineBookingPolicy_location_idx" ON "OnlineBookingPolicy"("location");

-- CreateIndex
CREATE UNIQUE INDEX "PortalAccount_email_key" ON "PortalAccount"("email");

-- CreateIndex
CREATE INDEX "PortalAccount_verifiedContact_idx" ON "PortalAccount"("verifiedContact");

-- CreateIndex
CREATE INDEX "PortalAccount_invitedBy_idx" ON "PortalAccount"("invitedBy");

-- CreateIndex
CREATE INDEX "PortalScope_account_idx" ON "PortalScope"("account");

-- CreateIndex
CREATE INDEX "PortalScope_patient_idx" ON "PortalScope"("patient");

-- CreateIndex
CREATE INDEX "PortalScope_grantedBy_idx" ON "PortalScope"("grantedBy");

-- CreateIndex
CREATE UNIQUE INDEX "PublicBookingRequest_publicRef_key" ON "PublicBookingRequest"("publicRef");

-- CreateIndex
CREATE INDEX "PublicBookingRequest_site_idx" ON "PublicBookingRequest"("site");

-- CreateIndex
CREATE INDEX "PublicBookingRequest_location_idx" ON "PublicBookingRequest"("location");

-- CreateIndex
CREATE INDEX "PublicBookingRequest_hold_idx" ON "PublicBookingRequest"("hold");

-- CreateIndex
CREATE INDEX "PublicBookingRequest_patientMatch_idx" ON "PublicBookingRequest"("patientMatch");

-- CreateIndex
CREATE INDEX "PublicBookingRequest_appointment_idx" ON "PublicBookingRequest"("appointment");

-- CreateIndex
CREATE INDEX "PublicBookingRequest_reviewedBy_idx" ON "PublicBookingRequest"("reviewedBy");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontSite_slug_key" ON "StorefrontSite"("slug");

-- CreateIndex
CREATE INDEX "StorefrontSite_location_idx" ON "StorefrontSite"("location");

-- CreateIndex
CREATE UNIQUE INDEX "_StorefrontSite_providersShown_AB_unique" ON "_StorefrontSite_providersShown"("A", "B");

-- CreateIndex
CREATE INDEX "_StorefrontSite_providersShown_B_index" ON "_StorefrontSite_providersShown"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_TemplateBlock_allowedTypes_AB_unique" ON "_TemplateBlock_allowedTypes"("A", "B");

-- CreateIndex
CREATE INDEX "_TemplateBlock_allowedTypes_B_index" ON "_TemplateBlock_allowedTypes"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_OnlineBookingPolicy_appointmentTypes_AB_unique" ON "_OnlineBookingPolicy_appointmentTypes"("A", "B");

-- CreateIndex
CREATE INDEX "_OnlineBookingPolicy_appointmentTypes_B_index" ON "_OnlineBookingPolicy_appointmentTypes"("B");

-- AddForeignKey
ALTER TABLE "ContactPoint" ADD CONSTRAINT "ContactPoint_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactPoint" ADD CONSTRAINT "ContactPoint_guarantor_fkey" FOREIGN KEY ("guarantor") REFERENCES "Guarantor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guarantor" ADD CONSTRAINT "Guarantor_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuarantorLink" ADD CONSTRAINT "GuarantorLink_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuarantorLink" ADD CONSTRAINT "GuarantorLink_guarantor_fkey" FOREIGN KEY ("guarantor") REFERENCES "Guarantor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeCase" ADD CONSTRAINT "MergeCase_survivor_fkey" FOREIGN KEY ("survivor") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeCase" ADD CONSTRAINT "MergeCase_merged_fkey" FOREIGN KEY ("merged") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeCase" ADD CONSTRAINT "MergeCase_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeCase" ADD CONSTRAINT "MergeCase_proposedBy_fkey" FOREIGN KEY ("proposedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeMap" ADD CONSTRAINT "MergeMap_mergeCase_fkey" FOREIGN KEY ("mergeCase") REFERENCES "MergeCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_mergedInto_fkey" FOREIGN KEY ("mergedInto") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_family_fkey" FOREIGN KEY ("family") REFERENCES "FamilyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_primaryProvider_fkey" FOREIGN KEY ("primaryProvider") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_primaryHygienist_fkey" FOREIGN KEY ("primaryHygienist") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_homeLocation_fkey" FOREIGN KEY ("homeLocation") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_referralSource_fkey" FOREIGN KEY ("referralSource") REFERENCES "ReferralSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAlert" ADD CONSTRAINT "PatientAlert_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAlert" ADD CONSTRAINT "PatientAlert_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientIdentifier" ADD CONSTRAINT "PatientIdentifier_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_toFrom_fkey" FOREIGN KEY ("toFrom") REFERENCES "ReferralSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_letter_fkey" FOREIGN KEY ("letter") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_operatory_fkey" FOREIGN KEY ("operatory") REFERENCES "Operatory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_type_fkey" FOREIGN KEY ("type") REFERENCES "AppointmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_rescheduledTo_fkey" FOREIGN KEY ("rescheduledTo") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_primaryProvider_fkey" FOREIGN KEY ("primaryProvider") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_supervisingDentist_fkey" FOREIGN KEY ("supervisingDentist") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_alertAckBy_fkey" FOREIGN KEY ("alertAckBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_bookedViaHold_fkey" FOREIGN KEY ("bookedViaHold") REFERENCES "BookingHold"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_proposal_fkey" FOREIGN KEY ("proposal") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_bookedBy_fkey" FOREIGN KEY ("bookedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentSegment" ADD CONSTRAINT "AppointmentSegment_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentSegment" ADD CONSTRAINT "AppointmentSegment_provider_fkey" FOREIGN KEY ("provider") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsapEntry" ADD CONSTRAINT "AsapEntry_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsapEntry" ADD CONSTRAINT "AsapEntry_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsapEntry" ADD CONSTRAINT "AsapEntry_appointmentType_fkey" FOREIGN KEY ("appointmentType") REFERENCES "AppointmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsapEntry" ADD CONSTRAINT "AsapEntry_provider_fkey" FOREIGN KEY ("provider") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsapEntry" ADD CONSTRAINT "AsapEntry_bookedAppointment_fkey" FOREIGN KEY ("bookedAppointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingHold" ADD CONSTRAINT "BookingHold_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingHold" ADD CONSTRAINT "BookingHold_operatory_fkey" FOREIGN KEY ("operatory") REFERENCES "Operatory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingHold" ADD CONSTRAINT "BookingHold_provider_fkey" FOREIGN KEY ("provider") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingHold" ADD CONSTRAINT "BookingHold_type_fkey" FOREIGN KEY ("type") REFERENCES "AppointmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingHold" ADD CONSTRAINT "BookingHold_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingHold" ADD CONSTRAINT "BookingHold_asapEntry_fkey" FOREIGN KEY ("asapEntry") REFERENCES "AsapEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingHold" ADD CONSTRAINT "BookingHold_convertedTo_fkey" FOREIGN KEY ("convertedTo") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokenAppointmentEvent" ADD CONSTRAINT "BrokenAppointmentEvent_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokenAppointmentEvent" ADD CONSTRAINT "BrokenAppointmentEvent_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokenAppointmentEvent" ADD CONSTRAINT "BrokenAppointmentEvent_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosureDay" ADD CONSTRAINT "ClosureDay_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmationAttempt" ADD CONSTRAINT "ConfirmationAttempt_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmationAttempt" ADD CONSTRAINT "ConfirmationAttempt_contactPoint_fkey" FOREIGN KEY ("contactPoint") REFERENCES "ContactPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmationAttempt" ADD CONSTRAINT "ConfirmationAttempt_message_fkey" FOREIGN KEY ("message") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operatory" ADD CONSTRAINT "Operatory_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionGoal" ADD CONSTRAINT "ProductionGoal_provider_fkey" FOREIGN KEY ("provider") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionGoal" ADD CONSTRAINT "ProductionGoal_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleTemplate" ADD CONSTRAINT "ScheduleTemplate_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleTemplate" ADD CONSTRAINT "ScheduleTemplate_publishedBy_fkey" FOREIGN KEY ("publishedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateBlock" ADD CONSTRAINT "TemplateBlock_template_fkey" FOREIGN KEY ("template") REFERENCES "ScheduleTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateBlock" ADD CONSTRAINT "TemplateBlock_operatory_fkey" FOREIGN KEY ("operatory") REFERENCES "Operatory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateBlock" ADD CONSTRAINT "TemplateBlock_provider_fkey" FOREIGN KEY ("provider") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentGrant" ADD CONSTRAINT "ConsentGrant_contactPoint_fkey" FOREIGN KEY ("contactPoint") REFERENCES "ContactPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentGrant" ADD CONSTRAINT "ConsentGrant_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contactPoint_fkey" FOREIGN KEY ("contactPoint") REFERENCES "ContactPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_agent_fkey" FOREIGN KEY ("agent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversation_fkey" FOREIGN KEY ("conversation") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_template_fkey" FOREIGN KEY ("template") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_proposal_fkey" FOREIGN KEY ("proposal") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeSession" ADD CONSTRAINT "IntakeSession_portalAccount_fkey" FOREIGN KEY ("portalAccount") REFERENCES "PortalAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeSession" ADD CONSTRAINT "IntakeSession_publicBookingRequest_fkey" FOREIGN KEY ("publicBookingRequest") REFERENCES "PublicBookingRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineBookingPolicy" ADD CONSTRAINT "OnlineBookingPolicy_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAccount" ADD CONSTRAINT "PortalAccount_verifiedContact_fkey" FOREIGN KEY ("verifiedContact") REFERENCES "ContactPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAccount" ADD CONSTRAINT "PortalAccount_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalScope" ADD CONSTRAINT "PortalScope_account_fkey" FOREIGN KEY ("account") REFERENCES "PortalAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalScope" ADD CONSTRAINT "PortalScope_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalScope" ADD CONSTRAINT "PortalScope_grantedBy_fkey" FOREIGN KEY ("grantedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicBookingRequest" ADD CONSTRAINT "PublicBookingRequest_site_fkey" FOREIGN KEY ("site") REFERENCES "StorefrontSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicBookingRequest" ADD CONSTRAINT "PublicBookingRequest_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicBookingRequest" ADD CONSTRAINT "PublicBookingRequest_hold_fkey" FOREIGN KEY ("hold") REFERENCES "BookingHold"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicBookingRequest" ADD CONSTRAINT "PublicBookingRequest_patientMatch_fkey" FOREIGN KEY ("patientMatch") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicBookingRequest" ADD CONSTRAINT "PublicBookingRequest_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicBookingRequest" ADD CONSTRAINT "PublicBookingRequest_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontSite" ADD CONSTRAINT "StorefrontSite_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StorefrontSite_providersShown" ADD CONSTRAINT "_StorefrontSite_providersShown_A_fkey" FOREIGN KEY ("A") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StorefrontSite_providersShown" ADD CONSTRAINT "_StorefrontSite_providersShown_B_fkey" FOREIGN KEY ("B") REFERENCES "StorefrontSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TemplateBlock_allowedTypes" ADD CONSTRAINT "_TemplateBlock_allowedTypes_A_fkey" FOREIGN KEY ("A") REFERENCES "AppointmentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TemplateBlock_allowedTypes" ADD CONSTRAINT "_TemplateBlock_allowedTypes_B_fkey" FOREIGN KEY ("B") REFERENCES "TemplateBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OnlineBookingPolicy_appointmentTypes" ADD CONSTRAINT "_OnlineBookingPolicy_appointmentTypes_A_fkey" FOREIGN KEY ("A") REFERENCES "AppointmentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OnlineBookingPolicy_appointmentTypes" ADD CONSTRAINT "_OnlineBookingPolicy_appointmentTypes_B_fkey" FOREIGN KEY ("B") REFERENCES "OnlineBookingPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Dental Phase 1 guards (SCHEMA §4.1, §21; DOMAIN I-S1, I-S2, I-S4) ───────────────────────────
-- The scheduling commands take ordered advisory locks (operatory → provider → patient) and check
-- every rule first; these constraints are the database backstop, so no code path, import or race can
-- leave two active appointments in one chair or one patient in two places at once.

-- I-S1: one active appointment per operatory at any instant, including the turnover buffer.
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_no_operatory_overlap" EXCLUDE USING gist (
  "operatory" WITH =,
  tsrange("startsAt", "endsAt" + make_interval(mins => COALESCE("bufferAfterMinutes", 0)), '[)') WITH &&
) WHERE ("operatory" IS NOT NULL AND "status" IN ('scheduled', 'confirmed', 'arrived', 'seated', 'ready_for_checkout'));

-- I-S2: a patient is never booked in two places at once.
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_no_patient_overlap" EXCLUDE USING gist (
  "patient" WITH =,
  tsrange("startsAt", "endsAt", '[)') WITH &&
) WHERE ("patient" IS NOT NULL AND "status" IN ('scheduled', 'confirmed', 'arrived', 'seated', 'ready_for_checkout'));

-- I-S4: two live holds never cover the same chair.
ALTER TABLE "BookingHold" ADD CONSTRAINT "BookingHold_no_operatory_overlap" EXCLUDE USING gist (
  "operatory" WITH =,
  tsrange("startsAt", "endsAt", '[)') WITH &&
) WHERE ("operatory" IS NOT NULL AND "status" = 'held');

-- I-S4 across tables: a live hold and an active appointment never share a chair. An exclusion
-- constraint can't span two tables, so a trigger checks under the same advisory lock the commands
-- take (operatory:<id>), which serialises concurrent writers on that chair. Timestamps are stored as
-- UTC without a zone (Prisma), so "now" is compared in UTC.
CREATE OR REPLACE FUNCTION dental_operatory_hold_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  clash TEXT;
BEGIN
  IF NEW."operatory" IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'Appointment' THEN
    IF NEW."status" NOT IN ('scheduled', 'confirmed', 'arrived', 'seated', 'ready_for_checkout') THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD."operatory" IS NOT DISTINCT FROM NEW."operatory" AND OLD."startsAt" = NEW."startsAt" AND OLD."endsAt" = NEW."endsAt"
       AND OLD."status" IN ('scheduled', 'confirmed', 'arrived', 'seated', 'ready_for_checkout') THEN RETURN NEW; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('operatory:' || NEW."operatory", 0));
    SELECT h."id" INTO clash FROM "BookingHold" h
     WHERE h."operatory" = NEW."operatory" AND h."status" = 'held' AND h."expiresAt" > (now() AT TIME ZONE 'UTC')
       AND (NEW."bookedViaHold" IS NULL OR h."id" <> NEW."bookedViaHold")
       AND tsrange(h."startsAt", h."endsAt", '[)') && tsrange(NEW."startsAt", NEW."endsAt" + make_interval(mins => COALESCE(NEW."bufferAfterMinutes", 0)), '[)')
     LIMIT 1;
    IF clash IS NOT NULL THEN
      RAISE EXCEPTION 'operatory % is held for this time (hold %)', NEW."operatory", clash USING ERRCODE = 'exclusion_violation';
    END IF;
  ELSE
    IF NEW."status" <> 'held' THEN RETURN NEW; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('operatory:' || NEW."operatory", 0));
    SELECT a."id" INTO clash FROM "Appointment" a
     WHERE a."operatory" = NEW."operatory" AND a."status" IN ('scheduled', 'confirmed', 'arrived', 'seated', 'ready_for_checkout')
       AND tsrange(a."startsAt", a."endsAt" + make_interval(mins => COALESCE(a."bufferAfterMinutes", 0)), '[)') && tsrange(NEW."startsAt", NEW."endsAt", '[)')
     LIMIT 1;
    IF clash IS NOT NULL THEN
      RAISE EXCEPTION 'operatory % already has an appointment at this time (appointment %)', NEW."operatory", clash USING ERRCODE = 'exclusion_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "Appointment_hold_guard" BEFORE INSERT OR UPDATE ON "Appointment"
  FOR EACH ROW EXECUTE FUNCTION dental_operatory_hold_guard();
CREATE TRIGGER "BookingHold_appointment_guard" BEFORE INSERT OR UPDATE ON "BookingHold"
  FOR EACH ROW EXECUTE FUNCTION dental_operatory_hold_guard();

-- Scheduling checks.
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_interval" CHECK ("endsAt" > "startsAt");
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_buffer" CHECK ("bufferAfterMinutes" IS NULL OR "bufferAfterMinutes" BETWEEN 0 AND 120);
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_status" CHECK ("status" IN ('planned', 'scheduled', 'confirmed', 'arrived', 'seated', 'ready_for_checkout', 'completed', 'cancelled', 'broken', 'rescheduled'));
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_booked_needs_place" CHECK ("status" = 'planned' OR ("operatory" IS NOT NULL AND "patient" IS NOT NULL AND "location" IS NOT NULL));
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_broken_kind" CHECK (("status" = 'broken' AND "brokenKind" IN ('no_show', 'late_cancel')) OR ("status" <> 'broken' AND "brokenKind" = ''));
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_production_nonnegative" CHECK ("productionScheduledMinor" IS NULL OR "productionScheduledMinor" >= 0);
ALTER TABLE "AppointmentSegment" ADD CONSTRAINT "AppointmentSegment_interval" CHECK ("endsAt" > "startsAt");
ALTER TABLE "AppointmentSegment" ADD CONSTRAINT "AppointmentSegment_override_reason" CHECK ("concurrencyKind" <> 'approved_override' OR length(trim("overrideReason")) > 0);
ALTER TABLE "BookingHold" ADD CONSTRAINT "BookingHold_interval" CHECK ("endsAt" > "startsAt");
ALTER TABLE "BookingHold" ADD CONSTRAINT "BookingHold_status" CHECK ("status" IN ('held', 'converted', 'expired', 'released'));
ALTER TABLE "BookingHold" ADD CONSTRAINT "BookingHold_ttl" CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + interval '30 minutes');
ALTER TABLE "TemplateBlock" ADD CONSTRAINT "TemplateBlock_window" CHECK ("endLocal" > "startLocal");
ALTER TABLE "ScheduleTemplate" ADD CONSTRAINT "ScheduleTemplate_window" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");
ALTER TABLE "ProductionGoal" ADD CONSTRAINT "ProductionGoal_weekday_xor_date" CHECK (("weekday" IS NULL) <> ("date" IS NULL));
ALTER TABLE "ProductionGoal" ADD CONSTRAINT "ProductionGoal_nonnegative" CHECK ("goalMinor" >= 0);
ALTER TABLE "ClosureDay" ADD CONSTRAINT "ClosureDay_half_day_window" CHECK (NOT "isHalfDay" OR ("startLocal" <> '' AND "endLocal" > "startLocal"));
ALTER TABLE "AppointmentType" ADD CONSTRAINT "AppointmentType_units" CHECK ("defaultDurationUnits" BETWEEN 1 AND 96);
ALTER TABLE "OnlineBookingPolicy" ADD CONSTRAINT "OnlineBookingPolicy_deposit" CHECK ("depositMinor" IS NULL OR "depositMinor" >= 0);
ALTER TABLE "OnlineBookingPolicy" ADD CONSTRAINT "OnlineBookingPolicy_hold_minutes" CHECK ("holdMinutes" BETWEEN 2 AND 30);

-- Patient checks (SM§1.1).
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_status" CHECK ("status" IN ('prospect', 'active', 'inactive', 'archived', 'deceased', 'merged_into'));
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_merged_points_to_survivor" CHECK (("status" = 'merged_into') = ("mergedInto" IS NOT NULL));
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_not_merged_into_self" CHECK ("mergedInto" IS NULL OR "mergedInto" <> "id");
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_deceased_date" CHECK ("status" <> 'deceased' OR "dateOfDeath" IS NOT NULL);
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_dob_sane" CHECK ("dateOfBirth" >= DATE '1880-01-01');
ALTER TABLE "ContactPoint" ADD CONSTRAINT "ContactPoint_one_owner" CHECK ((("patient" IS NOT NULL)::int + ("guarantor" IS NOT NULL)::int) = 1);
ALTER TABLE "MergeCase" ADD CONSTRAINT "MergeCase_distinct" CHECK ("survivor" IS NULL OR "merged" IS NULL OR "survivor" <> "merged");

-- Partial uniques.
CREATE UNIQUE INDEX "GuarantorLink_one_active_per_patient" ON "GuarantorLink" ("patient") WHERE "status" = 'active';
CREATE UNIQUE INDEX "ConsentGrant_one_granted" ON "ConsentGrant" ("contactPoint", "channel", "purpose") WHERE "status" = 'granted';
CREATE UNIQUE INDEX "MergeCase_one_open_pair" ON "MergeCase" (LEAST("survivor", "merged"), GREATEST("survivor", "merged")) WHERE "status" IN ('proposed', 'approved');
CREATE UNIQUE INDEX "ContactPoint_one_primary_per_kind" ON "ContactPoint" ("patient", "kind") WHERE "isPrimary" AND "isActive" AND "patient" IS NOT NULL;
CREATE UNIQUE INDEX "PortalScope_one_active" ON "PortalScope" ("account", "patient") WHERE "status" = 'active';

-- Search (pg_trgm): patient names for the duplicate detector and the patients search box.
CREATE INDEX "Patient_name_trgm_idx" ON "Patient" USING gin ((lower("lastName" || ' ' || "firstName")) public.gin_trgm_ops);
CREATE INDEX "Patient_last_name_trgm_idx" ON "Patient" USING gin (lower("lastName") public.gin_trgm_ops);

-- Immutable history.
CREATE TRIGGER "MergeMap_append_only" BEFORE UPDATE OR DELETE ON "MergeMap"
  FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "BrokenAppointmentEvent_append_only" BEFORE UPDATE OR DELETE ON "BrokenAppointmentEvent"
  FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();

-- I-S3 provider time: a provider's (or hygienist's) chair-time segments never overlap, except the
-- hygiene exam float and overlaps approved with a reason. Segments of cancelled, broken and
-- rescheduled appointments are inactive and free the time.
ALTER TABLE "AppointmentSegment" ADD CONSTRAINT "AppointmentSegment_no_provider_overlap" EXCLUDE USING gist (
  "provider" WITH =,
  tsrange("startsAt", "endsAt", '[)') WITH &&
) WHERE ("provider" IS NOT NULL AND "isActive" AND "concurrencyKind" = 'none' AND "role" IN ('provider', 'hygienist'));
