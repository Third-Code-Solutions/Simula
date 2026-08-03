---
title: Campaign Simulation Lab known risks
status: active
updated: 2026-08-03
classification: PROPOSED
---

# Known risks

| Risk                                                                    | Current status | Control                                                                                                                                                 |
| ----------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synthetic outputs mistaken for measured population response             | Open           | Explicit output types, notices, sample sizes, weights, run count, and limitations in every report.                                                      |
| Repeated-run interval mistaken for survey uncertainty                   | Open           | Label as run stability; do not call it margin of error.                                                                                                 |
| Survey weighting or post-stratification creates false precision         | Open           | Record design weights, effective sample size, missingness, nonresponse, and calibration scope.                                                          |
| Historical outcome leakage                                              | Open           | Blind prediction input, held-out outcome set, checksums, protocol registration, and reveal-after-replay evaluation.                                     |
| Political individual targeting                                          | Open           | Aggregate-only schemas/business rules/export checks and negative tests.                                                                                 |
| Rights or consent failure in imported data                              | Open           | Evidence source admission, consent-purpose metadata, license/allowed-use checks, and private retention/deletion.                                        |
| PhantomCrowd provenance confusion                                       | Controlled     | Exact commit, MIT register, provenance audit, and no copied code in first slice.                                                                        |
| Queue/cost explosion from repetitions                                   | Open           | Repetition caps, deadlines, idempotency, cost ceilings, durable progress, and cancellation.                                                             |
| Existing Phase 2/M7 release gates remain open                           | Open           | No production admission or predictive claim until the canonical gates pass.                                                                             |
| Railway deployment cannot be verified                                   | Open           | Railway access currently returns `Unauthorized` for the requested project; no auto-deploy claim until the project is reconnected and a deployment event is observed. |
| Hosted release identity can drift from application environment metadata | Open           | Bind readiness to migration head and verify provider deployment SHA, runtime health, and logs together.                                                 |
