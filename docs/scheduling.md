# Scheduling (Phase 1)

The appointment book: chairs, provider time, holds, confirmations and the
broken-appointment record. A dental appointment uses three things at once (a chair,
a provider's time in units, and the patient), so the schedule protects all three.

## Lists

| List | Purpose |
| --- | --- |
| `Operatory` | A chair at a location: doctor, hygiene, flex, consult or surgery. |
| `AppointmentType` | A visit the practice offers. Its **unit pattern** (`defaultPattern`) lays out who is needed when: `provider`, `assistant`, `hygienist`, `exam`. Production estimate in minor units. `publicName` is what online booking shows. |
| `ScheduleTemplate` / `TemplateBlock` | Weekly blocks per chair: provider, hours, the types allowed and whether online booking may use it. One active template per location at a time. Drafts are published from **Settings → Locations & operatories**. |
| `ProductionGoal` | Daily production goal per provider and weekday. |
| `ClosureDay` | A whole or half day closed, for one location or all. |
| `Appointment` | The booked visit. States: `planned → scheduled → confirmed → arrived → seated → ready_for_checkout → completed`, with `cancelled`, `broken` (no-show / late cancel) and `rescheduled` exits (STATE-MACHINES §2.1). |
| `AppointmentSegment` | Provider time inside a visit, laid out from the pattern. The hygiene exam is a segment for the examining dentist (`hygiene_exam_float`). |
| `BookingHold` | A time held for up to 30 minutes while someone books it (staff, online booking, agent offer). |
| `AsapEntry` | The ASAP list: patients who want an earlier time, with preferred windows. |
| `ConfirmationAttempt` | One reminder to send: when, which channel and contact, and what happened. |
| `BrokenAppointmentEvent` | Append-only record of no-shows and late cancels. |

## How a booking is checked

1. **Locks**: advisory locks in a fixed order (chair, then providers, then the
   patient) so two bookings can't interleave.
2. **Slot check** (`scheduling/service.ts` `checkSlot`): the time is on a unit
   boundary, inside a template block that allows the type (or a manager
   overrides with a reason), the chair and its turnover buffer are free, the
   patient is free, the providers' segments don't clash (a dentist's exam may
   overlap their own chair time; two exams may not), and supervision is met.
3. **The database** has the final word:
   - `Appointment_no_operatory_overlap`: an exclusion constraint on (chair,
     time + buffer) for active statuses;
   - `Appointment_no_patient_overlap`: a patient is never in two chairs at once;
   - `BookingHold_no_operatory_overlap` and the `dental_operatory_hold_guard`
     trigger: a live hold and an appointment can't share a chair and time
     (except the appointment converting that hold);
   - `AppointmentSegment_no_provider_overlap`: provider segments, except
     approved overrides and the exam float.

   A refusal from any of these comes back as `SLOT_TAKEN` (or
   `PATIENT_UNAVAILABLE`), never as a raw error.

The exit-gate tests prove it: a raw SQL insert that bypasses every application
check is refused by the constraint, and 50 parallel bookings of one slot give
exactly one appointment and 49 `SLOT_TAKEN`.

## Supervision

Hygiene types may require a dentist on site. The location's jurisdiction pack
decides whether that is a **hard** rule (refused) or a **warning** recorded on the
appointment. Online booking always treats it as hard. A pack that fails to parse
falls back to the strict default. The Florida pack is marked *verify*: check
the current rule with the board before relying on it.

## Transitions

Every transition is a command (`features/keystone/mutations/scheduling.ts`):
compare-and-set on the version, an audit event and an
idempotency key.

| Command | From → to | Notes |
| --- | --- | --- |
| `bookAppointment` | → scheduled | Through a hold or directly. Schedules reminders. |
| `confirmAppointment` | scheduled → confirmed | Method: phone, SMS reply, email link, in person, portal. |
| `markArrived` | scheduled/confirmed → arrived | Today only (unless `canOverrideSchedule`). A prospect becomes active. Lab-case gate hook (Phase 6). |
| `seatPatient` | arrived → seated | Active caution/critical medical alerts must be acknowledged. |
| `markReadyForCheckout` | seated → ready_for_checkout | |
| `completeAppointment` | ready_for_checkout → completed | Sets the patient's last visit. |
| `cancelAppointment` | scheduled/confirmed → cancelled | Inside the late-cancel window (`lateCancelHours`, default 24) it is recorded as **broken / late_cancel** instead. |
| `markBroken` | → broken | No-show or late cancel; writes a `BrokenAppointmentEvent`. A fee, if the practice charges one, is an adjustment request (Phase 4), never automatic. |
| `rescheduleAppointment` | scheduled/confirmed → rescheduled + new | One transaction: the old time is freed first, so a move into an overlapping time works. |
| `sweepNoShows` | (job) | Marks unarrived past visits as no-shows after the grace period. |

When the practice withdraws a visit (the patient died, or an online booking was
spam) it is cancelled without the late-cancel rule and no broken-appointment
event is recorded.

## Reminders

This app sends no texts or emails. Reminder attempts are not created. Outside notification of events is for Openfront Commerce webhooks only.

## Staff screens

- **Schedule** (`/dashboard/platform/schedule`): day view by chair with drag to
  move (a reschedule command), colour by type, production against goal and by
  provider; week view of provider × day production. The appointment drawer
  (`?appt=`) shows segments, alerts, warnings and reminders, and offers only the
  transitions the current state allows.
- **ASAP list** (`/schedule/asap`).
- **Confirmations** (`/schedule/confirmations`): unconfirmed visits for the next
  three days, with the phone to call and why a reminder couldn't go out.
- **Booking requests** (`/schedule/booking-requests`): see `docs/public-api.md`.
- **Locations & operatories** (`/settings/locations`): chairs, closures,
  templates (publish), appointment types and the online booking policy.
