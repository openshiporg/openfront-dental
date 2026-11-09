-- Phase 4 review r1 fixes (B2, m1). Forward-only: no row is deleted or rewritten.

-- B2. A payment trace number is compared by its key: letters and digits only, upper case. "chk-71502", " CHK 71502 " and
-- "CHK-71502" are one payment. Mirrors traceKey() in features/keystone/mutations/remittance.ts.
CREATE OR REPLACE FUNCTION dental_trace_key(trace TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT upper(regexp_replace(trace, '[^A-Za-z0-9]', '', 'g'))
$$;

-- One live remittance per payer and trace key. Rows that already break the rule (a second live remittance with the same key,
-- posted before this fix) are kept as they are and left out of the index by id, so the index can be built without touching them;
-- every new row is checked. scripts/report-duplicate-remittances.ts lists them; they are corrected by a takeback, never by delete.
DO $$
DECLARE
  grandfathered TEXT[];
BEGIN
  SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO grandfathered FROM (
    SELECT id, row_number() OVER (PARTITION BY coalesce(payer, ''), dental_trace_key("traceNumber") ORDER BY "createdAt", id) AS n
    FROM "Remittance"
    WHERE status <> 'duplicate' AND dental_trace_key("traceNumber") <> ''
  ) ranked WHERE n > 1;
  IF array_length(grandfathered, 1) > 0 THEN
    RAISE NOTICE 'Remittance rows sharing a live trace key before this fix (kept, reported): %', grandfathered;
  END IF;
  DROP INDEX IF EXISTS "Remittance_payer_trace_key";
  EXECUTE format(
    'CREATE UNIQUE INDEX "Remittance_payer_trace_key" ON "Remittance" (coalesce("payer", %L), dental_trace_key("traceNumber")) WHERE "status" <> %L AND dental_trace_key("traceNumber") <> %L AND NOT ("id" = ANY (%L::TEXT[]))',
    '', 'duplicate', '', grandfathered
  );
END $$;

-- m1. A payment's money facts never change once written: amount, currency, account, patient, office, tender, reference, the
-- processor's intent (once known) and its ledger entry (once posted). Refunds only ever add up. Status moves forward only.
CREATE OR REPLACE FUNCTION dental_payment_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  allowed TEXT[];
BEGIN
  IF NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor" OR NEW."currencyCode" IS DISTINCT FROM OLD."currencyCode"
     OR NEW."account" IS DISTINCT FROM OLD."account" OR NEW."patient" IS DISTINCT FROM OLD."patient"
     OR NEW."location" IS DISTINCT FROM OLD."location" OR NEW."tender" IS DISTINCT FROM OLD."tender" OR NEW."ref" IS DISTINCT FROM OLD."ref"
     OR NEW."source" IS DISTINCT FROM OLD."source" OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey" THEN
    RAISE EXCEPTION 'Payment_frozen: the amount, account, patient, office, tender and reference of a payment cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."providerIntentId" <> '' AND NEW."providerIntentId" IS DISTINCT FROM OLD."providerIntentId" THEN
    RAISE EXCEPTION 'Payment_frozen: the processor payment id cannot change once recorded' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."ledgerEntry" IS NOT NULL AND NEW."ledgerEntry" IS DISTINCT FROM OLD."ledgerEntry" THEN
    RAISE EXCEPTION 'Payment_frozen: the ledger entry of a posted payment cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."refundedMinor" < OLD."refundedMinor" THEN
    RAISE EXCEPTION 'Payment_frozen: the refunded amount only grows' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    allowed := CASE OLD."status"
      WHEN 'initiated' THEN ARRAY['requires_action', 'succeeded', 'failed', 'unknown']
      WHEN 'requires_action' THEN ARRAY['succeeded', 'failed', 'unknown']
      WHEN 'unknown' THEN ARRAY['succeeded', 'failed']
      WHEN 'failed' THEN ARRAY['succeeded']
      WHEN 'succeeded' THEN ARRAY['partially_refunded', 'refunded']
      WHEN 'partially_refunded' THEN ARRAY['refunded']
      ELSE ARRAY[]::TEXT[]
    END;
    IF NOT (NEW."status" = ANY (allowed)) THEN
      RAISE EXCEPTION 'Payment_status_forward_only: a payment cannot move from % to %', OLD."status", NEW."status" USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "Payment_frozen" BEFORE UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION dental_payment_frozen();

-- A new payment always starts at the beginning of its life.
CREATE OR REPLACE FUNCTION dental_payment_starts_initiated() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" <> 'initiated' OR NEW."refundedMinor" <> 0 OR NEW."ledgerEntry" IS NOT NULL THEN
    RAISE EXCEPTION 'Payment_starts_initiated: a payment is created as initiated, with nothing posted or refunded' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "Payment_starts_initiated" BEFORE INSERT ON "Payment" FOR EACH ROW EXECUTE FUNCTION dental_payment_starts_initiated();
