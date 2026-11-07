# Openfront Dental

The open-source alternative to Dentrix.

Openfront Dental runs a dental practice on one system: patients and families, scheduling by operatory and provider, tooth and perio charting, treatment plans, insurance eligibility, claims and remittance posting, patient balances, payment plans and memberships, recall and hygiene, lab cases and consent forms. Online booking and the patient portal are APIs, so a practice can put them on any website. Built-in AI agents can verify insurance, chase claims and fill the schedule through MCP tools. Every agent action is a proposal until a person approves it, or until an autonomy policy the practice wrote allows it.

Built on Next.js and KeystoneJS 6 with PostgreSQL.

## What works today

- **Practice set-up (Phase 0):** locations, operatories, staff with licences, NPIs and supervision rules, roles scoped to locations, two-person approvals, a hash-chained audit log, a read audit on every patient record, Florida and generic state rules packs, and MFA for staff.
- **Patients and scheduling (Phase 1):** patients and families with alerts, duplicate detection and two-person merges you can undo for 30 days; a schedule by operatory and provider with production goals, schedule templates, holds, an ASAP list, confirmations and booking requests; appointment reminders with consent and quiet hours checked again at send time, and C and STOP replies. The database refuses a double-booked chair or patient, even under 50 bookings at once.
- **APIs:** a public booking API that never reveals whether someone is already a patient, and a patient portal API with one-time codes and guardian access that ends at the age of majority. See [docs/public-api.md](./docs/public-api.md).

Coming next: the clinical chart, insurance and eligibility, claims and the patient ledger, then the AI agents (see the build plan).

## Sample practice

The seed loads **Bayview Family Dental** in Tampa, FL, and its St. Petersburg office: 19 staff, 70 families and about 230 patients with 794 appointments. Every name, birth date, phone number and address is invented. Phones use the 555 range. Staff emails use `@bayviewfamilydental.com` and patients use common mail providers; none of these mailboxes is real, and sample data only ever goes to the manual message queue, never to a live SMS or email provider. Every seeded record is marked synthetic.

Seeded staff cannot sign in until an owner sets their password. Create the first owner at `/dashboard/init`, then load the sample practice from onboarding. A production deployment refuses the sample practice unless `DENTAL_ALLOW_SAMPLE_PRACTICE=true` is set (for QA deployments only).

## Running it

```bash
# set DATABASE_URL and SESSION_SECRET (32+ characters); DENTAL_SECRET_KEY (32 bytes, hex) to store adapter secrets
npm install
npm run dev            # builds Keystone, applies migrations, starts Next.js
```

`npm run verify` runs type checks, lint, unit and Node tests. Database tests run when `DENTAL_TEST_DATABASE_URL` is set. The message worker runs with `npx tsx features/keystone/messaging/run-worker.ts --loop`.

## License

MIT. See [LICENSE](./LICENSE).
