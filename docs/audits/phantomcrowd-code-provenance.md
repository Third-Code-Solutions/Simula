---
title: PhantomCrowd code provenance
status: active
updated: 2026-08-01
classification: OBSERVED
---

## Upstream record

- Repository: https://github.com/l2dnjsrud/PhantomCrowd
- Commit: `4f197a8df0de5183f2376a210f42aaf948bd9b0a`
- License: MIT
- Copyright: `Copyright (c) 2026 PhantomCrowd`

## Files inspected

Backend: `README.md`, `LICENSE`, `pyproject.toml`, `requirements.txt`,
`app/main.py`, `app/api/*`, `app/core/*`, `app/models/*`, `app/schemas/*`,
`app/services/simulation_engine.py`, `app/services/simulation_v2/*`,
`app/services/report/*`, `app/services/knowledge/*`, `app/services/persona_generator.py`,
and `scripts/backtest.py`.

Frontend: `frontend/package.json`, router/store, campaign/simulation/A-B/compare
views, report charts, and API client.

Tests/docs: backend tests, `docs/validation-report.md`, and screenshots.

## SIMULA provenance status

| Category | Status |
| --- | --- |
| Verbatim PhantomCrowd code copied into SIMULA | None found in the current slice. |
| PhantomCrowd dependency imported | None. |
| Concepts independently reimplemented | Population-bound agents, replayable rounds, typed aggregation, provider boundaries, synthetic interviews, and evidence-separated reporting. |
| Concepts rejected | LLM-invented viral score, process-local state, unseeded global randomness, SQLite persistence, arbitrary URL egress, generated demographic frame, and unsupported validation claims. |
| Required future attribution | Keep this record and `THIRD_PARTY_NOTICES.md`; add source notices at the copied file if substantial code is ever reused. |

## Validation boundary

PhantomCrowd's reported backtest and validation numbers are repository-reported
claims only. The referenced `backend/data/backtesting_campaigns.py` was not
present in the inspected revision, so dataset provenance, labels, leakage
controls, and reproducibility remain unknown. SIMULA will not inherit those
numbers as evidence.
