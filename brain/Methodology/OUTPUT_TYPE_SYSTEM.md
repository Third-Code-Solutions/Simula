---
title: SIMULA Output Type and Uncertainty Contract
status: approved-for-prototype
created: 2026-07-17
updated: 2026-07-17
owner: Methodology and API leads
classification: PROPOSED
source_of_truth: true
---

# SIMULA Output Type and Uncertainty Contract

## Non-substitution rule

Output kind is part of the stored and public contract. A serializer, aggregator, report, export, or UI must not relabel one kind as another. Generated model confidence is never a confidence interval, margin of error, sampling uncertainty, or probability of human behavior.

## Output kinds

| Kind | Meaning | Minimum evidence | Phase 2 |
|---|---|---|---|
| `demo_fixture_distribution` | Deterministic authored values used only to verify the product path; estimates nobody | Fixture manifest, checksum, algorithm version, deterministic test | Allowed; only numerical kind |
| `measured_estimate` | Estimate computed from rights-approved human/observational data under a disclosed design | Dataset card, sampling/measurement method, uncertainty method, held-out checks | Forbidden |
| `model_estimate` | Model-derived estimate for a named validated task and scope | Model/method card, held-out benchmark, versioned calibration status | Forbidden |
| `heuristic_score` | Deterministic or model-assisted rule without validated probabilistic interpretation | Rule/version, range/direction, sensitivity and limitation statement | Forbidden until Phase 3 review |
| `generated_qualitative` | Synthetic explanation, rationale, theme, or counter-pattern | Provider/template version, input scope, synthetic label, faithfulness review | Allowed only from deterministic mock in Phase 2 |
| `recommendation` | Decision-support action derived from named inputs/rules | Rule/provider version, rationale links, uncertainty/limitations | Allowed only for “verify with human research” guidance in Phase 2 |

## Validation labels

- `experimental`: schema/safety may pass; no outcome or population-validity claim. Phase 2 default.
- `benchmarked`: named immutable configuration passed a prespecified held-out task and slice. No transfer outside that scope.
- `calibrated`: a probabilistic output passed prespecified calibration criteria for the named scope and current version.
- `retired`: new runs blocked because evidence expired, drifted, failed, or was superseded.

The highest label is computed from an approved registry entry. Clients cannot submit or override it.

## Uncertainty components

Each numerical output contains `uncertainty.status`:

- `not_applicable`: fixture or non-quantitative output.
- `not_estimated`: relevant uncertainty exists but has no defensible estimate.
- `estimated`: includes one or more named components, method, assumptions, level where applicable, and evidence version.
- `suppressed`: evidence or effective size is insufficient; value is not published.

Allowed component names: `frame_coverage`, `sampling`, `measurement`, `model`, `calibration`, `run_stability`, `missingness`, and `dataset_shift`. Components never collapse into one interval unless a reviewed method supports the composition.

## Required envelope

Every result uses this semantic shape; Pydantic is the implementation authority and JSON Schema is generated and committed.

```json
{
  "schema_version": "1.0.0",
  "run_id": "uuid",
  "validation_label": "experimental",
  "outputs": [
    {
      "output_id": "reaction_fixture",
      "kind": "demo_fixture_distribution",
      "label": "Pipeline demo values",
      "value": {
        "unit": "share",
        "categories": [
          {"key": "clear", "value": 0.4},
          {"key": "unclear", "value": 0.35},
          {"key": "needs_human_review", "value": 0.25}
        ]
      },
      "uncertainty": {"status": "not_applicable", "reason": "authored deterministic fixture"},
      "limitations": ["Estimates nobody and is not representative of any population."]
    }
  ],
  "qualitative": [
    {
      "kind": "generated_qualitative",
      "synthetic": true,
      "text": "A deterministic mock observation used to test rendering.",
      "source_output_ids": ["reaction_fixture"]
    }
  ],
  "recommendations": [
    {
      "kind": "recommendation",
      "text": "Verify wording with appropriately recruited human participants before acting.",
      "source_output_ids": ["reaction_fixture"]
    }
  ],
  "provenance": {},
  "limitations": []
}
```

## Invariants

- Distribution values are finite, each in `[0,1]`, and sum to `1 ± 1e-9`.
- Missing, unsupported, and suppressed differ from numeric zero.
- No unapproved decimal precision; Phase 2 UI displays whole percentages and “demo values.”
- `generated_qualitative.synthetic` is always `true`; presentation uses no participant quotation marks.
- A result references exactly one frozen run manifest and immutable versions.
- Terminal result insert is unique by run ID and schema version.
- Unknown enum values fail closed at write time and render as unsupported at read time.

## Threshold policy

Phase 2 approves only schema, determinism, safety, and operational thresholds. No predictive-validity, representativeness, calibration, or fairness threshold exists. Such thresholds require a prespecified held-out task, suitable human or outcome data, baseline, metric, slice, uncertainty, and independent review. Until then, `model_estimate` and `measured_estimate` are prohibited.

