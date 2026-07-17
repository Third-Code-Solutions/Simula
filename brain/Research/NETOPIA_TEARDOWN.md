---
title: Netopia AI Public-Evidence Teardown
status: active
created: 2026-07-17
updated: 2026-07-17
owner: Research lead
classification: OBSERVED
source_of_truth: true
---

# Netopia AI Public-Evidence Teardown

## Evidence boundary

Public, access-compliant evidence only. One claim receives one evidence label. No private implementation is inferred from SIMULA’s proposed architecture.

## OBSERVED

- E-1017, high: [Netopia’s public site](https://www.netopia.ai/) presents Predikta as its in-market campaign-simulation application. Limitation: public product relationship only.

## REPORTED

- E-1010, medium: vendor says its behavioral model uses surveys, decision traces, choice records, and contextual signals. Limitation: no published source-level provenance, sampling, license, or audit detail.
- E-1005, medium: Netopia-associated authors report survey-grounded Filipino-agent results in a [preprint](https://arxiv.org/abs/2505.22125). Limitation: not peer-reviewed or independently replicated.
- E-1006, medium: an involved partner reports historical AdSpark backtesting. Limitation: no public raw data or fully reproducible protocol.
- E-1015, high: peer-reviewed cognition work reports bounded feasibility and population/individual-difference limits. Limitation: unrelated cognitive tasks, not a Netopia product test.
- E-1016, high: cross-country well-being work reports larger errors in underrepresented countries and rejects replacement of direct self-report. Limitation: not a Netopia product test.

## INFERRED

- E-1010 and E-1017, medium: public positioning emphasizes a reusable behavioral engine plus an application, rather than a one-off report. Limitation: positioning inference; internal architecture remains UNKNOWN.
- E-1005, E-1006, E-1015, and E-1016, high: available evidence supports only bounded, task-specific feasibility—not general Filipino population or campaign validity.

## UNKNOWN

- Independent Netopia/Predikta product replication. Search scope on 2026-07-17: official Netopia/Predikta pages, associated arXiv paper, Globe partner article, public media results, and general web discovery. Limitation: search was broad but not exhaustive.
- E-1018, high for inspected scope: main-site rendered markup and common public privacy/terms routes did not expose policy text. Limitation: undiscovered, client-only, or authenticated documents may exist; no compliance conclusion.
- Complete datasets/licenses, frames, sampling, weights, sparse cells, update cadence, provider/model stack, prompts, algorithms, calibration, storage, tenancy, security, and cost.
- Generalizability of disclosed historical studies to new categories, languages, populations, or outcomes.

## PROPOSED SIMULA response

- Make provenance and validation scope product objects, not marketing-only assertions.
- Require independent or customer-reproducible evaluation before population or accuracy claims.
- Evaluate language, geography, and segment slices; never hide weak slices behind an aggregate.

Full metadata: [[../EVIDENCE_LEDGER#Competitor and market evidence|Evidence Ledger E-1005, E-1006, E-1010, E-1015–E-1018]].
