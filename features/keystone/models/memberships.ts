import { list } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, timestamp } from '@keystone-6/core/fields'
import { fixedChoice, lifecycle, minor, pct, readOnly, systemText, versionField } from './domainFields'
import { governed } from './listAccess'
import { moneyFilter, scopedGoverned, under, type MoneyPaths } from './scope'
import { trackingFields } from './trackingFields'

/*
 * In-house membership plans (SCHEMA §11, STATE-MACHINES §8) and the day's deposit (SCHEMA §10.11). Every row is written by a command;
 * the generated create/update operations are closed. The database backs what matters (migration 20261110300000_dental_phase4_memberships):
 * a plan's price and discount are in range, a membership is active only with a signed agreement and a period, an agreement and the
 * membership ledger are append-only, and a first payment funds one membership only.
 */

export const MEMBERSHIP_AGE_BANDS = ['child', 'adult', 'perio'] as const
export const MEMBERSHIP_INTERVALS = ['monthly', 'annual'] as const
export const MEMBERSHIP_PLAN_STATUSES = ['draft', 'active', 'retired'] as const
export const MEMBERSHIP_STATUSES = ['pending_agreement', 'active', 'past_due', 'frozen', 'cancelled', 'expired'] as const
export const MEMBERSHIP_LEDGER_KINDS = ['activate', 'charge', 'benefit_issue', 'benefit_use', 'benefit_reverse', 'discount', 'discount_reverse', 'freeze', 'unfreeze', 'cancel', 'renew'] as const
export const LICENCE_KINDS = ['discount_plan_operator', 'other'] as const
export const DEPOSIT_STATUSES = ['open', 'banked'] as const

const MANAGE = ['canManageMemberships', 'canReadLedger', 'canTakePayments'] as never
const plans = () => governed(MANAGE)
const MEMBER: MoneyPaths = { location: ['location'], patient: ['patient'], account: ['payer'] }
const scopedByPatient = scopedGoverned(MANAGE, moneyFilter(MEMBER))

export const RegulatoryLicence = list({
  access: governed(['canManageMemberships', 'canReadLedger']),
  ui: { labelField: 'number', listView: { initialColumns: ['kind', 'jurisdiction', 'number', 'effectiveFrom', 'effectiveTo'] } },
  fields: {
    kind: fixedChoice(LICENCE_KINDS),
    jurisdiction: systemText({ required: true }),
    number: systemText({ required: true }),
    effectiveFrom: calendarDay({ ...readOnly }),
    effectiveTo: calendarDay({ ...readOnly }),
    evidence: systemText(),
    ...trackingFields,
  },
})

export const MembershipPlan = list({
  access: plans(),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'ageBand', 'priceMinor', 'interval', 'status'] } },
  fields: {
    name: systemText({ indexed: 'unique', required: true }),
    ageBand: fixedChoice(MEMBERSHIP_AGE_BANDS),
    priceMinor: minor({ required: true }),
    interval: fixedChoice(MEMBERSHIP_INTERVALS),
    includedBenefits: json({ defaultValue: [], ...readOnly, ui: { ...readOnly.ui, description: 'Covered visits per period, by procedure family.' } }),
    discountPct: pct({ required: true, description: 'Percent off the office fee for work that is not a covered visit.' }),
    termsText: systemText(),
    termsHash: systemText(),
    renewalNoticeDays: integer({ defaultValue: 30, ...readOnly }),
    cancellationPolicy: json({ defaultValue: {}, ...readOnly }),
    locations: relationship({ ref: 'Location', many: true, ...readOnly }),
    status: lifecycle(MEMBERSHIP_PLAN_STATUSES),
    version: versionField(),
    ...trackingFields,
  },
})

export const PatientMembership = list({
  access: scopedByPatient,
  ui: { labelField: 'ref', listView: { initialColumns: ['ref', 'patient', 'plan', 'status', 'currentPeriodEnd'], initialSort: { field: 'createdAt', direction: 'DESC' } } },
  fields: {
    ref: systemText({ indexed: 'unique', required: true }),
    patient: relationship({ ref: 'Patient', ...readOnly }),
    plan: relationship({ ref: 'MembershipPlan', ...readOnly }),
    location: relationship({ ref: 'Location', ...readOnly }),
    payer: relationship({ ref: 'GuarantorAccount', ...readOnly }),
    status: lifecycle(MEMBERSHIP_STATUSES),
    currentPeriodStart: calendarDay({ ...readOnly }),
    currentPeriodEnd: calendarDay({ ...readOnly }),
    autoRenew: checkbox({ defaultValue: true, ...readOnly }),
    agreement: relationship({ ref: 'MembershipAgreement', ...readOnly }),
    cancelledReason: systemText(),
    entries: relationship({ ref: 'MembershipLedgerEntry.membership', many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const MembershipAgreement = list({
  access: scopedGoverned(MANAGE, moneyFilter(under(['membership'], MEMBER))),
  ui: { labelField: 'signerName' },
  fields: {
    membership: relationship({ ref: 'PatientMembership', ...readOnly }),
    termsHash: systemText({ required: true }),
    priceSnapshotMinor: minor({ required: true }),
    disclosures: json({ defaultValue: {}, ...readOnly }),
    affirmativeConsentHash: systemText({ required: true }),
    signerName: systemText({ required: true }),
    signedAt: timestamp({ ...readOnly }),
    ...trackingFields,
  },
})

export const MembershipLedgerEntry = list({
  access: scopedGoverned(MANAGE, moneyFilter(under(['membership'], MEMBER))),
  ui: { labelField: 'kind', listView: { initialColumns: ['membership', 'kind', 'codeFamily', 'quantity', 'at'], initialSort: { field: 'at', direction: 'DESC' } } },
  fields: {
    membership: relationship({ ref: 'PatientMembership.entries', ...readOnly }),
    kind: fixedChoice(MEMBERSHIP_LEDGER_KINDS),
    codeFamily: systemText(),
    quantity: integer({ ...readOnly }),
    chartEntry: relationship({ ref: 'ChartEntry', ...readOnly }),
    ledgerEntry: relationship({ ref: 'LedgerEntry', ...readOnly }),
    at: timestamp({ ...readOnly }),
    ...trackingFields,
  },
})

const READ_MONEY = ['canCloseDay', 'canReadLedger', 'canTakePayments'] as never
export const DepositBatch = list({
  access: scopedGoverned(READ_MONEY, moneyFilter({ location: ['location'] })),
  ui: { labelField: 'ref', listView: { initialColumns: ['ref', 'location', 'businessDate', 'totalMinor', 'status'], initialSort: { field: 'businessDate', direction: 'DESC' } } },
  fields: {
    ref: systemText({ indexed: 'unique', required: true }),
    location: relationship({ ref: 'Location', ...readOnly }),
    businessDate: calendarDay({ ...readOnly }),
    dayClose: relationship({ ref: 'DayClose', ...readOnly }),
    totalMinor: minor({ required: true }),
    status: lifecycle(DEPOSIT_STATUSES),
    lines: relationship({ ref: 'DepositLine.batch', many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const DepositLine = list({
  access: scopedGoverned(READ_MONEY, moneyFilter({ location: ['batch', 'location'] })),
  ui: { labelField: 'tender' },
  fields: {
    batch: relationship({ ref: 'DepositBatch.lines', ...readOnly }),
    payment: relationship({ ref: 'Payment', ...readOnly }),
    tender: systemText({ required: true }),
    amountMinor: minor({ required: true }),
    ...trackingFields,
  },
})

