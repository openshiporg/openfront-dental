# Clinical record, treatment plans, codes and fees (Phase 2)

Staff screens: patient → Open clinical record (chart, perio, notes, medical history, treatment plans); Forms & consents; Procedure codes; Fee schedules.

## Rules enforced by the database
- A posted procedure is locked; its fee and the one charge ledger entry cannot change. Corrections are forward: a reversal entry plus a corrected status.
- Exactly one charge per chart entry (partial unique index). The ledger is append-only.
- A signed clinical note, a completed perio exam, a presented plan version, a published form or fee version, and signed acceptances/consents cannot be updated or deleted (triggers).
- Perio depth 0–15 mm and gingival margin −10…15 mm are checked in the command and by CHECK constraints.

## Commands
Chart: add/accept/schedule/complete/correct. Notes: draft, update, sign (password re-check), entered-in-error. Perio: start, record, complete (sign), confirm classification (suggestion only), revise. Plans: build, present (freezes + hash), accept (signature evidence), decline, revise. Codes and fees: import → attest → request activation (second person approves); draft fee version → request publish (second person approves).
Every command takes an `idempotencyKey`; state changes use `expectedVersion`.

## Teeth
Stored as Universal numbers (1–32, primary A–T). Displayed as Universal, FDI or Palmer. Surfaces are always stored in the order M O D B I F L.

## Codes
Only practice-authored `OF-` codes ship. Licensed code sets arrive through an import under the practice's own licence; the repository contains none.
