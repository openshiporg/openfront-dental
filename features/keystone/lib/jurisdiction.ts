// Jurisdiction packs (DOMAIN §1 context 18, SCHEMA §17, RESEARCH §8.5). State rules are never hard
// coded: supervision, retention, membership plans, EPCS/PDMP, minors' confidentiality, AI disclosure,
// escheat and GFE timing live in a versioned pack attached to each Location. Every value carries a
// `verify` flag until counsel or the practice confirms it, and the dashboard says so.
import { z } from 'zod'

const verified = <T extends z.ZodTypeAny>(value: T) => z.object({ value, verify: z.boolean(), note: z.string().optional(), source: z.string().optional() })

export const packRulesSchema = z.object({
  retention: verified(z.object({ adultYearsAfterLastVisit: z.number().int().min(1).max(50), minorYearsAfterMajority: z.number().int().min(0).max(30), majorityAge: z.number().int().min(16).max(21) })),
  supervision: verified(z.object({
    hygieneGeneralAllowed: z.boolean(),
    requiresDentistExamWithinMonths: z.number().int().min(0).max(36).nullable(),
    /** What the scheduler does when a hygiene visit has no dentist on site: hard stop or warning (I-S5). */
    enforcement: z.enum(['hard', 'warn']),
    assistantDuties: z.array(z.string()),
  })),
  membershipPlans: verified(z.object({ mode: z.enum(['allowed', 'registration_required', 'licence_required', 'prohibited']), licenceKind: z.string().nullable() })),
  epcs: verified(z.object({ required: z.boolean(), scope: z.enum(['controlled_only', 'all', 'none']) })),
  pdmp: verified(z.object({ requiredBeforeSchedules: z.array(z.string()) })),
  minorsConfidentiality: verified(z.object({ guardianSeesClinical: z.boolean(), confidentialCategories: z.array(z.string()) })),
  aiDisclosure: verified(z.object({ voice: z.boolean(), chat: z.boolean() })),
  escheat: verified(z.object({ dormancyYears: z.number().int().min(1).max(15) })),
  gfe: verified(z.object({ scheduledDaysAheadMin: z.number().int(), deliverWithinBusinessDays: z.number().int(), onRequestWithinBusinessDays: z.number().int() })),
  consent: verified(z.object({ quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/), quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/), restartKeywords: z.array(z.string()) })),
  /** Phase 7: who must agree before a call is recorded. Optional so packs stored before Phase 7 still parse; a missing rule reads as all-party (the strict default). */
  recording: verified(z.object({ mode: z.enum(['one_party', 'all_party']) })).optional(),
})

export type PackRules = z.infer<typeof packRulesSchema>

export type PackSeed = { key: string; version: string; name: string; rules: PackRules; sources: { id: string; title: string; url: string }[] }

const SOURCES = {
  ada: { id: 'S46', title: 'ADA, Record Retention', url: 'https://www.ada.org/resources/practice/practice-management/record-retention' },
  cms: { id: 'S38', title: 'CMS, No Surprises Act good faith estimate (uninsured / self-pay)', url: 'https://www.cms.gov/nosurprises' },
  fcc: { id: 'S41', title: 'FCC 24-17 Declaratory Ruling (AI-generated voices under the TCPA)', url: 'https://docs.fcc.gov/public/attachments/FCC-24-17A1.pdf' },
  adha: { id: 'S47', title: 'ADHA, Scope of practice / supervision by state', url: 'https://www.adha.org/advocacy/scope-of-practice/' },
}

