# Implementation Plan: Campaign Simulation Lab evidence layers

## Overview

Build a native SIMULA campaign-simulation vertical using existing population
frames, weighted sampling, private execution, durable runs, and typed reporting.
The first code slice removes any temptation to use an LLM-invented viral score
by making repeated weighted simulation, consented survey calibration, and
held-out historical backtesting explicit core contracts.

## Architecture decisions

- Reuse `packages/simula-core` and its existing `MethodologyEngine`; do not add
  a second simulation/provider stack.
- Keep population weighting at the cohort/frame layer. The model/provider may
  produce structured reactions but never demographics, population weights, or
  the final numerical result.
- Keep real survey observations and historical outcomes separate from synthetic
  results. Link them by immutable checksums and named versions.
- Use repeated seeded runs for stability diagnostics. Never label their spread
  as population sampling error without a separately approved design.
- Keep qualitative LLM synthesis downstream of typed numerical evidence.
- Stage durable database/API/worker/UI integration after the core seams pass.

## Dependency graph

```text
population frame + audience definition
        -> deterministic weighted sample
        -> repeated seeded methodology runs
        -> component summaries + stability
        -> survey calibration and/or historical backtest
        -> durable API/worker/report integration
```

## Task list

### Phase 0: Audit and governance — complete

- [x] Inspect SIMULA and PhantomCrowd source, manifests, schemas, workers, auth,
      tenant, queue, storage, deployment, and CI boundaries.
- [x] Record capability classification, license obligations, security/privacy/
      political risks, and exact files in the integration audit.
- [x] Create status, decisions, next-actions, and risk records.

### Phase 1: Repeated weighted simulation — complete

- [x] Add a frozen repetition configuration with seed derivation, maximum run
      count, and stability tolerance.
- [x] Execute the existing methodology provider repeatedly against frozen
      population/audience inputs.
- [x] Aggregate named component metrics with mean, median, standard deviation,
      run-stability interval, and ranking stability.
- [x] Mark fewer than three repetitions as `insufficient_repetitions` for
      stability status.

Acceptance: an admitted population weight changes the aggregate result; same
manifest/seeds replay byte-identically; unstable outputs are disclosed; no
`viral_score` exists in the result.

### Phase 2: Consented survey calibration — complete (core)

- [x] Add aggregate survey provenance/consent/rights contract.
- [x] Add survey variant/cohort observations with quality, missingness, and
      effective-weight metadata.
- [x] Compute distribution distance, metric MAE/RMSE, Brier score where
      applicable, and variant rank agreement.
- [x] Return `Synthetic-only`, `Partially calibrated`, `Survey-calibrated`, or
      `insufficient_evidence` only from explicit evidence state.

Acceptance: missing consent/provenance/duplicate-quality gates fail closed;
synthetic rows cannot be presented as observed; calibration does not mutate the
synthetic artifact.

### Phase 3: Historical backtesting — complete (core)

- [x] Add held-out historical campaign/variant outcome contract.
- [x] Blindly replay predictions from frozen synthetic outputs before outcome
      data is joined.
- [x] Compute ranking agreement, pairwise directional accuracy, MAE/RMSE, and
      model-version regression deltas.
- [x] Add subgroup-specific backtest slices after the durable outcome schema
      carries aggregate cohort keys.
- [x] Suppress or block universal-accuracy language in the result limitations.

Acceptance: outcome leakage is rejected; backtest output names the exact
methodology/dataset/version; results are marked held-out benchmark evidence, not
universal prediction.

### Phase 4: Durable integration - implemented; promotion gates open

- [x] Add forward-only tenant-scoped migrations and RLS.
- [x] Add authenticated idempotent API commands and worker jobs, including
      durable survey import with worker-only raw payload handling.
- [x] Add audit events, retries, cancellation, progress, retention, and deletion
      behavior.
- [x] Regenerate/check OpenAPI and database contracts.

### Phase 5: Product/reporting and release

- [x] Add existing-design-system views for weights, repetitions, calibration,
      backtest evidence, uncertainty, and limitations.
- [x] Add report fields with source/evidence references and human approval
      state.
- [ ] Run local, browser, hosted dependency, data, and release gates.

## Verification checkpoints

- Phase 1-3 core slice: 175 tests passed; Ruff and mypy passed for the new
  contracts.

- After Phase 1: focused core tests, Ruff, mypy, claim scanner.
- After Phase 3: focused core + integration tests, contract checks, leakage and
  privacy negative tests.
- Before Phase 4 promotion: exact migration reset/lint/pgTAP, API/worker
  integration, tenant isolation, durable retries, and browser proof.
- Before release: hosted readiness, exact release identity, rights-cleared data,
  held-out validation, production logs, and rollback evidence.

## Open constraints

- No real Philippine survey or historical outcome dataset is attached in this
  checkout. Core contracts can be implemented and tested with explicit test
  fixtures; production calibration/backtesting remains blocked until lawful data
  and an approved protocol exist.
- Existing SIMULA Phase 2/M7 formal gates remain canonical and are not waived by
  this feature request.
