---
title: Campaign Simulation Lab next actions
status: active
updated: 2026-08-01
classification: PROPOSED
---

# Next actions

1. Add durable tenant-scoped migrations for repeated, calibration, and
   backtest artifacts.
2. Add authenticated idempotent API/worker commands over the new core seams;
   keep full runs off the request path.
3. Add survey-tool/CSV/ODK/Formbricks adapters only after rights/consent
   admission is defined.
4. Add focused integration tests for tenant isolation, retries, cancellation,
   retention, and deletion.
5. Add focused red/green tests for weight influence, repetition stability,
   consent/provenance rejection, survey metric correctness, blind outcome
   separation, and ranking instability disclosure.
6. Add existing-design-system report/UI fields without a standalone score.
7. Re-run the project release/readiness gates before making any deployment or
   validity claim.
