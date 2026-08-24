# Remediation Tracker

Final local status: **GREEN**. All five principal agents returned
`SUCCESS / PASS`; no agent is failed or blocked. Production release is
**WITHHELD**, not failed: hosted admission conditions remain deliberately
fail-closed.

| ID      | Priority | Finding                                                                      | Owner                  | Final status                                   | Acceptance evidence                                                                                        |
| ------- | -------- | ---------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| REM-001 | P1       | Retire arbitrary client-authored report persistence                          | Agent 3                | COMPLETE LOCALLY / FAIL-CLOSED                 | API/database denial, generated contracts, and integration coverage pass                                    |
| REM-002 | P1       | Consolidate and independently challenge Critical/High findings               | Orchestrator + Agent 4 | COMPLETE                                       | Findings deduplicated, severity checked, and final recheck returned `SUCCESS / PASS`                       |
| REM-003 | P1       | Establish the exact dependency/toolchain baseline                            | Orchestrator + Agent 5 | COMPLETE                                       | Node 24.18.1, pnpm 11.13.1, Python 3.14.7, uv 0.11.19, Supabase CLI 2.109.1                                |
| REM-004 | P1       | Run local quality, security, database, integration, build, and browser gates | Orchestrator           | COMPLETE                                       | Root check, SCA, secret scans, M1, M2, P2 E2E, and full integration suite pass                             |
| REM-005 | P1       | Verify hosted migration/configuration/production state without mutation      | Agent 5 + Orchestrator | COMPLETE READ-ONLY                             | Hosted topology, health, drift, migrations, variables, security, and rollback gaps recorded                |
| REM-006 | P2       | Complete browser/Axe/keyboard/console/network proof                          | Agent 4 + Orchestrator | COMPLETE LOCALLY + PUBLIC HOSTED               | Eleven real-browser E2E tests pass; public hosted desktop/mobile checks pass                               |
| REM-007 | P1       | Release only after every production admission and rollback gate passes       | Orchestrator + Agent 5 | RELEASE WITHHELD                               | Admission correctly rejected split identity, missing variables, undeployed migrations, and governance gaps |
| REM-008 | P1       | Bind survey source identity to exact payload digest and allowed use          | Agent 3                | COMPLETE / FAIL-CLOSED                         | Wrong-payload and scoped-use adversarial tests pass; no unbound payload is admitted                        |
| REM-009 | P1       | Preserve optional nonresponses and use answered-only denominators            | Agent 3                | COMPLETE                                       | Core and worker partial/all-omitted regressions pass                                                       |
| REM-010 | P1       | Prevent worker lease expiry and event-loop stalls                            | Agent 3                | COMPLETE                                       | Both workers use heartbeats and thread offload; slow/cancellation tests pass                               |
| REM-011 | P1       | Prevent self-asserted approval and cross-run evidence mixing                 | Agent 3                | COMPLETE / FAIL-CLOSED                         | Automated compliance ends without human approval; unsafe report assembly is unavailable                    |
| REM-012 | P1       | Reconcile transport and persistence body envelopes                           | Agent 3 + Orchestrator | COMPLETE                                       | Route-specific 6 MiB transport and 8 MiB bounded database envelope pass boundary tests                     |
| REM-013 | P1       | Recover migration source and unify a production release manifest             | Agent 5 + Orchestrator | SOURCE RECOVERED / RELEASE WITHHELD            | Migration is locally verified; one hosted source/image/schema/rollout/rollback identity is not yet proven  |
| REM-014 | P1       | Cover every deployable and critical gate in CI/release                       | Orchestrator           | COMPLETE LOCALLY / HOSTED RUN PENDING          | Five image builds/scans plus control-plane, integration, browser, identity, and provenance gates defined   |
| REM-015 | P1       | Split browser v1/v2 authoritative origins                                    | Orchestrator           | COMPLETE LOCALLY / HOSTED CONFIG PENDING       | Unit, development, Docker, and release contracts pass; required hosted variables are absent                |
| REM-016 | P1       | Fail-close methodology reports until immutable run binding exists            | Agent 3                | COMPLETE / FAIL-CLOSED                         | Mutation denial and explicit unavailable UI states pass                                                    |
| REM-017 | P1       | Close v2 Campaign Evidence substitution and lease duplicates                 | Agent 3                | COMPLETE                                       | TypeScript, SQL, Python, and slow-worker adversarial coverage passes                                       |
| REM-018 | P1       | Fail-close uncontrolled legacy feedback intake in production                 | Agent 3                | COMPLETE / FAIL-CLOSED                         | Production privacy denial and regression coverage pass                                                     |
| REM-019 | P1       | Resolve supply-chain findings without suppressions                           | Orchestrator           | COMPLETE LOCALLY / RELEASE ATTESTATION PENDING | Patched dependency floors, SCA, SBOM/image identity configuration, and scans pass locally                  |
| REM-020 | P1       | Align runtime problem codes with the governed inventory                      | Agent 3 + Agent 4      | COMPLETE                                       | Governed 409/410 `ProblemDetails`, generated OpenAPI, compatibility, and controller tests pass             |
| REM-021 | P1       | Remove dead report/backtest/calibration controls                             | Agent 3 + Agent 4      | COMPLETE / FAIL-CLOSED                         | Explicit unavailable panels and navigation/governance component tests pass                                 |

## Remaining release-admission actions

These are hosted release prerequisites, not failed or blocked agents:

1. Create and review one clean immutable release commit containing the audited
   changes without unrelated user artifacts.
2. Configure `NEXT_PUBLIC_SIMULA_API_V1_URL`, `NEXT_PUBLIC_SIMULA_API_V2_URL`,
   and the required web URL values in the exact Vercel/GitHub environments.
3. Run required CI/release workflows for that immutable revision and retain
   signed image/SBOM/provenance identities.
4. Enable or formally resolve leaked-password protection, branch protection,
   PITR, and hosted advisor findings.
5. Dry-run and deploy the verified migrations, then prove authenticated smoke,
   logs, rollback, and restore before labeling production green.
