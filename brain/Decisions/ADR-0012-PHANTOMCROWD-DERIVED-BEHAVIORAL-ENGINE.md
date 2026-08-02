---
title: ADR-0012 PhantomCrowd-Derived Behavioral Engine
status: accepted
created: 2026-07-29
updated: 2026-07-29
owner: Methodology architecture and security leads
classification: PROPOSED
source_of_truth: true
---

# ADR-0012 - PhantomCrowd-Derived Behavioral Engine

## Context

The user selected
[`l2dnjsrud/PhantomCrowd`](https://github.com/l2dnjsrud/PhantomCrowd) as the
primary source for SIMULA's complete product idea. The inspected MIT-licensed
revision provides a concrete open-source decomposition for knowledge-grounded,
tiered multi-agent campaign simulation, reports, interviews, and A/B tests.

Its reference implementation is useful but not production-compatible with
SIMULA's tenancy, durability, security, reproducibility, and claims contract.
The evidence and limitations are recorded in
[[../Research/PHANTOMCROWD_IMPLEMENTATION_REFERENCE|PhantomCrowd Implementation Reference]].

## Decision

### Adopted engine decomposition

- A context builder transforms admitted stimulus and governed evidence into a
  provenance-bearing context graph.
- A population builder transforms a versioned audience definition into a frozen
  weighted synthetic-agent manifest.
- A tiered fleet combines bounded LLM agents and deterministic rule agents
  behind one versioned behavior interface.
- A round orchestrator executes reactions and peer interactions, persists
  immutable actions, updates bounded agent memory, and publishes a replayable
  crowd-pulse summary for the next round.
- Typed aggregators compute evidence-backed numerical and heuristic outputs.
  Report tools expose only those typed facts to qualitative synthesis.
- Optional synthetic-agent interviews explain one simulated trace. They are
  never treated as human observations.
- Retest and A/B comparison use frozen matched manifests. Evaluation uses
  separately governed observed-outcome datasets.

### Production authority

- NestJS remains the public control plane under ADR-0011.
- Private Python/FastAPI owns engine contracts and provider orchestration.
- Python workers execute manifests but do not own run lifecycle state.
- Supabase PostgreSQL remains authoritative for tenant data, graph/artifact
  metadata, runs, events, attempts, leases, output, evaluation, and audit.
- BullMQ transports versioned identifiers only.
- Supabase Storage holds private source and export artifacts. pgvector is a
  retrieval index under measured recall and authorization gates.

### Reproducibility and truth

- Every run freezes code, audience, dataset, graph, embedding, method, agent,
  prompt, provider/model, seed, locale, limits, and output-schema versions.
- All stochastic code uses an injected seeded generator. No process-global
  randomness is permitted in admitted methodology.
- Missing/invalid provider or method output fails closed. No silent default
  scores, profiles, probabilities, labels, or controversy decisions.
- The model does not create demographics or weights. Those originate in an
  admitted population frame or explicitly authored demo fixture.
- Numerical, calibrated, heuristic, qualitative, and recommendation outputs
  remain separate types. Generated narrative cannot modify numerical evidence.
- A score becomes "validated" only for a named task/population/language/category
  scope after prespecified held-out evaluation, leakage review, uncertainty,
  baseline comparison, calibration, subgroup error, and temporal validation.

### Security and privacy

- Stimulus and retrieved context are untrusted data, not provider instructions.
  Prompt-injection tests and strict structured output are mandatory.
- Provider egress is minimized, allowlisted, cancellable, receipt-backed,
  deadline-bound, and cost-reserved.
- URL ingestion requires SSRF-safe DNS/IP/redirect checks and bounded content.
- Agent memory is run-scoped, minimized, encrypted through platform controls,
  and governed by the source run's deletion and retention policy.
- Public, licensed, consented, user-provided, or synthetic data only. Public
  accessibility does not establish reuse rights.

### Attribution and code reuse

- The exact reference revision and license are recorded.
- Substantial copied code must retain the PhantomCrowd copyright and MIT
  permission notice in the applicable distribution/source location.
- Prefer independent implementation of concepts when SIMULA's architecture
  changes the code materially. Do not import the reference dependency graph or
  copy its validation claims.

## Rejected options

- Wholesale fork: imports incompatible frontend/backend, persistence, auth,
  dependency, testing, and runtime assumptions.
- Treating LLM scores as outcome prediction: unsupported and unstable.
- LLM-generated population frames: destroys provenance and representation.
- Process-local campaign tasks/state: not restart-safe or horizontally safe.
- Silent behavioral defaults: creates plausible but unsupported evidence.
- Treating synthetic interviews as participant quotes: deceptive.

## Consequences

- M4 expands from a provider adapter into a complete context, population,
  interaction, memory, aggregation, reporting, interview, and evaluation
  engine.
- More durable schemas, evaluation fixtures, security tests, and scientific
  controls are required before feature parity.
- PhantomCrowd accelerates product decomposition but does not shorten SIMULA's
  independent validation or production release gates.

## Rollback

Disable the real-engine provider/method admission flags. Preserve immutable
historical manifests and results. Continue the visibly experimental deterministic
demo path while remediation or evaluation occurs. Never silently substitute demo
output for a failed real-engine run.
