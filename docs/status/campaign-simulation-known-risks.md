---
title: Campaign Simulation Lab known risks
status: active
updated: 2026-08-06
classification: PROPOSED
---

# Known risks

| Risk                                                                    | Current status | Control                                                                                                                                                    |
| ----------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synthetic outputs mistaken for measured population response             | Open           | Explicit output types, notices, sample sizes, weights, run count, and limitations in every report.                                                         |
| Repeated-run interval mistaken for survey uncertainty                   | Open           | Label as run stability; do not call it margin of error.                                                                                                    |
| Survey weighting or post-stratification creates false precision         | Open           | Record design weights, effective sample size, missingness, nonresponse, and calibration scope.                                                             |
| Historical outcome leakage                                              | Open           | Blind prediction input, held-out outcome set, checksums, protocol registration, and reveal-after-replay evaluation.                                        |
| Political individual targeting                                          | Open           | Aggregate-only schemas/business rules/export checks and negative tests.                                                                                    |
| Rights or consent failure in imported data                              | Open           | Evidence source admission, consent-purpose metadata, license/allowed-use checks, and private retention/deletion.                                           |
| PhantomCrowd provenance confusion                                       | Controlled     | Exact commit, MIT register, provenance audit, and no copied code in first slice.                                                                           |
| Queue/cost explosion from repetitions                                   | Open           | Repetition caps, deadlines, idempotency, cost ceilings, durable progress, and cancellation.                                                                |
| Existing Phase 2/M7 release gates remain open                           | Open           | Do not make population or election-validity claims until the canonical gates and evidence requirements pass; live deployment is not scientific validation. |
| Railway production release remains unverified                           | Controlled     | Merge commit `3bdb3f0` auto-deployed; API/worker/web are online, API readiness is `200`, and runtime logs/metadata match the merged SHA.                   |
| Hosted release identity can drift from application environment metadata | Controlled     | API/worker/web environment variables, readiness, deployment records, and worker logs were rechecked against the merged SHA.                                |
| GitHub CI account billing gate                                          | Open           | PR `#8` run `31029822687` fails before runner steps and provides no logs; repair account billing before treating CI as green.                              |
| Vercel team spend authorization                                         | Open           | Ignored-build guards prevent full builds for unrelated commits, but the connected session cannot set the account-level spend/on-demand limit.              |
