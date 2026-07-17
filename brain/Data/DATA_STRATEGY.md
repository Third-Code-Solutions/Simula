---
title: SIMULA Data Strategy
status: active
created: 2026-07-17
updated: 2026-07-17
owner: Data lead
classification: PROPOSED
source_of_truth: true
---

# SIMULA Data Strategy

## Goal

Create traceable audience frames and evaluation data without inventing distributions, exposing people, or treating a public table as unlimited model input.

## Layered plan

1. Authored demo fixtures: deliberately fictional records/cells, deterministic, labeled non-representative. Only data admitted to Phase 2.
2. Official aggregate controls: rights-reviewed PSA census, geography, and socioeconomic tables for coverage research.
3. Rights-approved microdata or panels: used only under explicit purpose, privacy, license, and model-use terms.
4. Client ground truth: separately stored, tenant-scoped, purpose-bound, and never silently blended into predictions.
5. Derived synthetic populations: versioned transformations with joint/marginal fidelity, disclosure-risk, sparse-cell, and held-out validation reports.

Phase 2 admission and retention rules: [[DEMO_DATA_POLICY|Demo Data and Admission Policy]].

## Population-frame requirements

- Named target population, inclusion/exclusion, time/geography, coverage gaps, source versions, controls, and weights.
- Evidence for each joint dependency; no product of marginals presented as observed truth.
- Effective sample/cell sizes, minimum thresholds, suppression, and instability flags.
- Language and cultural scope recorded separately from demographic coverage.
- No claim of representing 70 million Filipinos without independently reviewed evidence.

## Governance gates

Candidate, rights, privacy, quality, transformation, validation, release, monitoring, and retirement gates. Failed or expired data cannot enter new runs. Historical runs keep resolvable immutable metadata.

## Privacy direction

- Prefer aggregates and authored synthetic fixtures.
- Minimize individual fields and provider disclosure.
- Pseudonymization is not anonymization.
- Conduct PIA and lawful-basis review when personal data enter AI development/deployment (E-3007, E-3008).
- Publicly accessible personal data remain protected and cannot be scraped around terms or technical controls (E-3009).
- Implement deletion/rights propagation across stores, jobs, providers, logs, exports, and backup expiry before personal-data production use.

## Phase 1 decisions

- Approve dataset registry schema, review roles, version/checksum format, license taxonomy, sensitivity classes, retention model, and transformation manifest.
- Define first benchmark acquisition path and keep it separate from tuning.
- Approve no external production data until legal/contract and provenance gates pass.

## Evidence

Candidate source facts: E-3001–E-3006. Privacy/governance duties: E-3007–E-3010. Synthetic-population constraints: E-2001–E-2002. Full metadata in [[../EVIDENCE_LEDGER|Evidence Ledger]].
