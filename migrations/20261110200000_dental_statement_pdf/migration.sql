-- Statement PDF: the sha256 of the rendered document is stored when the statement is built and can be set once.
-- The PDF is always re-rendered from the frozen snapshot and served only if it still hashes to this value.
ALTER TABLE "Statement" ADD COLUMN "pdfSha256" TEXT NOT NULL DEFAULT '';

-- Pay link: the statement's random code opens one statement's balance until this time, and the time cannot be moved once set.
ALTER TABLE "Statement" ADD COLUMN "payLinkExpiresAt" TIMESTAMP(3);
UPDATE "Statement" SET "payLinkExpiresAt" = "createdAt" + INTERVAL '60 days' WHERE "payLinkExpiresAt" IS NULL;

CREATE OR REPLACE FUNCTION dental_statement_freeze() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW."snapshot" IS DISTINCT FROM OLD."snapshot" OR NEW."amountDueMinor" IS DISTINCT FROM OLD."amountDueMinor" OR NEW."payLinkCode" IS DISTINCT FROM OLD."payLinkCode"
     OR NEW."account" IS DISTINCT FROM OLD."account" OR NEW."cycleDate" IS DISTINCT FROM OLD."cycleDate" OR NEW."dueDate" IS DISTINCT FROM OLD."dueDate" THEN
    RAISE EXCEPTION 'A statement is a snapshot and cannot be changed. Generate a new one.' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."pdfSha256" <> '' AND NEW."pdfSha256" IS DISTINCT FROM OLD."pdfSha256" THEN
    RAISE EXCEPTION 'The statement document fingerprint is set once and cannot be changed.' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."payLinkExpiresAt" IS NOT NULL AND NEW."payLinkExpiresAt" IS DISTINCT FROM OLD."payLinkExpiresAt" THEN
    RAISE EXCEPTION 'The pay link expiry is set once and cannot be changed.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
