/* Argument types for every Phase 2 command. Kept free of server code so the dashboard's allowlist can import it. */

export const PHASE2_ARGS: Record<string, Record<string, string>> = {
  // Chart
  addChartProcedure: { patientId: 'ID!', locationId: 'ID!', codeId: 'ID!', site: 'JSON!', status: 'String', providerId: 'ID', appointmentId: 'ID', diagnosisCodes: '[String!]' },
  addChartCondition: { patientId: 'ID!', locationId: 'ID!', conditionId: 'ID!', site: 'JSON!', status: 'String' },
  setConditionStatus: { chartEntryId: 'ID!', status: 'String!', expectedVersion: 'Int!', reason: 'String' },
  removePlannedEntry: { chartEntryId: 'ID!', expectedVersion: 'Int!', reason: 'String!' },
  acceptChartEntry: { chartEntryId: 'ID!', expectedVersion: 'Int!' },
  scheduleChartEntry: { chartEntryId: 'ID!', expectedVersion: 'Int!', appointmentId: 'ID!' },
  completeProcedure: { chartEntryId: 'ID!', expectedVersion: 'Int!', providerId: 'ID!', dateOfService: 'String', feeMinor: 'String' },
  correctProcedure: { chartEntryId: 'ID!', expectedVersion: 'Int!', reason: 'String!', replacement: 'JSON' },
  // Notes
  draftClinicalNote: { patientId: 'ID!', appointmentId: 'ID', templateVersionId: 'ID', title: 'String', body: 'String', amendsNoteId: 'ID', refersToAt: 'String' },
  updateNoteDraft: { noteId: 'ID!', expectedVersion: 'Int!', title: 'String', body: 'String!' },
  signClinicalNote: { noteId: 'ID!', expectedVersion: 'Int!', password: 'String!' },
  markNoteEnteredInError: { noteId: 'ID!', expectedVersion: 'Int!', reason: 'String!' },
  // Perio
  startPerioExam: { patientId: 'ID!', locationId: 'ID!', examinerId: 'ID!', examDate: 'String' },
  recordPerioMeasurements: { examId: 'ID!', expectedVersion: 'Int!', measurements: '[JSON!]', findings: '[JSON!]' },
  completePerioExam: { examId: 'ID!', expectedVersion: 'Int!', password: 'String!', classificationInputs: 'JSON' },
  confirmPerioClassification: { classificationId: 'ID!', expectedVersion: 'Int!', stage: 'String!', grade: 'String!', reason: 'String' },
  reviseSignedPerioExam: { examId: 'ID!', reason: 'String!' },
  // Anaesthetic, vitals, history
  logAnesthetic: { patientId: 'ID!', appointmentId: 'ID', drug: 'String!', concentration: 'String', vasoconstrictor: 'String', carpules: 'String!', injectionSites: '[String!]' },
  recordVitals: { patientId: 'ID!', appointmentId: 'ID', systolic: 'Int', diastolic: 'Int', pulse: 'Int', asaClass: 'String' },
  submitMedicalHistory: { patientId: 'ID!', formId: 'ID!', answers: 'JSON!', via: 'String' },
  reviewMedicalHistory: { responseId: 'ID!', expectedVersion: 'Int!', acknowledgedChanges: '[String!]!', overrideReason: 'String', password: 'String!' },
  addMedication: { patientId: 'ID!', name: 'String!', dose: 'String', frequency: 'String' },
  endMedication: { medicationId: 'ID!' },
  // Treatment plans
  buildTreatmentPlan: { patientId: 'ID!', title: 'String!', chartEntryIds: '[ID!]!' },
  updatePlanItem: { itemId: 'ID!', phaseKey: 'String', priority: 'String', alternateGroup: 'String', feeMinor: 'String' },
  presentTreatmentPlan: { planId: 'ID!', expectedVersion: 'Int!', channel: 'String' },
  acceptTreatmentPlan: { planId: 'ID!', expectedVersion: 'Int!', versionHash: 'String!', selectedItemIds: '[ID!]!', signer: 'String!', signerName: 'String!', password: 'String!' },
  declineTreatmentPlan: { planId: 'ID!', expectedVersion: 'Int!', reason: 'String!' },
  reviseTreatmentPlan: { planId: 'ID!', reason: 'String!' },
  // Forms and consents
  requestForm: { patientId: 'ID!', templateVersionId: 'ID!', channel: 'String' },
  submitForm: { requestId: 'ID!', expectedVersion: 'Int!', data: 'JSON!', signerName: 'String!', signerRole: 'String!', password: 'String!', witnessUserId: 'ID' },
  withdrawConsent: { consentId: 'ID!', reason: 'String!' },
  publishFormVersion: { templateKey: 'String!', body: 'String!', fields: '[JSON!]', requiresWitness: 'Boolean' },
  recordImagingStudy: { patientId: 'ID!', modality: 'String!', teeth: '[String!]', acquiredAt: 'String' },
  // Codes and fees
  uploadCodeImport: { systemKey: 'String!', label: 'String!', editionYear: 'Int!', fileName: 'String!', rows: '[JSON!]!' },
  attestCodeLicence: { batchId: 'ID!', expectedVersion: 'Int!', licenceType: 'String!', licenceHolder: 'String!', agreementRef: 'String!' },
  requestCodeActivation: { batchId: 'ID!', expectedVersion: 'Int!' },
  openFeeSchedule: { name: 'String!', kind: 'String!', isDefault: 'Boolean' },
  createFeeVersion: { scheduleId: 'ID!', label: 'String!', effectiveFrom: 'String!' },
  setFee: { versionId: 'ID!', codeId: 'ID!', amountMinor: 'String!', copayMinor: 'String' },
  requestFeePublish: { versionId: 'ID!', expectedVersion: 'Int!' },
  // Phase 3: insurance
  savePayer: { payerId: 'ID', name: 'String!', kind: 'String!', stediPayerId: 'String', phone: 'String', timelyFilingDays: 'Int' },
  saveInsurancePlan: { planId: 'ID', payerId: 'ID!', groupName: 'String!', groupNumber: 'String', planType: 'String!', networkStatus: 'String!', feeScheduleId: 'ID', cobMethod: 'String', annualMax: 'String', deductible: 'String', deductibleFamily: 'String', benefitYearStartMonth: 'Int' },
  addCoverage: { patientId: 'ID!', planId: 'ID!', memberId: 'String!', relationship: 'String!', ordinal: 'String!', effectiveFrom: 'String!', subscriberFirstName: 'String', subscriberLastName: 'String', subscriberDateOfBirth: 'String' },
  setCoverageOrder: { coverageId: 'ID!', ordinal: 'String!', reason: 'String!' },
  terminateCoverage: { coverageId: 'ID!', expectedVersion: 'Int!', endedOn: 'String!', reason: 'String!' },
  requestVerification: { coverageId: 'ID!' },
  recheckEligibility: { checkId: 'ID!' },
  recordBenefitFact: { verificationId: 'ID!', field: 'String!', category: 'String', level: 'String', dollars: 'String', pct: 'String', count: 'Int', months: 'Int', group: 'String', method: 'String', flag: 'String', ageMin: 'String', ageMax: 'String', isUnknown: 'Boolean', source: 'String!', note: 'String' },
  completeVerification: { verificationId: 'ID!', expectedVersion: 'Int!' },
  failVerification: { verificationId: 'ID!', expectedVersion: 'Int!', reason: 'String!' },
  addOutsideHistory: { patientId: 'ID!', codeId: 'ID', codeText: 'String', frequencyGroup: 'String', tooth: 'String', dateOfService: 'String!', providerName: 'String', source: 'String!' },
  estimateTreatmentPlan: { planId: 'ID!' },
  // Ledger
  requestAdjustment: { patientId: 'ID!', locationId: 'ID!', typeId: 'ID!', amount: 'String!', reason: 'String!', relatedEntryId: 'ID' },
  reverseLedgerEntry: { entryId: 'ID!', reason: 'String!' },
  rebuildAccountBalance: { accountId: 'ID!' },
}

