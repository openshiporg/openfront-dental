import { list } from '@keystone-6/core'
import { calendarDay, checkbox, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { fixedChoice, lifecycle, minor, readOnly, systemText, versionField } from './domainFields'
import { governed } from './listAccess'
import { moneyFilter, scopedGoverned } from './scope'
import { trackingFields } from './trackingFields'

/*
 * Ledger support lists (SCHEMA §10.6, §10.11). Money is BIGINT minor units; every row here is written by a
 * command, never through the generated API. The database refuses what a command would also refuse (migration
 * 20261109200000_dental_phase4_ledger): sign by kind, mirrored reversals, closed periods, positive amounts.
 */

export const ADJUSTMENT_DIRECTIONS = ['credit', 'debit'] as const
export const ADJUSTMENT_CATEGORIES = ['courtesy', 'professional', 'bad_debt', 'small_balance', 'broken_appt_fee', 'membership_discount', 'other'] as const
export const ADJUSTMENT_STATUSES = ['requested', 'approved', 'posted', 'rejected'] as const
export const DAY_CLOSE_STATUSES = ['open', 'closing', 'closed'] as const
export const PERIOD_CLOSE_STATUSES = ['open', 'closing', 'closed', 'reopen_requested', 'reopened'] as const

export const AdjustmentType = list({
  access: governed('canReadLedger'),
  ui: { labelField: 'name', listView: { initialColumns: ['code', 'name', 'direction', 'category', 'approvalThresholdMinor', 'requiresApproval'] } },
  fields: {
    code: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    name: systemText({ required: true }),
    direction: fixedChoice(ADJUSTMENT_DIRECTIONS),
    category: fixedChoice(ADJUSTMENT_CATEGORIES),
    approvalThresholdMinor: minor({ required: true, description: 'At or above this amount a second person approves.' }),
    requiresApproval: checkbox({ defaultValue: false, ...readOnly }),
    isActive: checkbox({ defaultValue: true, ...readOnly }),
    ...trackingFields,
  },
})

export const AdjustmentRequest = list({
  access: scopedGoverned('canReadLedger', moneyFilter({ location: ['location'], patient: ['patient'], account: ['account'] })),
  ui: { labelField: 'reason', listView: { initialColumns: ['patient', 'type', 'amountMinor', 'status', 'createdAt'], initialSort: { field: 'createdAt', direction: 'DESC' } } },
  fields: {
    account: relationship({ ref: 'GuarantorAccount', ...readOnly }),
    patient: relationship({ ref: 'Patient', ...readOnly }),
    location: relationship({ ref: 'Location', ...readOnly }),
    type: relationship({ ref: 'AdjustmentType', ...readOnly }),
    amountMinor: minor({ required: true, description: 'Always positive; the type decides the direction.' }),
    reason: systemText({ required: true }),
    relatedEntry: relationship({ ref: 'LedgerEntry', ...readOnly }),
    status: lifecycle(ADJUSTMENT_STATUSES),
    approval: relationship({ ref: 'ApprovalRequest', ...readOnly }),
    postedEntry: relationship({ ref: 'LedgerEntry', ...readOnly }),
    requestedBy: relationship({ ref: 'User', ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const DayClose = list({
  access: scopedGoverned(['canCloseDay', 'canReadLedger'], moneyFilter({ location: ['location'] })),
  ui: { labelField: 'businessDate', listView: { initialColumns: ['location', 'businessDate', 'status', 'closedAt'] } },
  fields: {
    location: relationship({ ref: 'Location', ...readOnly }),
    businessDate: calendarDay({ ...readOnly }),
    status: lifecycle(DAY_CLOSE_STATUSES),
    daySheet: json({ defaultValue: {}, ...readOnly, ui: { ...readOnly.ui, description: 'Frozen totals by provider and tender.' } }),
    closedBy: relationship({ ref: 'User', ...readOnly }),
    closedAt: timestamp({ ...readOnly }),
    entries: relationship({ ref: 'LedgerEntry.dayClose', many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const PeriodClose = list({
  access: scopedGoverned(['canClosePeriod', 'canReadLedger'], moneyFilter({ location: ['location'] })),
  ui: { labelField: 'period', listView: { initialColumns: ['location', 'period', 'status', 'closedAt'] } },
  fields: {
    location: relationship({ ref: 'Location', ...readOnly }),
    period: systemText({ required: true }),
    status: lifecycle(PERIOD_CLOSE_STATUSES),
    approval: relationship({ ref: 'ApprovalRequest', ...readOnly }),
    closedBy: relationship({ ref: 'User', ...readOnly }),
    closedAt: timestamp({ ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const Restatement = list({
  access: scopedGoverned(['canClosePeriod', 'canReadLedger'], moneyFilter({ location: ['periodClose', 'location'] })),
  ui: { labelField: 'reason' },
  fields: {
    periodClose: relationship({ ref: 'PeriodClose', ...readOnly }),
    reason: systemText({ required: true }),
    entries: relationship({ ref: 'LedgerEntry.restatement', many: true, ...readOnly }),
    approvedBy: relationship({ ref: 'User', ...readOnly }),
    ...trackingFields,
  },
})
