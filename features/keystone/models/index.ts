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

/** Only list configs (modules also export vocabularies such as OUTBOX_TOPICS). */
const listsOf = (mod: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(mod).filter(([, value]) => value && typeof value === 'object' && 'fields' in (value as object))) as Record<string, any>

export const models = hideRefusedActions(applyPhiTiers({
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
}))

export default models
