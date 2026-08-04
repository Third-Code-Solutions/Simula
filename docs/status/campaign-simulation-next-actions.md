---
title: Campaign Simulation Lab next actions
status: active
updated: 2026-08-04
classification: PROPOSED
---

# Next actions

1. Repair the GitHub account payment/spending-limit gate, then rerun the
   required PR checks for `5e7d55c`; do not merge while the checks fail before
   runner steps are created.
2. After a green merge to `main`, observe Railway API and worker auto-deploys,
   update the runtime migration-head variable only with the merged release, and
   require `/health/ready` 200 plus matching release SHA before admission.
3. Reconnect authorized Vercel billing access and set a team spend/on-demand
   limit. Then promote only verified web/admin deployments; retain the ignored
   build guards for unrelated backend/worker commits.
4. Capture authenticated browser/API/worker evidence for the hosted Campaign Lab
   flow and verify report provenance, retention, cancellation, and private
   holdout deletion after the merged release.
5. Admit only lawfully governed Philippine survey and historical datasets after
   owner, consent, purpose, license, and current legal review. The PSA 2020
   aggregate frame is admitted for weighting; keep behavioral output explicitly
   synthetic until survey calibration and historical backtesting evidence exist.
6. Admit a human-reviewed English/Filipino/Taglish evaluation dataset and attach
   its artifact to a report; keep regional languages blocked until data rights
   and coverage exist.
7. Run the remaining Docker/local Supabase integration and pgTAP gates when the
   local runtime is available. Hosted Campaign Lab retention and
   durable-workflow checks are complete; the 30/35 foundation result reflects
   five intentional local role/Auth/seed-fixture assumptions that must not be
   copied to production.
