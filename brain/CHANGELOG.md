---
title: SIMULA Changelog
status: active
created: 2026-07-17
updated: 2026-07-30
owner: Principal program and engineering lead
classification: OBSERVED
source_of_truth: true
---

# SIMULA Changelog

## 2026-07-30

- Added E-5073: every deployed server now binds to migration head
  `20260801125632`; production additionally requires one rollout UUID, the
  deterministic archive digest, verified Sigstore-bundle digest, and exact
  GitHub Actions run. PostgreSQL readiness independently checks the applied
  head and forced RLS.
- Added the standalone NestJS dispatcher health server and zero-overlap Railway
  manifest. Production Redis permits TLS endpoints or Railway private-network
  origins; the Python worker and private engine share the same release
  admission contract.
- Replaced the unavailable private-repository GitHub-attestation design with a
  tag-only, pinned Sigstore keyless-signing workflow. It verifies
  `github.workflow_ref` plus the GitHub Actions issuer before uploading. No tag
  or signing run exists; Rekor disclosure requires explicit authorization.
- Exact-toolchain `pnpm check` exits 0 with API 39 suites/250 tests, web 141,
  Python 414 plus 2 expected Windows skips, contracts 7, admin 2, all builds,
  generated drift, 161-file claims, and 1,913-file secrets. SCA,
  observability, behavioral capacity, and the asset browser fixture pass.
  Linked Supabase dry-run reports 18 pending migrations and remote schema lint
  reports no errors; nothing was pushed or deployed.
- Added E-5072: pending organization deletion now has a forced-RLS
  cache/run/storage resource ledger, worker-only skip-locked leases, current-
  token completion, safe fixed-code release, bounded retry backoff, and guarded
  finalization only after every external resource is complete.
- The separate dispatcher now resumes abandoned deletion work every 30 seconds
  through the existing private S3 adapter, exact BullMQ generation cleanup,
  and exact organization-bound Redis patterns with absence verification.
- PostgreSQL adversarial proof covers partial failure, persisted retry,
  duplicate-completion no-op, blocked early finalization, final cascade, ledger
  purge, and minimized tombstone. Live Redis/BullMQ passes 10/10; the
  least-privilege organization gateway remains 4/4; exact live catalog
  inventories match the foundation assertions.
- Current `pnpm check` exits 0 with API 230/230, web 141/141, Python 396 plus 2
  expected Windows skips, contracts 7/7, admin 2/2, all four builds, generated
  drift, claims, and secrets. Docker pgTAP/type generation, a populated live-S3
  recovery pass, hosted recovery, backup expiry, and deployment remain open.
- Added E-5071 after the Pillow dependency upgrade exposed stale generated
  provenance: new technical image profiles now require and emit
  `pillow-12.3.0`; historical 12.1.0 profiles remain readable through an
  explicit two-version schema/contract.
- The same live database retest caught E-5070's audit-policy rewrite omitting
  `stimulus_visual_profile.created`. Migration `20260730210000` restores that
  action while retaining `organization.deletion_requested`; authored pgTAP now
  guards both actions and the two-version model constraint.
- Transactional full-migration/catalog proof passes. The least-privilege visual
  gateway integration returns to 4/4. Focused Python/restore 11, API 9, web 8,
  and contracts 7 pass.
- Current `pnpm check` exits 0 with API 223/223, web 141/141, Python 396 plus 2
  expected Windows skips, contracts 7/7, admin 2/2, all four builds, generated
  drift, claims, and secrets. Docker pgTAP/type generation and hosted migration
  remain open.
- Added E-5070: owners can now delete a disposable organization through one
  exact-name-confirmed, retry-safe v2 workflow. PostgreSQL first persists a
  durable manifest and disables the organization; NestJS then verifies private
  object deletion, BullMQ job removal, and organization-scoped Redis cleanup
  before confirming the relational cascade and minimized tombstone.
- Added least-privilege PostgreSQL adversarial coverage for active-run
  rejection, freeze, replay, conflict, cascade, and tombstone behavior; live
  Redis/BullMQ tenant-isolation cleanup proof; generated OpenAPI/client updates;
  owner danger-zone UI; and component/controller/gateway/contract tests.
- Added production-build browser evidence through Supabase-shaped Auth/JWT,
  actual Next/NestJS, least-privilege PostgreSQL/RLS, Redis, and BullMQ.
  Wrong-name confirmation is rejected; the disposable zero-asset/zero-run
  organization is deleted and disappears after redirect. Axe, overflow,
  console, page-error, and visual screenshot review pass.
- Final `pnpm check` exits 0 with API 223/223, web 140/140, contracts 7/7,
  admin 2/2, Python 396 plus 2 expected Windows skips, all four builds, and
  generated/claim/secret gates. The browser matrix passes 3 with one intentional
  duplicate mobile deletion skip.
- Boundaries remain explicit: Docker Supabase reset/lint/pgTAP/generated
  database types, hosted object/queue/cache deletion, populated-manifest browser
  deletion, backup expiry, human screen-reader, required checks, full staging
  restore, validation, and deployment remain open. E-5072 closes the local
  abandoned-request recovery implementation subset.
- Added E-5069: the whole-repository quality gate is green again. The PDF guide
  generator now owns pinned ReportLab runtime/type dependencies, uses strict
  callback/table-style typing, and retains one narrow copy-heavy `E501`
  exception. The generated admin declaration is Prettier-clean, and the visual
  analysis module explicitly exports its test seam.
- The first SCA rerun found current Pillow 12.1.0 advisories. Pillow is now
  pinned to 12.3.0; focused visual tests pass 9/9, Python audit reports zero
  known vulnerabilities, and npm audit passes with only the existing
  documented dev-only GHSA exception and review date.
- Final `pnpm check` exits 0: format covers 130 Python files, strict mypy covers
  130 sources, contracts pass 7/7, admin 2/2, NestJS API 213/213, web 138/138,
  and Python 396 with 2 expected Windows skips. All four production builds,
  generated-contract drift, the 160-file claim policy, and the 1,882-file
  secret baseline pass.
- The guide regenerates as a 15-page A4 PDF with 13 bookmarks, complete page
  text, correct Third Code metadata, explicit non-human-study boundaries, and
  zero nonbreaking hyphens. All pages plus dense pages were rendered and
  visually inspected with no clipping, overlap, or broken tables.
- E-5069 closes the stale full-repository format/lint/mypy blocker recorded by
  E-5068. It does not close exact Supabase-container database gates, hosted
  services, human accessibility, required-check governance, provider/data
  admission, scientific validation, deployment, or production admission.
- Added E-5068: the durable rollback integration now re-enables authenticated
  run admission after BullMQ-to-ARQ cutover, creates a second run through the
  actual NestJS v2 command, and executes it through the production Python ARQ
  dispatcher and worker composition in bounded one-shot mode.
- The authenticated run and result reads return `succeeded` plus one immutable
  result. PostgreSQL records exactly one attempt/result. After drained recutover
  to BullMQ, the retained immediate BullMQ delivery completes as a durable
  no-op; attempt/result counts remain one.
- TDD exposed a real ARQ startup defect: `require_queue_transport` was mapped by
  the worker database layer but absent from the fixed telemetry label allowlist.
  The allowlist and its bounded-label regression test now cover the transport
  assertion; the dispatcher protocol also reflects the exact ARQ/BullMQ type.
- A clean 51-migration PostgreSQL 17 fixture with independent main/outage Redis
  servers passes the complete BullMQ/ARQ database suite 14/14. Regression gates
  pass API 213/213, Python 396 with 2 expected Windows skips, API build/typecheck,
  generated-contract drift, focused Prettier/Ruff/mypy, the 160-file claim
  policy, and the 1,882-file secret baseline.
- Fixture cleanup leaves transport `arq`, admission enabled, zero named fixture
  organizations/nonterminal runs/open outboxes/operator fixture audits, null
  API/worker role passwords, and Redis 6387 returning `PONG`; outage-only Redis
  6388 is intentionally stopped. Unrelated Redis 6379 remains untouched.
- E-5068 closes the missing local post-rollback ARQ terminal-result subset only.
  Hosted Supabase/Railway execution, a staged release-identity/alert/rollback
  drill, pgTAP/generated database types, external-provider admission,
  rights-cleared validation, deployment, and production admission remain open.
  No behavioral-accuracy, population-representativeness, predictive-validity,
  Predikta-equivalence, or production-readiness claim is authorized.
- Added E-5067: the authenticated production-Next verifier now runs both
  desktop Chrome and a Pixel-class mobile profile. Organization empty,
  dashboard denial, project-directory denial, and project denial each require
  a non-empty document title, zero Axe violations, and at most one CSS pixel
  of horizontal overflow.
- The 2/2 matrix writes eight stable full-page artifacts under
  `output/playwright/m2-*.png`. All eight were visually inspected; desktop and
  mobile content remains readable, navigable, and unclipped without changing
  the established design.
- A repeated mobile run exposed an accessibility-harness race where Axe could
  inspect before streamed Next metadata supplied the title. The verifier now
  waits for a non-empty document title before every Axe scan and resets smooth
  scroll before each stable screenshot.
- E-5067 cleanup closes Auth/API/web listeners, removes the fixture
  organization, restores the temporary API-role password to null, and leaves
  Redis returning `PONG`. Human screen-reader evidence, hosted Auth/TLS,
  deployment, and production admission remain open.
- Added E-5066: the project directory now distinguishes a failed initial load
  from a real empty collection, labels busy state, and offers a retry. The
  organization dashboard exposes a generic level-one denial heading and clears
  stale load errors after retry.
- The methodology lab now retries failed initial state, explains missing
  audience/configuration/stimulus/variant prerequisites, reports an empty
  compatible comparison explicitly, and renders truthful empty report/audit
  sections instead of blank lists.
- Extended the authenticated production-Next proof across a foreign
  organization dashboard, foreign project directory, and foreign project.
  Every route returns only generic 404 UI, exposes none of the fixture IDs,
  names, or objective, and passes Axe. The browser run found and corrected two
  indistinguishable `Projects` landmarks without changing visual design.
