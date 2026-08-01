# Campaign simulation scoring contract

Status: experimental core contract. Updated 2026-08-01.

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

## Evidence boundary

Repeated synthetic runs are labelled `Synthetic-only`. Survey calibration and
historical backtesting are separate evidence stages. An LLM may produce
qualitative rationale downstream of typed outputs, but it cannot calculate,
override, or rename the numeric result.

Implementation: `packages/simula-core/src/simula_core/methodology.py` and
`repeated_simulation.py`. Focused tests use authored, non-representative
fixtures and do not establish population validity.
