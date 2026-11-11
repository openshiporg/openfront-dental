-- CreateTable
CREATE TABLE "AutonomyPolicy" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "approval" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutonomyPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutonomyPolicy_kind_idx" ON "AutonomyPolicy"("kind");

-- CreateIndex
CREATE INDEX "AutonomyPolicy_approval_idx" ON "AutonomyPolicy"("approval");

-- AddForeignKey
ALTER TABLE "AutonomyPolicy" ADD CONSTRAINT "AutonomyPolicy_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A kind marked never-autonomous cannot hold a policy that carries it out on its own, whatever path writes the row.
CREATE OR REPLACE FUNCTION dental_refuse_never_autonomous() RETURNS trigger AS $$
BEGIN
  IF NEW."mode" <> 'suggest_only' AND EXISTS (SELECT 1 FROM "ProposalKind" k WHERE k."key" = NEW."kind" AND k."riskClass" IN ('never_autonomous', 'high', 'medium')) THEN
    RAISE EXCEPTION 'kind % always needs a person' , NEW."kind" USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "ProposalKind" k WHERE k."key" = NEW."kind") THEN
    RAISE EXCEPTION 'unknown kind %', NEW."kind" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "AutonomyPolicy_never_autonomous" BEFORE INSERT OR UPDATE ON "AutonomyPolicy" FOR EACH ROW EXECUTE FUNCTION dental_refuse_never_autonomous();

-- And a kind cannot be moved to never-autonomous while a live carry-out policy exists for it.
CREATE OR REPLACE FUNCTION dental_refuse_kind_downgrade() RETURNS trigger AS $$
BEGIN
  IF NEW."riskClass" <> 'low' AND EXISTS (SELECT 1 FROM "AutonomyPolicy" p WHERE p."kind" = NEW."key" AND p."isActive" AND p."mode" <> 'suggest_only') THEN
    RAISE EXCEPTION 'kind % has a policy that carries it out on its own', NEW."key" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "ProposalKind_no_downgrade_under_policy" BEFORE UPDATE ON "ProposalKind" FOR EACH ROW EXECUTE FUNCTION dental_refuse_kind_downgrade();
