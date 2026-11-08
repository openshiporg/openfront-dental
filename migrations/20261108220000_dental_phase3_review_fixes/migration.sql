-- Phase 3 review fixes: the rules the commands enforce are now enforced by the database as well.
-- Each predicate was run against the live data first; the only rows that broke one are corrected below
-- (the rule is never dropped to fit the data).

-- ── Data corrections ─────────────────────────────────────────────────────────────────────────────

-- Two review estimates charged the patient the secondary's share twice (fee ≠ write-off + insurance + secondary + patient).
-- Estimates are append-only, so the corrected rows are written with the trigger paused inside this migration only.
-- `patientMinor` now means what the patient owes after BOTH plans (it used to be the amount before the secondary).
-- The old rule "secondary <= patient" is restated for that meaning: the secondary fits inside what the primary left.
ALTER TABLE "Estimate" DROP CONSTRAINT "Estimate_amounts";
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_amounts" CHECK (
  "feeMinor" >= 0 AND "allowedMinor" >= 0 AND "writeOffMinor" >= 0 AND "insuranceMinor" >= 0 AND "patientMinor" >= 0
  AND "deductibleAppliedMinor" >= 0 AND "maxAppliedMinor" >= 0 AND "secondaryInsuranceMinor" >= 0
  AND "allowedMinor" <= "feeMinor" AND "writeOffMinor" <= "feeMinor" AND "insuranceMinor" <= "feeMinor" AND "patientMinor" <= "feeMinor"
  AND "secondaryInsuranceMinor" <= "feeMinor" - "writeOffMinor" - "insuranceMinor");

-- Two review estimates charged the secondary's share twice (fee != write-off + insurance + secondary + patient).
-- Estimates are append-only, so the corrected rows are written with the trigger paused inside this migration only.
-- The secondary is capped to what the allowed amount can hold, and the patient owes the rest.
ALTER TABLE "Estimate" DISABLE TRIGGER "Estimate_append_only";
UPDATE "Estimate" SET
  "secondaryInsuranceMinor" = LEAST("secondaryInsuranceMinor", GREATEST("allowedMinor" - "insuranceMinor", 0)),
  "patientMinor" = "feeMinor" - "writeOffMinor" - "insuranceMinor" - LEAST("secondaryInsuranceMinor", GREATEST("allowedMinor" - "insuranceMinor", 0))
WHERE "feeMinor" <> "writeOffMinor" + "insuranceMinor" + "secondaryInsuranceMinor" + "patientMinor";
ALTER TABLE "Estimate" ENABLE TRIGGER "Estimate_append_only";

-- Checklist task titles read as plain questions, never as a raw field name.
UPDATE "WorkTask" SET "title" = CASE "taskKey"
  WHEN 'frequency_limit' THEN 'Ask the payer for frequency limits'
  WHEN 'waiting_period' THEN 'Ask about waiting periods'
  WHEN 'missing_tooth_clause' THEN 'Ask if a missing-tooth clause applies'
  WHEN 'downgrade' THEN 'Ask about downgrade (alternate benefit) rules'
  WHEN 'cob_method' THEN 'Ask which coordination-of-benefits method applies'
  WHEN 'frequency_used' THEN 'Ask what frequencies are already used this year'
  ELSE "title" END
WHERE "kind" = 'verification_checklist' AND "title" LIKE 'Ask the payer: %';

-- ── Coordination of benefits: maintenance of benefits joins the methods ──────────────────────────
ALTER TABLE "InsurancePlan" DROP CONSTRAINT "InsurancePlan_enums";
ALTER TABLE "InsurancePlan" ADD CONSTRAINT "InsurancePlan_enums" CHECK (
  "planType" IN ('ppo','indemnity','dhmo','medicaid','ma_dental','discount','other') AND "networkStatus" IN ('in_network','out_of_network')
  AND "cobMethod" IN ('standard','non_duplication','carve_out','maintenance_of_benefits','unknown'));
ALTER TABLE "InsurancePlan" ADD CONSTRAINT "InsurancePlan_currency" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_last4" CHECK (length("memberIdLast4") <= 4);

