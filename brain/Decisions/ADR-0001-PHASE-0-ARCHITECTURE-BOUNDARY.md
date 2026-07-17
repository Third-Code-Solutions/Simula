---
title: ADR-0001 — Treat Architecture Baseline as Phase 1 Input
status: accepted
created: 2026-07-17
updated: 2026-07-17
owner: Principal program and engineering lead
classification: PROPOSED
source_of_truth: true
---

# ADR-0001 — Treat Architecture Baseline as Phase 1 Input

## Context

`BOOTSTRAP_PROMPT.md` supplies a monorepo and hosting/service baseline, but Phase 0 is restricted to evidence and discovery. Premature scaffolding or unresearched technology detail would violate the phase boundary and could turn assumptions into commitments.

## Decision

During Phase 0:

- Treat Vercel, Railway, Supabase, Next.js, FastAPI, Python workers, and provider-neutral AI integration as SIMULA constraints labeled `PROPOSED` or mandated by the brief.
- Document logical boundaries, threats, requirements, and open decisions only.
- Do not create application/service/infrastructure scaffolding.
- Research current public platform constraints and defer version selection, queue choice, topology, schemas, contracts, and implementation ADRs to Phase 1.
- Never infer competitor internals from the SIMULA baseline.

## Consequences

- Phase 0 remains reversible and evidence-focused.
- Phase 1 receives a bounded decision backlog and current-source requirements.
- No working software exists at Phase 0 exit, by design.

## Alternatives considered

- Scaffold immediately: rejected because it violates explicit Phase 0 instruction.
- Ignore baseline and redesign freely: rejected because baseline applies unless a later ADR justifies change.

