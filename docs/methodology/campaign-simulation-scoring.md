# Campaign simulation scoring contract

Status: experimental core contract. Updated 2026-08-03.

SIMULA does not expose PhantomCrowd's LLM-invented `viral_score`. The numeric
path is built from named component metrics over admitted aggregate population
cells, repeated seeded runs, and separately attached observed evidence.

## Population weighting

`PopulationFrameVersion.cells` carries versioned source weights that sum to one.
`sample_population` filters the audience, preserves each admitted cell's
`population_weight`, normalizes admitted weights into `audience_weight`, and
allocates a deterministic sample count with the declared seed. Sparse cells are
suppressed and reported; they are not silently filled with invented people.

The provider receives cohort cells and structured response fields. It cannot
create demographics, alter weights, or return a final campaign score.

## Repeated runs

`run_repeated_methodology` executes the same frozen stimulus, population frame,
audience definition, methodology version, and cost ceiling with derived seeds.
The result records every run ID, seed, sampling receipt, population checksum,
component metric means/medians/standard deviations, positive reaction-share
summary, and reproducibility checksum.

Stability intervals use `1.96 * repeat_standard_deviation / sqrt(n)`. They are
reported in the metric's native scale and are explicitly Monte Carlo
repeat-dispersion diagnostics—not population confidence intervals. Fewer than
three repetitions yields `insufficient_repetitions`; a result above the declared
tolerance is `unstable`.

Component metrics are on a 0–100 scale:

- clarity;
- relevance;
- trust;
- persuasiveness;
- consideration.

Reaction distributions remain shares on a 0–1 scale (`positive`, `neutral`,
`negative`, `mixed`). No component is collapsed into a standalone “viral” or
winner score.

## Reported component fields

The Campaign Lab report retains per-variant repeated-run diagnostics rather
than replacing them with placeholders:

- sentiment and emotional-response categories are the arithmetic mean,
  run-minimum, and run-maximum of the typed provider outputs;
- clarity, relevance, trust, persuasiveness, and consideration retain the
  repeated-run mean, median, standard deviation, and repeat-dispersion
  interval;
- positive reaction share retains its repeated-run summary; behavioral action
  shares are shown separately when the multi-agent diagnostic is admitted;
- controversy, backlash, and cultural values are named `0–100 heuristic
  component` indicators. They are not probabilities, rates, or forecasts;
- each row carries `Synthetic-only` evidence status and the report includes the
  population checksum, source IDs, model/prompt versions, seed, repetitions,
  and limitations.

For the deterministic fixture provider, typed metric and risk values are
derived from a SHA-256 digest of the frozen cell, methodology version, seed,
and stimulus. That provider is a replay fixture, not a calibration source.
External providers must return the same typed schema and remain behind the
worker/provider boundary; provider output cannot alter population weights or
create a final campaign score. Missing observed objection, question, or
backlash evidence is reported as missing and routed to human validation.

## Calibration versions and drift monitoring

Each calibration result carries an explicit calibration version, model version,
survey source version, admitted survey sample size, and reproducibility checksum.
Adjacent versions can be compared with `calibration_model_drift`. The current
threshold contract is `calibration_drift_thresholds_v1`:

- distribution total-variation distance: review at `0.10`;
- aggregate metric MAE and RMSE: review at `5.0` native points;
- variant rank correlation and pairwise rank agreement: review at an absolute
  shift of `0.15`.

Half-threshold changes are labelled `monitor`; threshold-or-greater changes are
labelled `review`. Missing comparable metrics are `unavailable`. These are
monitoring triggers, not accuracy guarantees, confidence intervals, or evidence
of causal model failure. A human must review a flagged version before it is
treated as validated evidence.

## Evidence boundary

Repeated synthetic runs are labelled `Synthetic-only`. Survey calibration and
historical backtesting are separate evidence stages. An LLM may produce
qualitative rationale downstream of typed outputs, but it cannot calculate,
override, or rename the numeric result.

Implementation: `packages/simula-core/src/simula_core/methodology.py` and
`repeated_simulation.py`. Focused tests use authored, non-representative
fixtures and do not establish population validity.

Behavioral diagnostics also retain provider-call counts, token/cost usage, and
deterministic logical action timestamps for replay. Wall-clock execution time,
retry count, and failures belong to the durable worker run/attempt record; they
are operational evidence and must not enter the deterministic result checksum.
