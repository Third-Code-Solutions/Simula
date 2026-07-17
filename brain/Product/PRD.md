---
title: SIMULA Product Requirements Document
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-17
owner: Product lead
classification: PROPOSED
source_of_truth: true
---

# SIMULA Product Requirements Document

> Phase 1 decision. Approved only for an experimental walking skeleton; demand and validity remain unproven.

## Problem

Philippine campaign and research teams need fast, structured pre-launch pressure testing, but synthetic-audience products can create false confidence when provenance, uncertainty, validation scope, and generated-versus-measured output are hidden.

## Primary user and job decision

Primary Phase 2 hypothesis: a brand or agency strategist wants to expose likely wording confusion, objections, and cultural risk before paying for fieldwork or media. This is selected for prototype learning, not validated demand.

Secondary hypotheses:

1. Insights/research lead: use an auditable experimental pretest to refine questions and decide where human research is needed.
2. Communications/public-interest team: inspect language/geographic risk with explicit unsupported-use and harm controls.

Research administrators and data/method owners are enabling users, not the first sales persona.

## Product promise

Create a project, enter text stimuli, select a provenance-aware demo audience, run an asynchronous experimental simulation, inspect typed distributions and rationales, compare variants, see evidence/limits, and later attach real outcomes separately for evaluation.

Position: pressure-test before field research. Never replace surveys, panels, focus groups, experiments, or expert judgment.

## MVP scope by phase

- Phase 2: authentication, organization, project, one text stimulus, one authored demo audience, one async mock simulation, one structured result page, provenance, experimental label, E2E.
- Phase 3: versioned population/sampling/aggregation, uncertainty/stability, provider-neutral adapters, evaluation harness, reproducibility, cost limits.
- Phase 4: audience builder, variants, configuration review, full report/comparison, exports, audit, method drawer, admin essentials, feedback/ground-truth capture.

## Core requirements

- Tenant-owned data is private by default and authorized server-side plus RLS.
- Every run freezes stimulus, audience, data, method, model/provider, prompt, configuration, code release, and seed/artifact versions.
- Numerical, heuristic, qualitative, and recommendation outputs remain typed and visibly distinct.
- Validation status and limitations appear beside headline results.
- Missing/unsupported/suppressed slices are explicit.
- Generated rationales are never labeled participant quotes.
- Async states include queued, running, retrying, cancel requested, canceled, succeeded, and terminal failed.
- No silent fallback, duplicate billable execution, false precision, or unsupported population claim.
- User-visible status/errors and full critical journey target WCAG 2.2 AA (E-4010).
- Research disclosure follows source/sponsor/population/method/instrument/language/date/weight/limitation principles (E-4011).

## Success measures

Approved targets and testable criteria are in [[ACCEPTANCE_CRITERIA|Phase 2 Product Acceptance Criteria]]. Demand evidence is governed by [[USER_DISCOVERY_PLAN|User Discovery Plan]].

Track:

- First-project and first-run completion without operator help.
- Variant-comparison comprehension and correct interpretation of experimental status.
- Provenance/method disclosure findability.
- Job completion, retry recovery, and duplicate-run prevention.
- Accessibility and critical-journey test pass rate.
- Cost/latency budgets.
- Benchmark performance only after a held-out evaluation is approved.

No predictive-accuracy launch KPI exists yet.

## Safety and exclusions

See [[NON_GOALS|Non-Goals]]. No billing. No high-stakes individual decisions, sensitive-trait inference, one-agent-per-citizen fiction, scraped profile population, political persuasion optimization, or production representativeness claim.

## Approved Phase 2 release boundary

- English UI and English authored demo stimulus only. Filipino and Taglish are displayed as unsupported, not silently processed.
- One text stimulus version and one authored non-representative audience.
- Deterministic mock provider only; no predictive or representativeness claim.
- Export/share, file upload, variant comparison, real providers, real outcome data, and production use are deferred.
- Phase 2 behavior must satisfy [[ACCEPTANCE_CRITERIA|AC-*]].
