# Remediation route and role coverage — 2026-09-05

This is a source inventory and verification ledger, not exhaustive runtime
coverage. Routes were enumerated from current Next.js page/route files and both
checked-in OpenAPI documents. Every API operation below is NOT RUN by this UX
subtask. Earlier production snapshots in routes.json and roles.json describe the
earlier audited deployment, not this local refactor.

## Browser pages

| App / route                                     | Authentication and role boundary from source                                                       | UX verification in this remediation                                                                                                    |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Web `/`                                         | Public                                                                                             | PASSED desktop/mobile axe, overflow, workflow selection, skip-link focus before dependency relinking; latest footer link pending rerun |
| Web `/data-use`                                 | Public operating information; no legal promises                                                    | NOT RUN; added browser test, blocked by dependency-relink server failure                                                               |
| Web `/sign-in`                                  | Public login; Supabase credentials required to establish session                                   | PASSED desktop shell axe/overflow before final auth copy/style refinement; credential flow NOT RUN                                     |
| Web `/sign-up`                                  | Public registration; Supabase availability/policy controls completion                              | NOT RUN                                                                                                                                |
| Web `/forgot-password`                          | Public recovery request                                                                            | NOT RUN                                                                                                                                |
| Web `/reset-password`                           | Recovery session required for successful password update                                           | NOT RUN                                                                                                                                |
| Web `/organizations`                            | `requireAuthenticatedPage`; API returns caller-visible organizations                               | Source reviewed; authenticated runtime NOT RUN                                                                                         |
| Web `/organizations/[organizationId]/dashboard` | Authenticated; API dashboard permissions gate owner controls                                       | Source reviewed; owner/editor/viewer runtime NOT RUN                                                                                   |
| Web `/organizations/[organizationId]/projects`  | Authenticated; `can_create_projects` gates creation                                                | Source reviewed; owner/editor/viewer runtime NOT RUN                                                                                   |
| Web `/projects/[projectId]`                     | Authenticated; tenant-visible project; dashboard permissions gate modifications/runs               | Source reviewed; owner/editor/viewer runtime NOT RUN                                                                                   |
| Web `/projects/[projectId]/methodology`         | Authenticated; `can_create_runs` gates builders/run forms                                          | Source reviewed; owner/editor/viewer runtime NOT RUN                                                                                   |
| Web `/projects/[projectId]/evidence`            | Authenticated page; project lookup; protected evidence submissions visibly unavailable             | Source reviewed; owner/editor/viewer runtime NOT RUN                                                                                   |
| Web `/projects/[projectId]/campaign-lab`        | Authenticated; API tenant/permission checks remain authoritative                                   | NOT RUN by this subtask; independent agent owns campaign verification                                                                  |
| Web `/runs/[runId]`                             | Invalid IDs 404; otherwise authenticated; permission checks gate refinement                        | Source reviewed; owner/editor/viewer runtime NOT RUN                                                                                   |
| Admin `/`                                       | Supabase verified user/session; platform API 401→sign-in and 403→unauthorized; superadmin expected | PASSED component tests with fixtures; real superadmin/non-admin runtime NOT RUN                                                        |
| Admin `/sign-in`                                | Public login shell                                                                                 | PASSED component link/origin tests; browser/credentials NOT RUN                                                                        |
| Admin `/unauthorized`                           | Public denial page                                                                                 | NOT RUN                                                                                                                                |
| Web `/api/health`                               | Public health handler                                                                              | NOT RUN by this subtask                                                                                                                |
| Admin `/api/health`                             | Public health handler                                                                              | PASSED existing unit test in admin suite; live HTTP NOT RUN                                                                            |

## Role coverage

Role authorization must be established by API/database permission results, not
hidden UI alone. `requireAuthenticatedPage` proves a session, not tenant
membership. Source review observed gates such as `can_create_projects`,
`can_create_runs`, `can_manage_team`, and `can_manage_settings`; it does not
prove production enforcement.

| Role/state              | Intended boundary observed                                      | Current remediation runtime                                            |
| ----------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Signed out              | Public pages; protected page redirect to sign-in                | Public pages verified; all protected redirects NOT RUN by this subtask |
| Owner                   | API-granted project/run/team/settings capabilities              | NOT RUN                                                                |
| Editor                  | API-granted editing/run capabilities, no assumed owner controls | NOT RUN                                                                |
| Viewer                  | Read access; mutating controls depend on false permission flags | NOT RUN                                                                |
| Nonmember               | Resource visibility and access rejected by API                  | NOT RUN                                                                |
| Superadmin              | Dedicated platform dashboard via role-registry API              | NOT RUN; fixture component test only                                   |
| Expired/invalid session | Redirect/rejection; no assumed access from client state         | NOT RUN                                                                |

## API contract route inventory

