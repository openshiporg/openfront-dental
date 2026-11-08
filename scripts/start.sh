#!/bin/sh
# Production start: migrate, keep the background worker alive beside the web server, then serve.
# The worker drains the outbox (eligibility checks, reminders) and runs the leased schedule jobs.
# Two app instances are safe: every job and every message is claimed under a lease.
# one-time: clears the rolled-back first attempt of the review-fixes migration (a no-op when it is not marked failed)
npx prisma migrate resolve --rolled-back 20261108220000_dental_phase3_review_fixes >/dev/null 2>&1 || true
npm run migrate || exit 1
(
  while true; do
    ./node_modules/.bin/tsx features/keystone/messaging/run-worker.ts --loop
    echo "worker exited with $?; restarting in 5s"
    sleep 5
  done
) &
exec ./node_modules/.bin/next start
