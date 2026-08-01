---
title: Campaign Simulation Lab current state
status: active
updated: 2026-08-01
classification: OBSERVED
---

# Current state

## Completed in this turn

- PhantomCrowd reference cloned at the stated upstream commit and inspected.
- SIMULA architecture, data, worker, provider, auth/tenant, queue, deployment,
  and CI boundaries inspected.
- Pre-implementation integration audit completed.
- MIT license register and provenance record created.
- Population-weighted repeated simulation core added with derived seeds,
  component summaries, run-stability intervals, and variant rank stability.
- Aggregate consented-survey calibration core added with weighted distribution,
  MAE/RMSE/Brier, and rank-agreement metrics.
- Held-out blind historical backtesting core added with leakage checks,
  ranking/error metrics, and baseline regression deltas.
- Methodology formulas and evidence boundaries documented.
- Repeated seeded execution wired through the authenticated methodology command
  and private AI-engine path; the existing tenant-scoped report artifact now
  persists the repeated result and exposes database-indexed stability metadata.
- Supabase migration `20260801111007_campaign_simulation_report_evidence` was
  applied to the linked project and verified with migration, column, trigger,
  and schema-lint queries.

## Implemented before this turn

- Versioned population frames with source provenance and normalized cell
  weights.
- Deterministic weighted audience sampling and sparse-cell suppression.
- Private behavioral engine with weighted synthetic agents, deterministic
  provider fixtures, replayable action events, bounded memory, typed heuristic
  component metrics, and synthetic-agent disclosure.
- Durable run/attempt/lease/result/audit infrastructure and tenant-scoped RLS.
- Held-out benchmark registry/evaluation primitives.

## Not yet implemented

- Durable API/worker integration for survey calibration and historical
  backtesting; repeated execution is currently a bounded report-path command,
  not a separate worker job.
- Survey-tool/CSV/ODK/Formbricks adapters and lawful Philippine datasets.
- Durable persistence for calibration/backtest artifacts and their
  retention/deletion lifecycle.
- End-to-end hosted browser/API evidence for the new repeated report path.

## Truth boundary

SIMULA is not authorized to claim population prediction, survey replacement,
vote-share prediction, universal accuracy, or Predikta-equivalent capability.
The current deterministic fixture and newly added core tests remain experimental
and estimate nobody. The repeated synthetic contract is consumed by the report
path; survey calibration and historical backtesting remain core-only until
their data adapters, durable jobs, and hosted evidence are complete.