Bearer schemes below are copied from each operation’s OpenAPI `security` field,
falling back to document security. A missing scheme is reported as not declared,
not proof that a handler is publicly accessible. Fine-grained roles are not
inferred from HTTP verbs. Runtime role tests remain NOT RUN for every row; each
controller/gateway/RLS boundary requires separate verification.

### packages/contracts/openapi.json

| Method | Route                                                                            | Contract auth            | Role verification | Runtime |
| ------ | -------------------------------------------------------------------------------- | ------------------------ | ----------------- | ------- |
| GET    | `/api/v1/audiences/demo`                                                         | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/auth-events`                                                            | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/backtests/{run_id}`                                        | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/calibrations/{run_id}`                                     | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/campaigns`                                                 | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/campaign-lab/campaigns`                                                 | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}`                                   | HTTPBearer               | NOT RUN           | NOT RUN |
| PATCH  | `/api/v1/campaign-lab/campaigns/{campaign_id}`                                   | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/artifacts`                         | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/audit`                             | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/backtests`                         | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/calibrations`                      | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/cohorts`                           | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/cohorts`                           | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/compliance/reviews`                | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/compliance/runs/{run_id}`          | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/cultural-evaluations`              | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/forecasts`                         | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/interviews`                        | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/reports`                           | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/research`                          | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/research`                          | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/runs`                              | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/simulations`                       | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/surveys/forms`                     | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/surveys/forms`                     | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/surveys/forms/{form_id}`           | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/surveys/forms/{form_id}/responses` | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/surveys/import`                    | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/campaigns/{campaign_id}/variants`                          | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/campaign-lab/campaigns/{campaign_id}/variants`                          | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/forecast-datasets`                                         | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/forecasts/{run_id}`                                        | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/interviews/runs/{run_id}`                                  | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/interviews/{artifact_id}`                                  | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/reports/runs/{run_id}`                                     | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/reports/{artifact_id}`                                     | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/research/runs/{run_id}`                                    | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/simulations/{run_id}`                                      | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/campaign-lab/simulations/{run_id}/cancel`                               | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/campaign-lab/simulations/{run_id}/clone`                                | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/simulations/{run_id}/events`                               | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/simulations/{run_id}/results`                              | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/simulations/{run_id}/status`                               | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/campaign-lab/surveys/runs/{run_id}`                                     | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/exports/{export_id}`                                                    | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/me`                                                                     | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/methodology/registry`                                                   | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/organization-invitations/accept`                                        | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/organizations`                                                          | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/organizations`                                                          | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/organizations/{organization_id}/admin-summary`                          | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/organizations/{organization_id}/audiences`                              | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/organizations/{organization_id}/audiences`                              | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/organizations/{organization_id}/audit`                                  | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/organizations/{organization_id}/dashboard`                              | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/organizations/{organization_id}/feature-flags`                          | HTTPBearer               | NOT RUN           | NOT RUN |
| PUT    | `/api/v1/organizations/{organization_id}/feature-flags/{flag_key}`               | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/organizations/{organization_id}/feedback`                               | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/organizations/{organization_id}/feedback`                               | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/organizations/{organization_id}/invitations`                            | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/organizations/{organization_id}/invitations`                            | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/organizations/{organization_id}/projects`                               | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/organizations/{organization_id}/projects`                               | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/platform-admin/dashboard`                                               | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/projects/{project_id}`                                                  | HTTPBearer               | NOT RUN           | NOT RUN |
| PATCH  | `/api/v1/projects/{project_id}`                                                  | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/projects/{project_id}/methodology-previews`                             | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/projects/{project_id}/runs`                                             | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/projects/{project_id}/simulation-configurations`                        | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/projects/{project_id}/simulation-configurations`                        | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/projects/{project_id}/stimuli`                                          | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/projects/{project_id}/variant-groups`                                   | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/projects/{project_id}/variant-groups`                                   | HTTPBearer               | NOT RUN           | NOT RUN |
| DELETE | `/api/v1/report-shares/{share_id}`                                               | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/reports/{report_id}/exports`                                            | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/reports/{report_id}/shares`                                             | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/reports/{report_id}/shares`                                             | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/runs/{run_id}`                                                          | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/runs/{run_id}/cancel`                                                   | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/runs/{run_id}/methodology-reports`                                      | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/runs/{run_id}/provenance`                                               | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/runs/{run_id}/report`                                                   | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/runs/{run_id}/reports`                                                  | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/runs/{run_id}/result`                                                   | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/shared-reports/{token}`                                                 | HTTPBearer               | NOT RUN           | NOT RUN |
| POST   | `/api/v1/stimuli/{stimulus_id}/versions`                                         | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/api/v1/variant-groups/{variant_group_id}/comparison`                           | HTTPBearer               | NOT RUN           | NOT RUN |
| GET    | `/health/live`                                                                   | Not declared in contract | NOT RUN           | NOT RUN |
| GET    | `/health/ready`                                                                  | Not declared in contract | NOT RUN           | NOT RUN |

