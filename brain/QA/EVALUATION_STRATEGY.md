---
title: SIMULA Evaluation Strategy
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-17
owner: Evaluation lead
classification: PROPOSED
source_of_truth: true
---

# SIMULA Evaluation Strategy

## Evaluation families

- Data/frame fidelity and coverage.
- Synthetic cohort plausibility, joint fidelity, diversity, and disclosure risk.
- Structured response validity and failure rate.
- Aggregate prediction error and calibration against held-out humans/outcomes.
- Segment error, fairness, language/cultural performance, and sparse-cell behavior.
- Repeated-run stability and sensitivity to seed, prompt, model, method, and context.
- Qualitative faithfulness, unsupported assertion, harmful-content, and recommendation usefulness review.
- Operational cost, latency, retry, and failure behavior.

## Benchmark governance

- Rights-approved, versioned, checksum-identified datasets.
- Strict train/tune/calibrate/test separation.
- Prespecified tasks, metrics, thresholds, exclusions, and slices.
- Baseline comparison and uncertainty.
- Reproducible environment and configuration.
- Review of leakage, conflicts, negative results, and scope limits.

## Promotion gate

A model, prompt, dataset, methodology, or aggregation change cannot become default until applicable schema, safety, cost, stability, benchmark, and slice gates pass. Results outside validated scope retain experimental labels.

Phase 2 has no predictive evaluation or model promotion. It verifies schema, deterministic mock reproducibility, provenance, disclosure, and operations only. No fixture score can be reported as accuracy.

## Evaluation artifacts

- Evaluation plan and dataset card.
- Version manifest.
- Aggregate/slice metric report.
- Error analysis.
- Decision and approvers.
- Model/method card update.
- Rollback target.

## Research basis

See [[../Methodology/VALIDATION_FRAMEWORK|Validation Framework]]. External evidence pending methodology synthesis.