- Final E-5066 gates pass Playwright 1/1, web 39/39 files and 138/138 tests,
  API 35/35 suites and 213/213 tests, API/web types and lint, production Next
  and API builds, contracts build/drift, OpenAPI drift, and scoped formatting.
  The 160-file forbidden-claim policy and 1,881-file secret baseline pass.
  Teardown closes all three E2E listeners, deletes the fixture organization,
  restores the API role password to null, and leaves Redis healthy.
- E-5066 closes the remaining locally audited automated campaign-lab
  loading/empty/error-state subset only. Hosted Supabase Auth/TLS, human
  screen-reader evidence, full visual/responsive QA, deployment, and production
  admission remain open.
- Added E-5065: a reusable production-build browser verifier starts a
  Supabase-shaped password/Auth/JWKS boundary, actual NestJS v2 application,
  least-privilege PostgreSQL/RLS connection, isolated Redis namespace, and the
  Next.js standalone server. The browser signs in as a user with no
  memberships and the audited session reaches the real organization/project
  routes.
- The tenant-filtered organization request returns `200` with an empty page
  while the real loading and empty states render. Direct navigation to another
  tenant's project returns the generic `404 not_found`; the rendered page
  contains none of the foreign organization ID/name, project ID/name, or
  objective. Both states pass Axe with zero violations.
- The journey exposed two production defects. The concealed-project state had
  no level-one heading, so it now renders a generic accessible `Project
  unavailable` boundary. The standalone image omitted `apps/web/public`, so
  the runtime Docker stage and verifier now copy public assets; only the
  intentional foreign-project API 404 remains.
- Final E-5065 gates pass Playwright 1/1, API 213/213, web 132/132, Nest
  live-Redis 7/7, deployment configuration 9/9, API/web test-source and
  application types, web lint, production standalone/API builds,
  OpenAPI/generated-contract drift, scoped formatting/lint, the 159-file
  forbidden-claim policy, and the 1,880-file secret baseline. The fixture
  organization is deleted, the temporary API password is reset to null, all
  three E2E listeners close, and the unrelated Redis remains healthy.
- E-5065 uses protocol-shaped local Auth and disposable PostgreSQL/Redis, not
  hosted Supabase Auth/TLS or a human screen reader. Exact Supabase reset/lint/
  generated types, hosted cross-tenant proof, human assistive-technology
  review, deployment, and production admission remain open.
- Added E-5064: migration `20260730190000` creates a forced-RLS singleton
  queue-transport authority, defaulting to ARQ. A shared/exclusive PostgreSQL
  advisory-lock fence serializes worker claims with operator cutover; a switch
  requires disabled new-run admission plus zero non-terminal runs and zero
  pending/claimed outboxes, and emits an audit event.
- BullMQ and ARQ now use separate database claim boundaries. Node dispatcher
  readiness/passes and Python ARQ dispatch passes assert durable transport
  ownership before cancellation, recovery, outbox, or execution mutation.
  `pnpm operator:queue-transport` exposes least-privilege status, `set-arq`,
  and `set-bullmq` operations with mandatory correlation IDs.
- A clean 51-migration PostgreSQL 17/Redis fixture proves drained ARQ-to-BullMQ
  cutover, rejection of rollback while a run is active, one terminal BullMQ
  result, BullMQ-to-ARQ rollback, stale BullMQ rejection before mutation, and
  recutover. All database suites pass 19/19; regression gates pass API 213/213,
  Nest live-Redis 7/7, Python 396 passed with 2 expected Windows skips,
  contracts 7/7, scoped formatting/lint/types, API/contracts builds, and
  OpenAPI/generated-contract drift. The forbidden-claim policy passes 159
  files and the secret baseline passes 1,876 text files.
- E-5064 is a disposable local durable-fence/cutover subset, not the completed
  staging rollback drill: no hosted dependencies or ARQ-consumer terminal run
  after rollback was exercised. Docker Linux remained unavailable, so the new
  pgTAP assertions and generated database-type gate did not run. Hosted
  autoscaling/failure load, external-provider admission, rights-cleared data,
  held-out validation, deployment, and production admission remain open.
- Added E-5063: BullMQ database integration now starts two distinct Node
  dispatcher replicas with separate PostgreSQL pools and Redis clients, plus
  two synchronized Python worker processes using production concurrency 4.
  Both dispatcher replicas claim and confirm work; both worker replicas claim
  at least one job.
- A clean 50-migration PostgreSQL 17/Redis run creates 30 authenticated runs
  across 30 tenant organizations. The two dispatchers confirm all 30 exactly
  once and then both return an idle pass. Worker claim sets are non-empty,
  disjoint, and their union is the exact 30-job set.
- All 30 BullMQ jobs complete with `attemptsStarted=1`. PostgreSQL records 30
  succeeded runs, 30 succeeded attempts, 30 dispatched outboxes with one
  dispatch attempt each, and 30 immutable results. Final full-run attempt
  duration measured p95 `0.161628s`, maximum `0.174258s`, with
  creation-to-last-terminal fixture span `6.049773s`.
- Focused load proof passes 1/1; all opt-in database suites pass 17/17.
  Regression gates pass API 211/211, Nest live-Redis 7/7, Python 387 passed
  with 2 expected Windows skips, contracts 7/7, scoped Ruff/mypy/Prettier,
  test-source/application types, API/contracts builds, and
  OpenAPI/generated-contract drift. This is deterministic disposable local
  load, not hosted Railway/Supabase latency, maximum behavioral-engine load,
  provider capacity, staging rollback, or production admission.
- Added E-5062: migration `20260730180000` gives only the `simula_worker`
  dispatcher a bounded durable BullMQ-pressure update boundary. Run creation
  now rejects dispatched queue depth at 100, oldest ready age at 60 seconds,
  or Redis memory at 80%, and only a later healthy dispatcher snapshot below
  all thresholds clears that transient pressure. Existing poison, critical
  memory, and five-minute database-backlog conditions retain their separate
  operator-verified latch.
- A clean 50-migration PostgreSQL 17/Redis run proves real BullMQ depth 100
  blocks while 99 reopens, a 61-second ready job blocks while a 30-second job
  reopens, and bounded memory inputs 80/79.9% close/reopen admission. Live Redis
  memory parsing and the complete dispatcher-to-database wiring are covered by
  unit tests.
- The same authenticated v2 boundary proves the organization pending ceiling:
  run 20 is accepted, run 21 returns `429 quota_exceeded`, and exact replay
  remains accepted. Four concurrent worker-role v2 claims prove three active
  execution leases and one `organization_capacity`; expiring one lease admits
  the fourth claim without exceeding three active leases.
- A wall-clock hard-process-loss probe now uses the production BullMQ Python
  runtime (`lockDuration=30000`, `stalledInterval=30000`,
  `maxStalledCount=1`). BullMQ redelivers and settles the same generation-1 job
  only in the asserted 27-70 second window while PostgreSQL remains
  `running`/attempt 1 with no result; subsequent database-authorized stale
  recovery succeeds in generation 2 with one result.
- Focused BullMQ proof passes 11/11; all opt-in database suites pass 16/16.
  Regression gates pass API 211/211, Nest live-Redis 7/7, Python 387 passed
  with 2 expected Windows skips, contracts 7/7, scoped Ruff/mypy/Prettier,
  test-source compilation, API/contracts builds, and OpenAPI/generated-contract
  drift. The forbidden-claim policy passes 159 files and the secret baseline
  passes 1,872 text files. Exact Supabase-container pgTAP/database-type gates
  remain unavailable because Docker Linux is unavailable. Hosted dependencies,
  production-shaped multi-replica load, external-provider admission,
  rights-cleared population data, held-out validation, deployment, and
  production admission remain open.
- Added E-5061: a clean 49-migration PostgreSQL 17 replay proves exact
  idempotent API replay for a completed behavioral command, forced duplicate
  BullMQ delivery after removing the retained completed job, and no additional
  durable attempt, outbox, result, payload, receipt, normalized evidence, or
  public-summary rows.
- The same real NestJS/outbox/BullMQ/Python/private-FastAPI boundary now proves
  behavioral hard-process loss after claim. Database-authorized stale-lease
  recovery replaces generation 1, succeeds in generation 2, records attempts
  `superseded/recovered_stale_dispatch` then `succeeded`, and retains exactly
  one checksum-valid result, payload, and receipt.
- Full behavioral-run deletion initially failed at the actual foreign-key
  cascade because the non-login behavioral-result owner lacked `DELETE`.
  Migration `20260730170000` grants that owner-only capability while
  `simula_worker` retains no direct delete privilege. The test now deletes the
  run and proves zero rows across the run, attempts, events, outbox, canonical
  artifacts, context graph, fleet, actions, memories, report evidence, and
  public summaries.
- Focused BullMQ proof passes 8/8; all opt-in database suites pass 13/13.
  Regression gates pass API 208/208, Nest live-Redis 7/7, Python 387 passed
  with 2 expected Windows skips, contracts 7/7, test-source compilation, API
  and contracts builds, OpenAPI/generated-contract drift, scoped formatting
  and lint, claims, and secrets. Exact BullMQ stalled timing, saturation
  thresholds, hosted dependencies, real providers, rights-cleared population
  data, held-out validation, deployment, and production admission remain open.
- Added E-5060: a clean 48-migration PostgreSQL 17 replay now executes the
  governed behavioral path through the actual NestJS command/outbox,
  BullMQ, pinned Python worker, private FastAPI engine, canonical behavioral
  completion, normalization triggers, and authenticated result projection.
  The durable result is `experimental`, uses only `deterministic_tiered`,
  records 10 provider calls, one payload, one provider receipt, and a
  checksum-valid artifact against active non-representative audience version
  `00000000-0000-4000-8000-0000000000d2`.
