-- The clearinghouse has two real modes: manual_export (nothing connected, the office submits by hand) and live. No sandbox mode.
UPDATE "AdapterInstallation" SET "mode" = 'manual_export' WHERE "mode" = 'sandbox';
UPDATE "AdapterInstallation" SET "status" = 'configured' WHERE "status" = 'sandbox_verified';
UPDATE "EligibilityCheck" SET "mode" = 'manual_export' WHERE "mode" = 'sandbox';

ALTER TABLE "AdapterInstallation" DROP CONSTRAINT "AdapterInstallation_mode";
ALTER TABLE "AdapterInstallation" ADD CONSTRAINT "AdapterInstallation_mode" CHECK (mode IN ('manual_export', 'live'));

ALTER TABLE "EligibilityCheck" DROP CONSTRAINT "EligibilityCheck_enums";
ALTER TABLE "EligibilityCheck" ADD CONSTRAINT "EligibilityCheck_enums" CHECK (
  "status" IN ('queued','sent','responded','rejected','error_retryable','unknown') AND "mode" IN ('manual_export','live'));
COMMENT ON CONSTRAINT "EligibilityCheck_enums" ON "EligibilityCheck" IS NULL;
