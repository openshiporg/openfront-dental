import { createHash, createHmac } from 'node:crypto'
import {
  getNamedType, isInterfaceType, isObjectType, Kind,
  type DocumentNode, type ExecutionResult, type FieldNode, type FragmentDefinitionNode, type GraphQLNamedType, type GraphQLSchema, type SelectionSetNode,
} from 'graphql'
import { PHI_FIELDS, type PhiTier } from './phiFields'

/*
 * PHI read audit (DOMAIN §7, I-P2): every GraphQL operation that selects a tiered field writes one
 * PhiReadAudit row with the lists, tiers and field names it touched and HMAC reference tokens for
 * the records returned. Never values, never raw ids.
 * adapted from openfront-hospital@d1b1180 features/keystone/security/phiReadAudit.ts (driven by the
 * phiFields tier map instead of hand-kept name sets)
 */

export type PhiReadDescriptor = {
  operationType: string
  operationName: string
  listKeys: string[]
  tiers: PhiTier[]
  fields: string[]
  fieldSetDigest: string
  recordCount: number
  recordIdsDigest: string
  resourceReferences: { list: string; ref: string }[]
  success: boolean
}

const fieldsOf = (type: GraphQLNamedType | null | undefined) => (type && (isObjectType(type) || isInterfaceType(type)) ? type.getFields() : null)
const childType = (parent: GraphQLNamedType | null | undefined, field: FieldNode) => {
  const definition = fieldsOf(parent)?.[field.name.value]
  return definition ? getNamedType(definition.type) : null
}

export function referenceToken(secret: string, list: string, id: string) {
  if (!secret || secret.length < 32) throw new Error('A strong PHI audit reference secret (SESSION_SECRET) is required.')
  return createHmac('sha256', secret).update(`${list}\0${id}`).digest('hex')
}

/**
 * Walks the selection against the schema and the result together. Keystone names a list's output
 * type after the list key, so `PHI_FIELDS[typeName]` is the lookup.
 */
export function phiReadAuditDescriptor(document: DocumentNode, operationName: string | null | undefined, result: ExecutionResult, schema: GraphQLSchema, secret: string): PhiReadDescriptor | null {
  const operations = document.definitions.filter(d => d.kind === Kind.OPERATION_DEFINITION)
  const operation = operationName ? operations.find(d => d.kind === Kind.OPERATION_DEFINITION && d.name?.value === operationName) : operations.length === 1 ? operations[0] : undefined
  if (!operation || operation.kind !== Kind.OPERATION_DEFINITION) return null
  const fragments = new Map<string, FragmentDefinitionNode>()
  for (const d of document.definitions) if (d.kind === Kind.FRAGMENT_DEFINITION) fragments.set(d.name.value, d)
  const rootType = operation.operation === 'query' ? schema.getQueryType() : operation.operation === 'mutation' ? schema.getMutationType() : schema.getSubscriptionType()

  const touched = new Map<string, Set<string>>() // list → fields
  const tiers = new Set<PhiTier>()
  const references = new Map<string, { list: string; ref: string }>()

  const walk = (selectionSet: SelectionSetNode, parent: GraphQLNamedType | null | undefined, value: unknown, seen: Set<string>) => {
    if (Array.isArray(value)) {
      for (const item of value) walk(selectionSet, parent, item, seen)
      // Still record the selection when the list came back empty: the query asked for PHI.
      if (value.length) return
    }
    const record = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
    const listTiers = parent ? PHI_FIELDS[parent.name] : undefined
    let selectedPhi = false
    for (const selection of selectionSet.selections) {
      if (selection.kind === Kind.FIELD) {
        const name = selection.name.value
        const tier = listTiers?.[name]
        if (tier && parent) {
          selectedPhi = true
          tiers.add(tier)
          if (!touched.has(parent.name)) touched.set(parent.name, new Set())
          touched.get(parent.name)!.add(name)
        }
        if (selection.selectionSet) walk(selection.selectionSet, childType(parent, selection), record?.[selection.alias?.value ?? name], new Set(seen))
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        const condition = selection.typeCondition ? schema.getType(selection.typeCondition.name.value) : parent
        walk(selection.selectionSet, condition || parent, value, seen)
      } else if (!seen.has(selection.name.value)) {
        const fragment = fragments.get(selection.name.value)
        if (fragment) {
          const next = new Set(seen)
          next.add(selection.name.value)
          walk(fragment.selectionSet, schema.getType(fragment.typeCondition.name.value) || parent, value, next)
        }
      }
    }
    if (selectedPhi && parent && record && typeof record.id === 'string' && record.id.length <= 200) {
      const ref = referenceToken(secret, parent.name, record.id)
      references.set(`${parent.name}:${ref}`, { list: parent.name, ref })
    }
  }
  walk(operation.selectionSet, rootType, result.data ?? null, new Set())
  if (!touched.size) return null

  const listKeys = [...touched.keys()].sort()
  const fields = listKeys.flatMap(list => [...touched.get(list)!].sort().map(field => `${list}.${field}`))
  const resourceReferences = [...references.values()].sort((a, b) => `${a.list}:${a.ref}`.localeCompare(`${b.list}:${b.ref}`)).slice(0, 2_000)
  return {
    operationType: operation.operation,
    operationName: operationName || operation.name?.value || 'anonymous',
    listKeys,
    tiers: [...tiers].sort() as PhiTier[],
    fields,
    fieldSetDigest: createHash('sha256').update(fields.join('\n')).digest('hex'),
    recordCount: resourceReferences.length,
    recordIdsDigest: resourceReferences.length ? createHash('sha256').update(resourceReferences.map(r => `${r.list}:${r.ref}`).join('\0')).digest('hex') : '',
    resourceReferences,
    success: !result.errors?.length,
  }
}