- E-5060 also proves running cancellation after the worker claim and
  pre-provider heartbeat: HTTP cancellation moves the run to
  `cancel_requested`; releasing the paused provider settles the attempt as
  `canceled/canceled_by_user`, terminalizes the outbox as `canceled`, and
  persists zero result artifacts.
- Clean execution exposed and fixed six fail-closed integration defects:
  retired audience-version selection, a non-admitted creation event reason,
  non-canonical JSON-key validation, missing completion-owner summary/FK-lock
  privileges, revoked trigger-owner normalization execution, and a missing
  worker database/telemetry operation allowlist entry. Focused BullMQ proof
  passes 7/7; all opt-in database tests pass 12/12 across three suites. API
  208/208, Nest live-Redis 7/7, Python domain/worker/engine 250/250, two
  cross-language private HTTP/BullMQ integrations, scoped Ruff/mypy/Prettier,
  API typecheck/build/OpenAPI, generated contracts, claims, and secrets pass.
  Docker-dependent pgTAP and local database-type generation remain unavailable;
  no production flag, deployment, external provider, or validation claim
  changed.
- Added E-5059: a separate disposable Redis server now fails after a live
  BullMQ connection is established. The real dispatcher claims the pending
  outbox row but cannot publish or prove the job, so it records no false
  confirmation or terminal failure. After the claim lease is advanced and the
  live transport returns, the dispatcher reclaims, publishes, confirms, and
  the pinned Python worker commits one attempt and one immutable result; the
  durable outbox records two dispatch attempts.
- E-5059 also proves tenth-attempt poison terminalization and its atomic global
  admission latch. The run fails with zero execution attempts/results, the
  outbox becomes `terminal/dispatch_exhausted`, the control becomes
  `disabled/poison_outbox`, and one worker audit is written. A subsequent
  authenticated HTTP run request receives `503 queue_backpressure` with
  `Retry-After: 30`; verified operator re-enable returns the test fixture to a
  clean admitted state and writes its own audit. Focused proof passes 5/5; all
  opt-in database tests pass 10/10 across three suites. API 208/208, Nest
  live-Redis 7/7, worker 82/82, pinned Python BullMQ live-Redis 1/1, strict
  types/format/lint, API build/OpenAPI, generated contracts, claims, and
  secrets pass.
- Added E-5058: the real cross-language BullMQ database proof now covers
  queued cancellation and hard worker-process loss. Canceling through the
  NestJS HTTP route before dispatch finalizes the run and outbox without
  creating a durable attempt or result, even though the already-published
  Python job performs its bounded confirmation deferrals. A Python worker
  forced to exit immediately after a successful database claim leaves the run
  `running`; an expired lease is reconciled into generation 2, attempt 1 is
  durably `superseded` with `recovered_stale_dispatch`, outbox generation 1 is
  terminal `recovery_replaced`, and generation 2 succeeds with one immutable
  result.
- E-5058 focused proof passes 3/3 and the complete opt-in database suite
  passes 8/8 across three suites. API 208/208, Nest live-Redis 7/7, worker
  82/82, pinned Python BullMQ live-Redis 1/1, test-source and application
  types, API build/OpenAPI, generated contracts, scoped formatting/lint,
  forbidden claims, and secrets pass. Poison dispatch, Redis-loss behavior,
  organization/global backpressure, exact BullMQ stalled-job timing, and
  production admission remain open. ARQ remains the rollback path.
- Added E-5057: one fresh 47-migration UTF-8 PostgreSQL 17 database and
  isolated Redis now execute the real NestJS-to-BullMQ-to-Python durable run
  path. The first Python delivery is database-deferred before outbox
  confirmation; the actual Node dispatcher proves and confirms the retained
  v2 job; redelivery commits exactly one deterministic result and one attempt.
  Republishing the exact completed identity performs no additional durable
  work. The focused test passes 1/1; all three opt-in Nest database suites pass
  6/6. Regression gates pass 35 API suites / 208 tests, 2 live-Redis Nest
  suites / 7 tests, 82 worker tests, the pinned Python BullMQ live-Redis test,
  strict types/format/lint, API build, generated contracts, claims, and
  secrets.
- E-5057 closes only M3 confirmation, terminal-result, and duplicate-delivery
  proof. Crash/stall, cancellation, poison, stale lease, Redis-loss, and
  backpressure equivalence remain open. Production BullMQ admission stays
  rejected; ARQ stays the rollback path. This is disposable local evidence,
  not hosted Supabase, deployment, behavioral validation, Predikta
  equivalence, or production readiness.
- Added E-5056: a fresh 47-migration PostgreSQL 17 database, Redis, loopback
  RS256/JWKS and S3-shaped boundaries, the actual NestJS application, and the
  real AWS-SDK S3 adapter now run one opt-in adversarial asset suite. Foreign-
  tenant content reads and deletion commands return the same generic 404 while
  leaving bytes untouched. A simulated ambiguous provider deletion returns
  204 but retains the object; NestJS detects the retained bytes, returns 503,
  and leaves the durable row `deletion_requested`. Retrying with the same
  idempotency key reports replay, removes the object, and confirms `deleted`.
  An available asset past retention returns 404 before any object GET.
- Added default controller regressions for expiry-before-storage and same-key
  deletion recovery. The full API gate now passes 35 suites / 208 tests; the
  explicit database gate passes 5/5. API test-source compilation, typecheck,
  build, and OpenAPI drift also pass. This is isolated local evidence using a
  process-local S3 boundary and Redis 8.0.4, not hosted Supabase Storage, the
  pinned production Redis release, browser denial, deployment, behavioral
  validation, Predikta equivalence, or production admission.
- Added E-5055: a real Chromium session connected the production Next
  standalone build to loopback Supabase-shaped RS256/JWKS Auth, the actual
  NestJS v2 control plane, a clean 47-migration PostgreSQL database, isolated
  Redis, the real AWS-SDK S3 adapter, and the private FastAPI/Pillow engine.
  The browser signed in, created an organization/project/stimulus/bounded demo
  run, uploaded a 4,277,838-byte PNG, verified its SHA-256 before private
  preview, rendered the immutable nine-signal technical profile with explicit
  non-behavioral limitations, and permanently deleted the verified object plus
  an interrupted pending reservation. A fresh reload showed both tombstones
  with 0 console errors or warnings.
- The E-5055 journey exposed and corrected two migration defects. The v2 web
  client still called a removed v1 organization-dashboard route, so NestJS now
  serves a strict tenant/RLS-scoped v2 dashboard and the web client routes by
  the admitted domain version. Strict global validation also rejected the
  documented `{}` asset-deletion and run-cancellation commands; both now
  accept only the empty object and reject supplied fields.
- Regenerated the NestJS OpenAPI contract and TypeScript client. Current gates
  pass 35 API suites / 206 tests, 38 web files / 132 tests, and 7 contract
  tests. This remains disposable local evidence: Auth and S3 were loopback
  protocol-shaped harnesses, not hosted Supabase services. Cross-tenant HTTP,
  retention expiry, deletion-failure recovery, human assistive technology,
  hosted deployment, behavioral validation, Predikta equivalence, and
  production admission remain open.
- Added E-5053: executed the complete migration chain from zero on an isolated
  PostgreSQL 17 database and passed all 244 pgTAP assertions across 13 files.
  The visual slice contributes 18 catalog/contract assertions plus 14
  adversarial replay, immutable-conflict, tenant-denial, claim, and retirement
  assertions. Clean execution exposed and corrected composite-FK ordering,
  invalid schema-qualified SQL syntax, migration-owner context, audit-policy,
  trigger-authority, and least-privilege lookup defects.
- Executed the real local technical-profile path through RS256/JWKS auth,
  NestJS, isolated Redis, S3-compatible private object upload/download, the
  private FastAPI/Pillow engine, and PostgreSQL persistence. Asset SHA-256
  `431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460`
  produced immutable profile checksum
  `23cba6b384cefe7f8c0b35aeba3844ebd089f355de4b6aae8c904bb5bb23f03e`,
  nine signals, explicit false behavioral/population claims, and a durable
  replay receipt plus one success audit event.
- The live path exposed an empty-command DTO rejected by strict validation.
  The create contract now requires exact
  `technical_image_signals_v1`; NestJS, Next client, generated OpenAPI/types,
  and focused tests agree. Current gates pass 34 API suites / 201 tests, 3
  focused web files / 28 tests, 27 core/private-engine tests, and 7 contract
  tests. This remains local evidence: Moto is not hosted Supabase Storage, the
  Next browser was not connected to this stack, and all flags remain off.
- Added E-5054: the explicit NestJS database-integration compilation scope now
  includes `apps/api/test`, and a fresh 47-migration PostgreSQL database passes
  all 4 gateway integrations. The new case creates an asset-bound profile,
  proves exact replay, hides it from a foreign tenant, proves one receipt and
  one audit event, requests asset retirement, and proves derived-profile
  erasure. The disposable cluster was stopped and removed after the run.
- Added E-5052 and ADR-0015: verified available JPEG/PNG/WebP assets can now
  produce one immutable, asset-bound technical image profile. The private
  Python engine performs allowlisted verify/reopen decoding, decompression and
  pixel/input bounds, EXIF normalization, deterministic downsampling, and nine
  bounded technical signals. It retains no embedded metadata and publishes
  explicit no-behavioral/no-population limitations.
- Added authenticated NestJS create/read routes, private-byte media/size/hash
  revalidation, strict engine-response binding, an asset-stable analysis
  identity, durable idempotency, forced-RLS persistence, and derived-profile
  removal on asset retirement. Generated contracts and the default-off web
  workflow display exact dimensions/signals/method provenance with no OCR,
  object, emotion, persuasion, or campaign-performance claim.
- Added focused Python/API/web/contract tests and a real-Chromium fixture with
  zero Axe violations. E-5052 initially retained database and real-object
  execution as open gates; E-5053 records the later disposable PostgreSQL and
  local S3-compatible full-stack proof. Hosted Supabase Storage, deployment,
  validation, Predikta equivalence, and production admission remain absent.

## 2026-07-29

