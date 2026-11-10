-- Phase 4 r2 N4: requests made before ApprovalRequest carried its office and patient get them from the thing they approve,
-- so a single-office manager keeps seeing (and deciding) their own office's older requests. Data only; no schema change.
UPDATE "ApprovalRequest" r SET "location" = a."location", "patient" = a."patient", "account" = a."account"
  FROM "AdjustmentRequest" a WHERE r."targetList" = 'AdjustmentRequest' AND r."targetId" = a."id" AND r."location" IS NULL;

UPDATE "ApprovalRequest" r SET "location" = f."location", "account" = f."account", "patient" = p."patient"
  FROM "Refund" f LEFT JOIN "Payment" p ON p."id" = f."payment"
  WHERE r."targetList" = 'Refund' AND r."targetId" = f."id" AND r."location" IS NULL;

UPDATE "ApprovalRequest" r SET "location" = c."location"
  FROM "PeriodClose" c WHERE r."targetList" = 'PeriodClose' AND r."targetId" = c."id" AND r."location" IS NULL;

UPDATE "ApprovalRequest" r SET "location" = s."homeLocation", "patient" = m."survivor", "otherPatient" = m."merged"
  FROM "MergeCase" m LEFT JOIN "Patient" s ON s."id" = m."survivor"
  WHERE r."targetList" = 'MergeCase' AND r."targetId" = m."id" AND r."location" IS NULL;
