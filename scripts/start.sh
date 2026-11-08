#!/bin/sh
# Production start: migrate, keep the background worker alive beside the web server, then serve.
# The worker drains the outbox (eligibility checks, reminders) and runs the leased schedule jobs.
# Two app instances are safe: every job and every message is claimed under a lease.
npm run migrate || exit 1
(
  while true; do
    ./node_modules/.bin/tsx features/keystone/messaging/run-worker.ts --loop
    echo "worker exited with $?; restarting in 5s"
    sleep 5
  done
) &
exec ./node_modules/.bin/next start
