---
title: Campaign Simulation Lab next actions
status: active
updated: 2026-08-02
classification: PROPOSED
---

# Next actions

1. Promote the reviewed GitHub release to the connected Vercel web/admin
   projects and verify authenticated Campaign Lab browser/API/worker behavior on
   live hosts.
2. Obtain access to Railway project `f25b8598-d3cc-4e9d-a63d-0413a4035d22`,
   configure the GitHub service watch path, and capture one automatic deploy
   event after a verified push.
3. Schedule and monitor the retention cleanup function; verify private holdout
   deletion after completion, failure, cancellation, expiry, and restore drills.
4. Admit only lawfully governed Philippine survey and historical datasets after
   owner, consent, purpose, license, and current legal review.
5. Admit a human-reviewed English/Filipino/Taglish evaluation dataset and attach
   its artifact to a report; keep regional languages blocked until data rights
   and coverage exist.
6. Add focused integration tests for tenant isolation, retries, cancellation,
   retention, deletion, and project-scoped outcome references; the new route
   contract tests cover read-stage endpoints and mutation idempotency, while the
   cross-tenant/database integration suite remains open.
7. Re-run the project release/readiness gates before making any deployment or
   validity claim.
8. Start Docker and run the local Supabase lint/pgtap suite; hosted Campaign Lab
   migration/function/grant checks and the durable-workflow pgTAP checks are
   complete. The hosted foundation suite is 30/35 because five checks
   intentionally expect local role/Auth/seed fixtures and must not seed those
   fixtures into production.
