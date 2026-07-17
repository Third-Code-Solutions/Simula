---
title: SIMULA Methodology v0
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-17
owner: Methodology lead
classification: PROPOSED
source_of_truth: true
---

# SIMULA Methodology v0

> Approved for the Phase 2 deterministic walking skeleton only. No accuracy or representativeness claim is made.

## Intended use

Pressure-test text stimuli and compare variants before or alongside human research. Not a survey replacement, forecast guarantee, individual decision system, or evidence of how all Filipinos think.

## Population frame

Each frame declares target population, geography/time, inclusion/exclusion, source versions, collection frames, variables, weights, coverage gaps, and supported slices. Marginal controls do not prove joint distributions (E-2001, E-2002). Missing intersections stay unavailable or explicitly modeled and validation-labeled; they are never invented.

## Synthetic cohorts

- Generate weighted cells or bounded synthetic respondents, not one request per citizen.
- Use rights-approved source dependencies, explicit constraints, versioned code/config, and deterministic seeds.
- Test impossible combinations, marginal and joint fidelity, diversity, disclosure/linkage risk, sparse cells, and stability.
- Keep authored demo cohorts visibly fictional and non-representative.

## Psychographics

Every construct records definition, source/instrument, items, scoring, reliability, validity evidence, cultural/language adaptation, license, intended interpretation, prohibited use, and measurement-invariance status. Validity belongs to a score interpretation/use (E-2008); unsupported cross-group comparisons are suppressed (E-2009). No invented personality labels.

## Response pipeline

1. Freeze tenant, stimulus, audience, data, method, prompt, provider/model, configuration, and seed versions.
2. Validate authorization, rights, content, scope, quota, language, and schema.
3. Normalize stimulus and extract separately typed features.
4. Resolve eligible frame/cells and weights.
5. Sample deterministically under configured strategy.
6. Build minimal, injection-resistant context.
7. Generate schema-constrained responses through a provider-neutral adapter.
8. Retry only bounded transient failures; no silent provider/model/method substitution.
9. Score numerical outputs only under a named deterministic, calibrated, or heuristic rule.
10. Aggregate with weights, missingness, effective sizes, suppression, and stability.
11. Generate qualitative explanations/recommendations separately.
12. Persist provenance, limitations, cost, attempts, and audit events.

## Output types

- Measured/calibrated estimate: allowed only within held-out validated scope.
- Model estimate: model-derived with version and benchmark status.
- Heuristic score: explicit rule, labeled unvalidated.
- Generated qualitative rationale: not a participant quote or measurement.
- Product recommendation: decision support, not predicted fact.

The UI and API preserve these types; aggregation never converts generated confidence into statistical uncertainty.

Exact enums, envelopes, invariants, and Phase 2 prohibitions: [[OUTPUT_TYPE_SYSTEM|Output Type and Uncertainty Contract]].

## Uncertainty

Maintain a budget for frame/coverage, sampling, measurement, model, calibration, run stability, missingness, and dataset shift. Show only components supported by evidence. Repeated LLM variation is not human sampling error. E-2006 and E-2007 support proper scoring and shift-specific calibration evaluation, not fabricated intervals.

## Reproducibility

Record exact input hashes, dataset/frame/method/model/prompt/config/code versions, seed, environment, provider identifiers, responses or approved artifacts, stage events, attempts, errors, costs, and timestamps. A deterministic fixture must rerun exactly; provider outputs need traceable artifacts and stability tests.

## Promotion ladder

- Experimental: demo or unvalidated; default for initial product.
- Benchmarked: evaluated on a named held-out task/slice with disclosed metrics.
- Calibrated: quantitative output calibrated for named scope and current version.
- Retired: failed, expired, drifted, or superseded; blocked for new runs.

Promotion requires independent review and a method/model card. Documentation alone does not prove validity (E-2010).

## Known limits

E-2003 reports bounded promise. E-2004 and E-2005 show group misalignment, variance compression, changed inference, prompt sensitivity, and drift risks. E-1016 reports cross-country error concentration. Therefore all Phase 2/3 outputs remain experimental until SIMULA-specific held-out evidence passes Phase 1-approved gates.

## Phase 2 method decision

- Input: one English text stimulus version plus one authored demo audience version.
- Engine: deterministic local mock; SHA-256-derived seed; no model/provider egress.
- Output: one `demo_fixture_distribution`, deterministic synthetic observation, and human-research recommendation.
- Uncertainty: `not_applicable` for fixture values; no confidence, margin-of-error, or population language.
- Reproducibility: identical frozen manifest and code version must produce byte-equivalent canonical result JSON.
- Promotion: remains `experimental`; Phase 2 cannot emit `measured_estimate` or `model_estimate`.
