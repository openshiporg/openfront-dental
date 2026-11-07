# Online booking and patient portal APIs (Phase 1)

Backend only. These GraphQL operations are what the practice's own booking
pages and patient portal call. The pages themselves come later with the
storefront design.

## Online booking

| Operation | What it does |
| --- | --- |
| `publicSite(slug)` | Practice-facing information: locations, services, providers shown, bookable visit types (by public name). No patient data. |
| `publicAvailability(slug, typeId, fromDate, …)` | Open times in online-bookable blocks, after the policy's lead time and within its horizon. |
| `publicHoldSlot(…)` | Holds a time for `holdMinutes` (default 10). Returns a **hold token**; only its hash is stored, so the token is the proof of ownership. |
| `publicSubmitBooking(holdId, holdToken, contact, …)` | Books the held time. |

On submit the contact is matched against existing patients:

- **matched**: same date of birth, similar name and a shared phone/email. Books
  on the existing record.
- **new_patient**: no candidate. Creates a prospect, if the policy allows new
  patients online.
- **possible_duplicate**: a weaker match. Books on a new prospect flagged for
  the front desk.

The answer is the same in every case: a booking reference, the time and the
location name. **It never says whether someone is already a patient and never
returns a name.** The exit-gate test checks every response against every
patient name in the sample practice.

Consent ticked on the form is recorded as a `ConsentGrant` with the form as
evidence (SMS only when explicitly ticked).

### Protection

- Rate limits counted in Postgres (shared by every instance) and keyed by
  hashes: per client per hour, per contact per day and a global per-minute cap.
  The policy can tighten them.
- Captcha hook: with `TURNSTILE_SECRET_KEY` set, a Cloudflare Turnstile token
  is required. Without it the request is marked `not_configured` for the
  review queue.
- Requests store a keyed hash of the client address and user agent, never the
  address itself.

### Review (staff)

**Schedule → Booking requests** lists online bookings to review
(`reviewBookingRequest`):

- **Keep**: accept as booked.
- **Same person: propose merge**: opens a merge for a second person to approve
  (see `docs/patients.md`).
- **Reject as spam**: withdraws the visit and archives the empty prospect.

## Patient portal

A portal account is not a staff user and never reaches the dashboard.

| Operation | What it does |
| --- | --- |
| `portalRequestCode(email)` | Emails a six-digit code (hashed at rest, 10 minutes, 5 tries). The answer is the same whether or not the address has an account. |
| `portalSession(email, code)` | Exchanges the code for a portal token (HMAC-signed, 2 hours, bound to the account's `authVersion`). Sent back as the `x-portal-token` header. |
| `portalMe` | The people this account may act for. |
| `portalAppointments(patientId)` | Visits for one person. |
| `portalConfirm` / `portalCancel` / `portalReschedule` | The same commands staff use, with the same rules (late-cancel window, slot checks). |
| `portalPreferences(patientId, changes)` | Reminder consent per contact, channel and purpose. |

Every read and action names a patient and passes the **PortalScope** check:

- an active scope for that patient, not expired, with the capability
  (`appointments`, `forms`, `preferences`, …);
- a **guardian** scope ends when the patient reaches the age of majority under
  the location's jurisdiction pack;
- merged or archived patients drop out.

Every portal read is written to `PhiReadAudit` with purpose `patient_request`.

Staff manage access from the patient overview: `grantPortalAccess` (self,
guardian, guarantor, personal representative), `revokePortalScope`, and
`suspendPortalAccount`, which bumps `authVersion` so every token for that
account stops working at once.