export type PhiReadContext = { userId?: string | null; agentId?: string | null; purpose?: string; correlationReference?: string; breakGlassId?: string | null }

export async function recordPhiReadAudit(prisma: any, actor: PhiReadContext, descriptor: PhiReadDescriptor) {
  await prisma.phiReadAudit.create({
    data: {
      actorUserId: actor.userId ?? null,
      actorAgentId: actor.agentId ?? null,
      actorReference: actor.userId ? `user:${actor.userId}` : actor.agentId ? `agent:${actor.agentId}` : 'system',
      purpose: actor.purpose ?? 'operations',
      operationType: descriptor.operationType,
      operationName: descriptor.operationName.slice(0, 200),
      listKeys: descriptor.listKeys,
      tiers: descriptor.tiers,
      fields: descriptor.fields,
      fieldSetDigest: descriptor.fieldSetDigest,
      recordCount: descriptor.recordCount,
      recordIdsDigest: descriptor.recordIdsDigest,
      resourceReferences: descriptor.resourceReferences,
      breakGlassId: actor.breakGlassId ?? null,
      success: descriptor.success,
      correlationReference: actor.correlationReference ?? '',
      at: new Date(),
    },
  })
}

/** For custom resolvers that return PHI as JSON (getPatientSummary etc.): record the read explicitly. */
export async function recordDirectPhiRead(prisma: any, actor: PhiReadContext, input: { operationName: string; list: string; ids: string[]; fields: string[]; tiers: PhiTier[] }, secret = process.env.SESSION_SECRET || '') {
  const refs = input.ids.map(id => ({ list: input.list, ref: referenceToken(secret, input.list, id) }))
  const fields = input.fields.map(f => `${input.list}.${f}`).sort()
  await recordPhiReadAudit(prisma, actor, {
    operationType: 'query',
    operationName: input.operationName,
    listKeys: [input.list],
    tiers: [...new Set(input.tiers)].sort() as PhiTier[],
    fields,
    fieldSetDigest: createHash('sha256').update(fields.join('\n')).digest('hex'),
    recordCount: refs.length,
    recordIdsDigest: refs.length ? createHash('sha256').update(refs.map(r => `${r.list}:${r.ref}`).join('\0')).digest('hex') : '',
    resourceReferences: refs,
    success: true,
  })
}

/** Yoga plugin: audit after execution; a failed audit write fails the response (no unaudited PHI). */
export function phiReadAuditPlugin(options: { schema: GraphQLSchema; prisma: () => any; secret: () => string }) {
  return {
    onExecute({ args }: any) {
      return {
        async onExecuteDone({ result, setResult }: any) {
          if (!result || typeof result !== 'object' || Symbol.asyncIterator in result) return
          const context = args.contextValue ?? {}
          const session = context.session
          let descriptor: PhiReadDescriptor | null = null
          try {
            descriptor = phiReadAuditDescriptor(args.document, args.operationName, result, options.schema, options.secret())
            if (!descriptor) return
            await recordPhiReadAudit(options.prisma(), {
              userId: session?.itemId ?? null,
              purpose: context.openfrontPurpose ?? 'operations',
              correlationReference: context.openfrontCorrelationReference ?? '',
            }, descriptor)
          } catch {
            setResult({ data: null, errors: [{ message: 'The read could not be recorded in the access log, so nothing was returned.', extensions: { code: 'PHI_AUDIT_FAILED' } }] })
          }
        },
      }
    },
  }
}
