# Survey calibration contract

Status: aggregate evidence contract. Updated 2026-08-01.

Survey calibration compares synthetic aggregate outputs with observed aggregate
survey observations. It does not mutate the synthetic artifact or claim that a
survey replaces an election outcome dataset.

## Required evidence

`SurveyProvenance` records source/version, owner, license, allowed use, period,
geography, methodology, consent, calibration authorization, quality-filter
version, source checksum, known bias, and coverage limits. The evidence class is
fixed to `observed_survey`; unlabelled or synthetic rows cannot pass as survey
evidence.

`SurveyVariantObservation` is aggregate-only: variant/cohort key, respondent
count, post-stratification weight, reaction distribution, component metrics,
optional share intent, and quality pass rate. No respondent ID, name, contact,
political affiliation, vulnerability, or persuadability field is accepted.

Calibration fails closed when consent or authorization is absent, and rejects
duplicate variant/cohort observations. Survey weight is:

`respondent_count * quality_pass_rate * post_stratification_weight`.

## Reported comparisons

For each variant, matched cohort observations are normalized separately for the
synthetic and survey panels. The result reports:

- total variation distance: `0.5 * sum(abs(synthetic_share - survey_share))`;
- normalized categorical Brier distance: `0.5 * sum((synthetic_share - survey_share)^2)`;
- component metric MAE and RMSE on the 0–100 scale;
- positive-share values on the 0–1 scale;
- Spearman-style rank correlation and pairwise rank agreement when at least two
  variants are matched.

Evidence status is `Partially calibrated` when coverage is incomplete and
`Survey-calibrated` only when at least two variants and all declared variant /
cohort keys match. No universal accuracy is implied.

Implementation: `packages/simula-core/src/simula_core/survey_calibration.py`.
Current tests use an explicitly authored fixture; no real Philippine survey is
attached to this repository.
