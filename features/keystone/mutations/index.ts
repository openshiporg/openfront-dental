import { mergeSchemas } from '@graphql-tools/schema'
import type { GraphQLSchema } from 'graphql'
import redirectToInit from './redirectToInit'
import updateActiveUser from './updateActiveUser'
import { op } from './op'
import * as setup from './setup'
import * as audit from './audit'
import * as approvals from './approvals'
import * as ai from './ai'
import * as chat from './publicChat'
import * as mfa from './mfa'
import * as patients from './patients'
import * as scheduling from './scheduling'
import * as publicApi from './public'
import * as portal from './portal'
import { PHASE2_OPS, phase2TypeDefs } from './phase2Ops'
import '../lib/practiceControls'

const graphql = String.raw

// Every domain resolver checks permission itself and runs as one idempotent command: the state
// change, audit events and outbox messages commit in one transaction (features/keystone/lib).
export function extendGraphqlSchema(baseSchema: GraphQLSchema) {
  return mergeSchemas({
    schemas: [baseSchema],
    typeDefs: graphql`
      scalar JSON
      type Query {
        redirectToInit: Boolean
        verifyAuditChain: JSON
        mfaStatus: JSON
        findAvailability(locationId: ID!, typeId: ID!, fromDate: String!, days: Int, providerId: ID, operatoryIds: [ID!], patientId: ID, limit: Int): JSON
        publicSite(slug: String!): JSON
        aiHome: JSON
        publicChat(slug: String!, messages: JSON!): JSON
        publicAvailability(slug: String!, locationId: ID, typeId: ID!, fromDate: String!, days: Int, providerId: ID): JSON
        portalMe: JSON
        portalAppointments(patientId: ID!): JSON
      }
      input UserUpdateProfileInput { name: String, email: String, password: String, onboardingStatus: String }
      type Mutation {
        updateActiveUser(data: UserUpdateProfileInput!): User
        loadPracticeSetup(idempotencyKey: String!): JSON
        runSignalChecks(idempotencyKey: String!): JSON
        setAutonomyPolicy(kind: String!, mode: String!, idempotencyKey: String!): JSON
        decideProposal(proposalId: ID!, decision: String!, reason: String, expectedVersion: Int!, idempotencyKey: String!): JSON
        decideApprovalRequest(requestId: ID!, decision: String!, reason: String, expectedVersion: Int!, idempotencyKey: String!): JSON
        cancelApprovalRequest(requestId: ID!, expectedVersion: Int!, reason: String, idempotencyKey: String!): JSON
        requestPracticeControls(changes: JSON!, reason: String!, idempotencyKey: String!): JSON
        verifyMfa(code: String!, recovery: Boolean): JSON
        manageMfa(action: String!, password: String!, code: String, recovery: Boolean): JSON

        registerPatient(data: JSON!, acknowledgeDuplicates: Boolean, idempotencyKey: String!): JSON
        updatePatientDemographics(patientId: ID!, expectedVersion: Int!, changes: JSON!, reason: String, idempotencyKey: String!): JSON
        addContactPoint(patientId: ID!, kind: String!, value: String!, isPrimary: Boolean, idempotencyKey: String!): JSON
        deactivateContactPoint(contactPointId: ID!, reason: String!, idempotencyKey: String!): JSON
        recordConsent(contactPointId: ID!, channel: String!, purpose: String!, granted: Boolean!, source: String, evidence: JSON, reason: String, idempotencyKey: String!): JSON
${phase2TypeDefs}
        addPatientAlert(patientId: ID!, kind: String!, severity: String!, text: String!, idempotencyKey: String!): JSON
        endPatientAlert(alertId: ID!, reason: String!, idempotencyKey: String!): JSON
        linkGuarantor(patientId: ID!, guarantorPatientId: ID, personName: JSON, relationship: String!, idempotencyKey: String!): JSON
        setPatientStatus(patientId: ID!, status: String!, expectedVersion: Int!, dateOfDeath: String, reason: String!, idempotencyKey: String!): JSON
        proposeMerge(survivorId: ID!, mergedId: ID!, reason: String!, idempotencyKey: String!): JSON
        revertMerge(mergeCaseId: ID!, expectedVersion: Int!, reason: String!, idempotencyKey: String!): JSON

        holdSlot(locationId: ID!, operatoryId: ID!, typeId: ID!, startsAt: String!, providerId: ID, patientId: ID, idempotencyKey: String!): JSON
        releaseHold(holdId: ID!, idempotencyKey: String!): JSON
        bookAppointment(locationId: ID!, operatoryId: ID!, typeId: ID!, startsAt: String!, providerId: ID, patientId: ID!, holdId: ID, note: String, overrideTemplate: Boolean, overrideProviderClash: Boolean, overrideReason: String, idempotencyKey: String!): JSON
        confirmAppointment(appointmentId: ID!, expectedVersion: Int!, method: String!, idempotencyKey: String!): JSON
        markArrived(appointmentId: ID!, expectedVersion: Int!, overrideLabGate: Boolean, reason: String, idempotencyKey: String!): JSON
        seatPatient(appointmentId: ID!, expectedVersion: Int!, acknowledgeAlerts: Boolean, idempotencyKey: String!): JSON
        markReadyForCheckout(appointmentId: ID!, expectedVersion: Int!, reason: String, idempotencyKey: String!): JSON
        completeAppointment(appointmentId: ID!, expectedVersion: Int!, idempotencyKey: String!): JSON
        cancelAppointment(appointmentId: ID!, expectedVersion: Int!, reason: String!, idempotencyKey: String!): JSON
        markBroken(appointmentId: ID!, expectedVersion: Int!, kind: String!, reason: String, idempotencyKey: String!): JSON
        rescheduleAppointment(appointmentId: ID!, expectedVersion: Int!, locationId: ID!, operatoryId: ID!, typeId: ID!, startsAt: String!, providerId: ID, holdId: ID, overrideTemplate: Boolean, overrideProviderClash: Boolean, overrideReason: String, reason: String, idempotencyKey: String!): JSON
        addAsapEntry(patientId: ID!, locationId: ID!, appointmentTypeId: ID, providerId: ID, preferredWindows: JSON, earliestDate: String, note: String, priority: Int, idempotencyKey: String!): JSON
        closeAsapEntry(asapEntryId: ID!, status: String!, expectedVersion: Int!, reason: String, idempotencyKey: String!): JSON
        publishScheduleTemplate(templateId: ID!, expectedVersion: Int!, idempotencyKey: String!): JSON

        grantPortalAccess(patientId: ID!, email: String!, relationship: String!, capabilities: [String!], expiresAt: String, validUntilMajority: Boolean, idempotencyKey: String!): JSON
        revokePortalScope(portalScopeId: ID!, reason: String!, idempotencyKey: String!): JSON
        suspendPortalAccount(portalAccountId: ID!, reason: String!, idempotencyKey: String!): JSON

        publicHoldSlot(slug: String!, locationId: ID, typeId: ID!, operatoryId: ID!, startsAt: String!, providerId: ID, captchaToken: String, idempotencyKey: String!): JSON
        publicSubmitBooking(slug: String!, holdId: ID!, holdToken: String!, contact: JSON!, intake: JSON, insuranceCapture: JSON, captchaToken: String, idempotencyKey: String!): JSON
        reviewBookingRequest(requestId: ID!, decision: String!, expectedVersion: Int!, existingPatientId: ID, note: String, idempotencyKey: String!): JSON
        portalRequestCode(email: String!): JSON
        portalSession(email: String!, code: String!): JSON
        portalConfirm(appointmentId: ID!, expectedVersion: Int, idempotencyKey: String!): JSON
        portalCancel(appointmentId: ID!, expectedVersion: Int, reason: String, idempotencyKey: String!): JSON
        portalReschedule(appointmentId: ID!, expectedVersion: Int, operatoryId: ID!, startsAt: String!, providerId: ID, idempotencyKey: String!): JSON
        portalPreferences(patientId: ID!, changes: JSON, idempotencyKey: String): JSON
      }
    `,
    resolvers: {
      Query: {
        redirectToInit,
        verifyAuditChain: op(audit.verifyAuditChain),
        mfaStatus: op(mfa.mfaStatus),
        findAvailability: op(scheduling.findAvailability),
        publicSite: op(publicApi.publicSite),
        aiHome: op(ai.aiHome),
        publicChat: op(chat.publicChat),
        publicAvailability: op(publicApi.publicAvailability),
        portalMe: op(portal.portalMe),
        portalAppointments: op(portal.portalAppointments),
      },
      Mutation: {
        updateActiveUser,
        loadPracticeSetup: op(setup.loadPracticeSetup),
        decideApprovalRequest: op(approvals.decideApprovalRequest),
        runSignalChecks: op(ai.runSignalChecks),
        setAutonomyPolicy: op(ai.setAutonomyPolicy),
        decideProposal: op(ai.decideProposal),
        cancelApprovalRequest: op(approvals.cancelApprovalRequest),
        requestPracticeControls: op(approvals.requestPracticeControls),
        verifyMfa: op(mfa.verifyMfa),
        manageMfa: op(mfa.manageMfa),
        registerPatient: op(patients.registerPatient as any),
        updatePatientDemographics: op(patients.updatePatientDemographics as any),
        addContactPoint: op(patients.addContactPoint as any),
        deactivateContactPoint: op(patients.deactivateContactPoint as any),
        recordConsent: op(patients.recordConsent as any),
        addPatientAlert: op(patients.addPatientAlert as any),
        endPatientAlert: op(patients.endPatientAlert as any),
        linkGuarantor: op(patients.linkGuarantor as any),
        setPatientStatus: op(patients.setPatientStatus as any),
        proposeMerge: op(patients.proposeMerge as any),
        revertMerge: op(patients.revertMerge as any),
        ...Object.fromEntries(Object.entries(PHASE2_OPS).map(([name, spec]) => [name, op(spec.fn as any)])),
        holdSlot: op(scheduling.holdSlot as any),
        releaseHold: op(scheduling.releaseHold as any),
        bookAppointment: op(scheduling.bookAppointment as any),
        confirmAppointment: op(scheduling.confirmAppointment as any),
        markArrived: op(scheduling.markArrived as any),
        seatPatient: op(scheduling.seatPatient as any),
        markReadyForCheckout: op(scheduling.markReadyForCheckout as any),
        completeAppointment: op(scheduling.completeAppointment as any),
        cancelAppointment: op(scheduling.cancelAppointment as any),
        markBroken: op(scheduling.markBroken as any),
        rescheduleAppointment: op(scheduling.rescheduleAppointment as any),
        addAsapEntry: op(scheduling.addAsapEntry as any),
        closeAsapEntry: op(scheduling.closeAsapEntry as any),
        publishScheduleTemplate: op(scheduling.publishScheduleTemplate as any),
        grantPortalAccess: op(portal.grantPortalAccess as any),
        revokePortalScope: op(portal.revokePortalScope as any),
        suspendPortalAccount: op(portal.suspendPortalAccount as any),
        portalRequestCode: op(portal.portalRequestCode as any),
        portalSession: op(portal.portalSession as any),
        portalConfirm: op(portal.portalConfirm as any),
        portalCancel: op(portal.portalCancel as any),
        portalReschedule: op(portal.portalReschedule as any),
        portalPreferences: op(portal.portalPreferences as any),
        publicHoldSlot: op(publicApi.publicHoldSlot as any),
        publicSubmitBooking: op(publicApi.publicSubmitBooking as any),
        reviewBookingRequest: op(publicApi.reviewBookingRequest as any),
      },
    },
  })
}
