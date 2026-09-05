# Remediation route and role coverage — 2026-09-05

This is a source inventory and verification ledger, not exhaustive runtime
coverage. Routes were enumerated from current Next.js page/route files and both
checked-in OpenAPI documents. Every API operation below is NOT RUN by this UX
subtask. Earlier production snapshots in routes.json and roles.json describe the
earlier audited deployment, not this local refactor.

## Production release verified - 5 September 2026, 11:30 UTC

This section supersedes earlier application-release-pending statements while
preserving their historical evidence. All seven application components now run
source eb0ea931a180f1912f690be5648a6fb4a6557ab0: web, admin, API, control plane,
dispatcher, worker and private engine. Required CI33961708123 and signed
release33961707670 passed. Three release migrations are applied
through20260905104327; V4 readiness remains available for rollback
compatibility. Both canonical Vercel domains were promoted after
protected-candidate checks.

The production smoke receipt passes52 assertions: exact public service
SHA/health and frontend security headers; fresh synthetic
owner/editor/viewer/nonmember sessions; application invitation acceptance;
editor/viewer reads; viewer mutation, editor owner-only action, nonmember and
platform-admin denials; signed-out API/browser boundaries; actual browser
campaign submission, worker success, exact run restoration and visible
Synthetic-only limits. A separate real behavioral run completed in about5
seconds with same-command durable ID replay, saved experimental deterministic
result and artifact checksum. Six protected-candidate desktop/mobile checks and
production result1440/390 checks had zero Axe violations, document overflow and
page errors.

This is bounded production verification, not every route/role or scientific
validity. Report/calibration/backtest complex lifecycle evidence remains local
synthetic engineering proof; registry approval remains a separate administrator
process. Hosted superadmin pagination beyond100, production
recovery/load/retention and approved legal/privacy/terms text remain unverified
or unresolved. Direct private SSH health checks were blocked by unavailable
authorized keys; startup/config/image identities and an actual behavioral job
provide fallback evidence, not direct private-endpoint coverage. Immediate
publication means that job alone does not attribute dispatch to the dispatcher.

Evidence: production-smoke-verification.json, production-backend-promotion.json
and production-frontend-promotion.json in docs/audit/2026-09-05, plus the
release result and protected-candidate receipt. Promotion receipts retain the
initial frontend failure and subsequent recovery; they are not a claim of an
uninterrupted first attempt. Synthetic fixture records are retained by UUID, not
existing-user replacements.

## Browser pages

