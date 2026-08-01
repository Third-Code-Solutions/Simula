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
- Durable `campaign_evidence_runs`, private held-out secret storage, progress
  events, tenant-scoped RLS, lease/retry/cancel state, and worker audit hooks
  were added in migrations `20260801121240_campaign_lab_evidence_jobs`,
  `20260801124952_campaign_lab_evidence_cancel_finalize`, and
  `20260801125632_campaign_lab_evidence_project_retention`, applied to Supabase
  project `ywiwmczccktwzqyhzhiz`.
- Authenticated NestJS v2 survey-calibration and historical-backtest commands,
  idempotency, status/events/cancel reads, OpenAPI, and a native Evidence Lab
  UI were added. The worker now claims and evaluates these durable jobs with
  the deterministic core; held-out outcomes are never returned by the read API.
- Project-scoped outcome references, per-run `retention_until` metadata, bounded
  retention deletion, and retention audit events were added in migration
  `20260801125632_campaign_lab_evidence_project_retention`.
- Aggregate-only CSV, Formbricks, ODK, and generic JSON adapters now normalize
  external response exports in memory with duplicate, bot, low-quality,
  malformed, consent, rights, and prohibited-field controls. Respondent rows
  are not persisted.

## Implemented before this turn

- Versioned population frames with source provenance and normalized cell
  weights.
- Deterministic weighted audience sampling and sparse-cell suppression.
- Private behavioral engine with weighted synthetic agents, deterministic
  provider fixtures, replayable action events, bounded memory, typed heuristic
  component metrics, and synthetic-agent disclosure.
- Durable run/attempt/lease/result/audit infrastructure and tenant-scoped RLS.
- Held-out benchmark registry/evaluation primitives.

## Not yet verified or supplied

- Lawfully admitted Philippine survey and historical campaign datasets. The
  adapters and evaluators are functional, but no real dataset is attached to
  this release, so no validity or accuracy claim is permitted.
- Scheduled production invocation and alerting for retention cleanup.
- End-to-end hosted browser/API/data/readiness evidence for the new routes and
  provider deployments.

## Truth boundary

SIMULA is not authorized to claim population prediction, survey replacement,
vote-share prediction, universal accuracy, or Predikta-equivalent capability.
The current deterministic fixture and authored tests remain experimental and
estimate nobody. Survey calibration and historical backtesting are now durable
evaluation jobs, but no real Philippine survey or historical outcome dataset is
attached here; hosted verification and lawful data admission remain required
before any validity claim.