- Started the Predikta-class production-platform program without copying or
  inventing private competitor internals. Plan 003 defines the complete
  audience-to-stimulus-to-simulation-to-refinement/retest outcome and the
  requested Turborepo, Next.js, NestJS, Python/FastAPI, Supabase/pgvector,
  BullMQ, Storage/R2, OpenAPI, Sentry/OpenTelemetry, GitHub Actions, Vercel, and
  Railway stack.
- Accepted ADR-0011: NestJS is the target public control plane, Python/FastAPI is
  the private AI engine, BullMQ is the target transport, and PostgreSQL remains
  authoritative. FastAPI/ARQ stays rollback-safe until contract and
  crash/recovery equivalence pass. Added R-032 through R-034 for migration
  divergence, absent behavioral data/validation, and real-provider risk.
- Adopted MIT-licensed PhantomCrowd commit
  `4f197a8df0de5183f2376a210f42aaf948bd9b0a` as the primary open-source
  implementation reference. Added a source/validation audit and ADR-0012:
  SIMULA adapts its context graph, tiered agents, rounds/actions, memory,
  crowd-pulse, report, synthetic interview, and A/B/retest ideas while rejecting
  SQLite/in-memory authority, silent fallbacks, unseeded randomness, permissive
  auth, unsafe URL ingestion, and inherited accuracy claims.
- Added R-035 through R-037 for the missing reproducible reference backtest
  dataset, unsafe reference patterns, and confusion between synthetic output
  and human evidence. Expanded Plan 003 M4-M6 and production gates accordingly.
- Completed local M1 evidence E-5034: NestJS strict build/typecheck and 20 Jest
  tests pass; real loopback Redis/BullMQ integration passes 2 tests; separate
  OpenAPI/client drift and 3 contract tests pass; web/admin regression, lint,
  typecheck, and Next 16.2.11 production builds pass; frozen install,
  claims/secrets, and npm/Python SCA pass. Root format remains blocked only by
  unchanged generated `apps/admin/next-env.d.ts`; unrelated user-owned PDF
  generator lint/type findings were preserved.
- Added the first disabled-by-default M2 slice (E-5035): strict Supabase JWT and
  local Auth verification, duplicate-header rejection, FastAPI-compatible
  signed cursors, direct least-privilege PostgreSQL transactions with local
  claims, RLS organization reads, RFC 9457 failures, domain-aware readiness,
  `/api/v2/me`, `/api/v2/organizations`, OpenAPI, and generated client.
  Build/typecheck, 52 Jest, 2 Redis/BullMQ, and 3 contract tests pass.
  Production enablement is rejected. The separate disposable PostgreSQL gate
  failed before mutation because loopback 54322 is not a SIMULA database and
  Docker control is unavailable; M2 remains open.
- Expanded M2 through E-5036: ported all 13 overlapping identity,
  organization, project, stimulus, demo-audience, run, cancellation, result,
  provenance, and auth-event paths; added exact Redis admission/idempotency,
  durable sign-in/denial audit, strict CORS/body/deadline/trace controls,
  fail-closed DB/result/provenance mapping, generated v1/v2 golden contracts,
  and a Next v1/v2 rollback flag that defaults to v1. Frozen install, 92 Jest, 6
  live Redis/BullMQ, 4 contracts, 76 web tests, production build,
  claims/secrets, and SCA pass after upgrading AJV to 8.20.0 for
  GHSA-2g4f-4pwh-qvx6. Real PostgreSQL/RLS HTTP and authenticated browser E2E
  remain blocked; no production traffic moved.
- Extended M2 through E-5047 with the Phase 3/4 methodology workflow:
  authenticated v2 registry, audience create/list, simulation-configuration
  create/list, and methodology preview; strict nested DTOs; reuse of the
  existing RLS/idempotent SQL authorities; an authenticated private FastAPI
  methodology endpoint; bounded and identity-bound NestJS private-service
  responses; deterministic Python-compatible preview/report IDs; generated
  OpenAPI/client types; browser v1/v2 rollback routing; and expanded golden
  contract parity. Outputs remain experimental heuristic rehearsal artifacts.
  Database/RLS/browser proof remains blocked and v1 remains the default.
- Extended M2 through E-5048 with the durable optimization loop: ordered
  variant groups, compatible complete-report comparison, succeeded-run report
  creation/read, and checksum-bound JSON/CSV export creation/download. Added
  seven authenticated `/api/v2` routes, existing Phase 4 atomic SQL-helper
  reuse, private FastAPI comparison/export endpoints, a comparison-only 9 MiB
  bounded command envelope for eight maximum-size reports, fail-closed NestJS
  response/byte/hash binding, generated control-plane types, Next rollback
  routing, and v1/v2 golden parity. Local API, Python, web, contract, build,
  static, claims, secrets, and diff gates pass. Database/RLS/browser proof
  remains blocked; arbitrary report upload was not added to the v2 surface.
- Extended M6 through E-5049 with the browser-facing durable optimization loop.
  A succeeded behavioral run now exposes frozen-configuration report creation,
  durable reload, experimental methodology disclosure, and checksum-verified
  JSON/CSV download. The Methodology Lab now lists saved variant groups and
  renders compatible report deltas with an explicit no-winner/no-causal-lift
  boundary. New component/API tests, full web regression, lint, optimized
  production build, claims, secrets, formatting, and diff gates pass.
  Fixture-backed authenticated desktop/mobile browser journeys cover report
  create/export/reload and group comparison with clean final consoles and no
  horizontal overflow. Database-backed tenant/RLS/HTTP proof remains open.
- Added E-5050 and ADR-0014: private stimulus bytes now have a
  disabled-by-default NestJS/Supabase-S3 ingestion seam. PostgreSQL reserves an
  immutable tenant/stimulus/asset/digest path, expected size/hash/media, and
  retention; upload and download recheck bytes and metadata; deletion uses a
  durable request, S3 removal/absence proof, and tombstone. Browser roles
  receive no storage policy, credential, private path, or signed URL. Five v2
  operations and generated TypeScript contracts are covered by 186 API tests
  and the full repository regression/build gates. The migration and 21 pgTAP
  assertions are authored but unexecuted because the local Docker/Supabase
  database is unavailable. No web asset UI or visual-analysis claim was added.
- Extended M5/M6 through E-5051 with a disabled-by-default private asset web
  workflow. The v2 generated-contract client now reserves and uploads exact
  locally hashed bytes with stable retry keys, lists public lifecycle state,
  verifies response hardening/size/SHA-256 before access, previews only images
  and sandboxed PDFs, verifies MP4 before download, preserves viewer read-only
  access, and requires explicit deletion confirmation. Exact public parsing
  rejects storage coordinates and lifecycle mismatch. Full web/API regression,
  builds, contract drift, claims/secrets, and a self-starting Chromium fixture
  with zero Axe violations pass. The fixture uses an in-memory client because
  local Auth/database/S3 are unavailable; no full-stack storage or visual
  analysis claim is made.
- Added the partial M3 BullMQ migration seam (E-5037): a separate Node
  dispatcher with worker-only PostgreSQL credentials, exact outbox-to-job
  proof, durable run-control updates, and safe lifecycle; a strict Python v2
  binding and worker claim; and pinned BullMQ-Python active-to-delayed
  deferrals for database-authorized admission/provider retry only. Frozen
  install, 121 NestJS tests, 7 Node live-Redis tests, 294 Python passes plus 2
  expected platform skips, one live Python redelivery proof, contracts,
  claims/secrets, and SCA pass. ARQ remains the default; both new runtimes
  reject production. The new migration/pgTAP and complete database-backed
  equivalence gate remain blocked by the unavailable disposable SIMULA
  database.
- Added the first governed M4 behavioral-engine slice (E-5038): independent
  provenance graphs, population sampling, evidence-bound psychographic tiered
  fleets, seeded multi-round actions, bounded memory, replayable crowd pulse,
  typed heuristic scores, explicitly non-population dispersion, bound
  qualitative synthesis, synthetic interviews, matched A/B comparison, and
  replay receipts. A new private FastAPI service admits only the exact
  deterministic experimental provider, requires rotating bearer authority,
  enforces strict JSON/body/schema limits, propagates cancellation/deadline/cost
  failures, and ships a pinned non-root container. A disabled worker client
  rejects unsafe origins, proxy inheritance, redirects, encoded/oversized or
  malformed responses, and wrong-command results. Targeted tests pass 34/34;
  the full non-integration Python gate passes 335 plus 2 expected platform
  skips. Durable worker/database integration, real datasets/providers, held-out
  validation, deletion proof, and deployment remain open.
- Extended E-5038 through the durable experimental execution seam: compact
  schema-v2 `behavioral_demo_run_v1` manifests, a dedicated NestJS admission
  route, deterministic BullMQ job identity across cancellation, real private
  Uvicorn-to-worker HTTP proof, exact 16 MB canonical result hashing, an
  attempt/lease-bound worker receipt, and one atomic PostgreSQL result,
  provider-receipt, event, audit, and terminal-state command. The generated
  OpenAPI client and contract inventory include the new route. A separate
  prespecified evaluation harness enforces disjoint development/holdout IDs,
  exact rows, baseline completeness, deterministic checksums, constant-score
  disclosure, and sparse-subgroup suppression while labelling the result
  benchmark-only. Focused tests pass 132/132; complete non-integration Python
  passes 357 plus 2 expected
  Windows skips; NestJS passes 124/124; web passes 76/76; contracts pass 4/4;
  TypeScript workspace lint/type checks, changed-slice Ruff/mypy,
  forbidden-claim policy, contract drift, and static SQL parsing pass. The
  migration and 18-assertion pgTAP test remain unexecuted because the
  disposable SIMULA database is unavailable; M4 remains open.
- Closed the local M4 read-contract gap: generated the behavioral-report JSON
  Schema from the Python authority, added semantic action/score/evidence
  validation, and exposed only the authenticated tenant-scoped report summary
  at `/api/v2/runs/{run_id}/behavioral-result`. The canonical event payload
  remains private. Current gates pass 359 Python tests plus 2 expected Windows
  skips, 131 NestJS tests, 76 web tests, 5 contract tests, and all 9 TypeScript
  lint/typecheck tasks.