/** Florida, the seed jurisdiction. Every value is a starting point flagged for verification. */
export const US_FL_2026_1: PackSeed = {
  key: 'US-FL',
  version: '2026.1',
  name: 'Florida (United States)',
  rules: {
    retention: { value: { adultYearsAfterLastVisit: 4, minorYearsAfterMajority: 0, majorityAge: 18 }, verify: true, note: 'Florida Board of Dentistry record-keeping rule sets a minimum period after the last visit; many practices keep 7+ years. Confirm with counsel.', source: 'S46' },
    supervision: { value: { hygieneGeneralAllowed: true, requiresDentistExamWithinMonths: 13, enforcement: 'warn', assistantDuties: ['radiographs_with_certification', 'coronal_polish_with_certification', 'sealants_with_certification'] }, verify: true, note: 'General supervision for many hygiene duties if the patient was examined by the dentist within a set period. Confirm the current Board rule.', source: 'S47' },
    membershipPlans: { value: { mode: 'registration_required', licenceKind: 'discount_medical_plan_organization' }, verify: true, note: 'In-house plans may fall under discount plan rules; confirm with the Office of Insurance Regulation or counsel before activating.' },
    epcs: { value: { required: true, scope: 'controlled_only' }, verify: true, note: 'Florida electronic prescribing requirement with exceptions; controlled substances need an EPCS-certified eRx partner.' },
    pdmp: { value: { requiredBeforeSchedules: ['II', 'III', 'IV'] }, verify: true, note: 'E-FORCSE check before prescribing controlled substances (exceptions apply).' },
    minorsConfidentiality: { value: { guardianSeesClinical: true, confidentialCategories: [] }, verify: true },
    aiDisclosure: { value: { voice: true, chat: true }, verify: true, note: 'Disclose AI at the start of every voice and chat conversation as a product rule regardless of state law.', source: 'S41' },
    escheat: { value: { dormancyYears: 5 }, verify: true, note: 'Unclaimed property dormancy for credit balances; confirm the current period with the Division of Unclaimed Property.' },
    gfe: { value: { scheduledDaysAheadMin: 3, deliverWithinBusinessDays: 1, onRequestWithinBusinessDays: 3 }, verify: true, source: 'S38' },
    consent: { value: { quietHoursStart: '20:00', quietHoursEnd: '08:00', restartKeywords: ['START', 'UNSTOP'] }, verify: true, note: 'Florida Telephone Solicitation Act limits calling hours for solicitations; reminders use the same window as policy.' },
    recording: { value: { mode: 'all_party' }, verify: true, note: 'Florida requires every party to agree before a call is recorded (s. 934.03). Confirm with counsel; the product never records without a stored consent.' },
  },
  sources: [SOURCES.ada, SOURCES.adha, SOURCES.cms, SOURCES.fcc],
}

/** Conservative defaults for a state without its own pack yet. */
export const US_GENERIC_2026_1: PackSeed = {
  key: 'US-generic',
  version: '2026.1',
  name: 'United States (conservative defaults)',
  rules: {
    retention: { value: { adultYearsAfterLastVisit: 10, minorYearsAfterMajority: 7, majorityAge: 18 }, verify: true, note: 'Longest common period; replace with the state rule.', source: 'S46' },
    supervision: { value: { hygieneGeneralAllowed: false, requiresDentistExamWithinMonths: null, enforcement: 'hard', assistantDuties: [] }, verify: true, source: 'S47' },
    membershipPlans: { value: { mode: 'licence_required', licenceKind: null }, verify: true },
    epcs: { value: { required: true, scope: 'controlled_only' }, verify: true },
    pdmp: { value: { requiredBeforeSchedules: ['II', 'III', 'IV', 'V'] }, verify: true },
    minorsConfidentiality: { value: { guardianSeesClinical: false, confidentialCategories: ['reproductive', 'substance_use', 'mental_health'] }, verify: true },
    aiDisclosure: { value: { voice: true, chat: true }, verify: true, source: 'S41' },
    escheat: { value: { dormancyYears: 3 }, verify: true },
    gfe: { value: { scheduledDaysAheadMin: 3, deliverWithinBusinessDays: 1, onRequestWithinBusinessDays: 3 }, verify: true, source: 'S38' },
    consent: { value: { quietHoursStart: '21:00', quietHoursEnd: '08:00', restartKeywords: ['START', 'UNSTOP'] }, verify: true },
    recording: { value: { mode: 'all_party' }, verify: true, note: 'Strictest common rule until the state is known.' },
  },
  sources: [SOURCES.ada, SOURCES.adha, SOURCES.cms, SOURCES.fcc],
}

export const PACKS = [US_FL_2026_1, US_GENERIC_2026_1]

export function parsePackRules(rules: unknown): PackRules {
  return packRulesSchema.parse(rules)
}

/** Values still flagged for verification, for the settings screen banner. */
export const unverifiedRules = (rules: PackRules) => Object.entries(rules).filter(([, rule]) => rule?.verify).map(([key]) => key)

/** Recording consent mode for a pack. No rule on the pack means every party must agree. */
export const recordingModeOf = (rules: unknown): 'one_party' | 'all_party' => {
  const mode = (rules as { recording?: { value?: { mode?: string } } } | null)?.recording?.value?.mode
  return mode === 'one_party' ? 'one_party' : 'all_party'
}
