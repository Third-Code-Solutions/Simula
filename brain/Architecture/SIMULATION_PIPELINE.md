---
title: SIMULA Simulation Pipeline
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-17
owner: Methodology and architecture leads
classification: PROPOSED
source_of_truth: true
---

# SIMULA Simulation Pipeline

## Pipeline stages

1. **Authorize and freeze inputs:** bind tenant, project, stimulus, audience, data, method, prompt, and configuration versions.
2. **Validate:** content, schema, language, rights/use status, size, quota, and prohibited-use checks.
3. **Normalize/features:** deterministic/versioned extraction where possible; record generated features separately.
4. **Resolve frame:** confirm coverage, exclusions, eligible cells, weights, and suppression rules.
5. **Sample:** weighted or stratified sampling with seed and configuration; no per-citizen fiction.
6. **Construct context:** minimal study/cohort context under prompt-injection and privacy controls.
7. **Generate structured response:** provider-neutral adapter, schema validation, timeout, bounded retries, and cost limit.
8. **Score:** deterministic/calibrated logic where supported; heuristic outputs visibly typed.
9. **Aggregate:** weights, missingness, effective sizes, segments, stability, and suppression.
10. **Analyze:** disagreement, risk, counter-patterns, and sensitivity.
11. **Explain/recommend:** separately generated qualitative content with traceable input set.
12. **Persist/publish:** atomic terminal state, provenance, limitations, usage/cost, and audit event.
13. **Evaluate later:** link separately stored ground truth and evaluation/calibration version.

## State model requirements

Phase 2 canonical enum is `queued`, `running`, `retrying`, `cancel_requested`, `canceled`, `succeeded`, `failed`. Every transition records time, attempt, actor/system cause, correlation ID, and safe failure class. Exact transitions, leases, retries, and duplicate handling: [[../Decisions/ADR-0006-QUEUE-AND-RUN-STATE-MACHINE|ADR-0006]].

## Idempotency and retries

- Run identity and attempt identity are distinct.
- Persist stage checkpoints only where replay is safe and version-bound.
- Provider retries use bounded backoff and do not duplicate aggregation or publication.
- Dead-letter/terminal failure needs operator visibility and user-safe resolution.

## Reproducibility

Record exact inputs, versions, random seeds, runtime release, provider/model identifiers, prompt/template, parameters, responses or approved hashes/artifacts, transformations, errors, retry history, costs, and timestamps subject to privacy/retention rules.

## Failure policy

No silent provider fallback, method change, data substitution, or partial-result publication. Any approved fallback must be explicit in run metadata and comparability rules.

## Phase 2 decisions

- Railway Redis/ARQ transport with Supabase transactional outbox; Postgres run/outbox state is authoritative.
- No partial-result publication or provider cache.
- Cooperative cancellation; losing worker output is discarded.
- Result retained per [[../Data/DEMO_DATA_POLICY|Demo Data Policy]].
- Mock cost is zero; real-provider quota reservation is a Phase 3 gate.
