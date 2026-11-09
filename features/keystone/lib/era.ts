import { toMinor } from './money'

/*
 * Stedi's 835 JSON report to our own shape (INTEGRATIONS §2.4). Pure: no database, no network.
 * Amounts follow the 835: a positive adjustment reduces the payment, a negative one increases it.
 * Money is read as decimal text into whole minor units; nothing passes through floating point.
 */

export type EraAdjustment = { group: string; reason: string; amountMinor: bigint }
export type EraLine = { lineControlNumber: string; code: string; dateOfService: string | null; chargeMinor: bigint; paidMinor: bigint; adjustments: EraAdjustment[]; remarks: string[] }
export type EraClaim = {
  patientControlNumber: string
  payerClaimControlNumber: string
  statusCode: string
  chargeMinor: bigint
  paidMinor: bigint
  patientRespMinor: bigint
  adjustments: EraAdjustment[]
  lines: EraLine[]
  crossoverCarrier: Record<string, string>
}
export type ParsedEra = {
  traceNumber: string
  paymentMethod: 'eft' | 'check' | 'virtual_card' | 'none'
  paymentDate: string | null
  totalPaidMinor: bigint
  payerName: string
  claims: EraClaim[]
  providerAdjustments: { reason: string; amountMinor: string }[]
}

const money = (value: unknown): bigint => {
  const text = String(value ?? '').trim()
  return /^-?\d+(\.\d+)?$/.test(text) ? toMinor(text) : 0n
}

const day = (value: unknown): string | null => {
  const text = String(value ?? '')
  return /^\d{8}$/.test(text) ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null
}

function adjustmentsOf(list: any[] | undefined): EraAdjustment[] {
  const out: EraAdjustment[] = []
  for (const item of list ?? []) {
    for (let n = 1; n <= 6; n += 1) {
      const reason = item?.[`adjustmentReasonCode${n}`]
      const amount = item?.[`adjustmentAmount${n}`]
      if (reason !== undefined && reason !== null && String(reason) !== '') out.push({ group: String(item.claimAdjustmentGroupCode ?? ''), reason: String(reason), amountMinor: money(amount) })
    }
  }
  return out
}

export function parseStediEra(body: any): ParsedEra[] {
  const parsed: ParsedEra[] = []
  for (const transaction of body?.transactions ?? []) {
    const method = String(transaction?.financialInformation?.paymentMethodCode ?? '')
    const claims: EraClaim[] = []
    for (const detail of transaction?.detailInfo ?? []) {
      for (const info of detail?.paymentInfo ?? []) {
        const cpi = info?.claimPaymentInfo ?? {}
        const lines: EraLine[] = (info?.serviceLines ?? []).map((line: any) => {
          const pay = line?.servicePaymentInformation ?? {}
          return {
            lineControlNumber: String(line?.lineItemControlNumber ?? ''),
            code: String(pay.adjudicatedProcedureCode ?? ''),
            dateOfService: day(line?.serviceDate),
            chargeMinor: money(pay.lineItemChargeAmount),
            paidMinor: money(pay.lineItemProviderPaymentAmount),
            adjustments: adjustmentsOf(line?.serviceAdjustments),
            remarks: (line?.healthCareCheckRemarkCodes ?? []).map((r: any) => String(r?.remarkCode ?? '')).filter(Boolean),
          }
        })
        claims.push({
          patientControlNumber: String(cpi.patientControlNumber ?? ''),
          payerClaimControlNumber: String(cpi.payerClaimControlNumber ?? ''),
          statusCode: String(cpi.claimStatusCode ?? ''),
          chargeMinor: money(cpi.totalClaimChargeAmount),
          paidMinor: money(cpi.claimPaymentAmount),
          patientRespMinor: money(cpi.patientResponsibilityAmount),
          adjustments: adjustmentsOf(info?.claimAdjustments),
          lines,
          crossoverCarrier: info?.crossoverCarrierName ? { name: String(info.crossoverCarrierName) } : {},
        })
      }
    }
    parsed.push({
      traceNumber: String(transaction?.paymentAndRemitReassociationDetails?.checkOrEFTTraceNumber ?? ''),
      paymentMethod: method === 'ACH' || method === 'FWT' ? 'eft' : method === 'CHK' ? 'check' : method === 'BOP' ? 'virtual_card' : 'none',
      paymentDate: day(transaction?.financialInformation?.checkIssueOrEFTEffectiveDate),
      totalPaidMinor: money(transaction?.financialInformation?.totalActualProviderPaymentAmount),
      payerName: String(transaction?.payer?.name ?? ''),
      claims,
      providerAdjustments: (transaction?.providerAdjustments ?? []).flatMap((p: any) => (p?.adjustments ?? []).map((a: any) => ({ reason: String(a?.adjustmentReasonCode ?? ''), amountMinor: money(a?.providerAdjustmentAmount).toString() }))),
    })
  }
  return parsed
}

/** Every line must balance: charge = paid + the sum of its adjustments (any group, either sign). */
export const lineConserves = (line: Pick<EraLine, 'chargeMinor' | 'paidMinor' | 'adjustments'>) =>
  line.chargeMinor === line.paidMinor + line.adjustments.reduce((sum, a) => sum + a.amountMinor, 0n)

/** Contractual obligations (CO) are written off. Patient responsibility (PR), payer-initiated (PI) and other (OA) stay on the account. */
export const writeOffMinor = (adjustments: Pick<EraAdjustment, 'group' | 'amountMinor'>[]) => adjustments.filter(a => a.group === 'CO').reduce((sum, a) => sum + a.amountMinor, 0n)
export const patientRespOf = (adjustments: Pick<EraAdjustment, 'group' | 'amountMinor'>[]) => adjustments.filter(a => a.group === 'PR').reduce((sum, a) => sum + a.amountMinor, 0n)

/** Claim status codes: 1-3 processed as primary/secondary/tertiary, 4 denied, 19-21 processed and forwarded, 22 reversal. */
export const ERA_STATUS = { denied: '4', reversal: '22', forwarded: ['19', '20', '21'] } as const
