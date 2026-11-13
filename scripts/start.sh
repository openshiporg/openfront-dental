#!/bin/sh
# Production start: migrate, run the idempotent repair/report scripts, then serve. There is no worker: calls to outside services
# run straight after a command commits, and scheduled steps run from "Run pending work" on the Day and month close screen.
# one-time: clears the rolled-back first attempt of the review-fixes migration (a no-op when it is not marked failed)
npx prisma migrate resolve --rolled-back 20261108220000_dental_phase3_review_fixes >/dev/null 2>&1 || true
# one-time: clears the failed first attempt of the real-voice migration (it rolled back whole; a no-op when it is not marked failed)
npx prisma migrate resolve --rolled-back 20261113120000_dental_phase7_real_voice >/dev/null 2>&1 || true
npm run migrate || exit 1
# keyed member-ID hashes (idempotent; a failure here must not stop the site)
./node_modules/.bin/tsx scripts/rehash-member-ids.ts || true
# cached ledger balances (idempotent)
./node_modules/.bin/tsx scripts/rebuild-balances.ts || true
./node_modules/.bin/tsx scripts/seed-claim-reference.ts || true
./node_modules/.bin/tsx scripts/hash-statements.ts || true
# report (never fix) remittances that posted the same payment trace twice before the normalised index
./node_modules/.bin/tsx scripts/report-duplicate-remittances.ts || true
exec ./node_modules/.bin/next start
