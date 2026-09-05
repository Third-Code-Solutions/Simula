# Verified source promotion procedure

The release workflow signs an archive containing `source.tar`, a promotion
manifest, migration/configuration checksums and the existing build/scan evidence.
`scripts.promote_release` verifies the successful GitHub workflow, exact tag/SHA,
Sigstore workflow identity and issuer, archive integrity, source digest and
migration/build inputs before uploading that extracted source to a provider.

Provider builds are derivatives of this verified source. They are not claimed to
be byte-identical to locally scanned Docker images. Record provider image digests
and runtime identity after deployment. The script reports application health as
unverified until separate smoke checks pass.

## Preconditions

- Use the exact successful final release run and its downloaded artifact. A
  diagnostic tag or locally passing tree is not a production release.
- Confirm current provider account/project/environment/service IDs against
  `RELEASE_TARGETS.md`; refresh the inventory because those records are snapshots.
- Confirm database migration head and compatibility independently. The plan's
  schema field records that inspection; the deployment tool does not query SQL.
- Identify current successful Railway deployments and retained READY Vercel
  deployments for rollback. Prove availability before deployment.
- Use installed authenticated CLIs and checksum-verified Cosign. Do not pass
  access tokens as command-line parameters or copy them into a plan/receipt.

## Plan and execution

A JSON plan contains `release_sha`, `migration_head`, and `targets`. Railway
targets contain `provider: railway`, `project`, `environment`, `service`, and
`rollback_deployment`. Vercel targets contain `provider: vercel`, `project`,
`scope`, and `rollback_deployment`. IDs must refer to existing confirmed targets.

Run `uv run --frozen python -m scripts.promote_release --help` for arguments.
First omit `--execute` to verify the signature, source, schema declaration and
provider rollback availability. Review the receipt, then use `--execute` with
the same explicit inputs. Never substitute the current checkout as upload input.

The tool preserves only validated public release/admission settings for each
Railway target before updating them with `--skip-deploys`. It then uploads the
verified source and records the exact provider deployment ID before waiting.
Receipts are persisted per target, including failures and partially completed
rollouts. Inspect a failed/uncertain provider state before retrying.

Vercel creates a production candidate with `--skip-domain`. Verify the returned
deployment's authenticated preview, public/account pages, response headers,
runtime SHA and critical flows before promoting that exact deployment ID to
canonical domains. Never disable deployment protection to make a check pass.

## Verification and rollback

Railway SUCCESS is provider admission only. Check public API and control-plane
dependency readiness, actual image/runtime identities, private worker/engine/
dispatcher logs, queue state and authorized synthetic smoke journeys. Verify
every required component and backward compatibility with existing results.

If a Railway upload fails after settings change, use the receipt's
`previous_release_environment` to restore those seven public settings (including
removing previously absent keys), without triggering unintended deployments.
Use the recorded provider rollback deployment through its supported rollback
operation when application recovery requires it. A prior deployment ID alone
does not restore modified service variables or database state.

For Vercel, retain the previous READY deployment until canonical-domain smoke
checks succeed; use the provider's rollback/promotion operation for that exact
deployment if recovery is needed. Database and Redis backups are separate
recovery inputs. Never describe unexercised rollback as verified recovery.

Production promotion and recovery results must be recorded in the release
identity matrix. This procedure itself is not evidence of a deployment.