-- ── Estimate: the parts add up and stay inside the allowed amount ────────────────────────────────
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_parts_add_up" CHECK ("feeMinor" = "writeOffMinor" + "insuranceMinor" + "secondaryInsuranceMinor" + "patientMinor");
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_write_off" CHECK ("writeOffMinor" = 0 OR "writeOffMinor" = "feeMinor" - "allowedMinor");
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_within_allowed" CHECK ("insuranceMinor" + "secondaryInsuranceMinor" <= "allowedMinor");
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_covered_has_coverage" CHECK ("coverageStatus" <> 'covered' OR "coverage" IS NOT NULL);
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_subject_kind" CHECK ("subjectKind" IN ('plan_item','appointment','claim_line'));

-- ── BenefitFact: field, value and bounds ─────────────────────────────────────────────────────────
ALTER TABLE "BenefitFact" ADD CONSTRAINT "BenefitFact_has_coverage" CHECK ("coverage" IS NOT NULL);
ALTER TABLE "BenefitFact" ADD CONSTRAINT "BenefitFact_field_values" CHECK ("field" IN (
  'coverage_active','annual_max','annual_max_used','deductible','deductible_met','coverage_pct','frequency_limit','frequency_used','history_procedure',
  'waiting_period','missing_tooth_clause','downgrade','cob_method','ortho_max','ortho_used','non_covered','age_limit','other'));
ALTER TABLE "BenefitFact" ADD CONSTRAINT "BenefitFact_known_has_value" CHECK ("isUnknown" OR ("valueJson" IS NOT NULL AND "valueJson" <> '{}'::jsonb));
ALTER TABLE "BenefitFact" ADD CONSTRAINT "BenefitFact_pct_bounds" CHECK (
  "isUnknown" OR "field" NOT IN ('coverage_pct','non_covered')
  OR (CASE WHEN ("valueJson"->>'pct') ~ '^[0-9]+(\.[0-9]+)?$' THEN ("valueJson"->>'pct')::numeric BETWEEN 0 AND 100 ELSE false END));
ALTER TABLE "BenefitFact" ADD CONSTRAINT "BenefitFact_amount_bounds" CHECK (
  "isUnknown"
  OR (CASE WHEN "field" IN ('annual_max','deductible','ortho_max') THEN COALESCE("valueJson"->>'amountMinor','x') ~ '^[0-9]+$'
           WHEN "field" IN ('annual_max_used','deductible_met','ortho_used') THEN COALESCE("valueJson"->>'remainingMinor', "valueJson"->>'usedMinor', 'x') ~ '^[0-9]+$'
           ELSE true END));

-- A fact cannot be added to a coverage that has ended.
CREATE OR REPLACE FUNCTION dental_fact_coverage_open() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s TEXT;
BEGIN
  SELECT "status" INTO s FROM "Coverage" WHERE "id" = NEW."coverage";
  IF s IN ('terminated','invalid') THEN
    RAISE EXCEPTION 'This coverage has ended; benefits are not recorded for it' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "BenefitFact_coverage_open" BEFORE INSERT ON "BenefitFact" FOR EACH ROW EXECUTE FUNCTION dental_fact_coverage_open();

-- ── BenefitRule ──────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "BenefitRule" ADD CONSTRAINT "BenefitRule_kind_in" CHECK ("kind" IN (
  'coverage_pct','deductible_applies','frequency','age_limit','waiting_period','missing_tooth','downgrade','not_covered','requires_preauth','requires_attachment'));
ALTER TABLE "BenefitRule" ADD CONSTRAINT "BenefitRule_ages" CHECK (COALESCE("ageMin",0) >= 0 AND COALESCE("ageMax",0) >= 0);
ALTER TABLE "BenefitRule" ADD CONSTRAINT "BenefitRule_not_self_superseded" CHECK ("supersededBy" IS NULL OR "supersededBy" <> "id");

