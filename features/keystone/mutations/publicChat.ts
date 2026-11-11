import { systemActor } from '../lib/actor'
import { Codes, DomainError, isDomainError } from '../lib/errors'
import { infer } from '../lib/inference'
import { payloadHash } from '../lib/canonical'
import { MAX_CHAT_TURNS, buildSystemPrompt, cleanVisitorText, sanitizeReply, type PublicFacts } from '../lib/aiPure'
import { enforcePublicLimit } from '../security/publicRateLimit'
import type { Ctx } from './shared'

/*
 * Front Desk Assistant, web only (Phase 5 override: no texting). It answers from public practice facts and nothing else:
 * no patient, schedule, bill or staff data is ever put in its prompt, and it has no tools. A visitor's text is always treated as
 * possible personal health details, so it is never sent to a provider that may not hold it (the inference guard decides),
 * and the visitor is told to call the office instead.
 */

const actor = systemActor('front-desk-assistant')

export async function publicFacts(db: any, slug: string): Promise<{ facts: PublicFacts; siteId: string }> {
  const site = await db.storefrontSite.findUnique({ where: { slug: String(slug ?? '') }, include: { location: true } })
  if (!site || !site.isPublished) throw new DomainError(Codes.NOT_FOUND, 'Practice not found.')
  const practice = await db.practiceSettings.findUnique({ where: { id: 1 }, select: { displayName: true } })
  const locations = await db.location.findMany({ where: { isActive: true, ...(site.locationId ? { id: site.locationId } : {}) }, select: { name: true, address: true, phone: true }, orderBy: { name: 'asc' } })
  const addr = (a: any) => [a?.line1, a?.city, a?.state].filter(Boolean).join(', ')
  const services = Array.isArray(site.services) ? site.services.map((s: any) => String(s?.name ?? '')).filter(Boolean) : []
  return { siteId: site.id, facts: { practiceName: practice?.displayName || 'the practice', about: String(site.about ?? ''), services, locations: locations.map((l: any) => ({ name: l.name, address: addr(l.address), phone: l.phone || '' })) } }
}

export async function publicChat(_root: unknown, args: { slug: string; messages: unknown }, context: Ctx) {
  await enforcePublicLimit(context.prisma, { scope: 'chat', req: context.req })
  const { facts } = await publicFacts(context.prisma, args.slug)
  const incoming = Array.isArray(args.messages) ? args.messages : []
  const turns = incoming.slice(-MAX_CHAT_TURNS).map((m: any) => ({ role: m?.role === 'assistant' ? ('assistant' as const) : ('user' as const), content: cleanVisitorText(m?.content) })).filter(m => m.content)
  // The visitor can only speak as the visitor: any "assistant" turn they send is dropped, so they cannot forge what the assistant said.
  const visitor = turns.filter(t => t.role === 'user')
  const last = visitor[visitor.length - 1]
  if (!last) throw new DomainError(Codes.INVALID_INPUT, 'Type a question first.', { field: 'messages' })
  const callOffice = `I can't look at or discuss personal details here. Please call the office${facts.locations[0]?.phone ? ` at ${facts.locations[0].phone}` : ''} and the team will help.`
  // Fail closed: a visitor can type anything, and no pattern list can tell names or health details from other words. Visitor free text is always treated as PHI, so only a self-hosted or BAA-backed provider ever receives it.
  const carriesPhi = true
  const providerRow = await context.prisma.inferenceProvider.findFirst({ where: { isActive: true }, include: { baa: { select: { status: true, expiresOn: true } } }, orderBy: { createdAt: 'asc' } })
  if (!providerRow) return { reply: sanitizeReply('', facts), assistant: true }
  const started = new Date()
  const agent = await context.prisma.agentIdentity.findUnique({ where: { name: 'Front Desk Assistant' } }).catch(() => null)
  let reply: string, status = 'completed', model = providerRow.model
  try {
    const result = await infer({ ...providerRow, baa: providerRow.baa ?? null }, providerRow.key, { system: buildSystemPrompt(facts), messages: visitor.slice(-MAX_CHAT_TURNS), carriesPhi, maxTokens: 220 })
    reply = sanitizeReply(result.text, facts)
    model = result.model
  } catch (error) {
    status = 'failed'
    reply = isDomainError(error) && error.code === Codes.INFERENCE_PHI_BLOCKED ? callOffice : sanitizeReply('', facts)
  }
  // The run keeps a hash of the question, never the text.
  await context.prisma.agentRun.create({ data: { agentId: agent?.id ?? null, inferenceProviderId: providerRow.id, model, status, promptHash: payloadHash({ q: last.content }).slice(0, 32), endedAt: new Date(), startedAt: started, toolCalls: [] as never } }).catch(() => null)
  void actor
  return { reply, assistant: true }
}
