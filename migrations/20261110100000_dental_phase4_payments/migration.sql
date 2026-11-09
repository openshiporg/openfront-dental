
-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "payment" TEXT,
ADD COLUMN     "refund" TEXT;

-- CreateTable
CREATE TABLE "CreditBalance" (
    "id" TEXT NOT NULL,
    "account" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "arisenOn" DATE,
    "status" TEXT NOT NULL DEFAULT 'open',
    "dormancyDueOn" DATE,
    "noticeSentAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerNote" (
    "id" TEXT NOT NULL,
    "entry" TEXT,
    "text" TEXT NOT NULL DEFAULT '',
    "by" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "account" TEXT,
    "patient" TEXT,
    "location" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "refundedMinor" BIGINT NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT '',
    "tender" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'initiated',
    "adapterKey" TEXT NOT NULL DEFAULT '',
    "providerIntentId" TEXT NOT NULL DEFAULT '',
    "providerMethodId" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "methodToken" TEXT,
    "checkNumber" TEXT NOT NULL DEFAULT '',
    "receivedBy" TEXT,
    "source" TEXT NOT NULL,
    "statement" TEXT,
    "ledgerEntry" TEXT,
    "businessDate" DATE,
    "drawer" TEXT NOT NULL DEFAULT '',
    "failureNote" TEXT NOT NULL DEFAULT '',
    "disputedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "payment" TEXT,
    "ledgerEntry" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethodToken" (
    "id" TEXT NOT NULL,
    "account" TEXT,
    "adapterKey" TEXT NOT NULL DEFAULT '',
    "providerCustomerId" TEXT NOT NULL DEFAULT '',
    "providerMethodId" TEXT NOT NULL DEFAULT '',
    "brand" TEXT NOT NULL DEFAULT '',
    "last4" TEXT NOT NULL DEFAULT '',
    "expMonth" INTEGER,
    "expYear" INTEGER,
    "consentText" TEXT NOT NULL DEFAULT '',
    "consentAt" TIMESTAMP(3),
    "consentBy" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethodToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentPlan" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "account" TEXT,
    "patient" TEXT,
    "location" TEXT,
    "principalMinor" BIGINT NOT NULL,
    "downPaymentMinor" BIGINT NOT NULL DEFAULT 0,
    "interestRatePct" DECIMAL(9,4) NOT NULL,
    "schedule" JSONB DEFAULT '{}',
    "agreementText" TEXT NOT NULL DEFAULT '',
    "agreementHash" TEXT NOT NULL DEFAULT '',
    "agreedAt" TIMESTAMP(3),
    "agreedByName" TEXT NOT NULL DEFAULT '',
    "autopay" TEXT,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentPlanInstallment" (
    "id" TEXT NOT NULL,
    "plan" TEXT,
    "dueDate" DATE,
    "amountMinor" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'due',
    "payment" TEXT,
    "attempts" INTEGER DEFAULT 0,
    "lastAttemptOn" DATE,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentPlanInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "account" TEXT,
    "location" TEXT,
    "payment" TEXT,
    "target" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "reason" TEXT NOT NULL DEFAULT '',
    "approval" TEXT,
    "adapterRef" TEXT NOT NULL DEFAULT '',
    "requestedBy" TEXT,
    "approvedBy" TEXT,
    "ledgerEntry" TEXT,
    "failureNote" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Statement" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "account" TEXT,
    "location" TEXT,
    "cycleDate" DATE,
    "snapshot" JSONB DEFAULT '{}',
    "amountDueMinor" BIGINT NOT NULL,
    "dueDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "payLinkCode" TEXT NOT NULL DEFAULT '',
    "documentSha256" TEXT NOT NULL DEFAULT '',
    "sentAt" TIMESTAMP(3),
    "sentChannel" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Statement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditBalance_account_idx" ON "CreditBalance"("account");

-- CreateIndex
CREATE INDEX "LedgerNote_entry_idx" ON "LedgerNote"("entry");

-- CreateIndex
CREATE INDEX "LedgerNote_by_idx" ON "LedgerNote"("by");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_ref_key" ON "Payment"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_account_idx" ON "Payment"("account");

-- CreateIndex
CREATE INDEX "Payment_patient_idx" ON "Payment"("patient");

-- CreateIndex
CREATE INDEX "Payment_location_idx" ON "Payment"("location");

-- CreateIndex
CREATE INDEX "Payment_providerIntentId_idx" ON "Payment"("providerIntentId");

-- CreateIndex
CREATE INDEX "Payment_methodToken_idx" ON "Payment"("methodToken");

-- CreateIndex
CREATE INDEX "Payment_receivedBy_idx" ON "Payment"("receivedBy");

-- CreateIndex
CREATE INDEX "Payment_statement_idx" ON "Payment"("statement");

-- CreateIndex
CREATE INDEX "Payment_ledgerEntry_idx" ON "Payment"("ledgerEntry");

-- CreateIndex
CREATE INDEX "PaymentAllocation_payment_idx" ON "PaymentAllocation"("payment");

-- CreateIndex
CREATE INDEX "PaymentAllocation_ledgerEntry_idx" ON "PaymentAllocation"("ledgerEntry");

-- CreateIndex
CREATE INDEX "PaymentMethodToken_account_idx" ON "PaymentMethodToken"("account");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentPlan_ref_key" ON "PaymentPlan"("ref");

-- CreateIndex
CREATE INDEX "PaymentPlan_account_idx" ON "PaymentPlan"("account");

-- CreateIndex
CREATE INDEX "PaymentPlan_patient_idx" ON "PaymentPlan"("patient");

-- CreateIndex
CREATE INDEX "PaymentPlan_location_idx" ON "PaymentPlan"("location");

-- CreateIndex
CREATE INDEX "PaymentPlan_autopay_idx" ON "PaymentPlan"("autopay");

-- CreateIndex
CREATE INDEX "PaymentPlanInstallment_plan_idx" ON "PaymentPlanInstallment"("plan");

-- CreateIndex
CREATE INDEX "PaymentPlanInstallment_payment_idx" ON "PaymentPlanInstallment"("payment");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_ref_key" ON "Refund"("ref");

-- CreateIndex
CREATE INDEX "Refund_account_idx" ON "Refund"("account");

-- CreateIndex
CREATE INDEX "Refund_location_idx" ON "Refund"("location");

-- CreateIndex
CREATE INDEX "Refund_payment_idx" ON "Refund"("payment");

-- CreateIndex
CREATE INDEX "Refund_approval_idx" ON "Refund"("approval");

-- CreateIndex
CREATE INDEX "Refund_requestedBy_idx" ON "Refund"("requestedBy");

-- CreateIndex
CREATE INDEX "Refund_approvedBy_idx" ON "Refund"("approvedBy");

-- CreateIndex
CREATE INDEX "Refund_ledgerEntry_idx" ON "Refund"("ledgerEntry");

-- CreateIndex
CREATE UNIQUE INDEX "Statement_ref_key" ON "Statement"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "Statement_payLinkCode_key" ON "Statement"("payLinkCode");

-- CreateIndex
CREATE INDEX "Statement_account_idx" ON "Statement"("account");

-- CreateIndex
CREATE INDEX "Statement_location_idx" ON "Statement"("location");

-- CreateIndex
CREATE INDEX "LedgerEntry_payment_idx" ON "LedgerEntry"("payment");

-- CreateIndex
CREATE INDEX "LedgerEntry_refund_idx" ON "LedgerEntry"("refund");

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_refund_fkey" FOREIGN KEY ("refund") REFERENCES "Refund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditBalance" ADD CONSTRAINT "CreditBalance_account_fkey" FOREIGN KEY ("account") REFERENCES "GuarantorAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerNote" ADD CONSTRAINT "LedgerNote_entry_fkey" FOREIGN KEY ("entry") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerNote" ADD CONSTRAINT "LedgerNote_by_fkey" FOREIGN KEY ("by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_account_fkey" FOREIGN KEY ("account") REFERENCES "GuarantorAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_methodToken_fkey" FOREIGN KEY ("methodToken") REFERENCES "PaymentMethodToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receivedBy_fkey" FOREIGN KEY ("receivedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_statement_fkey" FOREIGN KEY ("statement") REFERENCES "Statement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_ledgerEntry_fkey" FOREIGN KEY ("ledgerEntry") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_ledgerEntry_fkey" FOREIGN KEY ("ledgerEntry") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethodToken" ADD CONSTRAINT "PaymentMethodToken_account_fkey" FOREIGN KEY ("account") REFERENCES "GuarantorAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_account_fkey" FOREIGN KEY ("account") REFERENCES "GuarantorAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_patient_fkey" FOREIGN KEY ("patient") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_autopay_fkey" FOREIGN KEY ("autopay") REFERENCES "PaymentMethodToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlanInstallment" ADD CONSTRAINT "PaymentPlanInstallment_plan_fkey" FOREIGN KEY ("plan") REFERENCES "PaymentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlanInstallment" ADD CONSTRAINT "PaymentPlanInstallment_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_account_fkey" FOREIGN KEY ("account") REFERENCES "GuarantorAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_ledgerEntry_fkey" FOREIGN KEY ("ledgerEntry") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_account_fkey" FOREIGN KEY ("account") REFERENCES "GuarantorAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ═══ Payment, refund, statement and plan invariants (SCHEMA §10.3-§10.10; DOMAIN I-L4, I-L5, I-L8) ═══
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amountMinor_bound" CHECK (abs("amountMinor") <= 1000000000);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_refundedMinor_bound" CHECK (abs("refundedMinor") <= 1000000000);
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_amountMinor_bound" CHECK (abs("amountMinor") <= 1000000000);
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_amountMinor_bound" CHECK (abs("amountMinor") <= 1000000000);
ALTER TABLE "CreditBalance" ADD CONSTRAINT "CreditBalance_amountMinor_bound" CHECK (abs("amountMinor") <= 1000000000);
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_amountDueMinor_bound" CHECK (abs("amountDueMinor") <= 1000000000);
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_principalMinor_bound" CHECK (abs("principalMinor") <= 1000000000);
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_downPaymentMinor_bound" CHECK (abs("downPaymentMinor") <= 1000000000);
ALTER TABLE "PaymentPlanInstallment" ADD CONSTRAINT "PaymentPlanInstallment_amountMinor_bound" CHECK (abs("amountMinor") <= 1000000000);

-- A payment is positive; what has been refunded is never more than what was paid; a settled payment has its ledger entry.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amountMinor" > 0 AND "refundedMinor" >= 0 AND "refundedMinor" <= "amountMinor");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_succeeded_has_entry" CHECK ("status" NOT IN ('succeeded','partially_refunded','refunded') OR "ledgerEntry" IS NOT NULL);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_refund_status" CHECK (("status" = 'refunded') = ("refundedMinor" = "amountMinor") AND ("status" <> 'partially_refunded' OR ("refundedMinor" > 0 AND "refundedMinor" < "amountMinor")));
CREATE UNIQUE INDEX "Payment_idempotencyKey_nonempty_key" ON "Payment"("idempotencyKey") WHERE "idempotencyKey" <> '';
CREATE UNIQUE INDEX "Payment_providerIntentId_nonempty_key" ON "Payment"("providerIntentId") WHERE "providerIntentId" <> '';

-- Allocations (I-L4): append-only; never more than the payment; never more than the charge; the charge is on the payment's account.
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_amount_positive" CHECK ("amountMinor" > 0);
CREATE UNIQUE INDEX "PaymentAllocation_payment_ledgerEntry_key" ON "PaymentAllocation"("payment", "ledgerEntry");
CREATE OR REPLACE FUNCTION dental_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE pay RECORD; chg RECORD; already BIGINT;
BEGIN
  SELECT * INTO pay FROM "Payment" WHERE "id" = NEW."payment" FOR UPDATE;
  SELECT * INTO chg FROM "LedgerEntry" WHERE "id" = NEW."ledgerEntry";
  IF pay."id" IS NULL OR chg."id" IS NULL THEN RAISE EXCEPTION 'An allocation needs a payment and a charge.' USING ERRCODE = 'check_violation'; END IF;
  IF chg."kind" <> 'charge' THEN RAISE EXCEPTION 'A payment is applied to charges only.' USING ERRCODE = 'check_violation'; END IF;
  IF chg."account" IS DISTINCT FROM pay."account" THEN RAISE EXCEPTION 'A payment can only be applied to charges on its own account.' USING ERRCODE = 'check_violation'; END IF;
  SELECT COALESCE(SUM("amountMinor"), 0) INTO already FROM "PaymentAllocation" WHERE "payment" = NEW."payment";
  IF already + NEW."amountMinor" > pay."amountMinor" THEN RAISE EXCEPTION 'More than the payment was applied. The rest stays as credit.' USING ERRCODE = 'check_violation'; END IF;
  SELECT COALESCE(SUM("amountMinor"), 0) INTO already FROM "PaymentAllocation" WHERE "ledgerEntry" = NEW."ledgerEntry";
  IF already + NEW."amountMinor" > chg."amountMinor" THEN RAISE EXCEPTION 'More than the charge was applied.' USING ERRCODE = 'check_violation'; END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "PaymentAllocation_guard" BEFORE INSERT ON "PaymentAllocation" FOR EACH ROW EXECUTE FUNCTION dental_allocation_guard();
CREATE TRIGGER "PaymentAllocation_append_only" BEFORE UPDATE OR DELETE ON "PaymentAllocation" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();

-- Refunds (I-L5): positive; approved by a different person than the requester; never more than the payment in total; a completed one is on the ledger.
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_second_person" CHECK ("status" IN ('requested','rejected') OR ("approvedBy" IS NOT NULL AND "approvedBy" IS DISTINCT FROM "requestedBy"));
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_completed_has_entry" CHECK ("status" <> 'completed' OR "ledgerEntry" IS NOT NULL);
CREATE OR REPLACE FUNCTION dental_refund_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE pay RECORD; total BIGINT;
BEGIN
  IF NEW."payment" IS NOT NULL AND NEW."status" NOT IN ('rejected','failed') THEN
    SELECT * INTO pay FROM "Payment" WHERE "id" = NEW."payment" FOR UPDATE;
    SELECT COALESCE(SUM("amountMinor"), 0) INTO total FROM "Refund" WHERE "payment" = NEW."payment" AND "status" NOT IN ('rejected','failed') AND "id" <> NEW."id";
    IF total + NEW."amountMinor" > pay."amountMinor" THEN RAISE EXCEPTION 'Refunds on a payment cannot add up to more than the payment.' USING ERRCODE = 'check_violation'; END IF;
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "Refund_guard" BEFORE INSERT OR UPDATE ON "Refund" FOR EACH ROW EXECUTE FUNCTION dental_refund_guard();
CREATE TRIGGER "Refund_no_delete" BEFORE DELETE ON "Refund" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();
CREATE TRIGGER "Payment_no_delete" BEFORE DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();

-- A ledger payment or refund row points at the payment or refund that made it.
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_payment_source" CHECK ("kind" <> 'patient_payment' OR "payment" IS NOT NULL OR "reverses" IS NOT NULL) NOT VALID;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_refund_source" CHECK ("kind" <> 'refund' OR "refund" IS NOT NULL) NOT VALID;
CREATE INDEX "LedgerEntry_payment_idx2" ON "LedgerEntry"("payment") WHERE "payment" IS NOT NULL;

-- Credit balances: one open row per account.
ALTER TABLE "CreditBalance" ADD CONSTRAINT "CreditBalance_amount_positive" CHECK ("amountMinor" > 0);
CREATE UNIQUE INDEX "CreditBalance_one_open_per_account" ON "CreditBalance"("account") WHERE "status" IN ('open','refund_requested','escheat_pending');

-- Card on file: a method token has consent and no more than the last four digits.
ALTER TABLE "PaymentMethodToken" ADD CONSTRAINT "PaymentMethodToken_shape" CHECK ("last4" ~ '^[0-9]{0,4}$' AND ("expMonth" IS NULL OR "expMonth" BETWEEN 1 AND 12) AND ("status" <> 'active' OR ("consentText" <> '' AND "consentAt" IS NOT NULL)));
CREATE UNIQUE INDEX "PaymentMethodToken_providerMethodId_key" ON "PaymentMethodToken"("providerMethodId") WHERE "providerMethodId" <> '';

-- Statements: a generated statement is a frozen snapshot with one pay link; one per account per cycle date.
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_amount_nonnegative" CHECK ("amountDueMinor" >= 0);
CREATE UNIQUE INDEX "Statement_account_cycleDate_key" ON "Statement"("account", "cycleDate");
CREATE OR REPLACE FUNCTION dental_statement_freeze() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW."snapshot" IS DISTINCT FROM OLD."snapshot" OR NEW."amountDueMinor" IS DISTINCT FROM OLD."amountDueMinor" OR NEW."payLinkCode" IS DISTINCT FROM OLD."payLinkCode"
     OR NEW."account" IS DISTINCT FROM OLD."account" OR NEW."cycleDate" IS DISTINCT FROM OLD."cycleDate" OR NEW."dueDate" IS DISTINCT FROM OLD."dueDate" THEN
    RAISE EXCEPTION 'A statement is a snapshot and cannot be changed. Generate a new one.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "Statement_freeze" BEFORE UPDATE ON "Statement" FOR EACH ROW EXECUTE FUNCTION dental_statement_freeze();
CREATE TRIGGER "Statement_no_delete" BEFORE DELETE ON "Statement" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();

-- Payment plans: no interest in this version; the instalments add up to the principal before the plan can run.
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_no_interest" CHECK ("interestRatePct" = 0);
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_amounts" CHECK ("principalMinor" > 0 AND "downPaymentMinor" >= 0);
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_active_has_agreement" CHECK ("status" IN ('proposed','cancelled') OR ("agreementHash" <> '' AND "agreedAt" IS NOT NULL));
ALTER TABLE "PaymentPlanInstallment" ADD CONSTRAINT "PaymentPlanInstallment_amount_positive" CHECK ("amountMinor" > 0);
CREATE UNIQUE INDEX "PaymentPlanInstallment_plan_dueDate_key" ON "PaymentPlanInstallment"("plan", "dueDate");
CREATE OR REPLACE FUNCTION dental_plan_sums() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE total BIGINT;
BEGIN
  IF NEW."status" IN ('active','delinquent','completed') AND OLD."status" = 'proposed' THEN
    SELECT COALESCE(SUM("amountMinor"), 0) INTO total FROM "PaymentPlanInstallment" WHERE "plan" = NEW."id";
    IF total <> NEW."principalMinor" THEN RAISE EXCEPTION 'The instalments must add up to the plan amount.' USING ERRCODE = 'check_violation'; END IF;
  END IF;
  IF OLD."status" <> 'proposed' AND (NEW."principalMinor" IS DISTINCT FROM OLD."principalMinor" OR NEW."agreementHash" IS DISTINCT FROM OLD."agreementHash") THEN
    RAISE EXCEPTION 'An agreed plan cannot be changed. Cancel it and make a new one.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER "PaymentPlan_sums" BEFORE UPDATE ON "PaymentPlan" FOR EACH ROW EXECUTE FUNCTION dental_plan_sums();
CREATE OR REPLACE FUNCTION dental_installment_frozen() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE st TEXT;
BEGIN
  SELECT "status" INTO st FROM "PaymentPlan" WHERE "id" = COALESCE(NEW."plan", OLD."plan");
  IF TG_OP = 'DELETE' AND st <> 'proposed' THEN RAISE EXCEPTION 'An agreed plan keeps its instalments.' USING ERRCODE = 'check_violation'; END IF;
  IF TG_OP = 'INSERT' AND st <> 'proposed' THEN RAISE EXCEPTION 'An agreed plan keeps its instalments.' USING ERRCODE = 'check_violation'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor" OR NEW."dueDate" IS DISTINCT FROM OLD."dueDate") AND st <> 'proposed' THEN
    RAISE EXCEPTION 'An agreed plan keeps its instalments.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $fn$;
CREATE TRIGGER "PaymentPlanInstallment_frozen" BEFORE INSERT OR UPDATE OR DELETE ON "PaymentPlanInstallment" FOR EACH ROW EXECUTE FUNCTION dental_installment_frozen();

-- Ledger notes only grow.
CREATE TRIGGER "LedgerNote_append_only" BEFORE UPDATE OR DELETE ON "LedgerNote" FOR EACH ROW EXECUTE FUNCTION dental_deny_update_delete();

-- Stripe webhook events are recorded once each.
CREATE UNIQUE INDEX "InboundObservation_stripe_event_key" ON "InboundObservation"("externalId") WHERE "source" = 'stripe';
