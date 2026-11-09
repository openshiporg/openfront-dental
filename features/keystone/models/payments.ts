import { list } from '@keystone-6/core'
import { calendarDay, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { fixedChoice, lifecycle, minor, pct, readOnly, systemText, versionField } from './domainFields'
import { MONEY, moneyFilter, scopedGoverned, under, type MoneyPaths } from './scope'
import { trackingFields } from './trackingFields'

/*
 * Payments, refunds, statements and payment plans (SCHEMA §10.3-§10.10). Money is BIGINT minor units. Every row is written by a
 * command; the generated create/update operations are closed. The database backs the rules that matter (migration
 * 20261110100000_dental_phase4_payments): a payment is positive and refunds never exceed it, allocations never exceed the payment
 * or the charge, a refund's approver is a second person, a plan carries no interest and its instalments add up, and a statement's
 * snapshot and pay-link code are frozen once generated.
 */

export const PAYMENT_TENDERS = ['card', 'ach', 'cash', 'check', 'financing', 'membership_credit', 'other'] as const
export const PAYMENT_STATUSES = ['initiated', 'requires_action', 'succeeded', 'failed', 'unknown', 'partially_refunded', 'refunded'] as const
export const PAYMENT_SOURCES = ['front_desk', 'pay_link', 'autopay', 'portal_api', 'payment_plan', 'membership'] as const
export const TOKEN_STATUSES = ['active', 'revoked', 'expired'] as const
export const REFUND_TARGETS = ['patient', 'payer'] as const
export const REFUND_METHODS = ['original_tender', 'check', 'ach'] as const
export const REFUND_STATUSES = ['requested', 'approved', 'executing', 'completed', 'failed', 'unknown', 'rejected'] as const
export const CREDIT_STATUSES = ['open', 'refund_requested', 'refunded', 'applied', 'transferred', 'escheat_pending', 'escheat_reported'] as const
export const STATEMENT_STATUSES = ['generated', 'sent', 'paid', 'partially_paid', 'overdue', 'payment_plan', 'collections_hold', 'suppressed'] as const
export const PLAN_STATUSES = ['proposed', 'active', 'delinquent', 'completed', 'cancelled'] as const
export const INSTALLMENT_STATUSES = ['due', 'paid', 'failed', 'missed'] as const

const READ = ['canReadLedger', 'canTakePayments', 'canIssueRefunds', 'canApproveRefunds'] as never
const scoped = (spec: MoneyPaths) => scopedGoverned(READ, moneyFilter(spec))
const PLAN: MoneyPaths = { location: ['location'], patient: ['patient'], account: ['account'] }

export const PaymentMethodToken = list({
  access: scoped({ guarantor: ['account', 'guarantor'] }),
  ui: { labelField: 'last4', listView: { initialColumns: ['brand', 'last4', 'expMonth', 'expYear', 'status'] } },
  fields: {
    account: relationship({ ref: 'GuarantorAccount', ...readOnly }),
    adapterKey: systemText({ required: true }),
    providerCustomerId: systemText(),
    providerMethodId: systemText(),
    brand: systemText(),
    last4: systemText(),
    expMonth: integer({ ...readOnly }),
    expYear: integer({ ...readOnly }),
    consentText: systemText(),
    consentAt: timestamp({ ...readOnly }),
    consentBy: systemText(),
    status: lifecycle(TOKEN_STATUSES),
    version: versionField(),
    ...trackingFields,
  },
})

export const Statement = list({
  access: scoped({ location: ['location'], account: ['account'] }),
  ui: { labelField: 'ref', listView: { initialColumns: ['ref', 'account', 'cycleDate', 'amountDueMinor', 'dueDate', 'status'], initialSort: { field: 'createdAt', direction: 'DESC' } } },
  fields: {
    ref: systemText({ indexed: 'unique', required: true }),
    account: relationship({ ref: 'GuarantorAccount', ...readOnly }),
    location: relationship({ ref: 'Location', ...readOnly }),
    cycleDate: calendarDay({ ...readOnly }),
    snapshot: json({ defaultValue: {}, ...readOnly }),
    amountDueMinor: minor({ required: true }),
    dueDate: calendarDay({ ...readOnly }),
    status: lifecycle(STATEMENT_STATUSES),
    payLinkCode: systemText({ indexed: 'unique', required: true }),
    documentSha256: systemText(),
    pdfSha256: systemText(),
    payLinkExpiresAt: timestamp({ ...readOnly }),
    sentAt: timestamp({ ...readOnly }),
    sentChannel: systemText(),
    payments: relationship({ ref: 'Payment.statement', many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const Payment = list({
  access: scoped(MONEY.payment),
  ui: { labelField: 'ref', listView: { initialColumns: ['ref', 'account', 'tender', 'amountMinor', 'status', 'businessDate'], initialSort: { field: 'createdAt', direction: 'DESC' } } },
  fields: {
    ref: systemText({ indexed: 'unique', required: true }),
    account: relationship({ ref: 'GuarantorAccount', ...readOnly }),
    patient: relationship({ ref: 'Patient', ...readOnly }),
    location: relationship({ ref: 'Location', ...readOnly }),
    amountMinor: minor({ required: true }),
    refundedMinor: minor({ defaultValue: 0n }),
    currencyCode: systemText(),
    tender: fixedChoice(PAYMENT_TENDERS),
    status: lifecycle(PAYMENT_STATUSES),
    adapterKey: systemText(),
    providerIntentId: systemText({ indexed: true }),
    providerMethodId: systemText(),
    idempotencyKey: systemText({ indexed: 'unique', required: true }),
    methodToken: relationship({ ref: 'PaymentMethodToken', ...readOnly }),
    checkNumber: systemText(),
    receivedBy: relationship({ ref: 'User', ...readOnly }),
    source: fixedChoice(PAYMENT_SOURCES),
    statement: relationship({ ref: 'Statement.payments', ...readOnly }),
    ledgerEntry: relationship({ ref: 'LedgerEntry', ...readOnly }),
    businessDate: calendarDay({ ...readOnly }),
    drawer: systemText(),
    failureNote: systemText(),
    disputedAt: timestamp({ ...readOnly }),
    allocations: relationship({ ref: 'PaymentAllocation.payment', many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const PaymentAllocation = list({
  access: scoped(under(['payment'], MONEY.payment)),
  ui: { labelField: 'amountMinor', listView: { initialColumns: ['payment', 'ledgerEntry', 'amountMinor'] } },
  fields: {
    payment: relationship({ ref: 'Payment.allocations', ...readOnly }),
    ledgerEntry: relationship({ ref: 'LedgerEntry', ...readOnly }),
    amountMinor: minor({ required: true }),
    ...trackingFields,
  },
})

export const Refund = list({
  access: scoped({ location: ['location'], account: ['account'] }),
  ui: { labelField: 'ref', listView: { initialColumns: ['ref', 'account', 'amountMinor', 'method', 'status', 'createdAt'], initialSort: { field: 'createdAt', direction: 'DESC' } } },
  fields: {
    ref: systemText({ indexed: 'unique', required: true }),
    account: relationship({ ref: 'GuarantorAccount', ...readOnly }),
    location: relationship({ ref: 'Location', ...readOnly }),
    payment: relationship({ ref: 'Payment', ...readOnly }),
    target: fixedChoice(REFUND_TARGETS),
    amountMinor: minor({ required: true }),
    method: fixedChoice(REFUND_METHODS),
    status: lifecycle(REFUND_STATUSES),
    reason: systemText(),
    approval: relationship({ ref: 'ApprovalRequest', ...readOnly }),
    adapterRef: systemText(),
    requestedBy: relationship({ ref: 'User', ...readOnly }),
    approvedBy: relationship({ ref: 'User', ...readOnly }),
    ledgerEntry: relationship({ ref: 'LedgerEntry', ...readOnly }),
    failureNote: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})

export const CreditBalance = list({
  access: scoped({ guarantor: ['account', 'guarantor'] }),
  ui: { labelField: 'status', listView: { initialColumns: ['account', 'amountMinor', 'arisenOn', 'status', 'dormancyDueOn'] } },
  fields: {
    account: relationship({ ref: 'GuarantorAccount', ...readOnly }),
    amountMinor: minor({ required: true }),
    arisenOn: calendarDay({ ...readOnly }),
    status: lifecycle(CREDIT_STATUSES),
    dormancyDueOn: calendarDay({ ...readOnly }),
    noticeSentAt: timestamp({ ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const PaymentPlan = list({
  access: scoped(PLAN),
  ui: { labelField: 'ref', listView: { initialColumns: ['ref', 'account', 'principalMinor', 'status', 'createdAt'], initialSort: { field: 'createdAt', direction: 'DESC' } } },
  fields: {
    ref: systemText({ indexed: 'unique', required: true }),
    account: relationship({ ref: 'GuarantorAccount', ...readOnly }),
    patient: relationship({ ref: 'Patient', ...readOnly }),
    location: relationship({ ref: 'Location', ...readOnly }),
    principalMinor: minor({ required: true, description: 'The amount spread over the instalments (after any payment up front).' }),
    downPaymentMinor: minor({ defaultValue: 0n }),
    interestRatePct: pct({ required: true, description: 'Always 0: plans are interest-free in this version.' }),
    schedule: json({ defaultValue: {}, ...readOnly }),
    agreementText: systemText(),
    agreementHash: systemText(),
    agreedAt: timestamp({ ...readOnly }),
    agreedByName: systemText(),
    autopay: relationship({ ref: 'PaymentMethodToken', ...readOnly }),
    status: lifecycle(PLAN_STATUSES),
    installments: relationship({ ref: 'PaymentPlanInstallment.plan', many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const PaymentPlanInstallment = list({
  access: scoped(under(['plan'], PLAN)),
  ui: { labelField: 'dueDate', listView: { initialColumns: ['plan', 'dueDate', 'amountMinor', 'status'] } },
  fields: {
    plan: relationship({ ref: 'PaymentPlan.installments', ...readOnly }),
    dueDate: calendarDay({ ...readOnly }),
    amountMinor: minor({ required: true }),
    status: lifecycle(INSTALLMENT_STATUSES),
    payment: relationship({ ref: 'Payment', ...readOnly }),
    attempts: integer({ defaultValue: 0, ...readOnly }),
    lastAttemptOn: calendarDay({ ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

/** A correction to how an entry reads. The ledger row is never edited; the screen shows the latest note instead of its memo. */
export const LedgerNote = list({
  access: scopedGoverned(['canReadLedger'], moneyFilter(under(['entry'], MONEY.ledgerEntry))),
  ui: { labelField: 'text', listView: { initialColumns: ['entry', 'text', 'createdAt'] } },
  fields: {
    entry: relationship({ ref: 'LedgerEntry', ...readOnly }),
    text: systemText({ required: true }),
    by: relationship({ ref: 'User', ...readOnly }),
    ...trackingFields,
  },
})

void text