- Started M5 through E-5039 with three additive CLI-created migrations:
  canonical artifact normalization into context/fleet/action/memory/evidence
  tables; versioned evidence rights, aggregate observed outcomes, sparse-cell
  controls, and private asset metadata/bucket policy; and a prespecified
  benchmark-only protocol/run/member registry. Added 49 focused pgTAP
  assertions and updated the 35-assertion exact catalog inventory. Vector
  storage remains gated until a rights-cleared corpus, admitted embedding
  model, recall target, and query-plan budget exist. Static SQL parsing and all
  code regressions pass; database/storage execution remains blocked by the
  unavailable disposable SIMULA stack.
- Added E-5046 and accepted ADR-0013: pgvector storage is private,
  model-versioned, content-checksum-bound, and tenant-bound. A worker-only
  idempotent function ingests vectors only for an admitted model; an API-only
  member-scoped function performs exact cosine search over one immutable graph,
  capped at 500 nodes and 50 returned matches. Admission requires explicit
  rights and benchmark fields, including 100 queries, semantic relevance at 10
  of at least 0.8, and exact recall at 10 of 1.0. The migration admits no model,
  creates no vector rows, and exposes no product HTTP route. Twenty-one focused
  pgTAP assertions, exact catalog allowlists, and the restore-head contract are
  updated. Disposable database execution remains blocked.
- Started M6 through E-5040 with generated context-graph and benchmark-only
  evaluation schemas plus an authenticated
  `/api/v2/runs/{run_id}/behavioral-evidence` route. The route binds the
  complete graph to normalized row/result metadata and returns only bounded,
  ordered evidence counts and sample event IDs; private actions, memories,
  fleets, and canonical bytes remain inaccessible. NestJS passes 138 tests,
  contracts pass 6, all 13 TypeScript lint/type/test tasks pass, and complete
  non-integration Python remains 359 passes plus 2 expected Windows skips.
  Real database/RLS/HTTP/browser proof and the remaining campaign-lab workflow
  are still open.
- Expanded E-5040 through the feature-gated campaign-lab result path: canonical
  payloads now atomically derive forced-RLS public fleet, round, and ten-agent
  replay summaries; the evidence UI renders fleet, timeline, fixed
  synthetic/not-testimony interviews, recommendations, and limitations; and a
  strict matched A/B/retest route/UI/export reports candidate-minus-baseline
  deltas with no winner, lift, causal, human-preference, or population claim.
  Local gates pass 154 NestJS tests, 98 web tests, 7 contract tests, 371 Python
  tests plus 2 expected Windows skips, and the optimized Next build. Database
  reset/RLS/browser/accessibility/export proof remains blocked.
- Started M7 through E-5041 with disabled-by-default Sentry error capture and
  OpenTelemetry trace export for NestJS, Next.js, Python API/worker/private AI
  engine. Exporters require exact deployment identity and safe endpoints;
  Sentry removes request/identity/URL/body/message data, OTel emits only generic
  span names and allowlisted operational attributes, and local audit/Prometheus
  controls remain independent. Added an eight-panel Grafana dashboard, six
  runbook-linked Prometheus alerts, and a static cardinality/inventory gate.
  Hosted telemetry, alert delivery/recovery, load, restore, rollback, signed
  release, staging, and production authorization remain open.
- Added E-5042 deterministic engine-envelope rehearsal. Ten demo, five
  200-agent x 3-round, and two maximum 2,000-agent x 5-round samples stay within
  local 1s/10s/60s budgets, the maximum result is 9,480,823 of 16,000,000
  bytes, peak traced allocation is about 81 MB, exact provider-call binding and
  zero deterministic cost hold, and each repeated case has one stable checksum.
  This is local sequential synthetic evidence, not hosted concurrency or a real
  provider cost/SLO claim.
- Added E-5043 target deployment/release controls: pinned non-root NestJS
  control-plane image, Railway control-plane/private-engine manifests, web
  public telemetry build inputs, and a fail-closed tag/manual workflow that
  builds a normalized bundle and Python wheels, checks SHA-256, creates a pinned
  GitHub/Sigstore provenance attestation, verifies it, then uploads. Eight
  static deployment tests and isolated Node runtime assembly pass. Docker Linux
  remains unavailable; no image, workflow, signature, tag, deployment, or
  release is claimed. Added a staged rollback runbook that prohibits dual
  control-plane writes and dual queue consumption, plus current-head restore
  contract checks that discover every `api`/`private` table.
- Added E-5044 repository technical privacy/security review covering telemetry,
  tenant/data boundaries, synthetic-output interpretation, provider/prompt
  abuse, and supply-chain/release identity. Default-off and redaction controls
  are confirmed locally; production is explicitly rejected pending named
  approvals, vendor terms/configuration, hosted redaction, disposable RLS/
  storage/browser/deletion, external-provider, independent security, recovery,
  and go/no-go evidence.
- Added E-5045 immutable refinement-and-retest and sanitized run audit history.
  Ambiguous retries reuse the created stimulus version plus stable append/run
  idempotency keys. The bounded v2 route projects only durable run states, safe
  reasons, service class, support correlation, and timestamps; actor identity,
  metadata, payloads, prompts, agent memory, and rationale remain private.
  Local gates pass 156 API tests, 107 web tests, 7 contract tests, and 371
  Python tests with 2 expected Windows skips.
- Added fixture-backed M6 browser QA using an ephemeral ES256/JWKS-verified
  Supabase session and real Next/client contracts. Desktop/mobile report,
  evidence, audit, keyboard refinement/retest, matched comparison export,
  injected audit failure, and recovery pass with zero final console errors.
  Axe reports zero violations after correcting score definition-list semantics
  and making the horizontally scrollable interaction timeline focusable. This
  does not replace database-backed RLS E2E or human screen-reader evidence.

## 2026-07-20

- Completed the Phase 2 code remediation and independent re-review tree (E-5033): enforced database/provider receipt invariants, verified receipt provenance UI, source-state-preserving dynamic restore proof, exact historical-canary Gitleaks suppression, trusted API/worker log identity, live worker liveness/readiness, and an audited least-privilege operator run-control path. Root `pnpm verify` passes 68 pgTAP, 64 API, 11 browser, 231 Python plus 2 expected Windows skips, 57 web, and 23 complete integration tests. Seed-free hosted migration history matches through `20260720083000`; linked lint and security advisors are clean; exact-head GitHub Actions `29728979248` is green on `72f1a66cf1a0be8e589f9ef5f88a84eb5cfcb10d`.
- Stopped implementation at the Phase 2 boundary. Formal exit remains open for human assistive-technology evidence and GitHub-plan-blocked enforceable required checks. User-facing deletion orchestration and a full application-compatible staging restore remain explicit Medium findings; existing performance-advisor notices remain monitored under R-031. Phase 3 and production deployment are not authorized.

## 2026-07-19

- Closed three Phase 2 Medium findings: immutable authored-demo audience v2 with full canonical manifest/checksum and retained v1 history; owned, fixed-lifetime, resource-scoped Redis admission markers with atomic run user/organization buckets and durable-success-safe promotion; and governed stable RFC 9457 codes plus a base-aware breaking OpenAPI diff gate in Linux/Windows CI. Root `pnpm verify` passes the complete 59-pgTAP/61-API/9-browser/204-Python/43-web/22-integration/build/security/SCA gate. Migration `20260719050000` is applied seed-free to hosted Supabase with exact history parity, clean linked lint/security advisors, one active v2 checksum, stable runtime selection, and temporary CREATE revocation (E-5032). Phase 2 remains open for the human accessibility proof, full independent exit re-review, GitHub-plan required-check governance, user-facing deletion/cache orchestration, and application-compatible staging restore.
- Pushed implementation commit `d912b21` and narrow history-secret false-positive correction `5ab8f6c`; GitHub Actions run `29718093557` passes all four jobs on the exact follow-up head. Pinned Gitleaks 8.30.1 scans all 70 reachable commits with no leak.

## 2026-07-18

- Completed the P2-07 implementation quality gate: clean local reset/lint/41 pgTAP assertions, ten real API/Redis/worker integrations, five browser flows, repository quality/security, Linux mypy, hosted migration equality through `20260718094407`, and GitHub Actions `29640798631` pass (E-5022). The required independent Phase 2 exit review remains open; Phase 3 is not authorized. No hosted API/worker deployment, seed/customer data, or provider call was added.
- Completed P2-06 recovery scope: explicit provider preflight-unavailable and rate-limited failures now use the same database-authorized 5s/30s/three-attempt budget as timeout; unknown provider errors remain terminal. Unit and three-case real integration proofs pass, with no new hosted migration required (E-5021). P2-07 is now active.
- Closed P2-06 failure-experience proof: a terminal failed run now states that SIMULA will not substitute a result, and `E2E-FAIL-001` proves the browser stops polling and never fetches/render a result. Full five-test browser gate and repository quality gates pass (E-5020); no hosted schema or application state changed.
- Added P2-06 bounded poison-dispatch handling: definite transport failures are recorded through the existing dispatch CAS; expired unconfirmed tenth claims terminalize worker-only as `dispatch_exhausted`, with run/audit/event evidence. The real local race proves poison failure and cancellation-wins behavior; migration `20260718070000` is applied and catalog-verified on hosted Supabase without seed or application data (E-5019).
- Added P2-06 stale-dispatch recovery: a worker-only, lock-ordered reconciler supersedes expired/declared-lost outbox generations, preserves the authoritative run, bounds recovery at three generations, and records recovery/exhaustion audit/event evidence. Dispatcher cadence and a real local stale-lease integration prove the replacement path. Migration `20260718060000` is applied and catalog-verified on hosted Supabase without seed or application data (E-5018).
- Added P2-06 database-authoritative timeout retry behavior: 5s then 30s ARQ defers, three-attempt terminal exhaustion, typed worker failure resolutions, real local integration proof, and worker-owner `private` schema-CREATE cleanup. Migration `20260718050000` is applied and verified on hosted Supabase without seed or application data (E-5017).
- Applied and verified P2-06 hosted Supabase schema migrations through `20260718041000`: cancellation command/finalizer ACLs are present, temporary command-owner `api`/`private` CREATE grants are revoked, and local/remote migration history matches. No seed, customer data, application deployment, or runtime credential was added (E-5016).
- Added P2-06 cancellation sub-slice: owner/editor-only empty-JSON cancel command, narrow RLS/event/audit authority, cancellation-aware dispatcher, cancel-wins worker completion/failure, generated contracts, workspace control, and local API/worker/browser race proof. Full `pnpm check` passes (E-5015). Retry/exhaustion/poison recovery remains active; Phase 2 is not complete.
- Closed P2-05 trustworthy result experience: added a route-ID guard, bounded shared polling with terminal telemetry, exhaustive state and unavailable-output rendering, canonical signed-64-bit seed handling, non-reconstructed legacy provenance, complete frozen limits/config display, keyboard/mobile/Axe browser evidence, a server-owned result rollback switch, and executable forbidden-claim checks. Disposable local E2E and full `pnpm check` pass (E-5014); no hosted application or schema mutation was made.