| App / route                                     | Authentication and role boundary from source                                                       | UX verification in this remediation                                                                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web `/`                                         | Public                                                                                             | PRODUCTION candidate desktop/mobile PASSED; canonical exact-SHA health/header checks PASSED                                                          |
| Web `/data-use`                                 | Public operating information; no legal promises                                                    | PASSED final public navigation/evidence-limit suite                                                                                                  |
| Web `/sign-in`                                  | Public login; Supabase credentials required to establish session                                   | PRODUCTION candidate desktop/mobile and fresh owner/editor/viewer normal login PASSED                                                                |
| Web `/sign-up`                                  | Public registration; Supabase availability/policy controls completion                              | PASSED desktop/mobile shell; registration completion NOT RUN                                                                                         |
| Web `/forgot-password`                          | Public recovery request                                                                            | PASSED desktop/mobile shell; email delivery NOT RUN                                                                                                  |
| Web `/reset-password`                           | Recovery session required for successful password update                                           | PASSED desktop/mobile shell; successful password update NOT RUN                                                                                      |
| Web `/organizations`                            | `requireAuthenticatedPage`; API returns caller-visible organizations                               | PRODUCTION synthetic owner organization creation PASSED; other directory cases not exhaustive                                                        |
| Web `/organizations/[organizationId]/dashboard` | Authenticated; API dashboard permissions gate owner controls                                       | PRODUCTION synthetic owner creation/navigation PASSED; full dashboard role matrix NOT RUN                                                            |
| Web `/organizations/[organizationId]/projects`  | Authenticated; `can_create_projects` gates creation                                                | PRODUCTION synthetic owner project creation PASSED                                                                                                   |
| Web `/projects/[projectId]`                     | Authenticated; tenant-visible project; dashboard permissions gate modifications/runs               | Source reviewed; owner/editor/viewer runtime NOT RUN                                                                                                 |
| Web `/projects/[projectId]/methodology`         | Authenticated; `can_create_runs` gates builders/run forms                                          | Source reviewed; owner/editor/viewer runtime NOT RUN                                                                                                 |
| Web `/projects/[projectId]/evidence`            | Authenticated page; project lookup; protected evidence submissions visibly unavailable             | Source reviewed; owner/editor/viewer runtime NOT RUN                                                                                                 |
| Web `/projects/[projectId]/campaign-lab`        | Authenticated; API tenant/permission checks remain authoritative                                   | PRODUCTION owner creation/simulation/reload and editor/viewer reads PASSED; selected API role denials PASSED; complex evidence lifecycles local only |
| Web `/runs/[runId]`                             | Invalid IDs 404; otherwise authenticated; permission checks gate refinement                        | Source reviewed; owner/editor/viewer runtime NOT RUN                                                                                                 |
| Admin `/`                                       | Supabase verified user/session; platform API 401→sign-in and 403→unauthorized; superadmin expected | PASSED component tests with fixtures; real superadmin/non-admin runtime NOT RUN                                                                      |
| Admin `/sign-in`                                | Public login shell                                                                                 | PRODUCTION protected candidate desktop/mobile shell PASSED; local real superadmin login PASSED                                                       |
| Admin `/unauthorized`                           | Public denial page                                                                                 | NOT RUN                                                                                                                                              |
| Web `/api/health`                               | Public health handler                                                                              | PRODUCTION canonical exact source SHA200 and security headers PASSED                                                                                 |
| Admin `/api/health`                             | Public health handler                                                                              | PRODUCTION canonical exact source SHA200 and security headers PASSED                                                                                 |

## Role coverage

Role authorization must be established by API/database permission results, not
hidden UI alone. `requireAuthenticatedPage` proves a session, not tenant
membership. Source review observed gates such as `can_create_projects`,
`can_create_runs`, `can_manage_team`, and `can_manage_settings`; it does not
prove production enforcement.

| Role/state              | Intended boundary observed                                      | Current remediation runtime                                                                                                                     |
| ----------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed out              | Public pages; protected page redirect to sign-in                | PRODUCTION protected page redirect and campaign API401 PASSED; public candidate shells checked                                                  |
| Owner                   | API-granted project/run/team/settings capabilities              | PRODUCTION synthetic organization/project/campaign creation, worker result/reload and behavioral run PASSED; full owner controls not exhaustive |
| Editor                  | API-granted editing/run capabilities, no assumed owner controls | PRODUCTION shared campaign API/browser read PASSED; owner-only invitation denied                                                                |
| Viewer                  | Read access; mutating controls depend on false permission flags | PRODUCTION shared campaign API/browser read PASSED; campaign mutation denied                                                                    |
| Nonmember               | Resource visibility and access rejected by API                  | PRODUCTION fresh authenticated nonmember campaign access denied                                                                                 |
| Superadmin              | Dedicated platform dashboard via role-registry API              | LOCAL actual admin pagination beyond100 PASSED; production large-directory role journey NOT RUN                                                 |
| Expired/invalid session | Redirect/rejection; no assumed access from client state         | NOT RUN                                                                                                                                         |

## API contract route inventory

Bearer schemes below are copied from each operation’s OpenAPI `security` field,
falling back to document security. A missing scheme is reported as not declared,
not proof that a handler is publicly accessible. Fine-grained roles are not
inferred from HTTP verbs. Runtime role tests remain NOT RUN for every row; each
controller/gateway/RLS boundary requires separate verification.

### packages/contracts/openapi.json

