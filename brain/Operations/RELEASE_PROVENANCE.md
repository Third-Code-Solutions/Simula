---
title: SIMULA Release Provenance
status: approved-for-staging
created: 2026-07-29
updated: 2026-09-05
owner: Platform and security leads
classification: PROPOSED
source_of_truth: true
---

# SIMULA Release Provenance


## Production release verified - 5 September 2026, 11:30 UTC

This section supersedes earlier application-release-pending statements while preserving their historical evidence. All seven application components now run source eb0ea931a180f1912f690be5648a6fb4a6557ab0: web, admin, API, control plane, dispatcher, worker and private engine. Required CI33961708123 and signed release33961707670 passed. Three release migrations are applied through20260905104327; V4 readiness remains available for rollback compatibility. Both canonical Vercel domains were promoted after protected-candidate checks.

The production smoke receipt passes52 assertions: exact public service SHA/health and frontend security headers; fresh synthetic owner/editor/viewer/nonmember sessions; application invitation acceptance; editor/viewer reads; viewer mutation, editor owner-only action, nonmember and platform-admin denials; signed-out API/browser boundaries; actual browser campaign submission, worker success, exact run restoration and visible Synthetic-only limits. A separate real behavioral run completed in about5 seconds with same-command durable ID replay, saved experimental deterministic result and artifact checksum. Six protected-candidate desktop/mobile checks and production result1440/390 checks had zero Axe violations, document overflow and page errors.

This is bounded production verification, not every route/role or scientific validity. Report/calibration/backtest complex lifecycle evidence remains local synthetic engineering proof; registry approval remains a separate administrator process. Hosted superadmin pagination beyond100, production recovery/load/retention and approved legal/privacy/terms text remain unverified or unresolved. Direct private SSH health checks were blocked by unavailable authorized keys; startup/config/image identities and an actual behavioral job provide fallback evidence, not direct private-endpoint coverage. Immediate publication means that job alone does not attribute dispatch to the dispatcher.

Evidence: production-smoke-verification.json, production-backend-promotion.json and production-frontend-promotion.json in docs/audit/2026-09-05, plus the release result and protected-candidate receipt. Promotion receipts retain the initial frontend failure and subsequent recovery; they are not a claim of an uninterrupted first attempt. Synthetic fixture records are retained by UUID, not existing-user replacements.

## Implementation checkpoint - 5 September 2026

The signed archive now includes source.tar and promotion.json binding SHA, source digest, migrations and build inputs. scripts/promote_release.py verifies the successful workflow, Sigstore identity/issuer and archive, then four required CI checks before execution. It requires exact existing target/rollback IDs and writes partial receipts plus previous public Railway release settings. Provider builds are derivatives of verified source, not byte-identical signed scanner images.

Vercel uses extracted monorepo source, explicit hosted roots and withheld domains; ambient Vercel/NOW target overrides are removed. Railway structured submission IDs and exact-ID polling bind receipts. Provider success does not substitute for runtime identity, readiness and authenticated smoke. Five Railway Git triggers and two Vercel Git connections are disabled with restoration evidence; this does not claim all alternate provider API paths are cryptographically prevented.

Baseline f984244 signed run33958761514 and downloaded verification passed. Newer585d633/run33960462851 failed; health expectation and exact Redis digest false-positive fixes pass bounded checks. Local backtest mechanics now pass; final source requires new immutable gates. Campaign Lab emergency-pause admission is a newly identified rollout blocker; the atomic guard and additional migration require verification before promotion. No new application promotion or pending report/readiness migration application is established. Separately verified Redis/Auth/Git changes are not application release evidence.

Follow [promotion procedure](../../docs/audit/2026-09-05/PROMOTION_PROCEDURE.md) and [targets](../../docs/audit/2026-09-05/RELEASE_TARGETS.md). Remaining sections define the provenance contract; provider-plan limitations below are historical observations, not a fresh capability recheck.

