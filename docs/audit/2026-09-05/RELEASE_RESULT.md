# UX remediation release result

The redesigned web and admin applications are live. Application source is
`eb0ea931a180f1912f690be5648a6fb4a6557ab0`, immutable tag
`v0.0.0-remediation.20260905.4`. Later documentation and promotion-tool maintenance
commits are not the deployed application source.

> Superseded for current production identities by the
> [2026-09-22 release result](../2026-09-22/RELEASE_RESULT.md). This file remains
> the record of the 2026-09-05 release.

- Web: https://simula-iota.vercel.app
- Admin: https://simula-admin.vercel.app
- Required CI: https://github.com/kurtgav/Simula/actions/runs/33961708123
- Signed release: https://github.com/kurtgav/Simula/actions/runs/33961707670

## Delivered behavior

Public and authenticated layouts, navigation, campaign forms, results and admin
pagination use a consistent restrained presentation. Report review, saved-run
calibration and independently admitted historical comparison workflows are
connected to durable API/worker processing. Source permissions, retention,
revocation, immutable bindings and independent review remain server-enforced.

Atomic Campaign Lab admission now respects the existing operator pause and a
global 100-nonterminal-run capacity bound, while idempotent replay remains
available. Evaluations have bounded cancellation and cleanup. The exact three
additive migrations from the signed source were applied; production head is
`20260905104327`. V4 readiness still identifies the previous schema contract,
and the previous API remained healthy immediately after migration.

## Deployed identities and checks

| Component | Deployment | Verification |
| --- | --- | --- |
| AI engine | `f99b6929-32fd-49d6-8468-ae0ed9ddd4cf` | Provider readiness and successful real private behavioral execution |
| Worker | `c4179c52-13d1-4def-a884-a5d86fd6aeb7` | Exact startup SHA; real Campaign Lab and behavioral runs completed |
| Dispatcher | `86b1d6b7-5175-40cb-8df0-3e5f38f357af` | Candidate startup and dispatch log claimed/confirmed one job; synthetic outbox confirmed once |
| Control plane | `9a24c030-21c0-4490-ae1d-e42d431caee9` | Live ready endpoint has exact SHA; real behavioral submission/replay/result |
| API | `41008d68-a16a-423f-a483-e5f725f433ca` | Live ready endpoint has exact SHA; owner/editor/viewer/nonmember checks |
| Web | `dpl_AzpLsWJmcimpe3HExVv8UbxDni41` | Canonical promoted; exact health SHA and real browser workflow |
| Admin | `dpl_6mZfv3Xi5VbrmssSu5SCFpbtud4f` | Canonical promoted; exact health SHA, rendered sign-in and non-admin denial |

Provider builds derive from the independently verified signed source. They are
not claimed byte-identical to the separately scanned release images. Image
digests, public release settings and source checksums are retained in the linked
receipts. Direct private SSH health inspection was unavailable because no SSH
key was configured; no access or protection control was weakened.

## Verification

**PASSED:** all four required hosted gates, signed release, independent Cosign
identity/signature verification, source/configuration/migration checksum checks,
and seven rollback-target availability checks.

**PASSED:** hosted foundation logs report 720 root Python tests, all 31
integration tests, 458 pgTAP assertions, 12 browser tests, 184 web tests, 23 admin
tests and 262 Nest tests. Two root Python tests were skipped, with 31 integration
tests separately selected and passed. Formatting, type checks, builds, generated
contracts and repository policy checks passed in the hosted gates.

**PASSED:** six protected-candidate browser views at 1440px and 390px, with no
detected Axe violations, document overflow or page errors, and expected security
headers. Candidate verification used authenticated access with temporary cookies
kept in memory; deployment protection stayed enabled.

**PASSED:** 52 production smoke assertions with four newly created, clearly
synthetic accounts. Actual application commands established editor/viewer roles;
nonmember, signed-out and unauthorized mutations were denied. A Campaign Lab run
completed and restored after reload. A separate deterministic behavioral run
completed, replayed the same durable ID and returned its persisted checksum-bound
experimental result. Its outbox has one dispatched generation, one confirmation
and one dispatch attempt. This is execution evidence, not scientific validation.
The exact dispatcher candidate also logged one claimed and confirmed job, with
zero recovered or poisoned jobs, during that execution. Post-smoke private-service
log samples contained no classified error records.

Synthetic fixture IDs are retained in the smoke receipt; credentials were kept
in memory, no emails were sent, and existing users were not modified. Session
logout was attempted. No bulk deletion or cleanup of those records is claimed.

## Release recovery and remaining boundaries

The first web candidate failed because Vercel chose pnpm 11.22.0 while the source
pins 11.13.1. Enabling documented Corepack support for the two existing production
projects resolved that mismatch; the successful build logs confirm pnpm 11.13.1.
The failed deployment and retry receipts are preserved. Backend services were
not redeployed during the frontend-only retry. Canonicals changed only after
candidate browser verification.

Previous deployment identities remain recorded in `RELEASE_TARGETS.md` and the
promotion receipts. Rollback availability was checked; an actual production
rollback or data restore was not performed. Pause admission and drain new-format
jobs on the new worker before rolling back an older worker binary.

Approved privacy/terms and retention/account-deletion policy text remains a user
dependency. Do not substitute invented legal commitments. Production smoke covers
the named flows, not every role and route. Independent report/backtest governance
and administrator pagination have additional real local API/worker/browser proof;
no production registry approval or scientific validation was manufactured.

## Evidence

- `hosted-final-foundation.json`
- `production-migration-receipt.json`
- `production-backend-promotion.json` (includes the historical failed web attempt)
- `production-frontend-promotion.json`
- `production-vercel-corepack.json`
- `production-private-candidate-evidence.json`
- `production-protected-candidate-verification.json`
- `production-smoke-verification.json`
- `production-outbox-verification.json`
- `REMEDIATION_ROUTES.md` and `REMEDIATION_TRACKER.md` for bounded coverage
