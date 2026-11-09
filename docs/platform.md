# Platform spine (Phase 0)

Everything a dental practice's records depend on before a patient exists: who
may see what, how every change is recorded, how risky changes get a second
person, and how nothing leaves the building without a business associate
agreement.

## Practice, locations and staff

| List | Purpose |
| --- | --- |
| `PracticeSettings` | Singleton (`id = 1`, enforced by a database CHECK). Display name, time zone, schedule unit (5/10/15 min), session length (1–12 h), break-glass window (5–240 min), MFA requirement, AI autonomy switch, currency. |
| `Location` | Each office, with its jurisdiction pack, place-of-service code and time zone. |
| `BillingEntity` | Tax ID / group NPI that claims are billed under. |
| `ProviderProfile` | Dentists and hygienists: NPI (Luhn-checked), specialty, schedule colour. |
| `Credential` | Licence, DEA, CPR, radiography and similar, each with its own validity window. |
| `StaffAssignment` | Who works where, over which dates. Location-scoped reads use these windows. |

`PracticeSettings` is changed only through the `practice.controls` approval
(below). The applier checks the version the requester saw (`baseVersion`), so
two requests prepared against the same settings can't both apply.

## Roles and access

Roles are permission sets (see `features/keystone/access.ts`).
`canBreakGlass` and `canBreakGlassRecords` are never granted by default to any
seeded role.

Staff who lack `canAccessAllLocations` see only records at locations where they
hold a current `StaffAssignment`.

### Patient-record tiers

Fields that hold patient information are tagged in one place,
`features/keystone/security/phiFields.ts`, under these tiers:

- **Demographics**: also readable by anyone with Clinical, Insurance, Ledger or ManagePatients.
- **Clinical**: also readable by anyone with Sensitive.
- **Sensitive**
- **Insurance**
- **Ledger**

The same map drives three things:

1. **Field access.** `applyPhiTiers` wraps every tagged field's read access.
2. **Read audit.** Any GraphQL operation that selects a tagged field writes a
   `PhiReadAudit` row: operation, fields, record count, and HMAC reference
   tokens instead of record ids. If that row can't be written, the response
   data is withheld (`PHI_AUDIT_FAILED`). Reads fail closed.
3. **Log redaction.** `lib/log.ts` masks tagged keys at any depth. Lint bans
   `console.log` in `features/keystone/**`.

## Every change is recorded

- `AuditEvent` is a hash chain: each row carries the previous row's hash.
  `AuditEvent`, `ApprovalDecision` and `PhiReadAudit` are append-only at the
  database. Triggers refuse UPDATE, DELETE and TRUNCATE.
  - It is written in the same transaction as the state change.
  - A CHECK stops synthetic rows from ever being queued for a `live` adapter.
- `CommandReceipt` makes every command idempotent by `idempotencyKey`. A replay
  with different parameters is refused with `IDEMPOTENCY_CONFLICT`.
- State changes use compare-and-swap on a version column. A lost race returns
  `STALE_STATE` with the current status and version.

## Second-person approval

`ApprovalPolicy` → `ApprovalRequest` → `ApprovalDecision`.

- The approver must hold the right `canApprove*` permission, must not be the
  requester, and must not own the agent that asked.
- An approval can be used once and expires after 24 hours.
- Agents never approve.
- Screen: **Approvals** (`/dashboard/platform/approvals`).

## Sign-in security

- Sessions are sealed cookies with a 12-hour ceiling.
- Bumping `authVersion` revokes every outstanding session for that user.
- **Two-step verification (TOTP):** enrol, confirm, rotate, and 10 single-use
  recovery codes.
  - Secrets live in `SecretBox`, encrypted with the purpose bound as additional
    authenticated data.
  - A password sign-in by an enrolled user gives a pending session, which is
    upgraded only by `verifyMfa`.
- **Rate limits:**
  - Applies to password sign-in, MFA, password reset and first-user creation.
  - Limits: 30 attempts per 15 minutes per client and 10 per account.
  - The counter is held in Postgres, so every app instance shares it.
  - Keys are hashed. No email address or IP address is stored.
  - If the counter can't be read, the request is refused (`RATE_LIMITED`).
- Screen: **Sign-in security** (`/dashboard/platform/settings/security`).

## Business associates and inference

- `BusinessAssociate` records each vendor's BAA status.
- `AdapterInstallation` records each partner connection.
  - Its mode is `manual_export`, `sandbox` or `live`.
  - A CHECK refuses a `live` adapter that handles patient data unless a BAA is
    on file.
- `InferenceProvider` is `self_hosted`, `baa_hosted` or `no_phi`.
  - `lib/inferenceGuard.ts` refuses to send patient data to a `no_phi`
    provider (`INFERENCE_PHI_BLOCKED`).
  - A database CHECK backs the guard up.

## State rules

State rules (supervision, hygienist scope, record retention) live in versioned
jurisdiction packs (`lib/jurisdiction.ts`): `US-FL@2026.1` and
`US-generic@2026.1`.

- Each rule records its source.
- Rules that still need a licensed reviewer carry `verify: true`, and the
  dashboard lists them.

## Sample practice

**Load sample practice** creates *Bayview Family Dental* (Tampa and Brandon, FL).

- Every row is marked `isSynthetic`, and all patient information is fictional.
- Seeded staff can't sign in until a password is set.
- Production refuses the sample unless `DENTAL_ALLOW_SAMPLE_PRACTICE=true`.

## Licensed content

This repository contains none of the following:

- CDT procedure codes;
- X12 implementation guides or envelopes;
- the ADA claim form artwork;
- SNODENT.

`tests/no-licensed-content.test.ts` enforces this on every run. Practices import
CDT under their own ADA licence (Phase 2).

## Running the checks

```bash
npm run typecheck
npm run lint
DENTAL_TEST_DATABASE_URL="postgres://…/db?schema=vitest" npm test   # database suites need a disposable schema
npm run test:node
```
