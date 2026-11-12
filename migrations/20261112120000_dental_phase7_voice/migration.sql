-- AlterTable
ALTER TABLE "CallRecord" ADD COLUMN     "adapter" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "agentRun" TEXT,
ADD COLUMN     "callerNumber" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "disclosedAt" TIMESTAMP(3),
ADD COLUMN     "followedUpAt" TIMESTAMP(3),
ADD COLUMN     "followedUpBy" TEXT,
ADD COLUMN     "handoffReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "loggedBy" TEXT,
ADD COLUMN     "notes" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "outcome" TEXT NOT NULL DEFAULT 'logged',
ADD COLUMN     "recordingBasis" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "recordingConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recordingRef" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "ref" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "scenario" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "toolCalls" JSONB DEFAULT '[]',
ADD COLUMN     "transcript" JSONB DEFAULT '[]',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "VoicePolicy" (
    "id" TEXT NOT NULL,
    "location" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "recordCalls" BOOLEAN NOT NULL DEFAULT false,
    "changedBy" TEXT,
    "changedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoicePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoicePolicy_location_idx" ON "VoicePolicy"("location");

-- CreateIndex
CREATE INDEX "VoicePolicy_changedBy_idx" ON "VoicePolicy"("changedBy");

-- CreateIndex
CREATE INDEX "CallRecord_ref_idx" ON "CallRecord"("ref");

-- CreateIndex
CREATE INDEX "CallRecord_agentRun_idx" ON "CallRecord"("agentRun");

-- CreateIndex
CREATE INDEX "CallRecord_followedUpBy_idx" ON "CallRecord"("followedUpBy");

-- CreateIndex
CREATE INDEX "CallRecord_loggedBy_idx" ON "CallRecord"("loggedBy");

-- AddForeignKey
ALTER TABLE "CallRecord" ADD CONSTRAINT "CallRecord_agentRun_fkey" FOREIGN KEY ("agentRun") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRecord" ADD CONSTRAINT "CallRecord_followedUpBy_fkey" FOREIGN KEY ("followedUpBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRecord" ADD CONSTRAINT "CallRecord_loggedBy_fkey" FOREIGN KEY ("loggedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoicePolicy" ADD CONSTRAINT "VoicePolicy_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoicePolicy" ADD CONSTRAINT "VoicePolicy_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

