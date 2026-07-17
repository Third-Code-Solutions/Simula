---
title: ADR-0007 Provider Boundary and Deterministic Mock
status: accepted
created: 2026-07-17
updated: 2026-07-17
owner: Methodology security and backend leads
classification: PROPOSED
source_of_truth: true
---

# ADR-0007 — Provider Boundary and Deterministic Mock

## Context

External model calls can leak confidential content, amplify prompt injection, incur unbounded cost, and return unstable or malformed output. No provider terms or SIMULA benchmark is approved.

## Decision

### Interface

`SimulationProvider` accepts an immutable, minimized `ProviderRequest` and returns a schema-validated `ProviderResponse` plus usage metadata. It cannot access database clients, tenant credentials, arbitrary tools, network destinations, or raw environment variables.

Required request fields: request/attempt IDs, method/config versions, allowed language, canonical stimulus content, abstract audience cells, deterministic seed, output schema version, deadline, and cost ceiling. Organization/user identifiers are excluded.

Required response fields: provider/model/template identifiers, schema version, typed outputs, finish status, usage/cost, start/end timestamps, and safe error class. Raw provider payload is not a public result.

### Phase 2 mock

- Only `DeterministicMockProvider` is registered. Real-provider feature flag and credentials do not exist.
- It performs no network, file, shell, database, clock-dependent, or random-global operation.
- Canonical frozen manifest + explicit seed + mock version determine output through SHA-256 and documented pure transformations.
- Same inputs produce byte-equivalent canonical JSON across supported platforms.
- Output is restricted to kinds approved by [[../Methodology/OUTPUT_TYPE_SYSTEM|Output Type Contract]] and always labeled experimental/demo/non-representative.
- Failure injection is explicit test configuration keyed by fixture, never user stimulus instructions.

### Real-provider admission

Before any adapter can be enabled:

1. Provider contract, subprocessors, region, retention/training, deletion, incident, and acceptable-use terms reviewed.
2. Field-level egress map and user disclosure approved; personal/sensitive data gate completed.
3. Structured-output conformance, prompt injection, secret exfiltration, timeout, cancellation, retry, rate, and cost tests pass.
4. Provider/model/template/config version is frozen and registered.
5. Benchmark scope and output-kind eligibility approved; default remains experimental otherwise.
6. Kill switch, quota reservation, alerts, and incident owner exist.

### Failure policy

- Deadlines are end-to-end, not reset per attempt. Phase 3 initial provider-call ceiling: 45 seconds inside a run budget.
- Adapter classifies timeout, rate limit, transient network, refused, invalid schema, safety/policy, budget, and permanent provider errors.
- Orchestrator owns retry policy per [[ADR-0006-QUEUE-AND-RUN-STATE-MACHINE|ADR-0006]]. Adapter does not silently retry billable requests unless the provider offers a proven idempotency key.
- No silent provider, model, prompt, method, language, or data fallback.
- Invalid structured output is failure, never “best effort” text parsing into a result.

### Prompt/content safety

- Stimulus and audience fields are delimited untrusted data, not instructions.
- Provider has no tools or retrieval in initial scope.
- System/template content is immutable/versioned and cannot interpolate secrets.
- Output is parsed as data and escaped by downstream renderers; generated links/HTML/code are not executed.

## Rejected options

- Direct provider calls from web/API request: secrets, duration, cancellation, and audit problems.
- One adapter with provider-specific branches: hidden fallback and poor conformance tests.
- Record/replay of unreviewed real payloads as fixtures: potential confidentiality/license leakage.
- Parse arbitrary prose: contract and injection risk.

## Consequences

- Phase 2 proves plumbing, not model quality.
- Real-provider work cannot start by merely adding an API key.
- Provider conformance suite becomes a Phase 3 gate.

## Rollback

Disable provider/config in registry and feature flags, stop new runs, cancel/drain affected jobs, rotate credential if exposed, and revert to deterministic mock only. Existing results retain original provenance and are not relabeled.

