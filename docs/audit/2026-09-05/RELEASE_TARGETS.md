# Release target and security snapshot

Observed 2026-09-05, approximately 09:33–09:36 UTC; F03 remediation independently reread at 09:40 UTC. This is a point-in-time inventory before primary-agent release work, not a claim that later deployments remain unchanged. Provider reads and the F08/F03 verification below were performed against authenticated accounts. No credentials or environment values are included. Hosted changes in this subtask were limited to the explicitly authorized F08 setting and F03 branch/environment protections.

## Identities and environments

| Provider | Confirmed target | Scope / account |
| --- | --- | --- |
| GitHub | `kurtgav/Simula`, private, default `main` | Authenticated `kurtgav`; repository admin/maintain/push permissions true; account plan unknown |
| Vercel | PAVI `team_n60dl3ccO8BFGFeUKQdqPhp3`, slug `pavi-2e9809a4` | Pro; CLI identity `kurtgav` |
| Railway | Simula `f25b8598-d3cc-4e9d-a63d-0413a4035d22` | CLI identity Kurt Gavin; deployment metadata Pro |
| Railway environment | production `2e8d5d3f-2127-4d8c-808c-607cbeecd332` | Only environment returned for this project; region `asia-southeast1-eqsg3a` |
| Supabase | Simula `ywiwmczccktwzqyhzhiz` | PAVI `bvayqsiwznmoibzaztma`, Pro, `ap-southeast-1`, ACTIVE_HEALTHY |

Supabase database host: `db.ywiwmczccktwzqyhzhiz.supabase.co`; PostgreSQL `17.6.1.147`. The inspected project has no branches (`branches: []`). No separate Simula staging project was returned by the project inventory. This does not establish the absence of an environment under an unrelated name.

## Vercel production and rollback identities

Both projects link to `kurtgav/Simula`. Resolve the canonical domain before promotion: the latest attempted deployment can be canceled while an earlier READY deployment still serves production.

| App | Project | Serving canonical domain | Current READY deployment / unique host | Declared source |
| --- | --- | --- | --- | --- |
| Web | `prj_mE6A7XyuiBjb7j5OFPfa79wQR94v`, root `apps/web` | `simula-iota.vercel.app` | `dpl_5YTotbDvyCkuEteSgtyF9LdAipiR` / `simula-dgcrvn8iv-pavi-2e9809a4.vercel.app` | `4b17ba4a85a010ff6ae0575de227b3672eaf6b1a`, **gitDirty=1** |
| Admin | `prj_tZ7PcEL9GAnhuMNqJCC7tCFvf8RO`, root `apps/admin` | `simula-admin.vercel.app` | `dpl_6o5gweJUTbTSxquD2SgaUyF7UbPw` / `simula-admin-dojky2c5a-pavi-2e9809a4.vercel.app` | `bf04ae493cf6da14b622aceb65283e64c9e1c162` |

Current deployment lookup used the domain, not the project wrapper's latest-attempt field. Latest attempts were canceled: web `dpl_28busF768gt6QLbBbJKNDBJR2E1c`, admin `dpl_8xHHdZzPv9sTuxPrfGqcURkNGy13`, both declaring `21469e533625fb50da1f7054e42f4efda9da0048`. These do not establish production outage or successful release.

Provider marked these retained READY deployments as rollback candidates:

| App | Prior deployment | Unique host | Declared commit |
| --- | --- | --- | --- |
| Web | `dpl_DJLvEeWhAFZjE2eNAGPnxM2qjnes` | `simula-glm0gjown-pavi-2e9809a4.vercel.app` | `bf04ae493cf6da14b622aceb65283e64c9e1c162` |
| Web | `dpl_Ct59zsEakStq6ff3P5mLaEzDRWmz` | `simula-bsihh500v-pavi-2e9809a4.vercel.app` | `bf04ae493cf6da14b622aceb65283e64c9e1c162` |
| Admin | `dpl_ASoP6kWKHsG9ricgLV5wHYMNZawh` | `simula-admin-pnno5y9xh-pavi-2e9809a4.vercel.app` | `bf04ae493cf6da14b622aceb65283e64c9e1c162` |

Rollback execution and previous-version application compatibility are NOT RUN. The dirty web source metadata prevents treating its declared commit as proof of exact deployed content. Preview deployments exist, but their existence alone does not prove data isolation from production.

