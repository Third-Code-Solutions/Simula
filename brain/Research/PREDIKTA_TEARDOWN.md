---
title: Predikta Public-Evidence Teardown
status: active
created: 2026-07-17
updated: 2026-07-17
owner: Research lead
classification: OBSERVED
source_of_truth: true
---

# Predikta Public-Evidence Teardown

## Evidence boundary

Public, access-compliant evidence only. One claim receives one evidence label. Private data, code, models, prompts, weights, calibration, customers, and infrastructure remain UNKNOWN.

## OBSERVED

- E-1001, high: [public product page](https://predikta.ai/) positions a campaign simulator for marketers and exposes an audience → simulation → insight workflow. Limitation: public marketing surface; authenticated behavior untested.
- E-1001, high: public surface names sentiment, emotional alignment, risk, and recommendation output categories. Limitation: observation of published categories, not output correctness.
- E-1003, high: [public application entry](https://app.predikta.ai/) and sign-up surface exist. Limitation: no protected route or identity-provider flow was exercised.

## REPORTED

- E-1002, medium: vendor says users define cohorts with demographics, psychographics, and values and simulate thousands of responses. Limitation: no authenticated verification.
- E-1002, medium: vendor claims modeled representation of 70 million Filipinos and psychological-model grounding. Limitation: no public population-frame audit or independent replication located.
- E-1004, high: [participant sheet](https://survey.predikta.ai/participant-information-sheet/) says one survey collected personality, opinions, beliefs, behavior, and demographics for product development/validation and states participant rights. Limitation: survey-specific; not evidence for every production dataset/control.
- E-1005, medium: [2025 preprint](https://arxiv.org/abs/2505.22125) reports task-specific Filipino survey-agent results. Limitation: preprint, vendor-author overlap, no blanket product-accuracy implication.
- E-1006, medium: [involved partner](https://www.globe.com.ph/about-us/newsroom/corporate/917ventures-netopia-validate-predikta) reports a blind historical AdSpark comparison. Limitation: public material lacks reproducible protocol/raw data.
- E-1007, medium: [media coverage](https://unbox.ph/news/predikta-adspark-backtesting-study/) limits current evidence to copy-level use and says exact KPI prediction/live-testing replacement is unsupported. Limitation: likely company-material-derived.

## INFERRED

- E-1001 and E-1007, medium: public position targets faster pre-launch pressure testing, not a verified substitute for field research. Limitation: product-position inference; adoption and user outcomes are UNKNOWN.
- E-1004, high: one survey sheet cannot establish provenance, rights, or controls for all production datasets. Limitation: bounded logical implication from document scope.

## UNKNOWN

- E-1008, high for inspected scope: on 2026-07-17, the homepage, signup rendered markup, and common public privacy/terms routes exposed labels but no policy text/document URL. Limitation: undiscovered, client-only, or authenticated documents may exist; no compliance conclusion.
- Population frame, inclusion/exclusion, joint distributions, weights, sparse cells, source licenses, and update cadence.
- Production provider/model, prompts, scoring, uncertainty, calibration, failure thresholds, retention, and tenant controls.
- Independent replication, language/region/category generalization, and outcome forecasting.

## PROPOSED SIMULA response

- Do not make a 70-million or comparable representation claim without independent frame and held-out evidence.
- Publish data/method/model/prompt/config versions, uncertainty sources, exclusions, and limitations beside outputs.
- Keep generated rationales separate from numerical evidence and retain human research for validation.

Full metadata: [[../EVIDENCE_LEDGER#Competitor and market evidence|Evidence Ledger E-1001–E-1008]].
