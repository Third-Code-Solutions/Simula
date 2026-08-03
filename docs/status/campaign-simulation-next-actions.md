---
title: Campaign Simulation Lab next actions
status: active
updated: 2026-08-03
classification: PROPOSED
---

# Next actions

1. The reviewed Campaign Lab/sidebar release is pushed at `f3b3e2c`. Preview
   Supabase configuration is now provisioned in both connected Vercel projects;
   verify the fresh exact-SHA previews and capture authenticated browser/API
   evidence for the protected Campaign Lab route before production promotion.
2. Reconnect Railway access for project `f25b8598-d3cc-4e9d-a63d-0413a4035d22`,
   confirm each service watch path, and capture one automatic deploy event after
   the GitHub push.
3. Deploy the retention-aware worker and observe one hosted cleanup invocation;
   verify private holdout deletion after completion, failure, cancellation,
   expiry, and restore drills.
4. Admit only lawfully governed Philippine survey and historical datasets after
   owner, consent, purpose, license, and current legal review.
5. Admit a human-reviewed English/Filipino/Taglish evaluation dataset and attach
   its artifact to a report; keep regional languages blocked until data rights
   and coverage exist.
6. Add focused integration tests for tenant isolation, retries, cancellation,
   retention, deletion, and project-scoped outcome references; the new route
   contract tests cover read-stage endpoints and mutation idempotency, while the
   cross-tenant/database integration suite remains open.
7. Re-run the project release/readiness gates after the new SHA; current GitHub
   Windows/Foundation/History checks fail before producing runner steps, so do
   not call the hosted release green until that external CI condition is fixed.
8. Start Docker and run the local Supabase lint/pgtap suite; hosted Campaign Lab
   migration/function/grant checks, retention pgTAP 10/10, and durable-workflow
   pgTAP 9/9 checks are complete. The hosted foundation suite is 30/35 because five checks
   intentionally expect local role/Auth/seed fixtures and must not seed those
   fixtures into production.

