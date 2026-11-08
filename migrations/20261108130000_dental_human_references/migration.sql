-- Human references for staff screens: plain chart numbers (1001, 1002, ...) and normal sequence-style refs.
UPDATE "Patient" SET "chartNumber" = (1000 + substring("chartNumber" from 'PT-SEED-0*([0-9]+)')::int)::text WHERE "chartNumber" LIKE 'PT-SEED-%';
UPDATE "Appointment" SET "ref" = 'APT-2026-' || lpad(substring("ref" from 'APT-SEED-0*([0-9]+)'), 6, '0') WHERE "ref" LIKE 'APT-SEED-%';
UPDATE "TreatmentPlan" SET "ref" = 'TP-2026-' || lpad(substring("ref" from 'TP-SEED-0*([0-9]+)'), 6, '0') WHERE "ref" LIKE 'TP-SEED-%';
UPDATE "GuarantorAccount" SET "ref" = 'ACC-2026-' || lpad(substring("ref" from 'ACC-SEED-0*([0-9]+)'), 6, '0') WHERE "ref" LIKE 'ACC-SEED-%';
INSERT INTO "Sequence" ("id", "key", "nextValue")
SELECT 'seq_chart', 'chart', COALESCE(MAX("chartNumber"::int), 1000) + 1 FROM "Patient" WHERE "chartNumber" ~ '^[0-9]+$'
ON CONFLICT ("key") DO UPDATE SET "nextValue" = EXCLUDED."nextValue";
INSERT INTO "Sequence" ("id", "key", "nextValue")
SELECT 'seq_tp_2026', 'TP-2026', COALESCE(MAX(substring("ref" from '[0-9]+$')::int), 0) + 1 FROM "TreatmentPlan" WHERE "ref" ~ '^TP-2026-[0-9]+$'
ON CONFLICT ("key") DO UPDATE SET "nextValue" = GREATEST("Sequence"."nextValue", EXCLUDED."nextValue");
INSERT INTO "Sequence" ("id", "key", "nextValue")
SELECT 'seq_apt_2026', 'APT-2026', COALESCE(MAX(substring("ref" from '[0-9]+$')::int), 0) + 1 FROM "Appointment" WHERE "ref" ~ '^APT-2026-[0-9]+$'
ON CONFLICT ("key") DO UPDATE SET "nextValue" = GREATEST("Sequence"."nextValue", EXCLUDED."nextValue");
INSERT INTO "Sequence" ("id", "key", "nextValue")
SELECT 'seq_acc_2026', 'ACC-2026', COALESCE(MAX(substring("ref" from '[0-9]+$')::int), 0) + 1 FROM "GuarantorAccount" WHERE "ref" ~ '^ACC-2026-[0-9]+$'
ON CONFLICT ("key") DO UPDATE SET "nextValue" = GREATEST("Sequence"."nextValue", EXCLUDED."nextValue");