## Release rule

No release artifact is uploadable from the repository workflow unless:

1. an immutable `v*` tag triggers the workflow;
2. the exact Node, pnpm, uv, and Python toolchains install from frozen locks;
3. quality, SCA, secret, observability, and behavioral-envelope gates pass;
4. build outputs and Python wheels are assembled with normalized order,
   ownership, timestamps, and gzip metadata;
5. the archive checksum is recorded in `SHA256SUMS`;
6. the pinned Sigstore action creates a keyless bundle for the archive;
7. the same step verifies the exact repository workflow identity and GitHub
   Actions OIDC issuer; and
8. the Sigstore bundle checksum is recorded before upload.

The workflow does not deploy or publish a GitHub Release. Promotion remains a
separate authorized operation with readiness, migration, browser, data,
telemetry, rollback, and go/no-go evidence.

## Trust and disclosure boundary

The repository is private and the current GitHub organization plan does not
support GitHub artifact attestations for private/internal repositories. The
workflow therefore uses keyless Sigstore signing directly. It grants only
`id-token: write`, pins
`sigstore/gh-action-sigstore-python@f832326173235dcb00dd5d92cd3f353de3188e6c`,
and disables the action's independent release and artifact upload behavior.

The expected certificate identity is:

```text
https://github.com/kurtgav/Simula/.github/workflows/release.yml@refs/tags/<tag>
```

The expected issuer is:

```text
https://token.actions.githubusercontent.com
```

Sigstore's public-good service records signing evidence in the public Rekor
transparency log. The archive contents and private source are not published by
this operation, but the artifact digest, signing certificate, repository
workflow identity, and tag become publicly auditable. Creating the tag and
making that disclosure require explicit release authorization.

Primary references:

- https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations
- https://docs.sigstore.dev/quickstart/quickstart-ci/
- https://docs.sigstore.dev/about/bundle/
- https://github.com/sigstore/gh-action-sigstore-python/tree/v3.1.0

## Verification

For a downloaded release artifact:

```text
sha256sum --check SHA256SUMS
sha256sum --check SIGSTORE_BUNDLE_SHA256
python -m sigstore verify identity simula-<release-sha>.tar.gz \
  --cert-identity \
  "https://github.com/kurtgav/Simula/.github/workflows/release.yml@refs/tags/<tag>" \
  --cert-oidc-issuer "https://token.actions.githubusercontent.com"
```

The adjacent `simula-<release-sha>.tar.gz.sigstore.json` bundle is required.
Inspect the verified archive digest, certificate identity, issuer, transparency
proof, workflow run, tag, and exact commit SHA. Checksums without
signature/identity/transparency verification are insufficient.

## Runtime binding

After verification, copy the archive digest from `SHA256SUMS`, the Sigstore
bundle digest from `SIGSTORE_BUNDLE_SHA256`, and the exact
`github.com/kurtgav/Simula/actions/runs/<id>` URL into the
server-only production environment. Use one lowercase UUIDv4 rollout ID for the
entire coordinated release. Every production server fails configuration
admission unless those values, the exact Git SHA, and the compiled database
migration head are present. Database readiness then independently verifies that
the applied schema head matches and forced RLS remains enabled.

## Failed provider submissions

A nonzero deployment CLI exit does not prove that no deployment was created.
Inspect the exact provider project and deployment timeline before retrying,
including failed builds. The CLI may fail before returning a deployment ID;
record the provider-discovered ID in the rollout evidence. For example, the
2026-09-05 Vercel build failure created `dpl_72tJ7Joi1xVn5zyumNmwfm5eG1nq`
even though the promotion command returned an error.

On Windows, a provider subprocess may retain a handle in the verified temporary
source directory. Promotion cleanup tolerates those cleanup errors so the
original provider failure remains visible. A locked temporary directory may
remain until the owning process exits; verify ownership before removing it.