## Railway service inventory

All current deployments below reported SUCCESS and canRedeploy=true. Current runtime health and actual image application behavior were not tested by this inventory.

| Service | Service ID | Current deployment | Declared commit | Public domain / configured health check |
| --- | --- | --- | --- | --- |
| api | `182f55ae-a10f-4fc7-8f36-54b529be2711` | `badca981-9907-450e-9c6d-04b5cd65c13b` | `4b17ba4a85a010ff6ae0575de227b3672eaf6b1a` | `api-production-5931.up.railway.app`; `/health/live` |
| control-plane | `9062c34b-9d5f-45a6-afa4-cd3dac15c954` | `f981b928-03fd-4f7e-a91c-e609483d61d2` | `a169fe7291bdde3a21fe4194eafe03400f530e47` | `control-plane-production-ddbb.up.railway.app`; `/health/ready` |
| worker | `10a8f62f-f56c-44ce-86ce-dac6cbc8c757` | `2f4519f6-2a40-4ac0-81dc-b1c1149986bb` | `4b17ba4a85a010ff6ae0575de227b3672eaf6b1a` | Private; no configured health check |
| dispatcher | `042a83d1-75e6-4cda-918b-33918f02e2df` | `432ede92-9ded-43ef-a1e6-82585d659d70` | `a169fe7291bdde3a21fe4194eafe03400f530e47` | Private; `/health/ready` |
| ai-engine | `3d245c7f-da8e-42c2-9bc2-ae0632d499dc` | `8408695d-100a-49d6-acf7-f2a16207c6c2` | `4b17ba4a85a010ff6ae0575de227b3672eaf6b1a` | Private; `/health/ready` |
| Redis | `12141225-de94-4a2e-ac9e-6d0bc0585348` | `ccfab734-23c5-49de-8f8f-f82caaee0660` | Source image `redis:8.2.1` | Private; persistent volume `/data` |

Resolved current image digests:

- api: `sha256:be7d4fc91e3ec44768997106cfcda9a14e188120679d625fcfab63f1865d3d95`
- control-plane: `sha256:4f0242f1151fa15d967742c8ef975c8f26ea777355472c967f414b82b4698a36`
- worker: `sha256:7d0015422b5d60547bbf0fdc69880c2763716fb7793333d28b2f9ee3685ddb4b`
- dispatcher: `sha256:166b10cb24e9b277fb8a184b470092970efc6b21099b51ceedd10270989f4502`
- ai-engine: `sha256:90297dc37fa76c2099074a2fdfd4cb74751a8438325de260960a3baa6ea5631d`
- Redis: `sha256:5fa2edb1e408fa8235e6db8fab01d1afaaae96c9403ba67b70feceb8661e8621`

Prior deployment metadata (status REMOVED; recoverability NOT VERIFIED): api `3b558d55-c1fa-4b83-bf9b-34ed52ae4dc1`, worker `f48a4ab7-09bf-45e5-b35b-427dd261f40a`, ai-engine `4fb1dbad-cf85-44b2-bbd7-c57f8eb74387` declare `db5412acfca2501a4559fb5180a6e32fd42aa3b5`; control-plane `4b4a27e5-a9f3-47d6-a097-978124e5f9eb` and dispatcher `585f87b9-d5c6-4a11-bdbc-fb76f633b12c` declare `e388d31d7f9d7bf02f5bc13f267e852f5fa9a35e`. Redis history sample contained only the current deployment. Preserve current artifacts before release; a service rollback does not restore database state.

## Finding status and next actions

### F08 — FIXED LIVE, independently verified

