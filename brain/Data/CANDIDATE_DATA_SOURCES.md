---
title: SIMULA Candidate Data Sources
status: active
created: 2026-07-17
updated: 2026-07-17
owner: Data lead
classification: OBSERVED
source_of_truth: true
---

# SIMULA Candidate Data Sources

## Gate

Discovery does not authorize production use. Public reachability is not a blanket right to transform, profile, model, redistribute, or combine data. Each source needs dataset-level terms, purpose, quality, privacy, and sparse-cell review.

| Candidate | Public content | Version/reference | Access/rights status | Potential use | Key limitation | Evidence |
|---|---|---|---|---|---|---|
| PSA 2020 Census of Population and Housing | Population, household, housing, demographic and socioeconomic variables; complete and sample forms | Reference 2020-05-01; catalog version 1.0 | Aggregates and selected public-use files; client terms apply | Population-frame controls and coverage analysis | Intersections, currency, confidentiality, and downstream commercial rights need review | E-3001, E-3002 |
| PSA Philippine Standard Geographic Code | Official region through barangay codes and changes | Release 2026-07-13; PSGC as of 2026-06-30 | Public classification/API subject to PSA terms | Versioned geography identity and joins | Codes/boundaries change; historical alignment required | E-3005 |
| PSA OpenSTAT | Official statistical tables and metadata | Live table-specific versions | API documented; rate-limited; table terms still apply | Automated aggregate-data ingestion | Not all needed variables or joints exist; availability is not a universal license | E-3006 |
| PSA 2023 FIES | Family income, expenditure, poverty-related estimates | 2023 survey; preliminary releases | Published aggregates; microdata/access terms separate | Economic-band hypotheses and validation controls | Household survey error, region/sample constraints, no psychographic inference | E-3003 |
| PSA 2022 NDHS | Demographic and health indicators | 2022 survey | Published outputs; DHS/PSA access terms apply | Restricted research/coverage analysis only if purpose-approved | Sensitive domain; minimization and rights review required | E-3004 |
| Licensed survey or panel | Vendor-specific respondent data and weights | Contract/version specific | UNKNOWN until contract, consent, purpose, geography, retention, and model-use rights pass review | Human benchmark and calibration | Cost, coverage, bias, reuse rights, cross-border transfer | UNKNOWN |
| Client-provided research/outcomes | Study-specific surveys, focus-group coding, campaign results | Client/version specific | UNKNOWN until client authority and data-processing terms pass review | Ground truth and customer-specific evaluation | Purpose mismatch, consent, sensitive data, leakage, confounding | UNKNOWN |
| Authored demo synthetic data | Deliberately fictional, non-personal fixtures | Repository release version | SIMULA-authored terms | Development, demo, deterministic tests | Must not be presented as representative or calibrated | PROPOSED |

## Rejected shortcuts

- No social-media or website scraping to build production profiles without purpose, lawful-basis, terms, minimization, and PIA review. NPC Advisory 2026-01 states that public availability does not remove protection (E-3009).
- No reconstruction of missing demographic intersections from intuition.
- No silent reuse of research data for model training or commercial profiling.
- No raw individual-level dataset in test, preview, analytics, logs, or model prompts by default.

## Admission checklist

Source identity/owner; direct URL; version/date; unit and frame; variables; geography; sample/weights; collection mode; missingness; transformations; license/contract; allowed purpose; model/AI use; redistribution; retention/deletion; personal/sensitive status; lawful basis; provider transfer; bias/coverage; sparse-cell rules; validation owner; checksum; review/expiry date.

## Phase 1 decision

Phase 2 uses only authored demo synthetic fixtures. Any external dataset remains disabled until a signed provenance record and data-governance review passes.
