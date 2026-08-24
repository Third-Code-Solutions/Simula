---
title: Philippine campaign-message survey fieldwork protocol
status: proposed
updated: 2026-08-07
classification: PROPOSED
---

# Outcome boundary

This protocol makes SIMULA ready to receive a lawful, real-human Philippine
panel delivery. It does not claim that respondents have been recruited or that
a real survey dataset already exists. Only an executed provider engagement and
completed fieldwork can produce that evidence.

The calibration dataset must answer the same construct SIMULA reports: human
reaction to randomized campaign-message variants. General social-attitude
surveys, election results, generated personas, and LLM outputs do not satisfy
that requirement.

# Source decision

Use a contracted Philippine probability sample or professional quota-panel
provider to program the SIMULA instrument and deliver consented response rows.
The contract must authorize commercial aggregate calibration, document the
sampling/recruitment method, and prohibit delivery of direct identifiers.

Use official sources only for their supported role:

- PSA or another approved official statistical source: population or quota
  targets, with period and coverage disclosed;
- COMELEC: official historical election outcomes after source terms and exact
  result provenance are approved;
- WVS, Asian Barometer, ISSP, DHS, SWS, and Pulse Asia: contextual or benchmark
  evidence only when the original owner grants the required use. They are not
  substitutes for variant-level message-response fieldwork.

Hugging Face mirrors are discovery aids only. Current inspected candidates are
not admissible calibration evidence:

| Dataset | Finding | Decision |
| --- | --- | --- |
| `3ebdola/wvs2persona` | Generated English persona summaries derived from WVS; dataset card exposes no license | Reject for calibration and commercial production unless WVS and derivative rights are proven |
| `Anthropic/llm_global_opinions` | Aggregate WVS/Pew questions under CC BY-NC-SA 4.0 | Reject for commercial use and construct mismatch |
| `gelcloudy/philippine-elections-2025` | Unofficial 9.5 GB COMELEC scrape; license `other`; uploader says commercial use may require permission | Reject as primary evidence; verify any outcome against COMELEC |

# Prespecified study

Before programming, freeze a protocol version and checksum for:

1. target population: Philippine adults aged 18+ or registered Philippine
   voters, never the all-person census population;
2. campaign, exact message variants, media, exposure duration, language, and
   ordering;
3. primary comparison and one primary outcome;
4. minimum detectable effect, alpha, power, expected design effect, attrition,
   and the resulting per-variant sample size;
5. recruitment method, inclusion/exclusion criteria, regional quotas, and
   post-stratification method;
6. server-side random assignment to one variant, with allocation and deviation
   logs;
7. bot, duplicate, speed, attention, completion, missingness, and fraud rules;
8. subgroup analyses, multiplicity treatment, stopping rule, and exclusions;
9. retention, deletion, incident handling, data-controller approval, legal
   review, and provider contract reference.

Do not choose a sample size by rule of thumb. A statistician must approve the
power analysis for the actual variant count and decision threshold. A quota
panel remains a non-probability sample even after weighting; reports must retain
that limitation.

# Instrument contract

Program equivalent human-reviewed English, Filipino, and/or Taglish forms using
`NativeSurveyForm`. The provider assigns `variant_key` and `cohort_key`; neither
is a respondent-facing political-profile question. The visible instrument
contains:

- affirmative consent and a linked privacy notice;
- controlled exposure to one randomized message variant;
- overall reaction: `positive`, `neutral`, `negative`, or `mixed`;
- 0-100 clarity, relevance, trust, persuasiveness, and consideration ratings;
- optional 0-100 share intent.

No free text, name, contact detail, voter identifier, political affiliation,
ideology, vulnerability, or individual persuadability field is admitted. A
qualified Filipino-language reviewer must approve translated wording; machine
translation alone is not a release gate.

# Provider delivery

The response file uses
`docs/data/philippine-panel-response-template.csv`. Required semantics:

- `response_id`: provider-generated opaque deduplication key;
- `variant_key`: programmed random assignment;
- `cohort_key`: one canonical 17-region key;
- `reaction`: one canonical reaction category;
- metrics: numeric 0-100 values;
- `post_stratification_weight`: positive provider weight;
- `quality`: 0-1 or 0-100 quality score;
- `bot`, `completed`, `consent`: explicit row-level gates.

The signed-off delivery manifest follows
`docs/data/philippine-panel-delivery-manifest.template.json`. Replace every
placeholder. `PhilippinePanelDeliveryManifest` rejects a delivery unless it has
all 17 regions, matching instrument and payload SHA-256 values, real-human and
commercial-use confirmation, personal-data removal, consent, data-controller
approval, and qualified-counsel review.

`admit_philippine_panel_delivery` then produces the metadata accepted by the
existing CSV/Formbricks/ODK/generic JSON aggregate importer. The worker consumes
rows from its transient secret, persists only aggregate observations, and
deletes the secret on terminal completion.

# Green gates

Fieldwork is green only when all are evidenced:

- protocol and power analysis approved before data inspection;
- provider selected; contract and commercial calibration rights executed;
- data-controller, privacy, election-law, and qualified-counsel reviews signed;
- human language and cultural review completed;
- instrument checksums frozen; randomization and quality rules test-run;
- real fieldwork completed; row count and quota deviations reconciled;
- raw export hash matches the delivery manifest;
- importer reports consent, completion, bot, duplicate, quality, and malformed
  exclusions; no prohibited fields are present;
- aggregate calibration is repeated and held-out historical backtesting remains
  separate;
- CI, database, API, worker, browser, release identity, observability, rollback,
  and production smoke checks pass on the same release.

Until then, SIMULA must report `Experimental` or `Blocked`, not survey-calibrated
production readiness.
