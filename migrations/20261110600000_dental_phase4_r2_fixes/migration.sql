-- Phase 4 r2 fixes: N1/N2 posting facts and one live payment per claim+payer+level, N4 approval scope, m2 claim state machine.

-- AlterTable
ALTER TABLE "ApprovalRequest" ADD COLUMN     "account" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "otherPatient" TEXT,
ADD COLUMN     "patient" TEXT;

-- AlterTable
ALTER TABLE "PaymentPosting" ADD COLUMN     "claim" TEXT,
ADD COLUMN     "coverageLevel" TEXT NOT NULL DEFAULT 'primary',
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'payment',
ADD COLUMN     "paidMinor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "payer" TEXT,
ADD COLUMN     "round" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "ApprovalRequest_location_idx" ON "ApprovalRequest"("location");

-- CreateIndex
CREATE INDEX "ApprovalRequest_patient_idx" ON "ApprovalRequest"("patient");

-- CreateIndex
CREATE INDEX "ApprovalRequest_otherPatient_idx" ON "ApprovalRequest"("otherPatient");

-- CreateIndex
CREATE INDEX "ApprovalRequest_account_idx" ON "ApprovalRequest"("account");

-- CreateIndex
CREATE INDEX "PaymentPosting_claim_idx" ON "PaymentPosting"("claim");

-- CreateIndex
CREATE INDEX "PaymentPosting_payer_idx" ON "PaymentPosting"("payer");

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_otherPatient_fkey" FOREIGN KEY ("otherPatient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_account_fkey" FOREIGN KEY ("account") REFERENCES "GuarantorAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPosting" ADD CONSTRAINT "PaymentPosting_claim_fkey" FOREIGN KEY ("claim") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPosting" ADD CONSTRAINT "PaymentPosting_payer_fkey" FOREIGN KEY ("payer") REFERENCES "Payer"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- N1/N2: backfill what each existing posting paid, for which claim, from which payer, at which coverage level.
UPDATE "PaymentPosting" p SET
  "claim" = rc."claim",
  "payer" = COALESCE(r."payer", pl."payer"),
  "kind" = CASE WHEN rc."claimStatusCode" = '22' OR rc."paidMinor" < 0 THEN 'takeback' ELSE 'payment' END,
  "paidMinor" = abs(rc."paidMinor"),
  "coverageLevel" = COALESCE(cv."ordinal", 'primary'),
  "round" = 'v' || COALESCE((SELECT max(v."number") FROM "ClaimVersion" v WHERE v."claim" = rc."claim" AND v."createdAt" <= p."createdAt"), 0)
         || '/a' || (SELECT count(*) FROM "Appeal" a JOIN "Denial" d ON d.id = a."denial" WHERE d."claim" = rc."claim" AND a."createdAt" <= p."createdAt")
FROM "RemittanceClaim" rc
JOIN "Remittance" r ON r.id = rc."remittance"
LEFT JOIN "Claim" c ON c.id = rc."claim"
LEFT JOIN "Coverage" cv ON cv.id = c."coverage"
LEFT JOIN "Subscriber" sb ON sb.id = cv."subscriber"
LEFT JOIN "InsurancePlan" pl ON pl.id = sb."plan"
WHERE rc.id = p."remittanceClaim";

ALTER TABLE "PaymentPosting" ADD CONSTRAINT "PaymentPosting_kind_check" CHECK ("kind" IN ('payment', 'takeback'));
ALTER TABLE "PaymentPosting" ADD CONSTRAINT "PaymentPosting_level_check" CHECK ("coverageLevel" IN ('primary', 'secondary', 'tertiary'));
ALTER TABLE "PaymentPosting" ADD CONSTRAINT "PaymentPosting_paid_nonnegative" CHECK ("paidMinor" >= 0);

-- N2: a payer pays a claim once per coverage level for one adjudication (claim version + appeals decided). A repeat under a new
-- trace number is refused by the database even if the application check is bypassed; a takeback (reversed) frees the slot.
CREATE UNIQUE INDEX "PaymentPosting_one_live_payment" ON "PaymentPosting" ("claim", "payer", "coverageLevel", "round")
  WHERE "status" = 'posted' AND "kind" = 'payment';

-- m2: the claim state machine, forward only, exactly as the commands move it (mutations/claims.ts, remittance.ts,
-- messaging/claimWorker.ts). voided and closed are terminal. A change that keeps the status is not a move.
CREATE OR REPLACE FUNCTION dental_claim_status_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  allowed text[];
BEGIN
  IF NEW."status" IS NOT DISTINCT FROM OLD."status" THEN RETURN NEW; END IF;
  allowed := CASE OLD."status"
    WHEN 'draft' THEN ARRAY['scrubbed', 'ready', 'voided']
    WHEN 'scrubbed' THEN ARRAY['ready', 'voided']
    WHEN 'ready' THEN ARRAY['scrubbed', 'released', 'voided']
    WHEN 'rejected' THEN ARRAY['scrubbed', 'ready', 'correction_required', 'void_requested']
    WHEN 'correction_required' THEN ARRAY['scrubbed', 'ready', 'voided']
    WHEN 'released' THEN ARRAY['submitted']
    WHEN 'submitted' THEN ARRAY['acknowledged', 'rejected', 'released', 'submission_unknown', 'void_requested', 'adjudicated']
    WHEN 'submission_unknown' THEN ARRAY['acknowledged', 'correction_required', 'void_requested', 'adjudicated']
    WHEN 'acknowledged' THEN ARRAY['pending_payer', 'correction_required', 'void_requested', 'adjudicated']
    WHEN 'pending_payer' THEN ARRAY['correction_required', 'void_requested', 'adjudicated']
    WHEN 'adjudicated' THEN ARRAY['correction_required', 'void_requested', 'appealed']
    WHEN 'appealed' THEN ARRAY['appeal_decided', 'void_requested', 'adjudicated']
    WHEN 'appeal_decided' THEN ARRAY['correction_required', 'void_requested', 'appealed', 'adjudicated']
    WHEN 'void_requested' THEN ARRAY['voided', 'rejected', 'submission_unknown']
    ELSE ARRAY[]::text[]
  END;
  IF NOT (NEW."status" = ANY (allowed)) THEN
    RAISE EXCEPTION 'Claim_status_forward_only: % -> %', OLD."status", NEW."status" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "Claim_status_forward_only" BEFORE UPDATE OF "status" ON "Claim"
  FOR EACH ROW EXECUTE FUNCTION dental_claim_status_guard();
