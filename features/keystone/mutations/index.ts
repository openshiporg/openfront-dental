import { mergeSchemas } from '@graphql-tools/schema'
import type { GraphQLSchema } from 'graphql'
import redirectToInit from './redirectToInit'
import updateActiveUser from './updateActiveUser'
import { op } from './op'
import * as setup from './setup'
import * as audit from './audit'
import * as approvals from './approvals'
import * as mfa from './mfa'
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
      }
      input UserUpdateProfileInput { name: String, email: String, password: String, onboardingStatus: String }
      type Mutation {
        updateActiveUser(data: UserUpdateProfileInput!): User
        loadPracticeSetup(idempotencyKey: String!): JSON
        decideApprovalRequest(requestId: ID!, decision: String!, reason: String, expectedVersion: Int!, idempotencyKey: String!): JSON
        cancelApprovalRequest(requestId: ID!, expectedVersion: Int!, reason: String, idempotencyKey: String!): JSON
        requestPracticeControls(changes: JSON!, reason: String!, idempotencyKey: String!): JSON
        verifyMfa(code: String!, recovery: Boolean): JSON
        manageMfa(action: String!, password: String!, code: String, recovery: Boolean): JSON
      }
    `,
    resolvers: {
      Query: {
        redirectToInit,
        verifyAuditChain: op(audit.verifyAuditChain),
        mfaStatus: op(mfa.mfaStatus),
      },
      Mutation: {
        updateActiveUser,
        loadPracticeSetup: op(setup.loadPracticeSetup),
        decideApprovalRequest: op(approvals.decideApprovalRequest),
        cancelApprovalRequest: op(approvals.cancelApprovalRequest),
        requestPracticeControls: op(approvals.requestPracticeControls),
        verifyMfa: op(mfa.verifyMfa),
        manageMfa: op(mfa.manageMfa),
      },
    },
  })
}
