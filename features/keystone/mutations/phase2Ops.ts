import * as catalogue from './catalogue'
import * as chart from './chart'
import * as clinical from './clinical'
import * as forms from './forms'
import * as plans from './plans'
import * as insurance from './insurance'
import * as claims from './claims'
import * as ledger from './ledger'
import * as payments from './payments'
import * as memberships from './memberships'
import * as close from './close'
import { PHASE2_ARGS } from './phase2Args'

/* Every Phase 2 command's resolver. index.ts builds the GraphQL schema from this table and PHASE2_ARGS. */

type Resolver = (root: unknown, args: any, context: any) => Promise<unknown>

const RESOLVERS: Record<string, Resolver> = {
  addChartProcedure: chart.addChartProcedure,
  addChartCondition: chart.addChartCondition,
  setConditionStatus: chart.setConditionStatus,
  removePlannedEntry: chart.removePlannedEntry,
  acceptChartEntry: chart.acceptChartEntry,
  scheduleChartEntry: chart.scheduleChartEntry,
  completeProcedure: chart.completeProcedure,
  correctProcedure: chart.correctProcedure,
  draftClinicalNote: clinical.draftClinicalNote,
  updateNoteDraft: clinical.updateNoteDraft,
  signClinicalNote: clinical.signClinicalNote,
  markNoteEnteredInError: clinical.markNoteEnteredInError,
  startPerioExam: clinical.startPerioExam,
  recordPerioMeasurements: clinical.recordPerioMeasurements,
  completePerioExam: clinical.completePerioExam,
  confirmPerioClassification: clinical.confirmPerioClassification,
  reviseSignedPerioExam: clinical.reviseSignedPerioExam,
  logAnesthetic: clinical.logAnesthetic,
  recordVitals: clinical.recordVitals,
  submitMedicalHistory: clinical.submitMedicalHistory,
  reviewMedicalHistory: clinical.reviewMedicalHistory,
  addMedication: clinical.addMedication,
  endMedication: clinical.endMedication,
  buildTreatmentPlan: plans.buildTreatmentPlan,
  updatePlanItem: plans.updatePlanItem,
  presentTreatmentPlan: plans.presentTreatmentPlan,
  acceptTreatmentPlan: plans.acceptTreatmentPlan,
  declineTreatmentPlan: plans.declineTreatmentPlan,
  reviseTreatmentPlan: plans.reviseTreatmentPlan,
  requestForm: forms.requestForm,
  submitForm: forms.submitForm,
  withdrawConsent: forms.withdrawConsent,
  publishFormVersion: forms.publishFormVersion,
  recordImagingStudy: forms.recordImagingStudy,
  uploadCodeImport: catalogue.uploadCodeImport,
  attestCodeLicence: catalogue.attestCodeLicence,
  requestCodeActivation: catalogue.requestCodeActivation,
  openFeeSchedule: catalogue.openFeeSchedule,
  createFeeVersion: catalogue.createFeeVersion,
  setFee: catalogue.setFee,
  requestFeePublish: catalogue.requestFeePublish,
  savePayer: insurance.savePayer,
  saveInsurancePlan: insurance.saveInsurancePlan,
  addCoverage: insurance.addCoverage,
  setCoverageOrder: insurance.setCoverageOrder,
  terminateCoverage: insurance.terminateCoverage,
  requestVerification: insurance.requestVerification,
  recheckEligibility: insurance.recheckEligibility,
  recordBenefitFact: insurance.recordBenefitFact,
  completeVerification: insurance.completeVerification,
  failVerification: insurance.failVerification,
  addOutsideHistory: insurance.addOutsideHistory,
  estimateTreatmentPlan: insurance.estimateTreatmentPlan,
  requestAdjustment: ledger.requestAdjustment,
  reverseLedgerEntry: ledger.reverseLedgerEntry,
  rebuildAccountBalance: ledger.rebuildAccountBalance,
  recordLicence: memberships.recordLicence,
  defineMembershipPlan: memberships.defineMembershipPlan,
  retireMembershipPlan: memberships.retireMembershipPlan,
  enrolMembership: memberships.enrolMembership,
  signMembershipAgreement: memberships.signMembershipAgreement,
  freezeMembership: memberships.freezeMembership,
  cancelMembership: memberships.cancelMembership,
  closeDay: close.closeDay,
  bankDeposit: close.bankDeposit,
  closePeriod: close.closePeriod,
  requestPeriodReopen: close.requestPeriodReopen,
  postRestatement: close.postRestatement,
  reclosePeriod: close.reclosePeriod,
  buildClaim: claims.createClaim,
  scrubClaim: claims.scrubClaimCommand,
  overrideScrub: claims.overrideScrub,
  releaseClaim: claims.releaseClaim,
  correctClaim: claims.correctClaim,
  voidClaim: claims.voidClaim,
  addClaimAttachment: claims.addClaimAttachment,
  saveClaimNarrative: claims.saveClaimNarrative,
  requestClaimStatus: claims.requestClaimStatus,
  enterManualEob: claims.enterManualEob,
  matchRemittance: claims.matchRemittance,
  startDenialWork: claims.startDenialWork,
  resolveDenial: claims.resolveDenial,
  fileAppeal: claims.fileAppeal,
  recordAppealOutcome: claims.recordAppealOutcome,
  takePayment: payments.takePayment,
  requestRefund: payments.requestRefund,
  recordRefundPaid: payments.recordRefundPaid,
  correctLedgerNote: payments.correctLedgerNote,
  generateStatements: payments.generateStatements,
  sendStatement: payments.sendStatement,
  holdStatements: payments.holdStatements,
  proposePaymentPlan: payments.proposePaymentPlan,
  activatePaymentPlan: payments.activatePaymentPlan,
  cancelPaymentPlan: payments.cancelPaymentPlan,
}

export const PHASE2_OPS = Object.fromEntries(Object.entries(PHASE2_ARGS).map(([name, args]) => [name, { args, fn: RESOLVERS[name] }]))

const signature = (args: Record<string, string>) => [...Object.entries(args).map(([k, v]) => `${k}: ${v}`), 'idempotencyKey: String!'].join(', ')

export const phase2TypeDefs = Object.entries(PHASE2_ARGS).map(([name, args]) => `        ${name}(${signature(args)}): JSON`).join('\n')
