-- CreateEnum
CREATE TYPE "UserKindType" AS ENUM ('staff', 'patient_portal', 'auditor', 'machine');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "password" TEXT NOT NULL,
    "role" TEXT,
    "kind" "UserKindType" DEFAULT 'staff',
    "title" TEXT NOT NULL DEFAULT '',
    "accessExpiresAt" TIMESTAMP(3),
    "mfaEnrolled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecretId" TEXT,
    "mfaPendingSecretId" TEXT,
    "mfaPendingExpiresAt" TIMESTAMP(3),
    "mfaLastCounter" INTEGER DEFAULT -1,
    "mfaRecoveryHashes" TEXT NOT NULL DEFAULT '[]',
    "mfaFailures" INTEGER DEFAULT 0,
    "mfaLockedUntil" TIMESTAMP(3),
    "quickSwitchPinHash" TEXT,
    "authVersion" INTEGER DEFAULT 1,
    "onboardingStatus" TEXT DEFAULT 'not_started',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passwordResetToken" TEXT,
    "passwordResetIssuedAt" TIMESTAMP(3),
    "passwordResetRedeemedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "canSeeOtherPeople" BOOLEAN NOT NULL DEFAULT false,
    "canEditOtherPeople" BOOLEAN NOT NULL DEFAULT false,
    "canManagePeople" BOOLEAN NOT NULL DEFAULT false,
    "canManageRoles" BOOLEAN NOT NULL DEFAULT false,
    "canAccessDashboard" BOOLEAN NOT NULL DEFAULT false,
    "canManageOnboarding" BOOLEAN NOT NULL DEFAULT false,
    "canManagePayments" BOOLEAN NOT NULL DEFAULT false,
    "canIssueRefunds" BOOLEAN NOT NULL DEFAULT false,
    "canReadAudit" BOOLEAN NOT NULL DEFAULT false,
    "canManagePractice" BOOLEAN NOT NULL DEFAULT false,
    "canManageAdapters" BOOLEAN NOT NULL DEFAULT false,
    "canApproveAdapters" BOOLEAN NOT NULL DEFAULT false,
    "canAccessAllLocations" BOOLEAN NOT NULL DEFAULT false,
    "canManagePatients" BOOLEAN NOT NULL DEFAULT false,
    "canApprovePatientMerge" BOOLEAN NOT NULL DEFAULT false,
    "canReadDemographics" BOOLEAN NOT NULL DEFAULT false,
    "canManageSchedule" BOOLEAN NOT NULL DEFAULT false,
    "canOverrideSchedule" BOOLEAN NOT NULL DEFAULT false,
    "canOverrideTemplate" BOOLEAN NOT NULL DEFAULT false,
    "canOverrideLabGate" BOOLEAN NOT NULL DEFAULT false,
    "canReadSchedule" BOOLEAN NOT NULL DEFAULT false,
    "canChart" BOOLEAN NOT NULL DEFAULT false,
    "canCompleteProcedures" BOOLEAN NOT NULL DEFAULT false,
    "canSignClinicalNotes" BOOLEAN NOT NULL DEFAULT false,
    "canPrescribe" BOOLEAN NOT NULL DEFAULT false,
    "canManagePerio" BOOLEAN NOT NULL DEFAULT false,
    "canManageLabCases" BOOLEAN NOT NULL DEFAULT false,
    "canApproveClinicalCorrections" BOOLEAN NOT NULL DEFAULT false,
    "canReadClinical" BOOLEAN NOT NULL DEFAULT false,
    "canReadSensitive" BOOLEAN NOT NULL DEFAULT false,
    "canManageTreatmentPlans" BOOLEAN NOT NULL DEFAULT false,
    "canPresentPlans" BOOLEAN NOT NULL DEFAULT false,
    "canManageFees" BOOLEAN NOT NULL DEFAULT false,
    "canImportCodes" BOOLEAN NOT NULL DEFAULT false,
    "canApproveCodeImport" BOOLEAN NOT NULL DEFAULT false,
    "canApproveFeePublish" BOOLEAN NOT NULL DEFAULT false,
    "canManageInsurance" BOOLEAN NOT NULL DEFAULT false,
    "canVerifyBenefits" BOOLEAN NOT NULL DEFAULT false,
    "canReadInsurance" BOOLEAN NOT NULL DEFAULT false,
    "canManageClaims" BOOLEAN NOT NULL DEFAULT false,
    "canSubmitClaims" BOOLEAN NOT NULL DEFAULT false,
    "canOverrideScrub" BOOLEAN NOT NULL DEFAULT false,
    "canPostRemittances" BOOLEAN NOT NULL DEFAULT false,
    "canTakePayments" BOOLEAN NOT NULL DEFAULT false,
    "canAdjust" BOOLEAN NOT NULL DEFAULT false,
    "canCloseDay" BOOLEAN NOT NULL DEFAULT false,
    "canClosePeriod" BOOLEAN NOT NULL DEFAULT false,
    "canApproveAdjustments" BOOLEAN NOT NULL DEFAULT false,
    "canApproveRefunds" BOOLEAN NOT NULL DEFAULT false,
    "canApprovePeriodReopen" BOOLEAN NOT NULL DEFAULT false,
    "canReadLedger" BOOLEAN NOT NULL DEFAULT false,
    "canManageMemberships" BOOLEAN NOT NULL DEFAULT false,
    "canMessagePatients" BOOLEAN NOT NULL DEFAULT false,
    "canManageTemplates" BOOLEAN NOT NULL DEFAULT false,
    "canReplyReviews" BOOLEAN NOT NULL DEFAULT false,
    "canManageAgents" BOOLEAN NOT NULL DEFAULT false,
    "canDecideProposals" BOOLEAN NOT NULL DEFAULT false,
    "canDecideClaimProposals" BOOLEAN NOT NULL DEFAULT false,
    "canDecideClinicalProposals" BOOLEAN NOT NULL DEFAULT false,
    "canDecideFinancialProposals" BOOLEAN NOT NULL DEFAULT false,
    "canApproveAgentGrants" BOOLEAN NOT NULL DEFAULT false,
    "canApproveAutonomy" BOOLEAN NOT NULL DEFAULT false,
    "canReadSignals" BOOLEAN NOT NULL DEFAULT false,
    "canManageCompliance" BOOLEAN NOT NULL DEFAULT false,
    "canBreakGlass" BOOLEAN NOT NULL DEFAULT false,
    "canBreakGlassRecords" BOOLEAN NOT NULL DEFAULT false,
    "canReviewPrivacy" BOOLEAN NOT NULL DEFAULT false,
    "canApproveRetention" BOOLEAN NOT NULL DEFAULT false,
    "canReadPhiAudit" BOOLEAN NOT NULL DEFAULT false,
    "canImportData" BOOLEAN NOT NULL DEFAULT false,
    "canExportData" BOOLEAN NOT NULL DEFAULT false,
    "canApproveImports" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthApp" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT NOT NULL DEFAULT '',
    "clientSecret" TEXT NOT NULL DEFAULT '',
    "tokenEndpointAuthMethod" TEXT DEFAULT 'client_secret_post',
    "redirectUris" JSONB DEFAULT '[]',
    "scopes" JSONB DEFAULT '["mcp:read","mcp:write"]',
    "webhookUrl" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'active',
    "installUrl" TEXT NOT NULL DEFAULT '',
    "uninstallUrl" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB DEFAULT '{}',
    "developerEmail" TEXT NOT NULL DEFAULT '',
    "privacyPolicyUrl" TEXT NOT NULL DEFAULT '',
    "termsOfServiceUrl" TEXT NOT NULL DEFAULT '',
    "supportUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthToken" (
    "id" TEXT NOT NULL,
    "tokenType" TEXT NOT NULL,
    "token" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT NOT NULL DEFAULT '',
    "user" TEXT,
    "scopes" JSONB DEFAULT '[]',
    "redirectUri" TEXT NOT NULL DEFAULT '',
    "resource" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "isRevoked" TEXT DEFAULT 'false',
    "authorizationCode" TEXT NOT NULL DEFAULT '',
    "refreshToken" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "codeChallenge" TEXT NOT NULL DEFAULT '',
    "codeChallengeMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdapterInstallation" (
    "id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "adapterKey" TEXT NOT NULL DEFAULT '',
    "displayName" TEXT NOT NULL DEFAULT '',
    "mode" TEXT DEFAULT 'manual_export',
    "status" TEXT NOT NULL DEFAULT 'configured',
    "secret" TEXT,
    "config" JSONB,
    "handlesPhi" BOOLEAN NOT NULL DEFAULT true,
    "baa" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "verificationReceipt" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdapterInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalDecision" (
    "id" TEXT NOT NULL,
    "request" TEXT,
    "decidedBy" TEXT,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalPolicy" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "requiredPermission" TEXT NOT NULL DEFAULT '',
    "minApprovals" INTEGER DEFAULT 1,
    "thresholdMinor" BIGINT,
    "expiresAfterMinutes" INTEGER DEFAULT 1440,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "targetList" TEXT NOT NULL DEFAULT '',
    "targetId" TEXT NOT NULL DEFAULT '',
    "payload" JSONB,
    "payloadHash" TEXT NOT NULL DEFAULT '',
    "requiredPermission" TEXT NOT NULL DEFAULT '',
    "requestedBy" TEXT,
    "requestedByAgent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "eventKey" TEXT NOT NULL DEFAULT '',
    "eventType" TEXT NOT NULL DEFAULT '',
    "entityType" TEXT NOT NULL DEFAULT '',
    "entityId" TEXT NOT NULL DEFAULT '',
    "actorUser" TEXT,
    "actorAgent" TEXT,
    "approver" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "requestId" TEXT NOT NULL DEFAULT '',
    "prevHash" TEXT NOT NULL DEFAULT '',
    "hash" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingEntity" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL DEFAULT '',
    "tinLast4" TEXT NOT NULL DEFAULT '',
    "tinSecretId" TEXT NOT NULL DEFAULT '',
    "npiType2" TEXT NOT NULL DEFAULT '',
    "address" JSONB DEFAULT '{}',
    "payToAddress" JSONB DEFAULT '{}',
    "clearinghouseSubmitterIds" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakGlassEvent" (
    "id" TEXT NOT NULL,
    "user" TEXT,
    "kind" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL DEFAULT '',
    "subjectId" TEXT NOT NULL DEFAULT '',
    "location" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "openedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "reviewedBy" TEXT,
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BreakGlassEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessAssociate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "service" TEXT NOT NULL DEFAULT 'other',
    "baaSignedOn" DATE,
    "expiresOn" DATE,
    "baaDocument" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessAssociate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommandReceipt" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "command" TEXT NOT NULL DEFAULT '',
    "principalKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "requestParams" JSONB,
    "responseCode" TEXT NOT NULL DEFAULT '',
    "responseBody" JSONB,
    "recoveryPoint" TEXT NOT NULL DEFAULT 'completed',
    "completedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommandReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "holder" TEXT,
    "staffUser" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'dental_licence',
    "jurisdiction" TEXT NOT NULL DEFAULT 'US-FL',
    "numberLast4" TEXT NOT NULL DEFAULT '',
    "numberSecretId" TEXT NOT NULL DEFAULT '',
    "issuedOn" DATE,
    "expiresOn" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'other',
    "phiTier" TEXT NOT NULL DEFAULT 'none',
    "storageKey" TEXT NOT NULL DEFAULT '',
    "sha256" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT '',
    "sizeBytes" INTEGER,
    "documentVersion" INTEGER DEFAULT 1,
    "supersedes" TEXT,
    "uploadedBy" TEXT,
    "retentionUntil" DATE,
    "signedAt" TIMESTAMP(3),
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundObservation" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "externalId" TEXT NOT NULL DEFAULT '',
    "contentHash" TEXT NOT NULL DEFAULT '',
    "raw" TEXT,
    "rawSecretId" TEXT NOT NULL DEFAULT '',
    "receivedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "applyResult" JSONB,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InferenceProvider" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "secret" TEXT,
    "baa" TEXT,
    "retainsPrompts" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InferenceProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT '',
    "intervalSeconds" INTEGER,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'idle',
    "leaseKey" TEXT NOT NULL DEFAULT '',
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JurisdictionPack" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "key" TEXT NOT NULL DEFAULT '',
    "version" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "rules" JSONB,
    "sources" JSONB,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JurisdictionPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lease" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "owner" TEXT NOT NULL DEFAULT '',
    "fencingToken" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL DEFAULT '',
    "address" JSONB DEFAULT '{}',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "timeZone" TEXT NOT NULL DEFAULT 'America/New_York',
    "jurisdiction" TEXT,
    "npiType2" TEXT NOT NULL DEFAULT '',
    "taxonomyCode" TEXT NOT NULL DEFAULT '',
    "placeOfServiceCode" TEXT NOT NULL DEFAULT '11',
    "stateFacilityPermit" TEXT NOT NULL DEFAULT '',
    "hours" JSONB DEFAULT '{}',
    "billingEntity" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineCredential" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "agent" TEXT,
    "tokenDigest" TEXT NOT NULL DEFAULT '',
    "tokenPrefix" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MachineCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipient" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "template" TEXT NOT NULL DEFAULT '',
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL DEFAULT '',
    "aggregateType" TEXT NOT NULL DEFAULT '',
    "aggregateId" TEXT NOT NULL DEFAULT '',
    "dedupeKey" TEXT NOT NULL DEFAULT '',
    "payload" JSONB,
    "adapterKey" TEXT NOT NULL DEFAULT '',
    "mode" TEXT DEFAULT 'manual_export',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT NOT NULL DEFAULT '',
    "leaseExpiresAt" TIMESTAMP(3),
    "fencingToken" INTEGER DEFAULT 0,
    "lastError" TEXT NOT NULL DEFAULT '',
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhiReadAudit" (
    "id" TEXT NOT NULL,
    "actorUser" TEXT,
    "actorAgent" TEXT,
    "actorReference" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT DEFAULT 'operations',
    "operationType" TEXT NOT NULL DEFAULT '',
    "operationName" TEXT NOT NULL DEFAULT '',
    "listKeys" JSONB,
    "tiers" JSONB,
    "fields" JSONB,
    "fieldSetDigest" TEXT NOT NULL DEFAULT '',
    "recordCount" INTEGER DEFAULT 0,
    "recordIdsDigest" TEXT NOT NULL DEFAULT '',
    "resourceReferences" JSONB,
    "breakGlass" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "correlationReference" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhiReadAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeSettings" (
    "id" INTEGER NOT NULL,
    "legalName" TEXT NOT NULL DEFAULT 'Openfront Dental',
    "displayName" TEXT NOT NULL DEFAULT 'Openfront Dental',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "defaultTimeZone" TEXT NOT NULL DEFAULT 'America/New_York',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "toothNumbering" TEXT NOT NULL DEFAULT 'universal',
    "scheduleUnitMinutes" INTEGER NOT NULL DEFAULT 10,
    "lateCancelHours" INTEGER DEFAULT 24,
    "noShowAfterMinutes" INTEGER DEFAULT 15,
    "inactiveAfterMonths" INTEGER DEFAULT 18,
    "backdateDays" INTEGER DEFAULT 3,
    "noteSignHours" INTEGER DEFAULT 24,
    "mergeRevertDays" INTEGER DEFAULT 30,
    "eligibilityCacheMinutes" INTEGER DEFAULT 60,
    "creditReviewDays" INTEGER DEFAULT 60,
    "minStatementMinor" BIGINT NOT NULL DEFAULT 500,
    "recallLeadDays" INTEGER DEFAULT 30,
    "sessionHours" INTEGER DEFAULT 12,
    "breakGlassMinutes" INTEGER DEFAULT 60,
    "strictAgentOwnerSoD" BOOLEAN NOT NULL DEFAULT true,
    "aiAutonomyAllowed" BOOLEAN NOT NULL DEFAULT false,
    "requireStaffMfa" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderProfile" (
    "id" TEXT NOT NULL,
    "user" TEXT,
    "displayName" TEXT NOT NULL DEFAULT '',
    "abbreviation" TEXT NOT NULL DEFAULT '',
    "providerType" TEXT NOT NULL DEFAULT 'dentist',
    "specialty" TEXT NOT NULL DEFAULT 'general',
    "npiType1" TEXT,
    "taxonomyCode" TEXT NOT NULL DEFAULT '',
    "payerProviderIds" JSONB DEFAULT '{}',
    "supervisionClass" TEXT NOT NULL DEFAULT '',
    "colour" TEXT NOT NULL DEFAULT '#2563eb',
    "productionCreditMode" TEXT NOT NULL DEFAULT 'rendering',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecretBox" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "ciphertext" TEXT NOT NULL DEFAULT '',
    "iv" TEXT NOT NULL DEFAULT '',
    "authTag" TEXT NOT NULL DEFAULT '',
    "keyVersion" INTEGER DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecretBox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "nextValue" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAssignment" (
    "id" TEXT NOT NULL,
    "user" TEXT,
    "location" TEXT,
    "role" TEXT,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentIdentity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'llm_agent',
    "inferenceProvider" TEXT,
    "owner" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "oauthApp" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentToolGrant" (
    "id" TEXT NOT NULL,
    "agent" TEXT,
    "scope" TEXT NOT NULL,
    "constraints" JSONB,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "approval" TEXT,
    "revokedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentToolGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "agent" TEXT,
    "inferenceProvider" TEXT,
    "model" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'started',
    "promptHash" TEXT NOT NULL DEFAULT '',
    "toolCalls" JSONB,
    "tokens" JSONB,
    "costMinor" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB,
    "payloadHash" TEXT NOT NULL DEFAULT '',
    "expectedImpact" JSONB,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "agentRun" TEXT,
    "proposedByAgent" TEXT,
    "proposedByUser" TEXT,
    "location" TEXT,
    "targetList" TEXT NOT NULL DEFAULT '',
    "targetId" TEXT NOT NULL DEFAULT '',
    "approval" TEXT,
    "validation" JSONB,
    "execution" JSONB,
    "realised" JSONB,
    "expiresAt" TIMESTAMP(3),
    "autonomyPolicyVersion" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthApp_clientId_key" ON "OAuthApp"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_token_key" ON "OAuthToken"("token");

-- CreateIndex
CREATE INDEX "OAuthToken_clientId_idx" ON "OAuthToken"("clientId");

-- CreateIndex
CREATE INDEX "OAuthToken_user_idx" ON "OAuthToken"("user");

-- CreateIndex
CREATE INDEX "AdapterInstallation_secret_idx" ON "AdapterInstallation"("secret");

-- CreateIndex
CREATE INDEX "AdapterInstallation_baa_idx" ON "AdapterInstallation"("baa");

-- CreateIndex
CREATE INDEX "ApprovalDecision_request_idx" ON "ApprovalDecision"("request");

-- CreateIndex
CREATE INDEX "ApprovalDecision_decidedBy_idx" ON "ApprovalDecision"("decidedBy");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalPolicy_action_key" ON "ApprovalPolicy"("action");

-- CreateIndex
CREATE INDEX "ApprovalRequest_action_idx" ON "ApprovalRequest"("action");

-- CreateIndex
CREATE INDEX "ApprovalRequest_targetId_idx" ON "ApprovalRequest"("targetId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_requestedBy_idx" ON "ApprovalRequest"("requestedBy");

-- CreateIndex
CREATE INDEX "ApprovalRequest_requestedByAgent_idx" ON "ApprovalRequest"("requestedByAgent");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_seq_key" ON "AuditEvent"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_eventKey_key" ON "AuditEvent"("eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_hash_key" ON "AuditEvent"("hash");

-- CreateIndex
CREATE INDEX "AuditEvent_eventType_idx" ON "AuditEvent"("eventType");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_idx" ON "AuditEvent"("entityType");

-- CreateIndex
CREATE INDEX "AuditEvent_entityId_idx" ON "AuditEvent"("entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUser_idx" ON "AuditEvent"("actorUser");

-- CreateIndex
CREATE INDEX "AuditEvent_actorAgent_idx" ON "AuditEvent"("actorAgent");

-- CreateIndex
CREATE INDEX "AuditEvent_approver_idx" ON "AuditEvent"("approver");

-- CreateIndex
CREATE INDEX "BreakGlassEvent_user_idx" ON "BreakGlassEvent"("user");

-- CreateIndex
CREATE INDEX "BreakGlassEvent_subjectId_idx" ON "BreakGlassEvent"("subjectId");

-- CreateIndex
CREATE INDEX "BreakGlassEvent_location_idx" ON "BreakGlassEvent"("location");

-- CreateIndex
CREATE INDEX "BreakGlassEvent_reviewedBy_idx" ON "BreakGlassEvent"("reviewedBy");

-- CreateIndex
CREATE INDEX "BusinessAssociate_baaDocument_idx" ON "BusinessAssociate"("baaDocument");

-- CreateIndex
CREATE UNIQUE INDEX "CommandReceipt_idempotencyKey_key" ON "CommandReceipt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Credential_holder_idx" ON "Credential"("holder");

-- CreateIndex
CREATE INDEX "Credential_staffUser_idx" ON "Credential"("staffUser");

-- CreateIndex
CREATE INDEX "Credential_evidence_idx" ON "Credential"("evidence");

-- CreateIndex
CREATE INDEX "Document_supersedes_idx" ON "Document"("supersedes");

-- CreateIndex
CREATE INDEX "Document_uploadedBy_idx" ON "Document"("uploadedBy");

-- CreateIndex
CREATE INDEX "InboundObservation_source_idx" ON "InboundObservation"("source");

-- CreateIndex
CREATE INDEX "InboundObservation_raw_idx" ON "InboundObservation"("raw");

-- CreateIndex
CREATE UNIQUE INDEX "InferenceProvider_key_key" ON "InferenceProvider"("key");

-- CreateIndex
CREATE INDEX "InferenceProvider_secret_idx" ON "InferenceProvider"("secret");

-- CreateIndex
CREATE INDEX "InferenceProvider_baa_idx" ON "InferenceProvider"("baa");

-- CreateIndex
CREATE UNIQUE INDEX "Job_kind_key" ON "Job"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "JurisdictionPack_label_key" ON "JurisdictionPack"("label");

-- CreateIndex
CREATE INDEX "JurisdictionPack_key_idx" ON "JurisdictionPack"("key");

-- CreateIndex
CREATE INDEX "JurisdictionPack_verifiedBy_idx" ON "JurisdictionPack"("verifiedBy");

-- CreateIndex
CREATE UNIQUE INDEX "Lease_key_key" ON "Lease"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Location_code_key" ON "Location"("code");

-- CreateIndex
CREATE INDEX "Location_jurisdiction_idx" ON "Location"("jurisdiction");

-- CreateIndex
CREATE INDEX "Location_billingEntity_idx" ON "Location"("billingEntity");

-- CreateIndex
CREATE UNIQUE INDEX "MachineCredential_tokenDigest_key" ON "MachineCredential"("tokenDigest");

-- CreateIndex
CREATE INDEX "MachineCredential_agent_idx" ON "MachineCredential"("agent");

-- CreateIndex
CREATE INDEX "Notification_recipient_idx" ON "Notification"("recipient");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_dedupeKey_key" ON "OutboxEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "OutboxEvent_topic_idx" ON "OutboxEvent"("topic");

-- CreateIndex
CREATE INDEX "OutboxEvent_aggregateId_idx" ON "OutboxEvent"("aggregateId");

-- CreateIndex
CREATE INDEX "PhiReadAudit_actorUser_idx" ON "PhiReadAudit"("actorUser");

-- CreateIndex
CREATE INDEX "PhiReadAudit_actorAgent_idx" ON "PhiReadAudit"("actorAgent");

-- CreateIndex
CREATE INDEX "PhiReadAudit_breakGlass_idx" ON "PhiReadAudit"("breakGlass");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderProfile_user_key" ON "ProviderProfile"("user");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderProfile_abbreviation_key" ON "ProviderProfile"("abbreviation");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderProfile_npiType1_key" ON "ProviderProfile"("npiType1");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitBucket_key_key" ON "RateLimitBucket"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Sequence_key_key" ON "Sequence"("key");

-- CreateIndex
CREATE INDEX "StaffAssignment_user_idx" ON "StaffAssignment"("user");

-- CreateIndex
CREATE INDEX "StaffAssignment_location_idx" ON "StaffAssignment"("location");

-- CreateIndex
CREATE INDEX "StaffAssignment_role_idx" ON "StaffAssignment"("role");

-- CreateIndex
CREATE INDEX "StaffAssignment_user_location_idx" ON "StaffAssignment"("user", "location");

-- CreateIndex
CREATE UNIQUE INDEX "AgentIdentity_name_key" ON "AgentIdentity"("name");

-- CreateIndex
CREATE INDEX "AgentIdentity_inferenceProvider_idx" ON "AgentIdentity"("inferenceProvider");

-- CreateIndex
CREATE INDEX "AgentIdentity_owner_idx" ON "AgentIdentity"("owner");

-- CreateIndex
CREATE INDEX "AgentIdentity_oauthApp_idx" ON "AgentIdentity"("oauthApp");

-- CreateIndex
CREATE INDEX "AgentToolGrant_agent_idx" ON "AgentToolGrant"("agent");

-- CreateIndex
CREATE INDEX "AgentToolGrant_approval_idx" ON "AgentToolGrant"("approval");

-- CreateIndex
CREATE INDEX "AgentToolGrant_agent_scope_idx" ON "AgentToolGrant"("agent", "scope");

-- CreateIndex
CREATE INDEX "AgentRun_agent_idx" ON "AgentRun"("agent");

-- CreateIndex
CREATE INDEX "AgentRun_inferenceProvider_idx" ON "AgentRun"("inferenceProvider");

-- CreateIndex
CREATE INDEX "Proposal_agentRun_idx" ON "Proposal"("agentRun");

-- CreateIndex
CREATE INDEX "Proposal_proposedByAgent_idx" ON "Proposal"("proposedByAgent");

-- CreateIndex
CREATE INDEX "Proposal_proposedByUser_idx" ON "Proposal"("proposedByUser");

-- CreateIndex
CREATE INDEX "Proposal_location_idx" ON "Proposal"("location");

-- CreateIndex
CREATE INDEX "Proposal_targetId_idx" ON "Proposal"("targetId");

-- CreateIndex
CREATE INDEX "Proposal_approval_idx" ON "Proposal"("approval");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_role_fkey" FOREIGN KEY ("role") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdapterInstallation" ADD CONSTRAINT "AdapterInstallation_secret_fkey" FOREIGN KEY ("secret") REFERENCES "SecretBox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdapterInstallation" ADD CONSTRAINT "AdapterInstallation_baa_fkey" FOREIGN KEY ("baa") REFERENCES "BusinessAssociate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_request_fkey" FOREIGN KEY ("request") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_decidedBy_fkey" FOREIGN KEY ("decidedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requestedByAgent_fkey" FOREIGN KEY ("requestedByAgent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUser_fkey" FOREIGN KEY ("actorUser") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorAgent_fkey" FOREIGN KEY ("actorAgent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_approver_fkey" FOREIGN KEY ("approver") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakGlassEvent" ADD CONSTRAINT "BreakGlassEvent_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakGlassEvent" ADD CONSTRAINT "BreakGlassEvent_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakGlassEvent" ADD CONSTRAINT "BreakGlassEvent_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessAssociate" ADD CONSTRAINT "BusinessAssociate_baaDocument_fkey" FOREIGN KEY ("baaDocument") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_holder_fkey" FOREIGN KEY ("holder") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_staffUser_fkey" FOREIGN KEY ("staffUser") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_evidence_fkey" FOREIGN KEY ("evidence") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_supersedes_fkey" FOREIGN KEY ("supersedes") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundObservation" ADD CONSTRAINT "InboundObservation_raw_fkey" FOREIGN KEY ("raw") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceProvider" ADD CONSTRAINT "InferenceProvider_secret_fkey" FOREIGN KEY ("secret") REFERENCES "SecretBox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceProvider" ADD CONSTRAINT "InferenceProvider_baa_fkey" FOREIGN KEY ("baa") REFERENCES "BusinessAssociate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JurisdictionPack" ADD CONSTRAINT "JurisdictionPack_verifiedBy_fkey" FOREIGN KEY ("verifiedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_jurisdiction_fkey" FOREIGN KEY ("jurisdiction") REFERENCES "JurisdictionPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_billingEntity_fkey" FOREIGN KEY ("billingEntity") REFERENCES "BillingEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineCredential" ADD CONSTRAINT "MachineCredential_agent_fkey" FOREIGN KEY ("agent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipient_fkey" FOREIGN KEY ("recipient") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhiReadAudit" ADD CONSTRAINT "PhiReadAudit_actorUser_fkey" FOREIGN KEY ("actorUser") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhiReadAudit" ADD CONSTRAINT "PhiReadAudit_actorAgent_fkey" FOREIGN KEY ("actorAgent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhiReadAudit" ADD CONSTRAINT "PhiReadAudit_breakGlass_fkey" FOREIGN KEY ("breakGlass") REFERENCES "BreakGlassEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderProfile" ADD CONSTRAINT "ProviderProfile_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_role_fkey" FOREIGN KEY ("role") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentIdentity" ADD CONSTRAINT "AgentIdentity_inferenceProvider_fkey" FOREIGN KEY ("inferenceProvider") REFERENCES "InferenceProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentIdentity" ADD CONSTRAINT "AgentIdentity_owner_fkey" FOREIGN KEY ("owner") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentIdentity" ADD CONSTRAINT "AgentIdentity_oauthApp_fkey" FOREIGN KEY ("oauthApp") REFERENCES "OAuthApp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentToolGrant" ADD CONSTRAINT "AgentToolGrant_agent_fkey" FOREIGN KEY ("agent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentToolGrant" ADD CONSTRAINT "AgentToolGrant_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agent_fkey" FOREIGN KEY ("agent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_inferenceProvider_fkey" FOREIGN KEY ("inferenceProvider") REFERENCES "InferenceProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_agentRun_fkey" FOREIGN KEY ("agentRun") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_proposedByAgent_fkey" FOREIGN KEY ("proposedByAgent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_proposedByUser_fkey" FOREIGN KEY ("proposedByUser") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Openfront Dental guards (SCHEMA G8, §18; BUILD-PLAN Phase 0 schema plumbing) ─────────────
-- adapted from openfront-hedge-fund@48199d9 migrations/20261107040200_init_hedge_fund (hf_forbid_change)
-- Extensions the scheduling exclusion constraints (Phase 1) and patient search use.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Immutable history: audit events, approval decisions and PHI read records can never be updated
-- or deleted, whatever the application does. Corrections are new rows.
CREATE OR REPLACE FUNCTION dental_deny_update_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END $$;

CREATE TRIGGER "AuditEvent_append_only" BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "AuditEvent_no_truncate" BEFORE TRUNCATE ON "AuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "ApprovalDecision_append_only" BEFORE UPDATE OR DELETE ON "ApprovalDecision"
  FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "ApprovalDecision_no_truncate" BEFORE TRUNCATE ON "ApprovalDecision"
  FOR EACH STATEMENT EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "PhiReadAudit_append_only" BEFORE UPDATE OR DELETE ON "PhiReadAudit"
  FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "PhiReadAudit_no_truncate" BEFORE TRUNCATE ON "PhiReadAudit"
  FOR EACH STATEMENT EXECUTE FUNCTION dental_deny_update_delete();

-- Spine checks.
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_seq_positive" CHECK (seq > 0);
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_hash_format" CHECK (hash ~ '^[0-9a-f]{64}$' AND "prevHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_attempts_nonnegative" CHECK (attempts >= 0);
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_mode" CHECK (mode IN ('manual_export', 'sandbox', 'live'));
-- Synthetic records never reach a live adapter (DOMAIN §13).
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_synthetic_not_live" CHECK (NOT ("isSynthetic" AND mode = 'live'));
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_fencing_positive" CHECK ("fencingToken" > 0);
ALTER TABLE "Sequence" ADD CONSTRAINT "Sequence_next_positive" CHECK ("nextValue" > 0);
ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_min_approvals" CHECK ("minApprovals" >= 1);
ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_threshold_nonnegative" CHECK ("thresholdMinor" IS NULL OR "thresholdMinor" >= 0);
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_version_nonnegative" CHECK (version >= 0);
-- A request comes from at most one principal: a person or an agent (system jobs have neither).
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_one_requester" CHECK ("requestedBy" IS NULL OR "requestedByAgent" IS NULL);
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_kind" CHECK (decision IN ('approve', 'reject'));

-- Practice controls: bounds the controls applier also validates.
ALTER TABLE "PracticeSettings" ADD CONSTRAINT "PracticeSettings_singleton" CHECK (id = 1);
ALTER TABLE "PracticeSettings" ADD CONSTRAINT "PracticeSettings_session_hours" CHECK ("sessionHours" BETWEEN 1 AND 12);
ALTER TABLE "PracticeSettings" ADD CONSTRAINT "PracticeSettings_break_glass_minutes" CHECK ("breakGlassMinutes" BETWEEN 5 AND 240);
ALTER TABLE "PracticeSettings" ADD CONSTRAINT "PracticeSettings_unit_minutes" CHECK ("scheduleUnitMinutes" IN (5, 10, 15));
ALTER TABLE "PracticeSettings" ADD CONSTRAINT "PracticeSettings_min_statement" CHECK ("minStatementMinor" >= 0);
ALTER TABLE "PracticeSettings" ADD CONSTRAINT "PracticeSettings_currency" CHECK ("currencyCode" ~ '^[A-Z]{3}$');

-- People and places.
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_window" CHECK ("endsOn" IS NULL OR "endsOn" >= "startsOn");
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_window" CHECK ("expiresOn" IS NULL OR "issuedOn" IS NULL OR "expiresOn" >= "issuedOn");
ALTER TABLE "Location" ADD CONSTRAINT "Location_pos_code" CHECK ("placeOfServiceCode" ~ '^[0-9]{2}$');
ALTER TABLE "ProviderProfile" ADD CONSTRAINT "ProviderProfile_colour" CHECK (colour ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE "JurisdictionPack" ADD CONSTRAINT "JurisdictionPack_label" CHECK (label = key || '@' || version);

-- PHI boundary: a no_phi inference provider is never registered as holding a BAA, and a BAA-hosted
-- one always is (INTEGRATIONS §10, lib/inferenceGuard).
ALTER TABLE "InferenceProvider" ADD CONSTRAINT "InferenceProvider_kind" CHECK (kind IN ('self_hosted', 'baa_hosted', 'no_phi'));
ALTER TABLE "InferenceProvider" ADD CONSTRAINT "InferenceProvider_baa" CHECK (kind <> 'baa_hosted' OR baa IS NOT NULL);
ALTER TABLE "AdapterInstallation" ADD CONSTRAINT "AdapterInstallation_mode" CHECK (mode IN ('manual_export', 'sandbox', 'live'));
-- An adapter that handles PHI can only go live under a business associate agreement.
ALTER TABLE "AdapterInstallation" ADD CONSTRAINT "AdapterInstallation_live_phi_baa" CHECK (NOT (mode = 'live' AND "handlesPhi" AND baa IS NULL));

-- Due-work indexes for the workers.
CREATE INDEX "OutboxEvent_due_idx" ON "OutboxEvent" ("nextAttemptAt", "createdAt") WHERE status IN ('pending', 'failed');
CREATE INDEX "OutboxEvent_leased_idx" ON "OutboxEvent" ("leaseExpiresAt") WHERE status = 'leased';
CREATE INDEX "ApprovalRequest_pending_idx" ON "ApprovalRequest" ("createdAt") WHERE status = 'pending';
CREATE INDEX "BreakGlassEvent_open_idx" ON "BreakGlassEvent" ("expiresAt") WHERE status = 'active';
