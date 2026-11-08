import * as catalogue from './catalogue'
import * as chart from './chart'
import * as clinical from './clinical'
import * as forms from './forms'
import * as plans from './plans'
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
}

export const PHASE2_OPS = Object.fromEntries(Object.entries(PHASE2_ARGS).map(([name, args]) => [name, { args, fn: RESOLVERS[name] }]))

const signature = (args: Record<string, string>) => [...Object.entries(args).map(([k, v]) => `${k}: ${v}`), 'idempotencyKey: String!'].join(', ')

export const phase2TypeDefs = Object.entries(PHASE2_ARGS).map(([name, args]) => `        ${name}(${signature(args)}): JSON`).join('\n')
