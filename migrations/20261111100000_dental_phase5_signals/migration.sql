-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "summary" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "ProposalKind" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "riskClass" TEXT NOT NULL,
    "requiredPermission" TEXT NOT NULL DEFAULT '',
    "defaultExpiryMinutes" INTEGER DEFAULT 1440,
    "validatorVersion" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalKind_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "type" TEXT,
    "run" TEXT,
    "location" TEXT,
    "subjectType" TEXT NOT NULL DEFAULT '',
    "subjectId" TEXT NOT NULL DEFAULT '',
    "patient" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "evidence" JSONB DEFAULT '[]',
    "impact" JSONB DEFAULT '{}',
    "dedupeKey" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalRun" (
    "id" TEXT NOT NULL,
    "signalType" TEXT,
    "location" TEXT,
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'started',
    "counts" JSONB DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "detectorVersion" TEXT NOT NULL DEFAULT '',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "params" JSONB DEFAULT '{}',
    "defaultProposalKind" TEXT NOT NULL DEFAULT '',
    "ownerRole" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_Proposal_signals" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_Proposal_signals_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProposalKind_key_key" ON "ProposalKind"("key");

-- CreateIndex
CREATE INDEX "Signal_type_idx" ON "Signal"("type");

-- CreateIndex
CREATE INDEX "Signal_run_idx" ON "Signal"("run");

-- CreateIndex
CREATE INDEX "Signal_location_idx" ON "Signal"("location");

-- CreateIndex
CREATE INDEX "Signal_subjectId_idx" ON "Signal"("subjectId");

-- CreateIndex
CREATE INDEX "Signal_patient_idx" ON "Signal"("patient");

-- CreateIndex
CREATE INDEX "SignalRun_signalType_idx" ON "SignalRun"("signalType");

-- CreateIndex
CREATE INDEX "SignalRun_location_idx" ON "SignalRun"("location");

-- CreateIndex
CREATE UNIQUE INDEX "SignalType_key_key" ON "SignalType"("key");

-- CreateIndex
CREATE INDEX "_Proposal_signals_B_index" ON "_Proposal_signals"("B");

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_type_fkey" FOREIGN KEY ("type") REFERENCES "SignalType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_run_fkey" FOREIGN KEY ("run") REFERENCES "SignalRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalRun" ADD CONSTRAINT "SignalRun_signalType_fkey" FOREIGN KEY ("signalType") REFERENCES "SignalType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalRun" ADD CONSTRAINT "SignalRun_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Proposal_signals" ADD CONSTRAINT "_Proposal_signals_A_fkey" FOREIGN KEY ("A") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Proposal_signals" ADD CONSTRAINT "_Proposal_signals_B_fkey" FOREIGN KEY ("B") REFERENCES "Signal"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One open or proposed signal per dedupe key: running a detector twice finds the same signal.
CREATE UNIQUE INDEX "Signal_dedupeKey_active_key" ON "Signal"("dedupeKey") WHERE "status" IN ('open', 'proposed');

-- One run per signal type, office and window.
CREATE UNIQUE INDEX "SignalRun_signalType_location_windowStart_key" ON "SignalRun"("signalType", "location", "windowStart");