### apps/api/openapi.json

| Method | Route                                                                 | Contract auth            | Role verification | Runtime |
| ------ | --------------------------------------------------------------------- | ------------------------ | ----------------- | ------- |
| GET    | `/api/v2/audiences/demo`                                              | supabase                 | NOT RUN           | NOT RUN |
| POST   | `/api/v2/projects/{project_id}/campaign-evidence/survey-calibrations` | supabase                 | NOT RUN           | NOT RUN |
| POST   | `/api/v2/projects/{project_id}/campaign-evidence/backtests`           | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/campaign-evidence/{evidence_id}`                             | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/campaign-evidence/{evidence_id}/events`                      | supabase                 | NOT RUN           | NOT RUN |
| POST   | `/api/v2/campaign-evidence/{evidence_id}/cancel`                      | supabase                 | NOT RUN           | NOT RUN |
| POST   | `/api/v2/auth-events`                                                 | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/me`                                                          | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/methodology/registry`                                        | supabase                 | NOT RUN           | NOT RUN |
| POST   | `/api/v2/organizations/{organization_id}/audiences`                   | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/organizations/{organization_id}/audiences`                   | supabase                 | NOT RUN           | NOT RUN |
| POST   | `/api/v2/projects/{project_id}/simulation-configurations`             | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/projects/{project_id}/simulation-configurations`             | supabase                 | NOT RUN           | NOT RUN |
| POST   | `/api/v2/projects/{project_id}/methodology-previews`                  | supabase                 | NOT RUN           | NOT RUN |
| POST   | `/api/v2/projects/{project_id}/variant-groups`                        | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/projects/{project_id}/variant-groups`                        | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/variant-groups/{variant_group_id}/comparison`                | supabase                 | NOT RUN           | NOT RUN |
| POST   | `/api/v2/runs/{run_id}/methodology-reports`                           | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/runs/{run_id}/report`                                        | supabase                 | NOT RUN           | NOT RUN |
| POST   | `/api/v2/reports/{report_id}/exports`                                 | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/exports/{export_id}`                                         | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/organizations/{organization_id}/dashboard`                   | supabase                 | NOT RUN           | NOT RUN |
| POST   | `/api/v2/organizations`                                               | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/organizations`                                               | supabase                 | NOT RUN           | NOT RUN |
| POST   | `/api/v2/organizations/{organization_id}/deletion`                    | supabase                 | NOT RUN           | NOT RUN |
| POST   | `/api/v2/organizations/{organization_id}/projects`                    | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/organizations/{organization_id}/projects`                    | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/projects/{project_id}`                                       | supabase                 | NOT RUN           | NOT RUN |
| PATCH  | `/api/v2/projects/{project_id}`                                       | supabase                 | NOT RUN           | NOT RUN |
| POST   | `/api/v2/projects/{project_id}/runs`                                  | supabase                 | NOT RUN           | NOT RUN |
| POST   | `/api/v2/projects/{project_id}/behavioral-demo-runs`                  | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/runs/{run_id}`                                               | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/runs/{run_id}/audit-history`                                 | supabase                 | NOT RUN           | NOT RUN |
| POST   | `/api/v2/runs/{run_id}/cancel`                                        | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/runs/{run_id}/result`                                        | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/runs/{run_id}/behavioral-result`                             | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/runs/{run_id}/behavioral-evidence`                           | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/runs/{run_id}/behavioral-comparison`                         | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/runs/{run_id}/provenance`                                    | supabase                 | NOT RUN           | NOT RUN |
| POST   | `/api/v2/stimuli/{stimulus_id}/assets`                                | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/stimuli/{stimulus_id}/assets`                                | supabase                 | NOT RUN           | NOT RUN |
| PUT    | `/api/v2/stimulus-assets/{asset_id}/content`                          | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/stimulus-assets/{asset_id}/content`                          | supabase                 | NOT RUN           | NOT RUN |
| POST   | `/api/v2/stimulus-assets/{asset_id}/deletion`                         | supabase                 | NOT RUN           | NOT RUN |
| POST   | `/api/v2/stimulus-assets/{asset_id}/visual-profile`                   | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/api/v2/stimulus-assets/{asset_id}/visual-profile`                   | supabase                 | NOT RUN           | NOT RUN |
| POST   | `/api/v2/projects/{project_id}/stimuli`                               | supabase                 | NOT RUN           | NOT RUN |
| POST   | `/api/v2/stimuli/{stimulus_id}/versions`                              | supabase                 | NOT RUN           | NOT RUN |
| GET    | `/health/live`                                                        | Not declared in contract | NOT RUN           | NOT RUN |
| GET    | `/health/ready`                                                       | Not declared in contract | NOT RUN           | NOT RUN |

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