## 2026-07-17

- Inspected empty repository state and read all available governing documents.
- Recorded that `AGENTS.md` is absent and singular `AGENT.md` is present.
- Recorded that directory has no Git metadata.
- Created Phase 0 Obsidian directory structure.
- Created master roadmap and active Phase 0 ExecPlan.
- Initialized project home, charter, state, risk register, evidence ledger, and glossary.
- Started three parallel, read-only public research streams: competitors, methodology, and data/governance.
- Created all required research, product, methodology, data, architecture, security, QA, operations, and decision-note drafts.
- Verified 33/33 required Obsidian artifacts have minimum YAML frontmatter.
- Verified no application scaffold directories exist.
- Received data-source/data-governance research summary: official Philippine candidates, legal/privacy/ethics sources, rights limitations, and 32 classified claims. Subagent made no file edits.
- Started architecture/security read-only research in the freed parallel slot.
- Received methodology research summary: 26 classified claims and 23 sources covering frames, synthetic populations, psychometrics, LLM failure evidence, calibration, uncertainty, fairness, reproducibility, and disclosure. Subagent made no file edits.
- Started UX/market-positioning read-only research in the freed parallel slot.
- Received competitor/product research summary: 35 classified findings covering Predikta, Netopia AI, seven comparator platforms, and independent research context. Subagent made no file edits.
- Re-audited M0 after continuation instruction. Current Git state is `No commits yet on main`; corrected stale current-state wording while retaining initial no-Git observation.
- M0 acceptance audit passed after correction: 33/33 required artifacts/YAML, 11/11 plan sections, 35/35 Home links, and no application scaffold.
- Received UX/positioning research summary: 25 classified findings, prioritized JTBD hypotheses, exact positioning, and trust/uncertainty/accessibility requirements. Subagent made no file edits.
- No application code created.
- Re-audited repository architecture, phase gates, and verification coverage with three independent read-only agents.
- Re-ran live public research for Predikta, Netopia/competitors, methodology, Philippine data/privacy, architecture/security, and UX/accessibility; retained vendor claims as REPORTED and private internals as UNKNOWN.
- Replaced placeholder competitor teardowns, landscape, evidence matrix, and evidence ledger with claim-level cited synthesis.
- Completed discovery-depth product/JTBD, methodology/validation, data/provenance, architecture/security, privacy, deployment, accessibility, and risk requirements.
- Added current PSA, NPC AI/privacy/scraping, Next.js, Vercel, Railway, Supabase, OWASP, NIST, W3C, and AAPOR evidence with access dates and limitations.
- Confirmed no application scaffold, tests, migrations, CI, or production resource changes were created during Phase 0 synthesis.
- Started independent final evidence-quality review and exit audit.
- Independent Phase 0 review found 0 Critical, 4 High, and 3 Medium. Fixed evidence-matrix IDs/classes, unsupported demand wording, teardown claim atomicity, negative-search scope, mixed classifications, stale state, and missing Phase 1 plan.
- Created `plans/active/001-phase-1-product-and-architecture-definition.md` with 11/11 required ExecPlan sections, ADR backlog, milestones, tests, rollback, and exit gate.
- Re-audit found 0 Critical, 2 High, and 1 Medium. Fixed final matrix classification, recorded resolution evidence, and refreshed audit counts.
- Phase 0 close audit passed: 33/33 required notes/YAML, 36/36 Home links, 49/49 vault wikilinks, 53 evidence IDs defined, 49 referenced, 0 undefined, and no application scaffold/manifests/code/tests/migrations/CI.
- Marked Phase 0 complete and moved its ExecPlan to `plans/completed/`.
- Activated Phase 1 Product and Architecture Definition. No Phase 2 application scaffold created.
- Rechecked official living platform docs/changelog and registries. Recorded Node 24.18 LTS, Python 3.14.6, Next 16.2.10, exact npm/PyPI direct pins, Supabase exposure/deprecation/pgmq hazards, and pinned CLI help evidence.
- Approved Phase 2 prototype job/scope, Given/When/Then acceptance, engineering/human-comprehension thresholds, and a falsifiable user-discovery plan without claiming customer demand.
- Approved methodology/output/uncertainty fail-closed policy: deterministic demo fixture only, values estimate nobody, no predictive/calibrated/measured output or validity threshold.
- Approved authored-data admission, provenance, privacy, retention, and real-provider gates.
- Accepted ADR-0002 through ADR-0010 for toolchain, auth/tenancy/RLS, data lifecycle, API/contracts, queue/state, provider/mock, environments/migrations, observability, and export/share deferral.
- Added authorization/RLS matrix, threat-control-test matrix, requirement traceability, Definition of Ready/Done, and ordered vertical Phase 2 backlog.
- Phase 1 M0–M3 complete. Audit before independent review: 54/54 Markdown YAML, 122/122 Obsidian links, 62 evidence IDs, 0 undefined referenced IDs, and no application scaffold/manifests/migrations/CI.
- Independent Phase 1 audit found 0 Critical and 6 High; Phase 1 remained active. Replaced Supabase Queues with Railway Redis/ARQ plus transactional outbox to satisfy the governing Railway queue mandate.
- Corrected invalid accessibility package pin to `@axe-core/playwright 4.12.1`; verified 18/18 npm pins, 18/18 PyPI pins, and Redis 8.2.7 image manifest.
- Closed organization contract with atomic create/list acceptance, exact database-command/API/idempotency/audit behavior, tests, and explicit Phase 2 membership-mutation deferral.
- Closed cancel/result CAS race with exact 202/200 outcomes and dual-winner tests.
- Rewrote every Phase 2 story with acceptance, ADR, threat, boundary, contract/data, test, dependency, observability, security/privacy, fixture/external-state, and rollback fields.
- Approved exact Phase 2 input, rate, quota, timeout, worker concurrency, polling, Redis memory, outbox, and queue-backpressure limits plus failure codes/tests.
- Post-correction local audit passed: 55/55 YAML, 127/127 wikilinks, 64 evidence IDs with zero undefined, 7/7 stories with all DoR fields, 21/21 acceptance IDs traced, 18/18 npm pins, 18/18 PyPI pins, Redis image manifest valid, and zero application scaffold files.
- Focused re-audit corrected the state-machine contradiction so `cancel_requested` can advance only to `canceled`; corrected stale acceptance evidence from 19/19 to 21/21.
- Full independent re-audit reported 0 Critical/2 High/0 Medium: browser-reachable Data API grants could bypass FastAPI controls/atomic helpers and expose membership roster data; user-scoped outbox confirmation could falsely acknowledge work never placed in Redis. Phase 1 remained blocked.
- Replaced caller-token Data API domain access with server-only TLS Postgres access: application schemas are not Data API exposed; `anon`/`authenticated` have no application grants; separate `simula_api`/`simula_worker` roles are NOINHERIT/NOBYPASSRLS; verified JWT claims are transaction-local; reads retain RLS; all writes use complete private atomic helpers; membership reads are self-only.
- Restricted outbox claim/confirm/fail to `simula_worker`. FastAPI may best-effort enqueue but never confirms; ambiguous Redis outcomes remain pending for dispatcher retry/deduplication.
- Added Supabase connection/role and Psycopg evidence E-4025/E-4026; pinned Psycopg 3.3.4, binary 3.3.4, and pool 3.3.1.
- A combined CPython 3.14/Linux `uv` solve exposed that ARQ 0.28 requires redis-py `<6`, contradicting the prior client 8.0.1 pin. Replaced it with compatible redis-py 5.3.1; all 21 direct Python pins now resolve together. Exact Redis server 8.2.7 integration remains a Phase 2 test.
- npm peer audit exposed openapi-typescript 7.13.0's TypeScript `^5.x` contract, contradicting TypeScript 7.0.2. Selected TypeScript 5.9.3 and completed the 31-pin baseline. Independent replay then exposed ESLint 10 peer overrides in config-next plugins; selected ESLint 9.39.5 and reran all 31 exact pins with exit 0 and zero peer/ERESOLVE warnings.
- Security re-audit caught ARQ 0.28's default pickle deserializer. Mandated one bounded canonical stdlib-JSON codec for the full ARQ envelope across API/dispatcher/inspector/worker, with no pickle fallback, versioned queue rollout, and malformed/noncanonical/duplicate/oversize/pickle-gadget tests (E-4028).
- Recorded ARQ's official maintenance-only status as R-020. Exact Phase 2 runtime proof and a Phase 5 queue-library reassessment/tested exit plan are mandatory before staging.
- Current correction audit: 55/55 YAML, 128/128 wikilinks, 54/54 Home links, 68 evidence IDs with zero undefined/duplicates, 21/21 acceptance IDs traced, 7/7 Ready stories, 31/31 npm pins resolve with zero peer warnings, 21/21 Python pins resolve together, and zero application scaffold files. Final independent re-audit pending.
- Final queue/security review hardened exact ARQ v0.28 envelope schemas, fail-closed `f=''` handling, custom connect/command timeouts, target-ZSET dispatch proof, Postgres job/run/generation binding, bounded confirmation/capacity handshakes, Redis-loss generations, run→outbox lock order, three-slot organization occupancy including active cancellation leases, and deterministic adversarial tests.
- Independent Phase 1 exit review passed: 0 Critical / 0 High / 0 Medium. Gate integrity remained 55/55 YAML, 128/128 links, 54/54 Home links, 68 unique evidence IDs, 21/21 acceptance criteria traced, 7/7 Ready stories, and zero scaffold.
- Marked Phase 1 complete, moved its reviewed ExecPlan to `plans/completed/`, and activated the 11-section Phase 2 Walking Skeleton ExecPlan. No hosted resource or production action authorized.
- Started P2-01 only after the Phase 2 ExecPlan was active. Added exact pnpm/Turbo and uv workspaces, health-only Next/FastAPI surfaces, payload-inert worker shell, shared canonical JSON codec, generated contracts, local Redis/Supabase config, digest-pinned non-root containers, and immutable-action CI. Added no domain tables, product routes, hosted resources, or deployment.
- Bootstrapped and verified exact user-local Node 24.18.0, pnpm 11.13.1, and signed/checksummed PSF Python 3.14.6 because system defaults drift and uv 0.11.19's managed catalog lacks the Windows 3.14.6 artifact. Kept exact manifest requirements intact.
- Committed reproducible `pnpm-lock.yaml` and `uv.lock` inputs. Frozen checks pass; Python 3.14.6 imports ARQ 0.28.0, redis-py 5.3.1, and hiredis 3.4.0.
- Removed redundant `vite-tsconfig-paths 6.1.1` after Vite 8.1.5 emitted native `resolve.tsconfigPaths` guidance; this also removed deprecated `tsconfck 3.1.6`. Updated ADR-0002 with evidence and rollback.
- npm audit found GHSA-qx2v-qp2m-jg93 in Next's PostCSS 8.4.31 transitive. Added a narrow pnpm workspace override to accepted PostCSS 8.5.19; clean build/tests and npm audit now report no known vulnerability. Python audit also reports none outside intentionally skipped editable local packages.
- Green P2-01 host/static evidence: exact toolchain plus effective pnpm-policy checks; frozen installs; format/lint; strict TypeScript/mypy over 28 Python source files; 4 web/contract and 31 Python unit tests; Next production build; byte-level generated-contract drift; 141-file secret baseline; Compose parse; Supabase config parse; and exact Redis/Node/Python/uv image manifest verification.
- Added exact Redis/ARQ integration proofs for startup, JSON-only enqueue/retry/result, hard subprocess crash/redelivery with one idempotent durable effect, and SIGTERM shutdown. Added CI container builds, import probes, and non-root user inspection. These checks are implemented but not claimed passing locally.
- Initial independent M0 static review found one High test-safety defect and one Medium route-inventory defect. Removed all Redis database flushes and runtime URL overrides; tests now use fixed loopback DB 15, dedicated namespaced keys, and exact-key cleanup. Disabled FastAPI docs/ReDoc/OpenAPI HTTP routes and added exhaustive route/404 tests. Runtime findings remain explicitly outside the claim while R-021 is open.
- Hardened the same boundary after advisory review: accept only canonical UUIDv4/v7 correlation, return generic correlated 500s, log allowlisted request/error fields, disable raw Uvicorn access logs, format stdlib/Uvicorn output as JSON, and detect Supabase secret keys plus privileged legacy JWTs with canary tests.
- Independent M0 re-audit then reported 0 Critical / 0 High / 4 Medium: ignored pnpm 11 policy, High-only npm audit threshold, fail-open readiness, and missing Supabase CI lifecycle. Moved policy into `pnpm-workspace.yaml`, regenerated `autoInstallPeers: false` lock state, asserted effective config, made Moderate audit findings blocking, added environment-specific readiness 503 tests, and added secret-suppressed disposable Supabase start/Auth-health/reset/always-stop CI steps.
- Final independent M0 static confirmation passed: 0 Critical / 0 High / 0 Medium; 31/31 Python unit tests and effective pnpm/Supabase CLI controls were rechecked. R-021 runtime evidence remains unproven, so M0 stays open and M1 stays untouched.
- Diagnosed Docker Desktop runtime failure from primary local logs: WSL distro import fails with `HCS_E_HYPERV_NOT_INSTALLED`; hardware virtualization and/or Windows Virtual Machine Platform is unavailable. Recorded R-021, kept M0 open, and stopped before P2-02. Remediation requires user/administrator host action plus reboot or an authorized Linux CI host.
- Re-audited the host without mutation: `Win32_Processor` reports `VirtualizationFirmwareEnabled=False`; WSL 2 is installed with no distribution; Windows optional-feature inspection requires elevation. Narrowed R-021 to the directly observed firmware blocker while retaining the unverified OS-feature dependency.
- Added `pnpm verify:m0-runtime`: a local-only M0 harness for exact Redis/ARQ/Supabase/container proof with credential-suppressed Supabase output and cleanup after failure or interruption.
- Independent harness safety review found 0 Critical / 2 High / 2 Medium: inherited Docker/Compose routing could target remote/unrelated state; cleanup lacked invocation ownership; commands could hang or die on SIGTERM without cleanup; and the health probe honored proxies/redirects.
- Corrected all four findings: sanitize routing/hosted overrides; validate and re-inject only local Unix-socket/named-pipe Docker context; pin Compose file/project; use a lock plus per-run Compose/Supabase/image namespaces and temp config; refuse occupied ports/prior namespaces; add timeouts and interruption handling; use direct loopback HTTP; and add sixteen routing/ownership/concurrency/timeout/termination/proxy tests.
- Follow-up reviews found POSIX descendant escalation, Windows abrupt-owner cleanup, POSIX nonzero-leader sweeping, and shared-lock safety gaps. Added independent PGID liveness/escalation, bounded pipe handling, a handshake launcher inside a validated kill-on-close Windows Job Object, forced-owner and stubborn/nonzero-descendant proofs, and a UID-private no-follow lock. Side corrections discard both credential-bearing streams, give probes exact run-owned containers, and make absent-image cleanup non-failing. The 26-test harness suite passes all 24 Windows-applicable tests with 2 expected POSIX-only skips.
- Final independent runtime-harness safety review passed: 0 Critical / 0 High / 0 Medium. The reviewer independently reran the applicable harness suite, Ruff, and mypy. This closes harness findings only; R-021 keeps the Docker-backed M0 runtime gate open.
- Frozen installs, exact toolchain, format/lint, strict types over 30 Python files, 4 JS/TS tests, 55 Python unit tests plus 2 expected POSIX-only skips, production build, contract drift, 143-file secret scan, and Moderate-blocking SCA pass. Adversarial preflight ignores hostile routing overrides and selects `desktop-linux` at the local named pipe; both it and the exact full gate exit 1 at read-only Docker inspection with zero Docker processes, temp runtime directories, or hosted link marker. M0 remains open and M1 remains untouched.
- Obsidian integrity recheck passes: 56/56 governed Markdown files have required frontmatter; 145/145 wikilinks resolve; 80 unique evidence IDs have zero duplicates or undefined references; the active ExecPlan retains sections 1–11.
- No hosted Supabase/Railway/Vercel resource, production data, production deployment, Git commit, or push was created.
- User restored the Windows virtualization/Docker prerequisite. Live inspection reports Docker 29.6.1 on the local `desktop-linux` named-pipe context; R-021 moved from Open to Mitigated.
- Corrected Docker Desktop Redis publication by retaining the host binding `127.0.0.1:6379` while making the Compose DNS bridge non-internal. Containers still resolve `redis:6379`; LAN exposure remains absent. This is trusted local-development topology only, not production networking.
- Hardened `pnpm verify:m0-runtime` to parse canonical Compose JSON and fail closed unless Redis uses only `simula-private`, that network is non-internal, and exactly TCP 6379 is published on `127.0.0.1`. Added valid-boundary plus malformed/public/internal/extra-port/extra-network tests; 30 Windows-applicable harness tests pass with 2 expected POSIX skips.
- Exact M0 runtime gate passed after remediation: Redis 8.2.7 non-root runtime, 3/3 ARQ integration tests, local Supabase Auth health/reset, pinned web/API/worker builds, non-root user checks, API/worker probes, and exact cleanup. Audit found zero run-owned containers, networks, images, temp directories, or hosted link markers.
- Current-tree `pnpm check`, Moderate-blocking npm/Python SCA, and Compose parse pass. M0 / P2-01 is complete; M1 / P2-02 is unlocked. No hosted or production mutation occurred.
- Post-close Obsidian audit passes: 56/56 governed Markdown frontmatter, 145/145 resolved wikilinks, 81 unique evidence IDs with zero duplicates/undefined references, and all 11 active-plan sections.
- Started P2-02 only after the exact Docker-backed P2-01 gate passed. Added the first ordered Supabase migration, privileged global-role bootstrap, authored local Auth identities, generated database types, and no HTTP/product UI surface.
- Implemented `api`/`private` schemas with 14 constrained tables, four least-privilege runtime/owner roles, global default function denial, forced RLS, 16 exact policies, self-only membership reads, composite tenant foreign keys, and one complete security-definer organization command with idempotency and atomic audit.
- Reset-driven testing exposed and corrected PostgreSQL 17 restricted-role bootstrap semantics, schema-scoped default-ACL ineffectiveness, retained `PUBLIC EXECUTE`, qualified `NULLIF`/`EXTRACT` grammar misuse, generated Auth identity email insertion, ACL/comment ordering after ownership transfer, and a correlated membership-policy name-resolution bug that blocked second-organization creation.
- Added `pnpm verify:m1-database`: two zero-state resets, database lint, 32 catalog-derived pgTAP assertions, authored Auth sign-in, anon/authenticated Data API denial, real-session claim/pool-reset/direct-DML/two-tenant/idempotency/atomic-rollback/deletion-skeleton tests, and byte-exact generated database-type drift.
- M1 gates pass: 32/32 pgTAP, 2/2 database boundary tests, 5/5 combined Redis/database integration, full `pnpm check`, 157-file secret scan, and Moderate-blocking npm/Python SCA. P2-02 is complete; P2-03 is active. No hosted/production mutation, commit, push, or runtime credential was created.
- P2-03 implementation added atomic project/stimulus-version database commands and adversarial tests; FastAPI JWT/JWKS/claim-pool/RFC-9457/idempotency/version APIs; generated OpenAPI/TypeScript; and an accessible Supabase-Auth-only web journey. Static evidence passes API 19/19, web 5/5, strict Python, web TypeScript/lint/format, generated declaration build, and Next production build (E-5010). M2 remains open: Docker's WSL engine is unavailable and the exact Node/pnpm bootstrap is not in the current shell for reset-driven local integration and Playwright E2E. No hosted/production mutation, commit, push, or runtime credential was created.
- Docker Desktop recovery: local data disks were backed up; Desktop updated to 4.82.0; Virtual Machine Platform/WSL and hypervisor boot were enabled; and Windows reboot restored Docker Server 29.6.1. Exact Node 24.18.0/pnpm 11.13.1 now resolves through a repo-local Corepack shim.
- P2-03 local runtime gate passes: two reset-driven Supabase database gates, lint, 32 pgTAP tests, 20 API unit tests, four real Auth/API/database integration tests, generated database types/contracts, web TypeScript/ESLint, five deterministic one-fork Vitest tests, and Next production build. Corrected Windows psycopg Proactor incompatibility with a selector loop before API startup; corrected the disposable viewer-membership fixture to use controlled UUID literals and the local superuser. Playwright E2E and independent M2 review remain pending (E-5010).
- Corrected the actual Windows Uvicorn launch: deprecated global event-loop policy does not affect Python 3.14's `asyncio.run`, so `python -m simula_api` now owns `asyncio.Runner(loop_factory=asyncio.SelectorEventLoop)`. A real local browser run then proved unauthenticated redirect, authored local sign-in, organization/project/stimulus creation, and a second immutable version with distinct hashes. Clean resets, database/API/contracts/types, format/lint/strict types, five web tests, and production build all pass. Independent M2 review remains pending (E-5010).
- Post-M1 Obsidian audit passes: 56/56 governed Markdown frontmatter, 145/145 resolved wikilinks, 55 Home links, 82 unique evidence IDs with zero duplicates/undefined references, and all 11 active-plan sections.
- P2-03/M2 completed after final independent review. Added atomic Redis rate buckets, boundary pre-auth IP protection/refund, 24-hour replay bypass, non-destructive Redis test isolation, JSON-only media enforcement, JWT/JWKS negative/rotation proof, denied-action audit evidence, and correlated browser-readable CORS errors. Final local gates pass: 32 pgTAP, 26 API tests, five integrations, generated database/OpenAPI checks, web tests/build, secret scan, and npm/Python SCA.
- User authorized hosted migration for Supabase project `ywiwmczccktwzqyhzhiz`, but the CLI has no access token and `supabase link` stopped before mutation. Future migrations require linked-history inspection and a seed-free `db push --linked --include-roles --dry-run` before push.
- Hosted P2-03 database bootstrap completed for Supabase project `ywiwmczccktwzqyhzhiz`: verified active MCP access as `kurtgav`, created the four least-privilege roles without passwords, applied the three checked-in migrations with no seed data, reconciled history to Git versions, and verified 9 empty `api` plus 5 empty `private` RLS tables (E-5011).
- Started P2-04 with the strict shared ARQ v0.28 transport codec: exact job/result envelope validation, canonical stdlib JSON, 16 KiB/depth/string bounds, canonical UUID/job binding, duplicate-key/noncanonical/pickle rejection, and tuple-only argument normalization. Full format/lint/type/test/build/contract/secret/SCA gate passed before commit `74d70ec`.
- P2-04 now has a generated closed deterministic result contract, pure no-egress mock, and expanded ARQ adversarial/liveness suite. Full format/lint/type/test/build/contract/secret/SCA gate passed (110 tests, 2 platform skips) before commit `9649549`.
- Added durable P2-04 run authority in commit `9342d37`: immutable authored-demo fixture, atomic frozen run/event/outbox/idempotency/audit command, strict execute-only worker helper ACL, lease/result state transitions, 128 KiB result bound, and 41 reset-driven pgTAP catalog/ACL checks. The same ordered migration is applied and verified on hosted project `ywiwmczccktwzqyhzhiz` (E-5012); only the pre-existing unrelated `public.rls_auto_enable` advisor warning remains.
- Added strict P2-04 worker runtime: role-pinned worker settings, bounded `simula_worker` function-only PostgreSQL gateway, durable outbox claim/enqueue/target-queue-proof/confirm dispatcher, strict ARQ worker wiring, and deterministic lease-bound completion/failure handling. Full repository gate passes (127 tests, 2 expected platform skips) before commit.
- Added P2-04 FastAPI run authority: atomic run-create command, post-commit non-confirming best-effort publish, normalized idempotency rate scope, per-run read limits, ETag state read, `404` pre-publication result read, and generated typed OpenAPI contracts. Format/lint/types/tests/build/generated-contract/secret/SCA gates pass (131 tests, 2 expected platform skips) before commit.
- Closed P2-04 async run proof: real local API/Auth → durable outbox → Redis/ARQ → role-pinned worker → result/retry flow passes after a clean reset. Five forward least-privilege migrations remove unnecessary table-write locks, correct failure enum typing, and grant only required extension-schema usage; the ordered set is applied and verified on hosted Supabase (E-5013).
- Completed P2-05/P2-06 and the P2-07 self-audit snapshot through E-5022: trustworthy result/provenance UI, cancellation, bounded retry, stale-dispatch recovery, poison terminalization, backpressure/capacity proof, hosted schema alignment, and green CI. These remain historical implementation gates, not a passing independent Phase 2 exit review.
- Ten bounded independent review assignments returned Phase 2 exit FAIL with unresolved High findings across acceptance, database/worker authority, API/auth, accessibility, CI/supply chain, observability/operations, and method/data controls. Reopened M6/P2-07; Phase 3 remains blocked (E-5023).
- First risk-first remediation added seed-free hosted/local migration `20260718113445_20260718111531_phase2_lease_attempt_hardening`: expired workers cannot heartbeat or fail a run, and stale/canceled attempts close terminally. Clean reset/lint/41 pgTAP/type/advisor, 10/10 run integrations, full repository gate, hosted function ownership/security configuration, zero hosted security-advisor lints, and GitHub Actions `29643209461` for `941f825` pass (E-5024).
- Added seed-free hosted/local migration `20260718122048_20260718120823_phase2_result_contract_boundary`: the durable worker completion boundary now rejects arbitrary nested result JSON and frozen-provenance drift. Clean reset/lint/41 pgTAP/type/advisor, 11/11 run integrations, exact hosted/local function hashes/ACL, zero hosted security-advisor lints, and GitHub Actions `29644323387` for `1ee0f5a` pass (E-5025). SEC-EGRESS-001 remained open at this increment and was subsequently closed by E-5027; other exit findings stay open.
- Aligned the worker with the approved transport/state contract: shared ARQ `max_tries=16`, exact 8s/2s/10s transaction deadlines, current-lease heartbeat before provider work, and content-free allowlisted binding/claim rejection telemetry. Worker/core, strict type, real database flow, secret, complete integration, browser, container, and GitHub Actions `29644976771`/`29645325104` pass (E-5026). R-027 is Mitigated for the Phase 2 deterministic provider.
- Added a fail-closed deterministic-worker probe and mandatory hardened container gate: no network namespace egress, loopback-only interface proof, read-only root filesystem, all capabilities dropped, `no-new-privileges`, and the existing non-root runtime. Focused local gates and GitHub Actions `29645866096` for `b732a5b` pass (E-5027). With E-5025, R-026 is Mitigated; real-provider egress remains prohibited.
- Added checksum-pinned Syft/Grype, CycloneDX SBOM/full-report artifacts for all three images, and a fixable High/Critical admission gate. Its first run correctly rejected vulnerable runtime-only npm/Undici; `bffe83b` removed npm/Corepack from the web runtime, and GitHub Actions `29646850994` passed in 8m38s with six archived reports (E-5028). R-025 remains Open for history secrets, Windows, root-command, and required-check governance gaps.
- Added checksum-pinned Gitleaks scanning of every reachable commit plus an exact Windows Server 2025 quality/SCA gate. GitHub Actions `29647492906` passed history scanning over 52 commits, the Windows gate, the disposable Linux foundation, and hardened three-image container scanning. R-025 remains Open for one root verification command and plan-blocked required-check governance (E-5029).
- Consolidated the disposable Linux foundation checks behind root `pnpm verify`. GitHub Actions `29648136756` passed that command plus history, exact Windows, no-egress, SBOM, and fixable High/Critical image gates in about eight minutes. R-025 now remains Open only for GitHub-plan-blocked enforceable required checks (E-5030).
- Closed the remaining API/auth/observability High code themes: rate admission now precedes sign-in audit writes; API/worker runtime metrics cover bounded database, pool, migration/RLS, run-state, cancellation, lease, delivery, transition, retry, failure, and provider signals; the local run-disable contract has an executable runbook. Root `pnpm verify` passes the complete 58-pgTAP/60-API/9-browser/198-Python/43-web/22-integration gate. Migration `20260719040000` is applied seed-free to hosted Supabase with exact history parity and clean linked lint. The final audit keeps Phase 2 open for independent re-review, human screen-reader proof, required-check governance, and five Medium findings (E-5031).