-- ── Other enums ──────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "Payer" ADD CONSTRAINT "Payer_kind_in" CHECK ("kind" IN ('commercial','medicaid','chip','medicare_advantage','tricare','other'));
ALTER TABLE "BenefitVerification" ADD CONSTRAINT "BenefitVerification_enums" CHECK (
  "trigger" IN ('signal','proposal','staff','online_booking','plan_year') AND "status" IN ('requested','in_progress','completed','failed')
  AND ("completeness" IS NULL OR "completeness" IN ('complete','partial')));
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_enums" CHECK (
  "kind" IN ('verification_checklist','note_sign','unsigned_plan_follow_up','lab_follow_up','rejection_fix','credit_review','other') AND "status" IN ('open','in_progress','done','cancelled'));
ALTER TABLE "Coverage" ADD CONSTRAINT "Coverage_relationship_in" CHECK ("relationship" IN ('self','spouse','child','other'));
ALTER TABLE "Coverage" ADD CONSTRAINT "Coverage_has_subscriber" CHECK ("subscriber" IS NOT NULL);
ALTER TABLE "Coverage" ADD CONSTRAINT "Coverage_terminated_has_end" CHECK ("status" <> 'terminated' OR "effectiveTo" IS NOT NULL);

-- Ending a coverage closes what was still open on it: the verification, its tasks and its electronic checks.
CREATE OR REPLACE FUNCTION dental_coverage_ended() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'terminated' AND OLD."status" <> 'terminated' THEN
    UPDATE "BenefitVerification" SET "status" = 'failed', "failureNote" = 'The coverage ended.', "version" = "version" + 1, "updatedAt" = now()
      WHERE "coverage" = NEW."id" AND "status" IN ('requested','in_progress');
    UPDATE "WorkTask" SET "status" = 'cancelled', "version" = "version" + 1, "updatedAt" = now()
      WHERE "subjectType" = 'Coverage' AND "subjectId" = NEW."id" AND "status" IN ('open','in_progress');
    UPDATE "EligibilityCheck" SET "status" = 'error_retryable', "resultNote" = 'The coverage ended.', "version" = "version" + 1, "updatedAt" = now()
      WHERE "coverage" = NEW."id" AND "status" IN ('queued','sent','unknown');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Coverage_ended_closes_work" AFTER UPDATE OF "status" ON "Coverage" FOR EACH ROW EXECUTE FUNCTION dental_coverage_ended();

-- ── EligibilityCheck: one call per delivery, one check in flight per coverage ───────────────────
ALTER TABLE "EligibilityCheck" ADD CONSTRAINT "EligibilityCheck_enums" CHECK (
  "status" IN ('queued','sent','responded','rejected','error_retryable','unknown') AND "mode" IN ('manual_export','sandbox'));
COMMENT ON CONSTRAINT "EligibilityCheck_enums" ON "EligibilityCheck" IS 'mode live is refused until go-live approval (Phase 8).';
DROP INDEX "EligibilityCheck_in_flight";
CREATE UNIQUE INDEX "EligibilityCheck_in_flight" ON "EligibilityCheck" ("coverage") WHERE "status" IN ('queued','sent','unknown');

-- A check becomes `sent` only from `queued`: a second delivery of the same message can never make a second payer call.
CREATE OR REPLACE FUNCTION dental_eligibility_claim_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'sent' AND OLD."status" IS DISTINCT FROM 'queued' THEN
    RAISE EXCEPTION 'An eligibility check is claimed only from queued (it is %)', OLD."status" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "EligibilityCheck_claim_once" BEFORE UPDATE OF "status" ON "EligibilityCheck" FOR EACH ROW EXECUTE FUNCTION dental_eligibility_claim_guard();

-- ── OutsideHistory: a record of care elsewhere is corrected by a new row, never edited ───────────
ALTER TABLE "OutsideHistory" ADD CONSTRAINT "OutsideHistory_not_future" CHECK ("dateOfService" IS NULL OR "dateOfService" <= current_date + 1);
ALTER TABLE "OutsideHistory" ADD CONSTRAINT "OutsideHistory_source_in" CHECK ("source" IN ('eligibility_271','payer_portal','payer_phone','fax_breakdown','prior_eob','patient_reported','practice_default'));
CREATE TRIGGER "OutsideHistory_append_only" BEFORE UPDATE OR DELETE ON "OutsideHistory" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "OutsideHistory_no_truncate" BEFORE TRUNCATE ON "OutsideHistory" FOR EACH STATEMENT EXECUTE FUNCTION dental_deny_update_delete();
