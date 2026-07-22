"""Platform-wide superadministrator read surface."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from simula_api.auth import VerifiedIdentity
from simula_api.phase34_models import PlatformAdminDashboardResponse
from simula_api.problems import AppProblem
from simula_api.routes import _problem_response, _services, rate_limited_identity

router = APIRouter(
    prefix="/api/v1/platform-admin",
    responses={
        401: _problem_response("Authentication is missing, expired, or invalid."),
        403: _problem_response("A platform superadministrator role is required."),
        422: _problem_response("The request is invalid or outside the supported scope."),
        429: _problem_response("A durable quota or rate limit was reached."),
        503: _problem_response("A required dependency is temporarily unavailable."),
    },
)


def _forbidden() -> AppProblem:
    return AppProblem(
        status=403,
        code="forbidden",
        title="Platform administrator required",
        detail="This surface is restricted to an active SIMULA platform superadministrator.",
    )


@router.get(
    "/dashboard",
    operation_id="get_platform_admin_dashboard",
    response_model=PlatformAdminDashboardResponse,
)
async def platform_admin_dashboard(
    request: Request,
    identity: Annotated[VerifiedIdentity, Depends(rate_limited_identity)],
    organization_limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> PlatformAdminDashboardResponse:
    """Return bounded platform metrics and cross-tenant organization inventory."""

    database = _services(request).database
    if not await database.is_platform_superadmin(identity):
        raise _forbidden()

    payload = await database.read_product_json(
        identity,
        operation="platform_admin_dashboard",
        query="""
          select pg_catalog.jsonb_build_object(
            'user_id', private.verified_subject(),
            'role', 'superadmin',
            'metrics', pg_catalog.jsonb_build_object(
              'users', private.platform_user_count(private.verified_subject()),
              'organizations', (
                select pg_catalog.count(*) from api.organizations
                where status <> 'deleted'
              ),
              'projects', (
                select pg_catalog.count(*) from api.projects
                where status <> 'deleted'
              ),
              'runs', (select pg_catalog.count(*) from api.simulation_runs),
              'active_runs', (
                select pg_catalog.count(*) from api.simulation_runs
                where state in ('queued', 'running', 'retrying', 'cancel_requested')
              ),
              'reports', (select pg_catalog.count(*) from api.report_artifacts),
              'feedback_records', (select pg_catalog.count(*) from api.feedback_records)
            ),
            'organizations', coalesce((
              select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'id', inventory.id,
                  'name', inventory.name,
                  'status', inventory.status,
                  'members', inventory.members,
                  'projects', inventory.projects,
                  'runs', inventory.runs,
                  'reports', inventory.reports,
                  'created_at', inventory.created_at,
                  'updated_at', inventory.updated_at
                ) order by inventory.updated_at desc, inventory.id desc
              )
              from (
                select
                  organizations.id,
                  organizations.name,
                  organizations.status,
                  organizations.created_at,
                  organizations.updated_at,
                  (
                    select pg_catalog.count(*)
                    from api.organization_memberships as memberships
                    where memberships.organization_id = organizations.id
                  ) as members,
                  (
                    select pg_catalog.count(*)
                    from api.projects as projects
                    where projects.organization_id = organizations.id
                      and projects.status <> 'deleted'
                  ) as projects,
                  (
                    select pg_catalog.count(*)
                    from api.simulation_runs as runs
                    where runs.organization_id = organizations.id
                  ) as runs,
                  (
                    select pg_catalog.count(*)
                    from api.report_artifacts as reports
                    where reports.organization_id = organizations.id
                  ) as reports
                from api.organizations as organizations
                where organizations.status <> 'deleted'
                order by organizations.updated_at desc, organizations.id desc
                limit %s
              ) as inventory
            ), '[]'::jsonb),
            'generated_at', pg_catalog.statement_timestamp()
          ) as payload
        """,
        parameters=(organization_limit,),
    )
    return PlatformAdminDashboardResponse.model_validate(payload)
