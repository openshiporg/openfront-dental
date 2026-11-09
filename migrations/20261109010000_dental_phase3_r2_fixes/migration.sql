-- Phase 3, review round 2.
--  1. A 271 answered with benefits sets Coverage.verificationLevel = 'verified_electronic'.
--  2. Downgrades: the amalgam codes the alternate benefit pays as (OF-R001/2/3), their fees in a new published
--     version of each existing fee schedule (published versions are immutable), and the plan downgrade rules.
--     Data steps run only where the sample practice's rows already exist; a fresh database gets them from the seed.

-- ── 1. Verification level ──────────────────────────────────────────────────────────────────────
ALTER TABLE "Coverage" DROP CONSTRAINT "Coverage_enums";
ALTER TABLE "Coverage" ADD CONSTRAINT "Coverage_enums" CHECK (
  "ordinal" IN ('primary','secondary','tertiary') AND "status" IN ('pending_verification','active','terminated','invalid')
  AND "verificationLevel" IN ('unverified','verified_electronic','verified_partial','verified_full'));

-- ── 2a. Amalgam codes (practice code system) ───────────────────────────────────────────────────
INSERT INTO "ProcedureCode" ("id","codeSystem","code","nomenclature","patientFriendlyName","category","areaRule","requiresSurfaces","maxSurfaces","effectiveFrom","isSynthetic")
SELECT v.id, cs.id, v.code, v.name, v.friendly, 'restorative', 'tooth_surface', true, v.max, DATE '2026-01-01', true
FROM (VALUES
  ('seed_code_of_r001','OF-R001','Amalgam, one surface, primary or permanent','Silver filling (1 surface)',1),
  ('seed_code_of_r002','OF-R002','Amalgam, two surfaces, primary or permanent','Silver filling (2 surfaces)',2),
  ('seed_code_of_r003','OF-R003','Amalgam, three surfaces, primary or permanent','Silver filling (3 surfaces)',3)
) AS v(id, code, name, friendly, max)
JOIN "CodeSystem" cs ON cs."key" = 'OF'
WHERE EXISTS (SELECT 1 FROM "ProcedureCode" WHERE "id" = 'seed_code_of_r010')
  AND NOT EXISTS (SELECT 1 FROM "ProcedureCode" p WHERE p."id" = v.id);

-- ── 2b. New fee schedule versions: every current fee, plus the amalgams ─────────────────────────
-- Office fees: 165.00 / 205.00 / 250.00. Plan fees: 78% of office, rounded to the dollar (as the seed does).
CREATE TEMP TABLE r2_amalgam_fee (code TEXT, office BIGINT, plan BIGINT);
INSERT INTO r2_amalgam_fee VALUES ('seed_code_of_r001', 16500, 12900), ('seed_code_of_r002', 20500, 16000), ('seed_code_of_r003', 25000, 19500);

CREATE TEMP TABLE r2_version (old_id TEXT, new_id TEXT, schedule TEXT, kind TEXT);
INSERT INTO r2_version
SELECT v."id", v."id" || '_r2', v."schedule", fs."kind"
FROM "FeeScheduleVersion" v JOIN "FeeSchedule" fs ON fs."id" = v."schedule"
WHERE v."id" IN ('seed_fee_office_2026','seed_fee_ppo_2026') AND v."status" = 'published' AND v."effectiveTo" IS NULL
  AND EXISTS (SELECT 1 FROM "ProcedureCode" WHERE "id" = 'seed_code_of_r001')
  AND NOT EXISTS (SELECT 1 FROM "Fee" f WHERE f."feeVersion" = v."id" AND f."code" = 'seed_code_of_r001')
  AND NOT EXISTS (SELECT 1 FROM "FeeScheduleVersion" n WHERE n."id" = v."id" || '_r2');

-- Draft first (fees can only be added to a draft), then published.
INSERT INTO "FeeScheduleVersion" ("id","label","schedule","effectiveFrom","status")
SELECT r.new_id, CASE WHEN r.kind = 'ppo' THEN '2026 plan fees (with amalgam)' ELSE '2026 office fees (with amalgam)' END, r.schedule, CURRENT_DATE - 1, 'draft' FROM r2_version r;

INSERT INTO "Fee" ("id","feeVersion","code","amountMinor","copayMinor")
SELECT r.new_id || '_' || f."code", r.new_id, f."code", f."amountMinor", f."copayMinor"
FROM r2_version r JOIN "Fee" f ON f."feeVersion" = r.old_id;

INSERT INTO "Fee" ("id","feeVersion","code","amountMinor")
SELECT r.new_id || '_' || a.code, r.new_id, a.code, CASE WHEN r.kind = 'ppo' THEN a.plan ELSE a.office END
FROM r2_version r CROSS JOIN r2_amalgam_fee a;

UPDATE "FeeScheduleVersion" SET "status" = 'published', "publishedAt" = now(), "version" = "version" + 1, "updatedAt" = now()
WHERE "id" IN (SELECT new_id FROM r2_version);

-- The previous version stops the day before (only effectiveTo changes on a published version). The new one starts
-- yesterday (UTC) so no practice-local day, west of UTC, falls between the two.
UPDATE "FeeScheduleVersion" SET "effectiveTo" = CURRENT_DATE - 2, "version" = "version" + 1, "updatedAt" = now()
WHERE "id" IN (SELECT old_id FROM r2_version);

-- ── 2c. Downgrade rules on the sample PPO plans: posterior composite → amalgam of the same surfaces ──
INSERT INTO "BenefitRule" ("id","plan","kind","appliesTo","downgradeToCode","note","source","observedAt")
SELECT 'seed_rule_' || p."id" || '_' || lower(replace(m.from_code, '-', '_')), p."id", 'downgrade', jsonb_build_object('fromCode', m.from_code, 'category', 'basic'), m.to_id,
       'Posterior composites are paid at the amalgam allowance (alternate benefit).', 'payer_portal', now()
FROM "InsurancePlan" p
CROSS JOIN (VALUES ('OF-R010','seed_code_of_r001'), ('OF-R011','seed_code_of_r002'), ('OF-R012','seed_code_of_r003')) AS m(from_code, to_id)
WHERE p."id" IN ('seed_plan_harbor_ppo','seed_plan_evergreen_ppo')
  AND EXISTS (SELECT 1 FROM "ProcedureCode" c WHERE c."id" = m.to_id)
  AND NOT EXISTS (SELECT 1 FROM "BenefitRule" r WHERE r."id" = 'seed_rule_' || p."id" || '_' || lower(replace(m.from_code, '-', '_')));
DROP TABLE r2_amalgam_fee; DROP TABLE r2_version;
