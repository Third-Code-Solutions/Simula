---
title: PhantomCrowd Implementation Reference
status: active
created: 2026-07-29
updated: 2026-07-29
owner: Research and methodology leads
classification: OBSERVED
source_of_truth: true
---

# PhantomCrowd Implementation Reference

## Reference boundary

E-1019. PhantomCrowd is SIMULA's primary public implementation reference for the
behavioral-simulation product idea. The inspected source is
[`l2dnjsrud/PhantomCrowd`](https://github.com/l2dnjsrud/PhantomCrowd) at commit
[`4f197a8df0de5183f2376a210f42aaf948bd9b0a`](https://github.com/l2dnjsrud/PhantomCrowd/tree/4f197a8df0de5183f2376a210f42aaf948bd9b0a).
The repository carries an
[`MIT License`](https://github.com/l2dnjsrud/PhantomCrowd/blob/4f197a8df0de5183f2376a210f42aaf948bd9b0a/LICENSE).

SIMULA may reuse MIT-licensed concepts and, when justified, code with required
copyright and permission notices. Default implementation policy is independent
adaptation into SIMULA's existing architecture and contracts, not wholesale
copying. Predikta remains a public workflow and market reference; PhantomCrowd
is the primary open-source implementation reference.

## OBSERVED architecture and features

- The
  [README](https://github.com/l2dnjsrud/PhantomCrowd/blob/4f197a8df0de5183f2376a210f42aaf948bd9b0a/README.md)
  describes a five-stage flow: campaign intake, context analysis, agent
  generation, interaction, and report.
- The backend uses FastAPI, SQLAlchemy, and SQLite. The frontend uses Vue and
  Vite.
- A knowledge layer combines LightRAG, embeddings, and NetworkX to assemble
  context before simulation.
- The multi-agent engine combines LLM agents with cheaper rule agents, executes
  rounds, emits action events, and feeds aggregate crowd state into later
  behavior.
- Agent memory records relationships and interaction history.
- Report generation is separated into report tools and synthesis. The product
  exposes quick simulation, A/B comparison, report export, and synthetic-agent
  interview flows.
- The inspected test surface is narrow: engine, JSON utility, memory, and report
  tool tests. Dependency requirements are lower bounds rather than exact pins.

## REPORTED claims, not accepted validation

- E-1020: the README reports support for up to 100 LLM agents and 2,000 rule agents,
  multilingual campaigns, A/B testing, interviews, and exports. These are
  repository claims, not SIMULA capacity or correctness evidence.
- E-1020: the repository's
  [validation report](https://github.com/l2dnjsrud/PhantomCrowd/blob/4f197a8df0de5183f2376a210f42aaf948bd9b0a/docs/validation-report.md)
  reports a 50-campaign backtest with Pearson correlation 0.469, MAE 21.6,
  directional accuracy 71%, exact-bucket accuracy 30%, and near-bucket accuracy
  60%.
- E-1020: that report also records score compression, context-insensitive scoring, and
  a cultural-sensitivity failure. Its described correction uses prompt anchors
  and a controversy penalty.
- E-1020: the expected campaign scores are described as hand-labelled outcomes. The
  inspected revision did not contain the referenced
  `backend/data/backtesting_campaigns.py`, so dataset construction, source
  provenance, label reproducibility, and leakage controls remain UNKNOWN.
- These reported results do not validate population representation, individual
  prediction, KPI forecasting, or SIMULA.

## Unsafe production patterns to reject

- API authentication can be disabled when no key is configured.
- SQLite and process-local state are used where SIMULA requires durable,
  tenant-scoped PostgreSQL authority.
- Long work is started with process-local background tasks; progress and some
  simulation state are held in memory.
- Broad exception handlers frequently return defaults. Examples include
  default probabilities, default report scores, and no-controversy results on
  detector failure.
- Rule-agent profiles and actions use unseeded global randomness. Generated
  demographic profiles can silently fall back to defaults.
- The headline score is model/prompt-derived and penalty-adjusted, not a
  statistically calibrated outcome estimate.
- URL scraping follows arbitrary URLs and redirects without SIMULA's required
  network-egress and SSRF controls.
- Synthetic-agent interviews are generated explanations based on synthetic
  state. They are not human testimony.
- Some report-tool behavior is described as incomplete in source.

## Adopted SIMULA pattern

```text
licensed/user-provided stimulus
  -> admitted evidence and context graph
  -> frozen audience/method/provider manifest
  -> tiered agent fleet
  -> bounded interaction rounds and immutable action events
  -> typed aggregation
  -> numerical/heuristic/qualitative output separation
  -> report tools and schema-validated synthesis
  -> refinement, retest, A/B comparison, and evaluation
```

- Context retrieval is provenance-aware and tenant-scoped. pgvector supports
  measured retrieval use cases; it does not create behavioral truth.
- LLM agents and rule agents implement versioned interfaces. Every pseudo-random
  decision uses a frozen seed and named algorithm.
- Agent traits come only from admitted audience definitions and governed
  population synthesis. An LLM must not invent the population frame.
- Each round writes bounded immutable action events. Agent memory is minimized,
  scoped to one run unless an explicit governed longitudinal design exists, and
  deleted under the run's retention policy.
- Crowd-pulse aggregation may influence later rounds only through a versioned,
  replayable transformation.
- Report tools receive typed evidence. Report synthesis cannot manufacture or
  silently replace numerical results.
- Synthetic interviews are optional qualitative explanations labelled
  "synthetic-agent explanation"; they never imply a real respondent said the
  text.
- A/B comparison uses matched frozen inputs and paired analysis. Backtesting
  uses rights-cleared, prespecified, held-out observed outcomes with baselines,
  uncertainty, subgroup error, leakage review, and calibration evidence.

## Production controls added by SIMULA

- Supabase PostgreSQL, forced RLS, least-privilege roles, durable outbox, leases,
  attempts, results, and audit remain authoritative.
- BullMQ transports identifiers only. Workers are restart-safe and replay from
  durable state.
- Strict schemas reject unknown or missing fields. No behavioral score,
  demographic, controversy result, or report silently defaults.
- Provider, model, prompt, method, dataset, embedding, graph, seed, and code
  versions are frozen in each run.
- Provider calls have data minimization, prompt-injection isolation, egress
  allowlists, deadlines, cancellation, cost reservations, receipts, and a kill
  switch.
- URL ingestion resolves and revalidates every redirect, blocks private/link
  local/reserved addresses, limits media/type/size/time, and stores provenance.
- Output types remain distinct: measured numerical, calibrated estimate,
  heuristic, qualitative, and recommendation. A "viral score" is never presented
  as validated prediction without held-out evidence for its exact scope.

## Decision

Adopt the PhantomCrowd product and engine decomposition as the primary
open-source idea source. Reimplement it through
[[../Decisions/ADR-0012-PHANTOMCROWD-DERIVED-BEHAVIORAL-ENGINE|ADR-0012]] and
[[../../plans/active/003-predikta-class-production-platform|Plan 003]], retaining
MIT attribution for any substantial copied code and requiring SIMULA's existing
security, tenancy, evidence, and release gates.
