# Agent rules for this repo

NEVER build outbox/texting/email notification machinery or cron/worker services. External events = Openfront Commerce webhooks (features/webhooks) only.

- No queue table, no background loop, no separate worker service. Calls to the card processor and the clearinghouse run straight after a command commits (`uow.after`), and scheduled steps run from the "Run pending work" command.
- Money is BigInt minor units. Fictional PHI only. No licensed code content.
