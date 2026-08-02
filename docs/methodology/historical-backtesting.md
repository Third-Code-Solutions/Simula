# Historical backtesting contract

Status: held-out benchmark contract. Updated 2026-08-01.

Historical backtesting evaluates a frozen model against observed campaign or
message outcomes after a blind prediction set has been created. It is a scoped
benchmark, not a universal campaign-winner guarantee.

## Protocol

`HistoricalBacktestProtocol` names the protocol, protocol version, model version,
methodology version, outcome metric, development campaign IDs, holdout campaign
IDs, and minimum campaign count. Development and holdout IDs must be disjoint.

`BlindBacktestPredictionSet` contains only campaign/variant predicted values
and a blind attestation. `HistoricalOutcomeDataset` is a separate observed
artifact with source/version, rights, geography, outcome definition, held-out
flag, authorization, checksum, bias, and coverage limitations. Development
leakage, missing holdout campaigns, metric mismatch, non-held-out outcomes, and
variant coverage mismatch fail closed.

## Reported metrics

Values are compared on the declared outcome scale (the current contract uses
0–100 percentage points):

- MAE and RMSE across held-out campaign/variant observations;
- pairwise directional rank accuracy;
- top-variant accuracy;
- per-campaign rank correlation where defined;
- optional baseline MAE and `baseline_mae - model_mae` improvement.

The result records the exact model/methodology/protocol/outcome source and is
`Historically backtested` only when the declared minimum campaign count is met;
otherwise it is `Insufficient evidence`. A positive baseline delta is a scoped
regression signal, not proof of generalization.

Implementation: `packages/simula-core/src/simula_core/historical_backtesting.py`.
Current tests use authored, non-representative fixtures and are not historical
validation evidence.
