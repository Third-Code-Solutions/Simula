# Production promotion result — 2026-09-22

Application source is `d4322bd95f7d90150fd68c220633a8a383617bb4`, immutable tag
`v0.0.0-remediation.20260922.1`. The signed release bundle
(`f8a3973cf54b883235e83e15017c6018f12b8df59aee88809e582e936ad46723`) was produced
from the independently verified source
(`3e0f17ccffe8fca0a143d87b0695be091b3b6661000492181a1a63a961d3f3d4`) by release run
35713299509. Promotion was an explicit CLI step; Git auto-deploy remains disabled.

- Web: https://simula-iota.vercel.app
- Admin: https://simula-admin.vercel.app
- API: https://api-production-5931.up.railway.app
- Control plane: https://control-plane-production-ddbb.up.railway.app
- Required CI: https://github.com/kurtgav/Simula/actions/runs/35713289091
- Signed release: https://github.com/kurtgav/Simula/actions/runs/35713299509

## Deployed identities and checks

| Component | Deployment | Verification |
| --- | --- | --- |
| API | `83002fa9-906d-46b5-9785-b3bd1231e800` | Live `/health/ready` returns HTTP 200 with the exact release SHA and `ready`; that status requires the production database to report migration head `20260905104327` with forced RLS |
| Control plane | `c43ebdb1-4158-4679-b2c8-33fb43a46b44` | Live `/health/ready` returns HTTP 200 with the exact release SHA and `ready` |
| Worker | `a63a3a1d-0fcd-40d4-a595-435f17592ef4` | Provider build from the verified signed source; deployment SUCCESS. No production job was executed against this release |
| AI engine | `d051cc38-6baa-47eb-bf89-85856b57f511` | Provider build from the verified signed source; deployment SUCCESS. No production behavioral execution was run against this release |
| Dispatcher | `eb7f07a0-b373-4695-972a-81b76ae3987d` | Deployed outside the promoter (see deviations); `dispatcher_started` logged; still running after a 300s re-check; no classified error records afterwards |
| Web | `dpl_GN1cghJnXTSPJVfBkCx6aKHsNvCa` | Candidate READY, canonical domain promoted; `/api/health` returns the exact release SHA |
| Admin | `dpl_9N99CtPoj2ixZCxVvkHdfe5yUEff` | Candidate READY, canonical domain promoted; `/api/health` returns the exact release SHA |

Provider builds derive from the independently verified signed source. They are not
claimed byte-identical to the separately scanned release images. The dispatcher was
the only service deployed by an out-of-band path.

## Database

Production head is `20260905104327`, which equals the head the deployed API requires.
Nothing was applied by this rollout: the head was already present, and the live
readiness probe proves it. See `production-migration-verification.json`.

The promoter's own migration check compares files inside the signed source and never
connects to production, so it is not evidence about the production database. The live
readiness contract is the evidence: `isReady()` returns true only when
`private.runtime_schema_readiness_v5()` yields exactly one row whose
`migration_version` equals the compiled constant `REQUIRED_DATABASE_MIGRATION_HEAD`
(`20260905104327`) and whose `rls_force_enabled` is true. Production returns `ready`.

## Verification performed

**PASSED:** required hosted CI on the promoted commit; signed release run; Cosign
identity and signature verification of the release bundle against the verified source;
source, configuration and migration checksum checks; promoter dry run before the
executing run; seven rollback-target availability checks.

**PASSED:** live readiness and liveness for the API and the control plane, both
reporting the exact release SHA. Canonical web and admin domains serve the exact
release SHA on `/api/health`. All six Railway services plus Redis report their latest
deployment as SUCCESS.

**NOT PERFORMED for this release:** no authenticated production journey (sign-in,
role checks, run submission, replay, report review) was executed. No production job
was dispatched or completed. The most recent production smoke evidence remains the
2026-09-05 release, whose receipt covers different source and different deployments.

## Deviations from the documented procedure

1. **Dispatcher deployed outside the promoter.** The promoter preflight requires a
   successful rollback anchor in provider history. Dispatcher history held one CRASHED
   and four FAILED deployments with no SUCCESS deployment, so no anchor existed. The
   service was deployed with `railway up` from the verified signed source rather than
   left in a crashed state. It therefore has no rollback anchor and no
   promoter-issued provider receipt. Recorded in `production-dispatcher-deployment.json`.
2. **Vercel canonicals moved by an explicit `vercel promote`.** The promoter does not
   wait for provider builds; both candidates were confirmed READY via `vercel inspect`
   before the canonical domains were moved, and the move was verified afterwards.
3. **Deployment Protection was left enabled.** Candidate URLs return 302 to
   unauthenticated callers. Verification used the Vercel CLI instead of weakening
   access control.

## Release recovery and remaining boundaries

Previous deployment identities are recorded in `RELEASE_TARGETS.md` and in the
promotion receipts, including the rollback targets
`0e814757-a538-4af8-b250-958ea4d99347`,
`5d17528d-605b-47eb-91f6-5e4fb5988270`,
`1ab33958-c93c-4794-81be-04aecbb59c50`,
`c311900f-cf12-4d3e-a8a7-5f21321cbf31`,
`dpl_5YTotbDvyCkuEteSgtyF9LdAipiR` and `dpl_6o5gweJUTbTSxquD2SgaUyF7UbPw`.
Rollback availability was checked; no production rollback or data restore was
performed. Pause admission and drain new-format jobs on the new worker before rolling
back an older worker binary.

An older worker binary must not be rolled back while new-format jobs are in flight.
Approved privacy/terms and retention/account-deletion policy text remains a user
dependency; do not substitute invented legal commitments. The public archive repository
`Third-Code-Solutions/Simula` was deliberately not updated and remains at its August
state.

## Evidence

- `production-backend-promotion.json` (executing promoter run, six targets)
- `production-frontend-promotion.json` (candidate verification and canonical promotion)
- `production-dispatcher-deployment.json` (out-of-band deployment and prior crash cause)
- `production-migration-verification.json` (live head verification)