| Method | Route                                                                            | Contract auth            | Role verification    | Runtime              |
| ------ | -------------------------------------------------------------------------------- | ------------------------ | -------------------- | -------------------- |
| GET    | `/api/v1/audiences/demo`                                                         | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/auth-events`                                                            | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/backtests/bound/runs/{run_id}`                             | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/backtests/{run_id}`                                        | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/calibrations/{run_id}`                                     | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/campaigns`                                                 | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/campaigns`                                                 | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}`                                   | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| PATCH  | `/api/v1/campaign-lab/campaigns/{campaign_id}`                                   | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/artifacts`                         | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/audit`                             | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/backtests`                         | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/backtests/admissions`              | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/backtests/commitments`             | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/backtests/history`                 | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/backtests/inputs`                  | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/backtests/sources`                 | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/calibrations`                      | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/calibrations/from-runs`            | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/calibrations/from-runs`            | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/cohorts`                           | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/cohorts`                           | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/compliance/reviews`                | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/compliance/runs/{run_id}`          | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/cultural-evaluations`              | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/forecasts`                         | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/interviews`                        | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/reports`                           | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/reports/from-runs`                 | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/reports/from-runs`                 | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/research`                          | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/research`                          | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/runs`                              | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/simulations`                       | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/surveys/forms`                     | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/surveys/forms`                     | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/surveys/forms/{form_id}`           | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/surveys/forms/{form_id}/responses` | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/surveys/import`                    | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/surveys/preview`                   | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/variants`                          | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/variants`                          | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/forecast-datasets`                                         | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/forecasts/{run_id}`                                        | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/interviews/runs/{run_id}`                                  | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/interviews/{artifact_id}`                                  | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/reports/bound/runs/{run_id}`                               | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/reports/bound/runs/{run_id}/export`                        | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/reports/bound/runs/{run_id}/review`                        | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/reports/runs/{run_id}`                                     | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/reports/{artifact_id}`                                     | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/research/runs/{run_id}`                                    | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/simulations/{run_id}`                                      | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/simulations/{run_id}/cancel`                               | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/campaign-lab/simulations/{run_id}/clone`                                | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/simulations/{run_id}/events`                               | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/simulations/{run_id}/results`                              | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/simulations/{run_id}/status`                               | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/campaign-lab/surveys/runs/{run_id}`                                     | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/exports/{export_id}`                                                    | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/me`                                                                     | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/methodology/registry`                                                   | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/organization-invitations/accept`                                        | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/organizations`                                                          | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/organizations`                                                          | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/organizations/{organization_id}/admin-summary`                          | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/organizations/{organization_id}/audiences`                              | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/organizations/{organization_id}/audiences`                              | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/organizations/{organization_id}/audit`                                  | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/organizations/{organization_id}/dashboard`                              | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/organizations/{organization_id}/feature-flags`                          | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| PUT    | `/api/v1/organizations/{organization_id}/feature-flags/{flag_key}`               | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/organizations/{organization_id}/feedback`                               | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/organizations/{organization_id}/feedback`                               | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/organizations/{organization_id}/invitations`                            | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/organizations/{organization_id}/invitations`                            | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/organizations/{organization_id}/projects`                               | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/organizations/{organization_id}/projects`                               | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/platform-admin/dashboard`                                               | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/projects/{project_id}`                                                  | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| PATCH  | `/api/v1/projects/{project_id}`                                                  | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/projects/{project_id}/methodology-previews`                             | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/projects/{project_id}/runs`                                             | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/projects/{project_id}/simulation-configurations`                        | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/projects/{project_id}/simulation-configurations`                        | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/projects/{project_id}/stimuli`                                          | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/projects/{project_id}/variant-groups`                                   | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/projects/{project_id}/variant-groups`                                   | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| DELETE | `/api/v1/report-shares/{share_id}`                                               | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/reports/{report_id}/exports`                                            | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/reports/{report_id}/shares`                                             | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/reports/{report_id}/shares`                                             | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/runs/{run_id}`                                                          | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/runs/{run_id}/cancel`                                                   | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/runs/{run_id}/methodology-reports`                                      | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/runs/{run_id}/provenance`                                               | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/runs/{run_id}/report`                                                   | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/runs/{run_id}/reports`                                                  | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/runs/{run_id}/result`                                                   | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/shared-reports/{token}`                                                 | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v1/stimuli/{stimulus_id}/versions`                                         | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v1/variant-groups/{variant_group_id}/comparison`                           | HTTPBearer               | NOT RUN individually | NOT RUN individually |
| GET    | `/health/live`                                                                   | Not declared in contract | NOT RUN individually | NOT RUN individually |
| GET    | `/health/ready`                                                                  | Not declared in contract | NOT RUN individually | NOT RUN individually |

### apps/api/openapi.json

| Method | Route                                                                 | Contract auth            | Role verification    | Runtime              |
| ------ | --------------------------------------------------------------------- | ------------------------ | -------------------- | -------------------- |
| GET    | `/api/v2/audiences/demo`                                              | supabase                 | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v2/projects/{project_id}/campaign-evidence/survey-calibrations` | supabase                 | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v2/projects/{project_id}/campaign-evidence/backtests`           | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/campaign-evidence/{evidence_id}`                             | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/campaign-evidence/{evidence_id}/events`                      | supabase                 | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v2/campaign-evidence/{evidence_id}/cancel`                      | supabase                 | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v2/auth-events`                                                 | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/me`                                                          | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/methodology/registry`                                        | supabase                 | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v2/organizations/{organization_id}/audiences`                   | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/organizations/{organization_id}/audiences`                   | supabase                 | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v2/projects/{project_id}/simulation-configurations`             | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/projects/{project_id}/simulation-configurations`             | supabase                 | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v2/projects/{project_id}/methodology-previews`                  | supabase                 | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v2/projects/{project_id}/variant-groups`                        | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/projects/{project_id}/variant-groups`                        | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/variant-groups/{variant_group_id}/comparison`                | supabase                 | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v2/runs/{run_id}/methodology-reports`                           | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/runs/{run_id}/report`                                        | supabase                 | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v2/reports/{report_id}/exports`                                 | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/exports/{export_id}`                                         | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/organizations/{organization_id}/dashboard`                   | supabase                 | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v2/organizations`                                               | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/organizations`                                               | supabase                 | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v2/organizations/{organization_id}/deletion`                    | supabase                 | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v2/organizations/{organization_id}/projects`                    | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/organizations/{organization_id}/projects`                    | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/projects/{project_id}`                                       | supabase                 | NOT RUN individually | NOT RUN individually |
| PATCH  | `/api/v2/projects/{project_id}`                                       | supabase                 | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v2/projects/{project_id}/runs`                                  | supabase                 | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v2/projects/{project_id}/behavioral-demo-runs`                  | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/runs/{run_id}`                                               | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/runs/{run_id}/audit-history`                                 | supabase                 | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v2/runs/{run_id}/cancel`                                        | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/runs/{run_id}/result`                                        | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/runs/{run_id}/behavioral-result`                             | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/runs/{run_id}/behavioral-evidence`                           | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/runs/{run_id}/behavioral-comparison`                         | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/runs/{run_id}/provenance`                                    | supabase                 | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v2/stimuli/{stimulus_id}/assets`                                | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/stimuli/{stimulus_id}/assets`                                | supabase                 | NOT RUN individually | NOT RUN individually |
| PUT    | `/api/v2/stimulus-assets/{asset_id}/content`                          | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/stimulus-assets/{asset_id}/content`                          | supabase                 | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v2/stimulus-assets/{asset_id}/deletion`                         | supabase                 | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v2/stimulus-assets/{asset_id}/visual-profile`                   | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/api/v2/stimulus-assets/{asset_id}/visual-profile`                   | supabase                 | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v2/projects/{project_id}/stimuli`                               | supabase                 | NOT RUN individually | NOT RUN individually |
| POST   | `/api/v2/stimuli/{stimulus_id}/versions`                              | supabase                 | NOT RUN individually | NOT RUN individually |
| GET    | `/health/live`                                                        | Not declared in contract | NOT RUN individually | NOT RUN individually |
| GET    | `/health/ready`                                                       | Not declared in contract | NOT RUN individually | NOT RUN individually |

## Current runtime evidence from primary — supersedes earlier NOT RUN cells

On the isolated local stack (real Supabase Auth/PostgreSQL, FastAPI, Redis and
worker), browser login, empty-organization creation, dashboard navigation,
project creation, campaign creation and a repeated simulation completed. The
worker persisted a succeeded result. Campaign selection and result restoration
after refresh pass after fixing duplicated initialization requests that caused
real429 responses; result reads respect Retry-After.

- Public landing/sign-in/data-use suite:5 PASSED. First retry had wrong fixture
  port; next identified stale space-sensitive button names. Both were corrected
  against rendered UI without reducing assertions.
- Landing, sign-in, sign-up, forgot-password and reset-password shells:10
  desktop/mobile combinations returned200 with no overflow or Axe violations.
  Password delivery and successful reset are not established by these shell
  checks.
- Campaign creation/selection + succeeded results after reload:1440px/390px
  checks PASSED, no page errors, overflow or Axe violations. Simulation output
  remained explicitly Synthetic-only; this proves mechanics, not prediction.
- Organization/dashboard synthetic rendering checks remain separate from these
  real API-backed owner actions. Viewer/nonmember browser journeys and real
  superadmin pagination remain NOT RUN by primary.

Evidence files: `output/playwright/current-public-verification.json`,
`output/playwright/live-campaign-verification.json`,
`output/playwright/live-campaign-run-verification.json`. No hosted deployment.

## Current source refresh and bound report evidence

The 19 Next pages/handlers and both contract operation inventories were
refreshed from current source. Individual API cells deliberately remain NOT RUN
individually: successful flows below do not prove every role on every operation.
Source and contracts include the newer bound-report review/list/export
lifecycle; these changes require the final signed release and hosted migration
before production claims.

`output/playwright/live-bound-report-verification.json` records real local API,
worker and Supabase sessions using synthetic engineering data: refresh
restoration, author self-approval rejection, independent approval, bound export
and revocation all passed. Desktop1440/mobile390 both report no overflow or Axe
violations and errors is empty. This establishes bounded lifecycle mechanics,
not predictive validity or exhaustive role coverage.

## Bound backtest source refresh

Six new bound backtest routes are included from current contracts: inputs,
commitments, admitted outcomes, history, sources and bound-run result. The
implementing agent confirmed stable100-row pagination with next_offset for
inputs/history/sources. Nine backend and four new UI tests passed, including
pagination, temporal/author/checksum/coverage constraints, legacy422 and
preserved insufficiency status. Actual backtest browser/worker flow remains in
progress at this refresh; no production or predictive-validation evidence is
implied. No new DDL is required by this slice.

## Superseding admin runtime evidence

Admin / and /sign-in now pass actual local Supabase superadmin authentication
and API-backed offset pagination beyond100 over121 new synthetic organizations
(141 total). Next/Previous, reload and no-match filtering navigation pass.
Desktop1440/mobile390 have no page errors, Axe violations or document overflow
after the table-container positioning fix. Earlier superadmin NOT RUN cells are
superseded only for this bounded local case; ordinary-user denial, production
pagination and every platform capability remain unverified. See
REMEDIATION_UX.md and output/playwright/live-admin-pagination-verification.json.

## Superseding local backtest and final evidence flow

PASSED actual local API/worker preregistration, later independent source
admission, real custodian file upload, bound result and refresh. Bound and
legacy backtest result reads reject revoked source with422; fixture source
restored afterward. Report/calibration/backtest at1440/390 total six views have
zero Axe violations, document overflow or page errors.47focused Python
and28Campaign Lab tests pass. Evidence:
output/playwright/live-bound-backtest-api-verification.json,
live-final-evidence-verification.json and live-backtest-source-rights.json (also
copied into this audit directory by primary).

This supersedes earlier actual-backtest-flow pending statements only for the
exercised synthetic engineering fixture. Observed result is Scoped historical
comparison with campaignCount1; independent scientific validity is not
established. Registry approval remains a separate administrator process. New
Campaign Lab emergency-pause guard/migration is an open rollout blocker; no new
application production deployment is claimed.