SIMULA/PAVI is Pro, so no purchase was required. [Supabase password security](https://supabase.com/docs/guides/auth/password-security) documents leaked-password protection on Pro and above. The [management API](https://supabase.com/docs/reference/api/v1-update-auth-service-config) identifies its configuration as `password_hibp_enabled`.

The signed-in dashboard showed Simula / PAVI PRO / main PRODUCTION. Under Authentication → Sign In / Providers → Email, `PASSWORD_HIBP_ENABLED` was initially 0. Only this switch was set to 1 and saved. Reloading the page and reopening Email verified persisted 1 with Save disabled. Neighboring email/security switches and OTP settings remained unchanged. No user accounts, passwords, or other Auth settings were changed.

Before, the security advisor reported `auth_leaked_password_protection`. After saving, `supabase_get_advisors(project_id=ywiwmczccktwzqyhzhiz,type=security)` at **2026-09-05T09:35:42.014Z** no longer reported it. The remaining result was INFO `rls_enabled_no_policy` on the intentional quarantine table `private.legacy_campaign_lab_report_quarantine`. This verifies persisted configuration plus independent advisor resolution; a real leaked-password signup/reset attempt was NOT RUN.

### F03 — hosted branch/environment controls FIXED LIVE

Before remediation, GitHub `main` protection read returned 404 “Branch not protected”; repository rulesets returned `[]`. Each listed environment had `protection_rules: []` and `deployment_branch_policy: null`: Preview – simula, Preview – simula-admin, Production – simula, Production – simula-admin, Simula / production. Account-plan response was null, but the supported API accepted the following controls without any paid upgrade.

`PUT /repos/kurtgav/Simula/branches/main/protection` configured strict required status checks for **History secret gate**, **Windows quality gate**, **Foundation gate**, and **Non-root container gate**, each bound to GitHub Actions app ID `15368`. Names and app identity were confirmed from both the repository workflow and actual check runs on main. Protection applies to administrators. Pull requests are required with **zero required approvals**, preserving the solo owner's ability to merge after checks pass; stale approvals are dismissed, conversations must resolve, and force pushes/deletions are disabled. A fresh GET at **2026-09-05T09:40:34Z** confirmed every setting persisted. No test push or deliberately failing PR was created; rejection behavior is NOT RUN.

The three existing production environments now use custom branch policies with exactly one allowed branch, `main` (type `branch`), verified with fresh environment and deployment-policy GETs:

| Environment | Persisted deployment branch policy ID |
| --- | --- |
| Production – simula | `59172561` |
| Production – simula-admin | `59172564` |
| Simula / production | `59172565` |

Preview environment settings were left unchanged. No reviewer, wait timer, paid upgrade, Vercel/Railway trigger change, or resource provisioning was added. Main direct pushes must now follow the protected workflow; primary should use a branch and PR. These environment policies allow main branches, not release tags. The current tag-triggered signing workflow does not declare an environment, so these policies do not govern that job. GitHub environment restrictions also do not establish that external provider CLI/API deployment paths are gated; primary still owns release promotion enforcement and verification.

### F09 — production Redis drift remains

Production still uses mutable `redis:8.2.1`; tested compose uses `redis:8.2.7-alpine@sha256:223b183cbc49f5ff48728e1fc52ccf101f05072decad2bd9867281a3c9bf75fd`. Production has `/data` persistence and configured RDB saving; recoverable backups and a restore exercise are NOT VERIFIED. Before replacing the live image, stage the intended digest with equivalent persistence configuration and verify queue/persistence/recovery behavior. This inspection did not change Redis or its volume.

### F11 — isolated staging not established

The confirmed Railway project has production only; Supabase Simula has no branches. Vercel previews are available, but isolated backing services/data were not established. Primary should provision or confirm isolation before using previews as a staging acceptance gate. No new environments or cost-bearing resources were created here.

## Evidence methods and limits

PASSED read-only provider inspection: Vercel team/project/deployment connector reads (canonical domain resolution included); Railway `whoami`, filtered project listing, status and per-service deployment history; Supabase organization/project/branch/advisor connector reads; GitHub authenticated account, repository permissions, branch protection, rulesets and environments through `gh api`. Credential values were neither logged nor copied. F08 used the supported authenticated dashboard because a management access token was not configured for the CLI; no private API reverse engineering was used.

PASSED F03 mutation and independent persisted reads: main branch protection and the three production environment branch restrictions. NOT RUN in this subtask: application smoke tests, deployment promotion, rollback execution, database restore, Redis upgrade, staging provisioning, deliberate protected-push/deployment rejection tests, or production browser flow acceptance. Primary release records should supersede this snapshot with actual post-release identities and verification.

## Read-only predeployment follow-up (09:41–09:44 UTC)

### Schema and durable activity

PASSED migration-version comparison: **81 remote versions and 81 committed local versions**, no remote-only or local-only versions; both heads are `20260824020000`. `git status --short supabase/migrations` was empty. This establishes migration-ledger version alignment, not a complete catalog/schema diff or proof of unchanged historical statement contents.

The remote ledger has `statements[]`, but no original-file checksum column. The following audit fingerprints were captured; remote fingerprints hash the newline-joined stored statement array, whereas local SHA256 hashes file bytes. These are different representations and algorithms and **must not be compared as if equal content were proven**. Exact normalized statement/schema equivalence is NOT RUN.

| Version | Remote statement count / MD5 of joined statements | Local file SHA256 |
| --- | --- | --- |
| `20260815100000` | 27 / `20cd304c3d409df582b2e5650ad3798a` | `4b4b2d0f70e4d527202a794755ab5414157766d523b788838216c7a6b40e49ca` |
| `20260824010000` | 39 / `746c93609f2be5ddc27bc48c2d6056ab` | `5ed2634d502803e53080bb83bbe9475185169c3996b40ecbcb99a0e6bb4979b0` |
| `20260824020000` | 15 / `31f4d1760a00da4efda81432e7e2abc0` | `35992beefd785508f6d82364f0766cd1753b5a90ec31d34e9ecddff06796a24b` |

Aggregate-only SQL snapshot at **2026-09-05T09:42:19.375778Z**:

- Durable `run_creation` admission enabled=true, reason=null, BullMQ pressure reason=null; active transport `bullmq`.
- Simulation runs: 3 succeeded, 2 failed; no other states.
- Campaign Lab runs: 9 succeeded, 1 failed; no other states.
- Campaign evidence runs: zero rows.
- Run outbox: 5 dispatched; no other statuses.

No pending/running work appeared in those durable tables. Redis queue depth itself was NOT READ, and historical failures were not diagnosed here. Admission remains open, so new work can arrive after this snapshot; recheck immediately before worker/queue changes and use the established admission/drain procedure if required. No run IDs, organization IDs, request/result bodies, lease tokens, user content, or user identity fields were queried. Database and Redis were not mutated.

### Live HTTP readiness and provenance

All four requests returned HTTP200 with a 25-second client timeout:

| Service endpoint | Body evidence |
| --- | --- |
| API `/health/live` | status `ok`, environment `production`, service `api`, release SHA `4b17ba4a85a010ff6ae0575de227b3672eaf6b1a` |
| API `/health/ready` | status `ready`, same production identity and SHA |
| Control-plane `/health/live` | status `alive` |
| Control-plane `/health/ready` | status `ready` |

API runtime SHA agrees with the deployment snapshot. Control-plane health does not return a release SHA; its code provenance is provider metadata only (`a169fe7291bdde3a21fe4194eafe03400f530e47` above), not independently attested by this health response. Readiness is a point-in-time dependency/configuration check, not full user-flow verification.

### Actual Vercel CLI JSON shape for rollback validation

Observed CLI `54.7.1`: `vercel inspect dpl_5YTotbDvyCkuEteSgtyF9LdAipiR --format=json --scope pavi-2e9809a4` returns top-level fields **id, name, url, target, readyState, createdAt, aliases, builds, contextName**. It does **not** return `projectId`, `project`, or `status`. Verified `id=dpl_5YTotbDvyCkuEteSgtyF9LdAipiR`, `readyState=READY`, `target=production`.

`vercel list prj_mE6A7XyuiBjb7j5OFPfa79wQR94v --scope pavi-2e9809a4 --status READY --format=json` accepts the explicit project ID and exits0. Top-level fields are **contextName, deployments, pagination**; each deployment contains **url, name, state, target, createdAt, buildingAt, ready, creator, meta**, with no `id`, `uid`, or `projectId`. The inspected unique URL `simula-dgcrvn8iv-pavi-2e9809a4.vercel.app` is present in that scoped list with name `simula`, state `READY`, target `production`.

Therefore CLI-only preflight must join the exact inspected URL to the list scoped by confirmed team/project and check `readyState` on inspect plus `state` on list. It must not fail or silently pass based on nonexistent ID/status fields. The list is paginated (observed count20, nonnull next cursor); a missing first-page match is inconclusive until pagination is exhausted. No rollback was executed.

## F09 Redis recovery feasibility follow-up

Read-only inspection on 2026-09-05 confirmed the existing Redis source remains `redis:8.2.1`, deployment `ccfab734-23c5-49de-8f8f-f82caaee0660`. Allowlisted checks of the configured start command confirmed password enforcement is present, `--save 60 1` is present, and the data directory uses the volume mount variable. The command and password value were not printed. These are configured settings, not live `CONFIG GET` evidence.

Volume `redis-volume`, ID `087b9f1c-b907-4b12-93e2-e1ae6ae2143e`, is mounted at `/data`; its production instance ID is **`0875c185-bd7e-4881-9091-7c1b30cfb8a4`**. Provider state READY, currentSizeMB `1168.367616`, sizeMB `50000`, no pending deletion. The authenticated public API returned:

```json
{"volumeInstanceBackupList":[],"volumeInstanceBackupScheduleList":[]}
```

Thus there are **no provider backups or schedules for this volume instance** at inspection. A non-mutating `railway ssh ... redis-server --version` attempt failed: `No SSH keys found in your SSH agent or ~/.ssh/`. No key was generated or registered. Live version, AOF/RDB status, last-save success, eviction policy, key counts, and actual restore compatibility remain NOT VERIFIED.

The supported `railway api` command uses the existing authenticated CLI context; no access-token extraction is needed. Live schema introspection confirmed these operations are available (described only; no mutations called):

- `volumeInstanceBackupCreate(volumeInstanceId: String!, name: String)` returns a workflow identity.
- `volumeInstanceBackupRestore(volumeInstanceId: String!, volumeInstanceBackupId: String!)` returns a workflow identity. Do not supply unrelated replica/wipe-service fields.
- `serviceInstanceUpdate(serviceId: String!, environmentId: String, input: ServiceInstanceUpdateInput!)`, whose `source` accepts `ServiceSourceInput { image, repo }`.
- `deploymentRollback(id: String!)` returns Boolean. Availability in schema is not proof that the existing deployment will remain restorable after replacement.

[Railway's backup documentation](https://docs.railway.com/volumes/backups) describes restoration as a staged replacement volume with the original retained but unmounted; applying the stage redeploys the service. Restoring an older snapshot removes newer backups, and restoration is limited to the same project/environment. Backups have incremental storage charges; none were created here. The [public volume API documentation](https://docs.railway.com/integrations/api/manage-volumes) documents listing, creation, restoration and scheduling.

Safe primary-owned next steps:

1. Establish authorized SSH access or another supported authenticated runtime path. Read only the allowlisted Redis persistence/health settings and aggregate queue state; do not enumerate user key values. Confirm volume/RDB permissions for the intended Alpine image.
2. Quiesce new run admission using the established operator path, drain/reconcile active durable work, and confirm both durable and Redis queue state. Create and verify a recoverable backup of the confirmed volume instance before replacement; record its identifier and restore plan. Current evidence does not justify claiming recovery is ready.
3. Validate the target digest's ability to load a representative persisted snapshot in an isolated existing test environment. An image rollback alone cannot undo data written by the new Redis version.
4. Only after those gates, update the exact service/environment image to `redis:8.2.7-alpine@sha256:223b183cbc49f5ff48728e1fc52ccf101f05072decad2bd9867281a3c9bf75fd`, preserving password configuration, start behavior, volume and service identity. Inspect/review any staged change before deployment.
5. Verify version/digest, authenticated ping, persistence status, queue processing, and API/control-plane readiness. Reopen admission only after successful verification. On failure keep admission closed and use the recorded compatible image plus recovery plan; never assume `deploymentRollback` restores volume contents.

No production Redis commands, backups, restores, image changes, service changes, purchases, or resource provisioning were performed. The immediate blocker is recovery evidence/access, not an observed provider plan refusal.

### Authorized backup creation — COMPLETED 09:48 UTC

The preceding no-backup state was subsequently remediated under explicit primary authorization to create a recoverable backup of this existing volume. No upgrade or separate purchase was required; normal incremental backup storage usage applies under the existing plan.

Called only `volumeInstanceBackupCreate` for instance `0875c185-bd7e-4881-9091-7c1b30cfb8a4`, label `simula-pre-redis-alignment-2026-09-05`. Returned workflow `createVolumeInstanceBackup/0875c185-bd7e-4881-9091-7c1b30cfb8a4`. A fresh backup-list read returned:

- Backup ID: **`da2dce84-c47b-4a3b-a78b-c6760521f4b6`**.
- Created: **2026-09-05T09:48:16.741Z**.
- expiresAt: null; referencedMB: 1168; volumeInstanceSizeMB: 50000.
- usedMB was null, so incremental charge/size is not yet available from this response.

The public `workflowStatus` query refused access with `Not Authorized`; this did not indicate backup failure. Independent authenticated dashboard verification showed activity **“Backup created”**, the exact backup label, **1.14 GB**, and an enabled **Restore** button in SIMULA → production → Redis → Backups. This confirms creation completed and the provider offers it as a restore target. No restore button was clicked, no schedules changed, and no image/service/volume content mutation occurred. Actual restore rehearsal and snapshot application consistency remain NOT RUN; the backup was taken while admission remained open and must not be called a proven quiesced restore point.

This supersedes the earlier absence of backups. The SSH/runtime inspection and isolated restore-compatibility gaps remain before image promotion.

## F02 automatic Git release paths — DISABLED LIVE

Under explicit release-configuration remediation authorization, preserved nonsecret restoration inputs in `git-trigger-restore.json` before changing triggers. This file records provider/repository/branch/checkSuites/project/environment/service identities and original deployment/configuration fingerprints. It contains no environment values or credentials.

Before: all five Railway source services had a `main` GitHub trigger for `kurtgav/Simula` with `checkSuites=false`, `validCheckSuites=1`, and no base-environment override. Exact removed trigger IDs:

| Service | Removed Git trigger |
| --- | --- |
| api | `9672a5ef-c270-4ec7-b92b-497b702ec464` |
| control-plane | `b4411d6c-779f-4a0d-b4c4-e5011147693b` |
| worker | `de485b60-d108-468f-bffb-65c1211ac2e2` |
| dispatcher | `5633b59b-c7ff-4de0-b0fc-f1f9532373cd` |
| ai-engine | `03e18418-1b4f-4616-8e34-18da4f0991f3` |

Called the supported `deploymentTriggerDelete(id)` mutation once for each exact trigger; each returned true. Fresh scoped queries returned **zero triggers with hasNextPage=false** for every service. Each service still has source repo `kurtgav/Simula`, unchanged deployment ID, and unchanged deployed serviceManifest SHA256. No service, source repository, deployment, volume, or data was deleted. Redis was excluded.

Live schema has no trigger `enabled` flag; `DeploymentTriggerUpdateInput` supports branch/checkSuites/repository/rootDirectory only. Trigger restoration is supported via `deploymentTriggerCreate(input)` using the saved projectId, environmentId, serviceId, provider, repository, branch, and checkSuites values. IDs will be newly assigned. Restoration should remain an intentional operational decision because it reintroduces the Git deployment path. [Railway documents disabling automatic deployments](https://docs.railway.com/deployments/github-autodeploys) independently of manual deployment; the existing explicitly scoped `railway up` verified-source path remains supported.

Vercel GETs initially confirmed both projects linked GitHub `kurtgav/Simula`, production branch `main`, `gitProviderOptions.createDeployments=enabled`. The official project-update schema inspected here did not expose that setting as a supported patch input. Used the supported **`vercel git disconnect`** command instead, with preverified local project links and team scope `pavi-2e9809a4`: repository root for web, `apps/admin` for admin. Both reported `Disconnected kurtgav/Simula`. Fresh project GETs confirmed `link` absent and root directories retained (`apps/web`, `apps/admin`). This disconnects only automatic Git integration; existing projects and explicit CLI deployment targets remain intact. To restore, deliberately reconnect `https://github.com/kurtgav/Simula` to the corresponding existing project, retaining the saved roots/main branch settings.

[Vercel's official Git configuration](https://vercel.com/docs/project-configuration/git-configuration) supports `git.deploymentEnabled: false` in each app's `vercel.json` to disable automatic deployments for all branches. Primary owns adding this source guard; hosted disconnection closes the immediate merge race before that source change reaches main. [CLI source deployment](https://vercel.com/docs/cli/deploying-from-cli) is a separate supported path. Neither mechanism proves all authorized CLI/API users are forced through the signature gate; deployment credentials and promotion execution remain governed by the primary's verified-release procedure.

PASSED: independent persisted trigger/link reads after mutations. NOT RUN: intentionally pushing/merging a commit to demonstrate nondeployment, reconnecting/restoring triggers, or invoking a deployment. No new deployment was initiated by this subtask.

## F09 image alignment — LIVE VERIFIED 10:03 UTC

This supersedes the earlier unchanged-image/SSH-access limitations. A supported Railway variable read was captured in process memory only, then used by redis-py for authenticated read-only Redis queries. No credentials were printed, logged, or saved. Runtime inspection succeeded without SSH.

Preflight at10:00:08Z showed zero durable simulation, Campaign Lab, evidence, and pending/claimed outbox work. All six BullMQ ready/active/paused/delayed/prioritized/waiting-children counts were zero. Run admission remained open throughout; it was not falsely described as quiesced. The confirmed backup remained available. A read-only/network-none local container confirmed the pinned Alpine image provides `/bin/sh`, `/bin/rm`, and `/usr/local/bin/redis-server`; no Bash dependency was found.

Existing startup contained `rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/`. This targets a filesystem recovery directory, not dump.rdb; its emptiness could not be verified because filesystem access needed SSH keys. Under explicit safer-change authorization, removed only that redundant cleanup and its separator. The `/bin/sh` wrapper and Redis invocation/options/variable references remained unchanged: `--requirepass` uses `$REDIS_PASSWORD`, `--save 60 1`, `--dir $RAILWAY_VOLUME_MOUNT_PATH`. No deletion command was executed. Original command SHA256 is preserved in `redis-alignment-receipt.json`; rollback uses the safe command without cleanup.

Applied supported `serviceInstanceUpdate` to Redis service `12141225-de94-4a2e-ac9e-6d0bc0585348`, production environment `2e8d5d3f-2127-4d8c-808c-607cbeecd332`, with only:

```json
{
  "source": {
    "image": "redis:8.2.7-alpine@sha256:223b183cbc49f5ff48728e1fc52ccf101f05072decad2bd9867281a3c9bf75fd"
  },
  "startCommand": "<exact preserved Redis command with only lost+found cleanup removed>"
}
```

The exact safe command (variable references only, no password value) is in the receipt. A fresh read confirmed the source and command changed without a new deployment; then called `serviceInstanceDeploy` for the same service/environment. New deployment **`1f7117fe-67cd-4e2d-ac31-b703dfa0fe8d`**, created **2026-09-05T10:02:38.897Z**, progressed to **SUCCESS**. At **10:03:34.874Z**, provider image digest matched the requested `sha256:223b…75fd` exactly and the safe start command matched its saved value.

Postdeployment verification:

- Authenticated PING true; runtime version **8.2.7**; unauthenticated PING rejected with AuthenticationError.
- loading0, background save0, last RDB save status `ok`; unchanged `save=60 1`, `dir=/data`, `dbfilename=dump.rdb`, `appendonly=no`, `maxmemory-policy=noeviction`.
- Six key-name SHA256 fingerprints with types/cardinality-or-length matched the predeployment snapshot exactly. No key names or values were emitted or copied. One expiring key remained expected; this comparison is structural, not content equivalence.
- All six inspected BullMQ active/pending state counts remained zero.
- API `/health/ready` HTTP200 ready, still application SHA `4b17ba4a85a010ff6ae0575de227b3672eaf6b1a`; control-plane `/health/ready` HTTP200 ready. This Redis change does not promote application source.

Evidence: `redis-pre-alignment.json`, `redis-post-alignment.json`, `redis-post-auth-verification.json`, and `redis-alignment-receipt.json`. The earlier synthetic RDB upgrade/rollback exercise remains separately recorded in `redis-upgrade-rollback-disposable.json`.

Prepared rollback input is the same service/environment and safe no-cleanup start command, changing only source image to **`redis:8.2.1@sha256:5fa2edb1e408fa8235e6db8fab01d1afaaae96c9403ba67b70feceb8661e8621`**, followed by explicit deployment and the same checks. Old deployment `ccfab734-23c5-49de-8f8f-f82caaee0660` now reports REMOVED; do not assume its deployment ID is restorable. Backup `da2dce84-c47b-4a3b-a78b-c6760521f4b6` remains the recorded provider restore target if data recovery is required. No rollback or live snapshot restore was needed/performed.

Remaining limitations: no actual production restore rehearsal, no user-job submission in this subtask, no value-level data equality proof, and no closed-admission window. Existing authenticated persistence/queue/dependent readiness checks passed; this establishes live image alignment, not every future workload scenario.
