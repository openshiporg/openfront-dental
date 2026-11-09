# Insurance, benefits, estimates and eligibility (Phase 3)

Fictional data only. No licensed procedure-code content; the estimator tests generate fake `D9xxx` codes at run time.

## Lists (`features/keystone/models/insurance.ts`)
Payer, Employer, InsurancePlan, BenefitRule, Subscriber, Coverage, BenefitVerification, BenefitFact, EligibilityCheck, OutsideHistory, Estimate, BenefitUsage, WorkTask. Member IDs are stored sealed (`SecretBox`) with a hash and the last four characters for display.

## Rules the database enforces (migration `20261108180000_dental_phase3_insurance`)
- Money and percent CHECKs on plans, rules and estimates; estimate parts cannot exceed the fee; an estimate that is not `covered` has insurance 0.
- An `unknown` estimate is always `assumed`.
- `BenefitFact` and `Estimate` are append-only; `BenefitRule` is immutable except for one `supersededBy` link.
- A fact from a 271 must point at the stored response; an unknown fact carries no value.
- One open coverage per patient and order; one verification in flight per coverage; one in-flight eligibility check per coverage and request hash; one open task per subject and key.

## Eligibility (`features/integrations/clearinghouse`, `messaging/eligibilityWorker.ts`)
`requestVerification` creates a verification and an `EligibilityCheck` and runs it straight after the commit. The step claims the check (`queued → sent`), calls the clearinghouse with **no transaction open**, and applies the outcome in a second guarded transaction:

| Outcome | Check status | Effect |
|---|---|---|
| 271 read | `responded` | raw response stored sealed as an `InboundObservation`; benefits become `eligibility_271` facts; checklist tasks open for what a 271 cannot say |
| payer rejection (AAA) | `rejected` | no facts; tasks for a person |
| timeout / 502–504 | `unknown` | no facts; **re-check reuses the same row and request hash**, never a second check |
| transient error | `error_retryable` | no facts |

Only the sandbox is built. Live is refused. The sample practice uses a recorded transport (`recorded.ts`, fixtures in `fixtures/`); no key, no network.

## Estimator (`lib/estimator.ts`, `lib/estimateInputs.ts`)
Pure and deterministic (`est-1.0.0`): fee → allowed → eligibility checks (frequency, age, waiting period, missing tooth, non-covered) → downgrade → deductible → coverage % → annual maximum → secondary by COB → patient. Half-even rounding once per line. Benefits the payer did not give are `unknown`: insurance pays 0 and the line is `assumed`, never shown as covered. Each snapshot stores the fact ids, fee schedule version, usage and estimator version. The golden workbook is `lib/estimator.golden.csv` (40 cases).

## Screens
Insurance plans (`/platform/insurance`), Verification worklist (`/platform/verifications`), and per-patient Insurance and estimates (`/platform/patients/:id/insurance`).
