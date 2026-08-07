# Respondent-free aggregate forecasting

Status: implemented and transaction-rehearsed. Production admission still
requires hosted migration application, generated database contracts, exact-SHA
deployment, and an authenticated live durable run.

## Supported claim

SIMULA can forecast a named **aggregate turnout quantity** from versioned
official historical outcomes without collecting survey respondents. The first
admitted product scope is Philippine national turnout (voted/not voted), whose
counts sum to the official registered-voter denominator for every election.

This model does not predict an individual voter, infer a person's political
preference, estimate causal message persuasion, or convert synthetic persona
responses into votes. Campaign message simulation and official aggregate
forecasting are separate evidence products.

## Admitted evidence

An admitted dataset must provide:

- an official owner and direct source URL;
- exact source and normalized SHA-256 checksums;
- source version, observation period, geography, license or public-use basis,
  and allowed uses containing aggregate forecasting;
- at least five temporally ordered elections;
- at least two complete options per election/contest/geography cell;
- one consistent valid-vote denominator per cell, with option votes summing to
  that denominator;
- stable `option_group_key` definitions documented in the manifest; and
- an exact, versioned next-election target set containing every option group
  present in the latest historical cell; and
- an admission timestamp and explicit forecasting authorization.

Hugging Face or another mirror may help discovery or reproducible caching. A
mirror is never production ground truth unless its bytes match the cited
official artifact and the official provenance remains available.

## Model and temporal boundary

`aggregate_trend_v1` evaluates two transparent deterministic candidates over
earlier aggregate shares for the same contest, geography, and stable option
group: linear trend and persistence of the last official result. It selects the
lower-error candidate using only earlier one-step predictions; ties choose the
conservative persistence baseline. Predictions within each target cell are
normalized to 100 percent. Linear trend advances by one election ordinal, not
by self-authored day intervals. The target election must be later than every
training observation, target keys cannot appear in training data, and the
request must exactly match the dataset manifest's admitted target set.

The durable API accepts only an admitted dataset identifier and aggregate target
options. Historical observations are read by the API service, validated, placed
in the worker-only secret envelope, and deleted when the leased run completes.
Browser clients cannot read registry observations.

## Validation and promotion gates

The worker performs strict retrospective walk-forward evaluation. Every
holdout prediction is generated from earlier elections only. Production
threshold defaults are owned by the core model and cannot be relaxed by a
client:

- at least three training elections per option group;
- at least two distinct holdout elections;
- mean absolute error no greater than 5 percentage points;
- MAE improvement no worse than the last-result baseline; and
- at least 80 percent empirical coverage for the 80 percent uncertainty
  interval.

Result labels:

- `experimental`: enough retrospective holdouts exist to report error; or
- `insufficient_evidence`: the minimum temporal evidence is absent.

Passing the numerical quality thresholds is reported separately as
`retrospective_quality_gate_passed`. It does not create a historical-validation
claim. The 2025 outcome was not pre-registered and sealed before model
development, so this release cannot honestly emit `historically_validated`.

## Reproducibility

Every result records model version, source ID/version/checksum, aggregate
predictions, interval bounds, per-election and per-option errors, latest-point
scope-sensitivity bounds, walk-forward metrics, limitations, a literal
`respondent_data_used: false`, and a canonical result checksum. The database
records run creation, worker progress, completion, and source admission in the
existing audit boundaries. Admitted dataset metadata and observations are
immutable. A dataset can move only from admitted to non-authorized `retired`;
retired evidence cannot be modified or reactivated.

## Reference dataset and observed backtest

The first release dataset is the national COMELEC turnout series for all 12
National and Local Elections from 1992 through 2025. It binds two official raw
artifacts:

- COMELEC ERSD comparative turnout PDF, 1992–2022: SHA-256
  `c4421379e76f1cb9ff52fd6fc3d334ad262aada55b6d49360d2732685c573dce`;
- COMELEC 2025 Local AES turnout workbook: SHA-256
  `316647c5b417fedc2fa27a400fee4f705a48f9235cefa5127949cc58dbaa5d9d`.

The combined source checksum is
`8e590cfa9e29c6beb721ca0293b5be472e0eaccaa95d582dcf27df0c8172a7cb`.
The canonical 24-row voted/not-voted checksum is
`bec5d068c5380262077abe60edcfadd8ff0f5a95443927f45e580efd15a55486`.
`scripts/acquire_comelec_turnout.py` redownloads both official artifacts,
extracts the 1992-2022 chart totals from the locked PDF streams and the 2025
Local AES row from the XLSX XML, and compares those source-derived values with
the normalized manifest. Redirect destinations are allowlisted before follow,
responses are byte-bounded while streaming, and retrieval status/final URL/
headers are recorded. Exact originals are retained under
`docs/data/raw/comelec-national-turnout-1992-2025`. The verifier also locks
election-date/scope/source metadata; dates are chronology labels and do not
control trend distance. It fails closed on redirect, path, content type, byte,
hash, parser, chronology, denominator, turnout, metadata, or normalization
drift.

Observed strict walk-forward result under the fixed production thresholds:

- 9 holdout elections and 18 option predictions;
- MAE 4.2995 percentage points;
- last-result baseline MAE 4.2995 points, so improvement is 0.0;
- 80 percent interval empirical coverage 0.8889; and
- selected production method: transparent last-result persistence.

For the default 2028 national-turnout target, the deterministic point forecast
is 83.3973 percent voted with an interval of 75.0912–91.7034 percent. Excluding
the latest 2025 scope anchor produces 84.2024 percent, reported as a
scope-sensitivity bound. The evidence label remains `experimental`: this is not
a pre-registered sealed evaluation, candidate/party forecast, individual-voter
prediction, persuasion estimate, or causal campaign-effect forecast. COMELEC
says the 2022 headline includes local absentee voting and 63 BARMM barangays,
while the 2025 row is Local AES.

## Remaining release proof

Before live promotion:

1. apply the rehearsed hosted database migrations;
2. generate database contracts from the applied schema;
3. run full Python, TypeScript, browser, SQL, security, and build checks;
4. deploy the exact commit to Railway API/worker and Vercel web; and
5. execute an authenticated live forecast and compare its checksum with an
   offline run.
