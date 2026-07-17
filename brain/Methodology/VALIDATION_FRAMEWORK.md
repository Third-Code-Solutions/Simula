---
title: SIMULA Validation Framework
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-17
owner: Evaluation lead
classification: PROPOSED
source_of_truth: true
---

# SIMULA Validation Framework

## Principle

Validation is scoped to a population, language, task, construct, data version, methodology, model/provider, prompt, configuration, and time. Passing one benchmark never establishes universal accuracy.

## Evidence ladder

1. Schema/safety validity: output parses, respects types/ranges, and fails safely.
2. Reproducibility: deterministic fixtures and traceable stochastic artifacts.
3. Internal stability: seed, prompt, provider, context, and repeat sensitivity.
4. Construct evidence: intended interpretation, reliability, invariance, and fairness.
5. Human benchmark: held-out responses collected with disclosed methods.
6. Outcome benchmark: later real-world outcomes with leakage/confounding review.
7. External replication: independent data/protocol or customer-reproducible study.

Product labels map directly to highest passed rung.

## Benchmark design

- Rights-approved immutable dataset with checksum, card, sponsor, population, language, collection dates/mode, instrument, sample, exclusions, weights, missingness, and limitations.
- Strict train/tune/calibrate/test separation; benchmark never silently enters prompt optimization.
- Prespecified hypotheses, baselines, metrics, slices, thresholds, uncertainty, stopping rules, and negative-result handling.
- Evaluate full distributions, variance, relationships, segment error, disagreement, and failure rate—not means alone (E-2005).
- Separate respondent-level, aggregate, comparative-ranking, and outcome tasks.

## Metric families

- Classification: confusion matrix, macro/micro metrics where justified.
- Probabilistic: Brier/log score, calibration curve/error, sharpness (E-2006).
- Continuous/distribution: MAE/RMSE, rank correlation, Wasserstein or other prespecified distance.
- Stability: test-retest, seed variance, prompt/model/provider sensitivity.
- Coverage/fairness: error and calibration by language, geography, demographic/psychographic slice, and intersection.
- Operations: schema failure, refusal, timeout, retry, latency, token/cost, and safety violations.

Metrics are selected before evaluation. Correlation alone is insufficient.

## Shift and drift

Test time, language, campaign category, geography, audience, model/provider, prompt, and data shifts. Calibration can fail under shift (E-2007). Monitor input/coverage, output distribution, error where ground truth arrives, provider changes, and operational failure. Drift or expired evidence demotes the configuration to experimental or retired.

## Fairness and culture

- Define construct/proxy assumptions and potential harm.
- Test supported Filipino, English, and Taglish contexts separately before claims.
- Require measurement-invariance evidence before score comparison across groups/time (E-2009).
- Report worst supported-slice behavior; suppress cells below approved thresholds.
- Do not infer sensitive traits or optimize high-stakes persuasion.

## Phase gates

- Phase 2: schemas, deterministic fixtures, typed outputs, no-claim labels, and end-to-end provenance pass.
- Phase 3: repeatability, sampling/aggregation properties, provider conformance, cost ceilings, and evaluation harness pass.
- Phase 4: report language, slice visibility, feedback separation, and user comprehension pass.
- Phase 5–7: security/load/failure, drift, accessibility, operations, and final independent QA/security reviews pass.

## Threshold policy

No numerical predictive-validity threshold is approved because no eligible benchmark exists. This is an approved fail-closed policy, not an omitted decision. Phase 2 gates only schema validity, deterministic reproducibility, tenant isolation, state-machine behavior, disclosure, accessibility, and operational budgets. Quantitative prediction kinds remain prohibited until a use-case-specific prespecified benchmark and independent review approve thresholds.

## Source basis

E-1015, E-1016, E-2003–E-2010 in [[../EVIDENCE_LEDGER|Evidence Ledger]]. Vendor-reported E-1005/E-1006 are design inputs, not SIMULA validation.
