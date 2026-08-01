---
title: Campaign Simulation Lab next actions
status: active
updated: 2026-08-01
classification: PROPOSED
---

# Next actions

1. Add durable tenant-scoped calibration and backtest artifacts, including
   aggregate subgroup slices and retention/deletion behavior.
2. Move repeated execution and the future calibration/backtest commands to
   durable worker jobs with bounded retries and progress state.
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
