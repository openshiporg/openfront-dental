# Patients (Phase 1)

## Lists

| List | Purpose |
| --- | --- |
| `Patient` | Chart number, legal and preferred names, date of birth, sex assigned at birth, pronouns, language, address, home location, primary dentist and hygienist. Status: `prospect → active ⇄ inactive → archived`, `deceased`, `merged_into` (STATE-MACHINES §1.1). |
| `PatientIdentifier` | Other identifiers (previous system chart number and similar). |
| `FamilyGroup` | A household for scheduling and statements. |
| `Guarantor` / `GuarantorLink` | Who is financially responsible, as a patient or as a named person; one active link per patient. |
| `ContactPoint` | Phones and emails, normalised (E.164 / lower-case) for matching. |
| `ConsentGrant` | Consent per contact × channel × purpose, with its source and evidence. |
| `PatientAlert` | Medical and other alerts shown as a banner (premedication, anticoagulant, latex, …). |
| `ReferralSource` / `Referral` | How the patient found the practice. |
| `MergeCase` / `MergeMap` | Record merges and the exact rows each one moved. |

All patient fields are tagged with a tier in `security/phiFields.ts`; every
read of a tiered field is written to `PhiReadAudit`.

## Duplicates

`registerPatient` looks for an existing record before creating one: the same date
of birth plus a similar name (trigram similarity) or a shared phone or email.
If it finds one it refuses with `DUPLICATE_SUSPECTED` and the candidate chart
numbers. The desk either opens that record or confirms this is a different
person (`acknowledgeDuplicates`), which is audited.

## Merge and revert

1. Anyone with `canManagePatients` proposes a merge (`proposeMerge`), naming
   the record to keep and the one to fold in, with a reason.
2. A **second person** with `canApprovePatientMerge` approves it in
   **Approvals**. The proposer can't approve their own.
3. On approval every child row (contacts, consents, alerts, appointments,
   guarantor links, ASAP entries, portal scopes, …) is re-pointed to the
   survivor. Each move is written to `MergeMap`. The merged record becomes
   `merged_into` and points at the survivor.
4. Within the practice's merge window (`mergeRevertDays`, default 30)
   `revertMerge` replays the map backwards. A row changed since the merge is
   left alone. Ledger rows never move (Phase 4).

Conflicting rows (for example two appointments at the same time) stop the merge
with `MERGE_CONFLICT`.

## Status changes

`setPatientStatus`:

- **inactive / archived**: refused while visits are still booked.
- **deceased**: needs the date of death. Future booked visits are withdrawn (not
  counted as broken), statements are held and outreach stops.

## Staff screens

- **Patients** (`/dashboard/platform/patients`): search by name, chart number,
  date of birth or phone/email; status tabs; register a new patient.
- **Patient overview** (`/patients/[id]`): alerts banner, demographics, family
  and guarantor, contact points with consent per purpose (record a verbal
  consent with a note, withdraw it, deactivate a contact), upcoming visits and
  history, add an alert, portal access, and merges (propose, undo inside the
  window). Clinical, insurance and ledger tabs arrive with their phases.
