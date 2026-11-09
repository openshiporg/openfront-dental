import { User } from './User'
import { Role } from './Role'
import { OAuthApp } from './OAuthApp'
import { OAuthToken } from './OAuthToken'
import * as platform from './platform'
import { AgentIdentity, AgentToolGrant, AgentRun, Proposal } from './agents'
import * as patients from './patients'
import * as scheduling from './scheduling'
import * as messaging from './messaging'
import * as portal from './portal'
import * as catalogue from './catalogue'
import * as clinical from './clinical'
import * as treatment from './treatment'
import * as insurance from './insurance'
import * as ledger from './ledger'
import * as claims from './claims'
import * as payments from './payments'
import * as memberships from './memberships'
import { applyPhiTiers } from '../security/phiFields'
import { sys } from '../access'

/**
 * Lists whose create/delete is server-only (`sys`) hide those buttons in the dashboard, so staff are
 * never offered an action the API will refuse. Access is still enforced by the operation rule.
 */
const hideRefusedActions = (lists: Record<string, any>) =>
  Object.fromEntries(Object.entries(lists).map(([key, config]) => {
    const op = config.access?.operation ?? {}
    const ui = { ...config.ui }
    if (op.create === sys && ui.hideCreate === undefined) ui.hideCreate = true
    if (op.delete === sys && ui.hideDelete === undefined) ui.hideDelete = true
    return [key, { ...config, ui }]
  }))

/**
 * Every list query is bounded (`graphql.maxTake`): a caller cannot ask for every row of a table in one request,
 * at the top level or on a nested relationship. Sizes cover the largest dashboard read (the schedule week view).
 */
const MAX_TAKE_DEFAULT = 1000
const MAX_TAKE: Record<string, number> = { Appointment: 3000 }
const boundTake = (lists: Record<string, any>) =>
  Object.fromEntries(Object.entries(lists).map(([key, config]) => [key, config.isSingleton ? config : { ...config, graphql: { ...config.graphql, maxTake: config.graphql?.maxTake ?? MAX_TAKE[key] ?? MAX_TAKE_DEFAULT } }]))

/** Only list configs (modules also export vocabularies such as OUTBOX_TOPICS). */
const listsOf = (mod: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(mod).filter(([, value]) => value && typeof value === 'object' && 'fields' in (value as object))) as Record<string, any>

export const models = boundTake(hideRefusedActions(applyPhiTiers({
  User,
  Role,
  OAuthApp,
  OAuthToken,
  ...listsOf(platform),
  AgentIdentity,
  AgentToolGrant,
  AgentRun,
  Proposal,
  ...listsOf(patients),
  ...listsOf(scheduling),
  ...listsOf(messaging),
  ...listsOf(portal),
  ...listsOf(catalogue),
  ...listsOf(clinical),
  ...listsOf(treatment),
  ...listsOf(insurance),
  ...listsOf(ledger),
  ...listsOf(claims),
  ...listsOf(payments),
  ...listsOf(memberships),
})))

export default models
