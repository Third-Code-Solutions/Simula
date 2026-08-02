---
title: Campaign Simulation Lab data flow
status: active
updated: 2026-08-01
classification: OBSERVED
---

# Data flow

1. An authenticated organization member submits campaign variants, aggregate
   cohort definitions, a population-data provenance record, and a deterministic
   simulation configuration.
2. SIMULA produces weighted synthetic aggregate observations. It does not
   represent fictional agents as real respondents and does not generate an
   individual persuadability ranking.
3. A governed survey source is admitted only with owner, license, consent,
   purpose, quality, geography, version, and checksum metadata. CSV, Formbricks,
   ODK, and generic JSON adapters consume response rows through a worker-only
   transient secret and emit only aggregate variant/cohort observations. The
   secret is deleted after terminal processing.
4. Survey calibration compares the synthetic aggregate with the admitted survey
   aggregate using distribution distance, Brier score, MAE/RMSE, and rank
   agreement. It does not retune the model or manufacture a final campaign
   score.
5. A historical backtest stores frozen predictions in the public request and
   holds actual outcomes in a worker-only secret row. The worker reveals outcomes
   only inside the evaluator, persists scoped error/ranking metrics, then deletes
   the secret payload.
6. Reports expose provenance, uncertainty, limitations, model/methodology/data
   versions, and evidence status. Audit events remain immutable while ordinary
   evidence artifacts follow the configured retention policy.

## Excluded data

SIMULA rejects or does not retain names, email addresses, phone numbers, voter
identifiers, political affiliation, ideology, or individual persuadability
signals in the campaign evidence import path. A source may not be admitted for
calibration or backtesting without documented rights and purpose authorization.

## Data subject controls

Export and deletion requests must be handled through the tenant data-governance
workflow. The evidence worker deletes held-out outcomes on terminal completion,
failure, cancellation, and retention expiry. This document is an engineering
control description, not legal advice.
