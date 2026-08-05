---
title: Campaign Simulation Lab next actions
status: active
updated: 2026-08-06
classification: PROPOSED
---

# Next actions

Current candidate: PR `#8`, code head
`c061e8237d7ecfb7080bf4f4d19d1e0a032e1b5d`. The web preview for the code commit
is READY; the docs-only follow-up was correctly canceled by Vercel's
ignored-build guard. Railway production remains healthy on the prior merged
`main` SHA `3bdb3f02`.

1. Repair the GitHub account payment/spending-limit gate, then rerun the
   required checks for PR `#8`; do not claim CI-green release evidence while
   jobs fail before runner steps are created.
2. Reconnect authorized Vercel billing access and set a team spend/on-demand
   limit. Keep the ignored-build guards for unrelated backend/worker commits;
   the current web/admin production deployments are already verified.
3. Capture authenticated browser/API/worker evidence for the hosted Campaign Lab
   flow and verify report provenance, retention, cancellation, and private
   holdout deletion after the merged release.
4. Admit only lawfully governed Philippine survey and historical datasets after
   owner, consent, purpose, license, and current legal review. The PSA 2020
   aggregate frame is admitted for weighting; keep behavioral output explicitly
   synthetic until survey calibration and historical backtesting evidence exist.
5. Admit a human-reviewed English/Filipino/Taglish evaluation dataset and attach
   its artifact to a report; keep regional languages blocked until data rights
   and coverage exist.
6. Run the remaining Docker/local Supabase integration and pgTAP gates when the
   local runtime is available. Hosted Campaign Lab retention and
   durable-workflow checks are complete; the 30/35 foundation result reflects
   five intentional local role/Auth/seed-fixture assumptions that must not be
   copied to production.
