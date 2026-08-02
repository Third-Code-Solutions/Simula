# Philippine language and cultural evaluation

Status: implemented benchmark contract. Updated 2026-08-02.

SIMULA supports three evaluated language variants: English, Filipino, and
Taglish. Regional languages remain disabled until a rights-cleared evaluation
dataset exists.

## Human-reviewed suite

`CulturalEvaluationSuite` accepts reviewed examples with a frozen model and
prompt version, an expected interpretation, a reviewer, and 1–5 ratings. Every
suite must cover all three supported languages and the following dimensions:

- translation accuracy, naturalness, and formality;
- respect markers, local idioms, ambiguous wording, and class-coded language;
- regional, religious, and historical sensitivity;
- humor and sarcasm interpretation;
- potential insult, stereotyping, misleading translation, and cultural mismatch.

The evaluator reports mean ratings by language and dimension, low-scoring
dimensions, model/prompt provenance, and a reproducibility checksum. It never
turns the ratings into a campaign, persuasion, vote-share, or viral score.

The suite is available through the authenticated Campaign Lab cultural
evaluation artifact endpoint and can be attached to a generated report. The
artifact remains a benchmark of reviewed examples, not proof of universal
Filipino cultural competence.
