# M6 browser fixture QA — 2026-07-29

Status: **fixture-backed browser PASS; database-backed M6 gate OPEN**.

## Scope

- Real Next.js server and client code on loopback.
- Ephemeral ES256 Supabase session verified through the real SSR
  `getClaims()` and JWKS path.
- Loopback-only fixture responses conforming to the strict run, behavioral
  result/evidence/comparison, audit, project, stimulus-version, and dashboard
  contracts.
- Chromium desktop at 1440 by 1000 and mobile at 390 by 844.

The fixture contained no customer data and made no external provider or hosted
mutation. Generated browser state and traces containing the ephemeral token
were deleted after the run.

## Observed proof

| Check | Result |
| --- | --- |
| Authenticated run page | Report, evidence, comparison, audit, and refinement rendered |
| XSS-safe context | Literal hostile markup rendered as text; no image or script execution |
| Evidence details | Synthetic interview replay and graph identity/limitations expanded |
| Matched comparison | Candidate-minus-baseline rendered with 20 paired agents and no winner |
| Export | Validated JSON downloaded; identities, deltas, limitations, and `winner: null` preserved |
| Keyboard refinement | Message and variant entered by keyboard; submit activated by Enter |
| Immutable retest | One version POST and one behavioral-run POST; navigation reached the queued run |
| Failure behavior | Injected audit 503 hid the entire governed report; recovery restored all sections |
| Responsive overflow | Document width remained equal to viewport; wide timeline stayed in its scroll region |
| Final console | 0 errors, 0 warnings |
| Desktop Axe 4.12.1 | 0 violations, 48 passes, 0 incomplete |
| Mobile Axe 4.12.1 | 0 violations, 49 passes, 4 contrast checks requiring manual review |
| Manual contrast review | Sidebar text 5.70:1; teal code text 6.11:1 |

The Axe pass required two product corrections found during this run:

- score cards now use only valid `dt`/`dd` children inside grouped definition
  lists;
- the horizontally scrollable interaction timeline is keyboard-focusable and
  retains its existing accessible label.

## Retained artifacts

- `output/playwright/simula-behavioral-run-desktop.png`
- `output/playwright/simula-behavioral-run-mobile.png`
- `output/playwright/simula-matched-comparison.json`

## Open gate

This evidence verifies presentation, client contracts, interaction, and
fixture failure handling. It does not prove migration execution, tenant RLS,
database concurrency, durable ambiguous-network replay, queue/worker behavior,
deletion, loading/empty states, human screen-reader usability, hosted
telemetry, provider behavior, scientific validity, or production readiness.
