# Repository Coverage Ledger

Audit target: `46b051ff6ecd2fce6e48a58f18c444f005a993a4`
Tracked files inventoried: 775
Final disposition: 763 INSPECTED; 12 EXCLUDED; 0 PENDING

Statuses are PENDING, INSPECTED, VERIFIED, or EXCLUDED. Generated source/contracts remain reviewable and are not automatically excluded; binary/reference assets are inventoried with explicit exclusion reasons.

`INSPECTED` records the assigned principal's semantic source review at the audit target. It is not a claim that every file has an isolated runtime test; executed checks and finding-to-file evidence are recorded in `TEST_AND_VERIFICATION_EVIDENCE.md` and `FULL_REPOSITORY_AUDIT.md`. `EXCLUDED` is limited to five binary/reference assets and seven deterministic schema/lock artifacts whose source manifests, generators, metadata, and freshness/security gates were inspected instead.

| File or directory | Purpose | Owning application/package | Reviewer | Inspection status | Issues found | Finding IDs | Exclusion reason |
|---|---|---|---|---|---|---|---|
| .agent/PLANS.md | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| .dockerignore | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| .editorconfig | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| .env.example | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| .gitattributes | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| .github/workflows/ci.yml | CI/deployment/operations | SIMULA | Agent 5 | INSPECTED | — | — | — |
| .github/workflows/release.yml | CI/deployment/operations | SIMULA | Agent 5 | INSPECTED | — | — | — |
| .gitignore | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| .gitleaks.toml | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| .gitleaksignore | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| .grype.yaml | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| .node-version | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| .nvmrc | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| .prettierignore | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| .python-version | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| .vercelignore | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| AGENT.md | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| BOOTSTRAP_PROMPT.md | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| README.md | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| THIRD_PARTY_NOTICES.md | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| apps/admin/eslint.config.mjs | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/next-env.d.ts | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/next.config.ts | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/package.json | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/src/app/api/health/route.test.ts | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/src/app/api/health/route.ts | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/src/app/error.tsx | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/src/app/globals.css | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/src/app/icon.svg | Admin application | SIMULA | Agent 2 | EXCLUDED | — | — | Binary/reference asset: inventory and metadata review only; excluded from line-by-line source review. |
| apps/admin/src/app/layout.tsx | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/src/app/loading.tsx | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/src/app/page.tsx | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/src/app/sign-in/page.tsx | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/src/app/sign-in/sign-in-form.tsx | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/src/app/unauthorized/page.tsx | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/src/components/admin-dashboard.test.tsx | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/src/components/admin-dashboard.tsx | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/src/components/sign-out-button.tsx | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/src/lib/platform-api.ts | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/src/lib/supabase/client.ts | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/src/lib/supabase/proxy.ts | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/src/lib/supabase/server.ts | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/src/proxy.ts | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/src/test/setup.ts | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/tsconfig.json | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/vercel-ignore.mjs | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/vercel.json | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/admin/vitest.config.ts | Admin application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/Dockerfile | NestJS control plane | SIMULA | Agent 5 | INSPECTED | — | — | — |
| apps/api/jest.database.config.cjs | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/jest.integration.config.cjs | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/openapi.json | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/package.json | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/app.module.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/application.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/application.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/assets/asset-object-store.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/assets/s3-asset-object-store.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/assets/s3-asset-object-store.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/assets/stimulus-asset.dto.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/assets/stimulus-assets.controller.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/assets/stimulus-assets.controller.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/assets/stimulus-visual-profiles.controller.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/assets/stimulus-visual-profiles.controller.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/assets/visual-profile-engine.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/assets/visual-profile-engine.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/assets/visual-profile.dto.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/assets/visual-profile.dto.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/audiences/audience.dto.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/audiences/audiences.controller.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/auth/current-identity.decorator.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/auth/identity.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/auth/supabase-auth.guard.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/auth/supabase-auth.guard.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/auth/supabase-token-verifier.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/auth/supabase-token-verifier.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/auth/unavailable-identity-verifier.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/campaign-evidence/campaign-evidence.controller.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/campaign-evidence/campaign-evidence.dto.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/campaign-evidence/campaign-evidence.service.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/config/production-admission.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/config/production-admission.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/config/redis-connection.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/config/redis-connection.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/dispatcher/dispatcher-health.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/dispatcher/dispatcher-health.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/dispatcher/dispatcher-runtime.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/dispatcher/dispatcher-runtime.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/dispatcher/dispatcher-service.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/dispatcher/dispatcher-service.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/dispatcher/main.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/dispatcher/organization-cache-purger.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/dispatcher/organization-deletion-reconciler.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/dispatcher/organization-deletion-reconciler.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/dispatcher/pg-run-outbox-database.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/dispatcher/pg-run-outbox-database.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/dispatcher/run-outbox-dispatcher.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/dispatcher/run-outbox-dispatcher.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/domain/domain-readiness.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/domain/domain-readiness.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/domain/domain-runtime.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/domain/domain-runtime.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/domain/domain.constants.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/domain/domain.module.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/domain/problem.dto.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/domain/problem.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/empty-command.dto.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/health/health.controller.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/health/health.module.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/health/health.service.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/health/health.service.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/http/command-coordination.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/http/request-contract.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/http/request-contract.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/http/request-deadline.interceptor.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/http/request-deadline.interceptor.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/identity/auth-events.controller.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/identity/identity.controller.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/identity/identity.dto.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/instrumentation.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/main.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/methodology/methodology-engine.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/methodology/methodology-engine.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/methodology/methodology.controller.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/methodology/methodology.controller.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/methodology/methodology.dto.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/methodology/optimization.controller.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/methodology/optimization.dto.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/observability/observability-config.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/observability/observability-config.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/observability/redaction.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/observability/redaction.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/openapi/export-openapi.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/openapi/openapi-document.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/organizations/cursor-codec.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/organizations/cursor-codec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/organizations/organization-gateway.port.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/organizations/organization.dto.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/organizations/organizations.controller.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/organizations/organizations.controller.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/organizations/pg-organization-gateway.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/organizations/pg-organization-gateway.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/organizations/unavailable-organization-gateway.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/projects/project.dto.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/projects/projects.controller.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/projects/projects.controller.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/queue/bullmq-simulation-queue.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/queue/bullmq-simulation-queue.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/queue/queue.constants.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/queue/simulation-job.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/queue/simulation-job.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/queue/simulation-queue.integration-spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/queue/simulation-queue.module.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/queue/simulation-queue.port.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/queue/unavailable-simulation-queue.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/rate-limits/domain-rate-limiter.integration-spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/rate-limits/domain-rate-limiter.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/rate-limits/domain-rate-limiter.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/rate-limits/organization-cache-patterns.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/runs/behavioral-comparison-validator.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/runs/behavioral-comparison-validator.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/runs/behavioral-report-validator.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/runs/behavioral-report-validator.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/runs/context-graph-validator.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/runs/context-graph-validator.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/runs/result-validator.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/runs/result-validator.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/runs/run.dto.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/runs/runs.controller.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/runs/runs.controller.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/stimuli/stimuli.controller.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/stimuli/stimulus.dto.spec.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/src/stimuli/stimulus.dto.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/test/database/bullmq-run-pipeline.database-int.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/test/database/organization-gateway.database-int.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/test/database/stimulus-assets-http.database-int.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/test/e2e/m2-global-setup.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/test/support/loopback-auth-s3.ts | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/tsconfig.build.json | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/tsconfig.json | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/api/tsconfig.spec.json | NestJS control plane | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/Dockerfile | Web application | SIMULA | Agent 5 | INSPECTED | — | — | — |
| apps/web/eslint.config.mjs | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/instrumentation-client.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/next-env.d.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/next.config.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/package.json | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/postcss.config.mjs | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/public/brand/simula-mark-minimal.png | Web application | SIMULA | Agent 2 | EXCLUDED | — | — | Binary/reference asset: inventory and metadata review only; excluded from line-by-line source review. |
| apps/web/public/images/simula/decision-horizon.png | Web application | SIMULA | Agent 2 | EXCLUDED | — | — | Binary/reference asset: inventory and metadata review only; excluded from line-by-line source review. |
| apps/web/sentry.edge.config.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/sentry.server.config.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/api/health/route.test.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/api/health/route.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/auth-context.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/auth-proof.module.css | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/context-graph.module.css | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/context-graph.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/context-graph.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/forgot-password/forgot-password-form.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/forgot-password/forgot-password-form.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/forgot-password/page.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/globals.css | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/landing/cinematic-proof.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/landing/evidence-library.module.css | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/landing/evidence-library.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/landing/evidence-library.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/landing/hero-motion.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/landing/hero.module.css | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/landing/hero.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/landing/landing-page.module.css | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/landing/motion-sections.module.css | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/landing/pinned-statement.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/landing/product-story.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/landing/product-story.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/landing/site-header.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/landing/support-sections.module.css | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/landing/support-sections.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/layout.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/not-found.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/organizations/[organizationId]/dashboard/dashboard-overview.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/organizations/[organizationId]/dashboard/dashboard.module.css | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/organizations/[organizationId]/dashboard/organization-dashboard.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/organizations/[organizationId]/dashboard/organization-dashboard.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/organizations/[organizationId]/dashboard/owner-controls.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/organizations/[organizationId]/dashboard/page.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/organizations/[organizationId]/projects/page.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/organizations/[organizationId]/projects/projects-workspace.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/organizations/[organizationId]/projects/projects-workspace.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/organizations/organizations-workspace.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/organizations/organizations-workspace.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/organizations/organizations.module.css | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/organizations/page.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/page.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/page.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/projects/[projectId]/behavioral-run-launcher.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/projects/[projectId]/behavioral-run-launcher.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/projects/[projectId]/campaign-lab/navigation.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/projects/[projectId]/campaign-lab/page.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/projects/[projectId]/campaign-lab/workspace.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/projects/[projectId]/evidence/page.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/projects/[projectId]/evidence/workspace.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/projects/[projectId]/methodology/methodology-workspace.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/projects/[projectId]/methodology/page.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/projects/[projectId]/methodology/workspace.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/projects/[projectId]/page.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/projects/[projectId]/project-workspace.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/projects/[projectId]/stimulus-assets-panel.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/projects/[projectId]/stimulus-assets-panel.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/rehearsal-story.module.css | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/rehearsal-story.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/rehearsal-story.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/reset-password/page.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/reset-password/reset-password-form.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/reset-password/reset-password-form.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/runs/[runId]/page.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/sign-in/page.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/sign-in/safe-next-path.test.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/sign-in/safe-next-path.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/sign-in/sign-in-form.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/sign-in/sign-in-form.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/sign-out-button.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/sign-up/page.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/sign-up/sign-up-form.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/sign-up/sign-up-form.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/workspace-navigation.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/app/workspace-sidebar.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/assets/stimulus-asset-contract.test.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/assets/stimulus-asset-contract.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/assets/visual-profile-contract.test.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/assets/visual-profile-contract.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/behavioral-comparison-contract.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/behavioral-comparison-panel.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/behavioral-comparison-panel.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/behavioral-contract.test.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/behavioral-evidence-contract.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/behavioral-evidence-review.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/behavioral-refinement-panel.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/behavioral-refinement-panel.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/behavioral-refinement.test.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/behavioral-refinement.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/behavioral-result-contract.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/behavioral-result-renderer.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/behavioral-result-renderer.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/methodology-report-panel.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/methodology-report-panel.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/provenance-disclosure.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/provenance-disclosure.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/result-contract.test.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/result-contract.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/result-renderer.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/result-renderer.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/run-audit-history-contract.test.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/run-audit-history-contract.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/run-audit-history.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/run-audit-history.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/run-poller.test.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/run-poller.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/run-route.test.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/run-route.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/run-status-panel.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/run-status-panel.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/run-telemetry.test.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/run-telemetry.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/run-workspace.test.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/features/runs/run-workspace.tsx | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/instrumentation.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/lib/api.test.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/lib/api.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/lib/auth.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/lib/runtime.test.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/lib/runtime.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/lib/supabase/client.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/lib/supabase/proxy.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/lib/supabase/server.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/observability/sentry.test.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/observability/sentry.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/proxy.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/test/behavioral-fixtures.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/src/test/setup.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/tsconfig.json | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/vercel-ignore.mjs | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/vercel.json | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| apps/web/vitest.config.ts | Web application | SIMULA | Agent 2 | INSPECTED | — | — | — |
| brain/00_HOME.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Architecture/API_ARCHITECTURE.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Architecture/AUTHORIZATION_MATRIX.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Architecture/DATA_MODEL.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Architecture/RESOURCE_LIMITS.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Architecture/SIMULATION_PIPELINE.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Architecture/SYSTEM_ARCHITECTURE.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/CHANGELOG.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Data/CANDIDATE_DATA_SOURCES.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Data/DATA_PROVENANCE_STANDARD.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Data/DATA_STRATEGY.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Data/DEMO_DATA_POLICY.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Decisions/ADR-0001-PHASE-0-ARCHITECTURE-BOUNDARY.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Decisions/ADR-0002-TOOLCHAIN-AND-GENERATED-CONTRACTS.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Decisions/ADR-0003-IDENTITY-TENANCY-AND-RLS.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Decisions/ADR-0004-DATA-MODEL-VERSIONING-AND-LIFECYCLE.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Decisions/ADR-0005-API-AND-CONTRACT-COMPATIBILITY.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Decisions/ADR-0006-QUEUE-AND-RUN-STATE-MACHINE.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Decisions/ADR-0007-PROVIDER-BOUNDARY-AND-MOCK.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Decisions/ADR-0008-ENVIRONMENTS-DEPLOYMENT-AND-MIGRATIONS.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Decisions/ADR-0009-OBSERVABILITY-AUDIT-AND-SERVICE-OBJECTIVES.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Decisions/ADR-0010-EXPORT-SHARE-AND-STORAGE-SEAM.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Decisions/ADR-0011-NESTJS-BULLMQ-CONTROL-PLANE.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Decisions/ADR-0012-PHANTOMCROWD-DERIVED-BEHAVIORAL-ENGINE.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Decisions/ADR-0013-GOVERNED-PGVECTOR-RETRIEVAL.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Decisions/ADR-0014-PRIVATE-STIMULUS-ASSET-PIPELINE.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Decisions/ADR-0015-ASSET-BOUND-TECHNICAL-IMAGE-PROFILE.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/EVIDENCE_LEDGER.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/GLOSSARY.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Methodology/METHODOLOGY_V0.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Methodology/MODEL_CARD_TEMPLATE.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Methodology/OUTPUT_TYPE_SYSTEM.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Methodology/VALIDATION_FRAMEWORK.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Operations/BACKUP_AND_RESTORE.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Operations/DEPLOYMENT_ARCHITECTURE.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Operations/INCIDENT_RESPONSE.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Operations/OBSERVABILITY.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Operations/OBSERVABILITY_RUNBOOK.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Operations/RELEASE_PROVENANCE.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Operations/RUNBOOK_RUN_CREATION_DISABLED.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Operations/STAGED_ROLLOUT_AND_ROLLBACK.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/PROJECT_CHARTER.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/PROJECT_STATE.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Product/ACCEPTANCE_CRITERIA.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Product/FEATURE_CATALOG.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Product/NON_GOALS.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Product/PRD.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Product/USER_DISCOVERY_PLAN.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Product/USER_JOURNEYS.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/QA/EVALUATION_STRATEGY.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/QA/M6_BROWSER_FIXTURE_QA_2026-07-29.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/QA/PHASE_2_AUDIT_2026-07-18.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/QA/PHASE_2_BACKLOG.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/QA/PHASE_3_IMPLEMENTATION_AUDIT_2026-07-20.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/QA/PHASE_4_IMPLEMENTATION_AUDIT_2026-07-20.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/QA/SIMULA_DASHBOARD_PRODUCTION_AUDIT_2026-07-22.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/QA/SIMULA_DASHBOARD_PRODUCTION_IMPLEMENTATION_2026-07-21.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/QA/TEST_STRATEGY.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/QA/TRACEABILITY_MATRIX.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/RISK_REGISTER.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Research/COMPETITIVE_LANDSCAPE.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Research/NETOPIA_TEARDOWN.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Research/PHANTOMCROWD_IMPLEMENTATION_REFERENCE.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Research/PREDIKTA_TEARDOWN.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Research/PUBLIC_EVIDENCE_MATRIX.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Security/CONTROL_TEST_MATRIX.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Security/M7_PRIVACY_SECURITY_REVIEW_2026-07-29.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Security/PRIVACY_MODEL.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| brain/Security/THREAT_MODEL.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| compose.yaml | Repository support | SIMULA | Agent 5 | INSPECTED | — | — | — |
| docs/audits/phantomcrowd-code-provenance.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/audits/phantomcrowd-simula-integration-audit.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/compliance/open-source-license-register.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/compliance/philippines-political-campaign-readiness.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/data/comelec-national-turnout-1992-2025.json | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/data/philippine-population-2020-regional-frame.csv | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/data/philippine-population-2020-regional-frame.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/data/raw/comelec-national-turnout-1992-2025/2025_NLE_VotersTurnoutbyCityMun_OFOV_112525.xlsx | Governance/documentation | SIMULA | Agent 1 | EXCLUDED | — | — | Binary/reference asset: inventory and metadata review only; excluded from line-by-line source review. |
| docs/data/raw/comelec-national-turnout-1992-2025/Comperative_Stats_1992_2002_NLE.pdf | Governance/documentation | SIMULA | Agent 1 | EXCLUDED | — | — | Binary/reference asset: inventory and metadata review only; excluded from line-by-line source review. |
| docs/methodology/campaign-simulation-scoring.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/methodology/historical-backtesting.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/methodology/language-cultural-evaluation.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/methodology/respondent-free-aggregate-forecasting.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/methodology/survey-calibration.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/privacy/campaign-data-retention.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/privacy/campaign-simulation-data-flow.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/BEHAVIORS.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/PAGE_TOPOLOGY.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/components/auth-proof.spec.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/components/rehearsal-story.spec.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/components/simula-polish.spec.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/micro.so/BEHAVIORS.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/micro.so/PAGE_TOPOLOGY.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/micro.so/body-outline.json | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/micro.so/components/cinematic-proof.spec.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/micro.so/components/closing-footer.spec.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/micro.so/components/context-system.spec.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/micro.so/components/hero.spec.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/micro.so/components/library-gallery.spec.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/micro.so/components/pinned-statement.spec.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/micro.so/components/product-story.spec.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/micro.so/components/site-header.spec.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/micro.so/desktop-extraction.json | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/micro.so/dom-outline.json | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/micro.so/interaction-states-desktop.json | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/micro.so/mobile-extraction.json | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/micro.so/scroll-sweep-desktop.json | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/research/philippine-official-election-outcome-acquisition-2026-08-07.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/security/campaign-simulation-threat-model.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/status/campaign-simulation-current-state.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/status/campaign-simulation-decisions.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/status/campaign-simulation-known-risks.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| docs/status/campaign-simulation-next-actions.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| ops/observability/grafana-dashboard.json | CI/deployment/operations | SIMULA | Agent 5 | INSPECTED | — | — | — |
| ops/observability/prometheus-alerts.yml | CI/deployment/operations | SIMULA | Agent 5 | INSPECTED | — | — | — |
| package.json | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| packages/contracts/behavioral-comparison.schema.json | Generated/shared contracts | SIMULA | Agent 2 | EXCLUDED | — | — | Deterministically generated contract; source generator and freshness gate inspected instead. |
| packages/contracts/behavioral-evaluation-report.schema.json | Generated/shared contracts | SIMULA | Agent 2 | EXCLUDED | — | — | Deterministically generated contract; source generator and freshness gate inspected instead. |
| packages/contracts/behavioral-report.schema.json | Generated/shared contracts | SIMULA | Agent 2 | EXCLUDED | — | — | Deterministically generated contract; source generator and freshness gate inspected instead. |
| packages/contracts/context-graph.schema.json | Generated/shared contracts | SIMULA | Agent 2 | EXCLUDED | — | — | Deterministically generated contract; source generator and freshness gate inspected instead. |
| packages/contracts/openapi.json | Generated/shared contracts | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/contracts/package.json | Generated/shared contracts | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/contracts/result.schema.json | Generated/shared contracts | SIMULA | Agent 2 | EXCLUDED | — | — | Deterministically generated contract; source generator and freshness gate inspected instead. |
| packages/contracts/src/control-plane.ts | Generated/shared contracts | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/contracts/src/database.ts | Generated/shared contracts | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/contracts/src/index.ts | Generated/shared contracts | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/contracts/src/openapi.ts | Generated/shared contracts | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/contracts/tests/contracts.test.mjs | Generated/shared contracts | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/contracts/tsconfig.json | Generated/shared contracts | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/pyproject.toml | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/__init__.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/aggregate_forecasting.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/arq_codec.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/behavioral_demo.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/behavioral_engine.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/behavioral_evaluation.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/bullmq_codec.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/calibration_monitoring.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/campaign_lab.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/cultural_evaluation.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/historical_backtesting.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/json_codec.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/methodology.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/observability.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/population_sources.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/py.typed | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/queue_runtime.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/repeated_simulation.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/reporting.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/research_ingestion.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/research_knowledge.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/runtime.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/runtime_admission.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/safe_logs.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/simulation.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/survey_calibration.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/survey_forms.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/survey_imports.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/trace_context.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/src/simula_core/visual_analysis.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_aggregate_forecasting.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_arq_codec.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_behavioral_engine.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_behavioral_evaluation.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_bullmq_codec.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_calibration_monitoring.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_campaign_lab.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_cultural_evaluation.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_deterministic_mock.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_historical_backtesting.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_json_codec.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_methodology.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_observability.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_official_turnout_dataset.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_population_sources.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_queue_runtime.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_repeated_simulation.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_reporting.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_research_ingestion.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_runtime.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_runtime_admission.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_safe_logs.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_survey_calibration.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_survey_forms.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_survey_imports.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| packages/simula-core/tests/test_visual_analysis.py | Behavioral/domain core | SIMULA | Agent 2 | INSPECTED | — | — | — |
| plans/MASTER_ROADMAP.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| plans/active/002-phase-2-walking-skeleton.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| plans/active/003-predikta-class-production-platform.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| plans/completed/000-phase-0-evidence-and-discovery.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| plans/completed/001-phase-1-product-and-architecture-definition.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| playwright.assets.config.ts | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| playwright.config.ts | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| playwright.m2.config.ts | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| pnpm-lock.yaml | Repository support | SIMULA | Agent 1 | EXCLUDED | — | — | Machine-generated lockfile; manifests, frozen install, audit, and policy gates provide authoritative review. |
| pnpm-workspace.yaml | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| prettier.config.mjs | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| pyproject.toml | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| railway.ai-engine.json | CI/deployment/operations | SIMULA | Agent 5 | INSPECTED | — | — | — |
| railway.api.json | CI/deployment/operations | SIMULA | Agent 5 | INSPECTED | — | — | — |
| railway.control-plane.json | CI/deployment/operations | SIMULA | Agent 5 | INSPECTED | — | — | — |
| railway.dispatcher.json | CI/deployment/operations | SIMULA | Agent 5 | INSPECTED | — | — | — |
| railway.web.json | CI/deployment/operations | SIMULA | Agent 5 | INSPECTED | — | — | — |
| railway.worker.json | CI/deployment/operations | SIMULA | Agent 5 | INSPECTED | — | — | — |
| scripts/__init__.py | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| scripts/acquire_comelec_turnout.py | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| scripts/check_forbidden_claims.py | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| scripts/check_generated.py | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| scripts/check_observability_assets.py | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| scripts/check_secrets.py | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| scripts/check_toolchain.py | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| scripts/check_web_bundle_secrets.py | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| scripts/database_types.py | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| scripts/dev.mjs | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| scripts/dev.test.mjs | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| scripts/generate_contracts.py | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| scripts/generate_user_guide_pdf.py | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| scripts/openapi_compatibility.py | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| scripts/queue_transport_control.py | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| scripts/run_control.py | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| scripts/run_supabase_tests.mjs | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| scripts/verify_behavioral_capacity.py | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| scripts/verify_m0_runtime.py | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| scripts/verify_m2_browser_e2e.mjs | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| scripts/verify_p2_e2e.py | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/ai-engine/Dockerfile | Private AI engine | SIMULA | Agent 5 | INSPECTED | — | — | — |
| services/ai-engine/pyproject.toml | Private AI engine | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/ai-engine/src/simula_ai_engine/__init__.py | Private AI engine | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/ai-engine/src/simula_ai_engine/__main__.py | Private AI engine | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/ai-engine/src/simula_ai_engine/app.py | Private AI engine | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/ai-engine/src/simula_ai_engine/config.py | Private AI engine | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/ai-engine/src/simula_ai_engine/py.typed | Private AI engine | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/ai-engine/src/simula_ai_engine/registry.py | Private AI engine | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/ai-engine/tests/test_ai_engine_app.py | Private AI engine | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/ai-engine/tests/test_ai_engine_config.py | Private AI engine | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/ai-engine/tests/test_ai_engine_registry.py | Private AI engine | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/Dockerfile | FastAPI legacy/public API | SIMULA | Agent 5 | INSPECTED | — | — | — |
| services/api/certs/supabase-prod-ca-2021.crt | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/pyproject.toml | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/__init__.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/__main__.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/app.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/auth.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/campaign_lab_routes.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/config.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/cursor.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/database.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/logging.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/models.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/phase34_models.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/phase34_routes.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/platform_admin_routes.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/problem_codes.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/problems.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/py.typed | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/queue.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/rate_limits.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/readiness.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/routes.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/run_admission.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/services.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/src/simula_api/telemetry.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/tests/test_api_config.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/tests/test_api_logging.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/tests/test_auth.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/tests/test_campaign_lab_routes.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/tests/test_database_readiness.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/tests/test_health.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/tests/test_m2_routes.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/tests/test_m3_routes.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/tests/test_main.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/tests/test_platform_admin_routes.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/tests/test_readiness.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/tests/test_run_admission.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/api/tests/test_telemetry.py | FastAPI legacy/public API | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/Dockerfile | Python worker | SIMULA | Agent 5 | INSPECTED | — | — | — |
| services/worker/pyproject.toml | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/src/simula_worker/__init__.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/src/simula_worker/__main__.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/src/simula_worker/behavioral_engine_client.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/src/simula_worker/bullmq_runtime.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/src/simula_worker/campaign_evidence.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/src/simula_worker/campaign_lab.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/src/simula_worker/config.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/src/simula_worker/database.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/src/simula_worker/dispatcher.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/src/simula_worker/logging.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/src/simula_worker/main.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/src/simula_worker/py.typed | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/src/simula_worker/telemetry.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/tests/test_behavioral_engine_client.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/tests/test_bullmq_runtime.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/tests/test_campaign_evidence.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/tests/test_campaign_lab_forecast.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/tests/test_campaign_lab_survey_import.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/tests/test_config.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/tests/test_database.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/tests/test_dispatcher.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/tests/test_worker.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/tests/test_worker_logging.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/tests/test_worker_main.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| services/worker/tests/test_worker_telemetry.py | Python worker | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/config.toml | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260717000100_phase2_database_foundation.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260717025314_phase2_project_stimulus_commands.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260718000000_phase2_audit_and_rate_hardening.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260718010000_phase2_runs_and_worker.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260718020000_fix_run_fixture_lock.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260718020100_fix_run_failure_enum.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260718020200_grant_runtime_extension_usage.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260718020300_fix_worker_organization_lock.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260718020400_fix_completion_result_lock.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260718030000_phase2_provenance_snapshot.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260718030100_phase2_private_schema_grant_cleanup.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260718040000_phase2_cancellation.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260718041000_revoke_command_api_create.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260718050000_phase2_retry_backoff.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260718060000_phase2_stale_dispatch_recovery.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260718070000_phase2_poison_dispatch.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260718093135_phase2_global_run_backpressure.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260718094407_revoke_hosted_rls_auto_enable.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260718113445_20260718111531_phase2_lease_attempt_hardening.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260718122048_20260718120823_phase2_result_contract_boundary.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260718160000_phase2_audience_governance.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260718161000_phase2_run_support_and_replay.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260719000000_phase2_deletion_graph.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260719010000_phase2_trace_and_sign_in_audit.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260719020000_phase2_operational_run_control.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260719030000_phase2_release_configuration_binding.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260719040000_phase2_runtime_observability_snapshot.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260719050000_phase2_audience_v2_immutability.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260720063411_phase2_exit_database_invariants.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260720070010_phase2_provider_success_receipts.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260720072350_phase2_provider_receipt_fk_index.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260720083000_phase2_operator_run_control.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260720095228_phase3_methodology_registry.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260720100002_phase4_mvp_product.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260720110000_phase4_sharing_and_team_acceptance.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260722033736_platform_superadmin.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260722033952_platform_superadmin_granted_by_index.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260729090000_bullmq_v2_worker_binding.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260729094522_behavioral_engine_artifacts.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260729102512_m5_governed_behavioral_data.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260729103220_m5_evidence_outcomes_private_assets.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260729103629_m5_behavioral_evaluation_registry.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260729110611_m6_behavioral_public_summaries.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260729113000_m6_run_audit_history.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260729132200_m7_governed_context_embeddings.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260729151639_m6_private_stimulus_asset_pipeline.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260730123000_m6_visual_stimulus_profiles.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260730160000_fix_behavioral_demo_active_audience.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260730170000_fix_behavioral_run_delete_cascade.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260730180000_m3_bullmq_queue_pressure.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260730190000_m3_queue_transport_fence.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260730200000_m2_organization_deletion_orchestration.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260730210000_m6_visual_profile_pillow_12_3.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260730220000_m2_organization_deletion_recovery.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260730230000_m7_runtime_production_admission.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260801111007_campaign_simulation_report_evidence.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260801112745_campaign_simulation_security_cleanup.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260801113233_campaign_simulation_security_revoke.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260801121240_campaign_lab_evidence_jobs.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260801124952_campaign_lab_evidence_cancel_finalize.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260801125632_campaign_lab_evidence_project_retention.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260801135222_campaign_lab_runtime_head.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260801150000_m6_visual_profile_fk_privilege.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260801150001_campaign_lab_runtime_head.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260801185129_phase4_command_scope_repair.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260802060315_campaign_simulation_lab.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260802063625_campaign_lab_api_wrappers.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260802090954_campaign_lab_cultural_evaluation.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260802105930_campaign_lab_mutation_idempotency.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260802131842_campaign_lab_durable_workflows.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260802150729_campaign_lab_survey_import_workflow.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260803020312_campaign_lab_retention_cleanup.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260804124631_psa_2020_regional_population_frame.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260806093913_campaign_lab_native_survey_forms.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260807100937_aggregate_forecast_registry.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260807104033_official_comelec_national_turnout.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260807190000_campaign_lab_v3_command_owner.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/migrations/20260807200000_worker_failure_audit_outcome.sql | Database migration | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/operations/20260804100000_psa_2020_regional_population_frame.sql | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/roles.sql | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/seed.sql | Repository support | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/tests/database_foundation.test.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/tests/m10_aggregate_forecast_registry.test.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/tests/m11_official_comelec_turnout.test.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/tests/m2_organization_deletion_recovery.test.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/tests/m3_bullmq_v2_binding.test.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/tests/m3_queue_transport_fence.test.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/tests/m3_runs_adversarial.test.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/tests/m4_behavioral_engine_artifacts.test.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/tests/m5_behavioral_evaluation_registry.test.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/tests/m5_evidence_outcomes_private_assets.test.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/tests/m5_governed_behavioral_data.test.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/tests/m6_behavioral_public_summaries.test.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/tests/m6_private_stimulus_asset_pipeline.test.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/tests/m6_run_audit_history.test.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/tests/m6_visual_stimulus_profiles.test.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/tests/m6_visual_stimulus_profiles_adversarial.test.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/tests/m7_governed_context_embeddings.test.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/tests/m7_runtime_production_admission.test.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/tests/m8_campaign_lab_durable_workflows.test.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| supabase/tests/m9_campaign_lab_retention.test.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tasks/campaign-simulation-plan.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| tasks/campaign-simulation-todo.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| tasks/plan.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| tasks/todo.md | Governance/documentation | SIMULA | Agent 1 | INSPECTED | — | — | — |
| tests/__init__.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/browser-fixtures/stimulus-assets/index.html | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/browser-fixtures/stimulus-assets/src/api-fixture.ts | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/browser-fixtures/stimulus-assets/src/main.tsx | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/browser-fixtures/stimulus-assets/vite.config.ts | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/database/m2_commands_adversarial.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/database/organization_deletion_adversarial.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/database/organization_deletion_recovery_adversarial.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/database/platform_admin_adversarial.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/database/runtime_adversarial.sql | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/e2e/landing.spec.ts | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/e2e/m2-cross-tenant.spec.ts | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/e2e/phase2-run-results.spec.ts | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/e2e/stimulus-assets.spec.ts | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/integration/__init__.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/integration/arq_crash_worker.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/integration/arq_worker_once.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/integration/bullmq_worker_once.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/integration/conftest.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/integration/redis_fixture.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/integration/test_api_m2.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/integration/test_behavioral_engine_private_http.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/integration/test_bullmq_python_runtime.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/integration/test_database_boundary.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/integration/test_m3_run_pipeline.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/integration/test_operator_run_control.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/integration/test_phase34_product.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/integration/test_queue_runtime.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/integration/test_rate_limits.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/integration/test_restore_drill.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/test_acquire_comelec_turnout.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/test_bundle_secret_scanner.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/test_deployment_config.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/test_foundation.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/test_openapi_compatibility.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/test_queue_transport_control.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/test_restore_contract.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/test_run_control.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/test_runtime_gate.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tests/test_secret_scanner.py | Verification | SIMULA | Agent 2 | INSPECTED | — | — | — |
| tsconfig.base.json | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| turbo.json | Repository support | SIMULA | Agent 1 | INSPECTED | — | — | — |
| uv.lock | Repository support | SIMULA | Agent 1 | EXCLUDED | — | — | Machine-generated lockfile; manifests, frozen sync, audit, and policy gates provide authoritative review. |
