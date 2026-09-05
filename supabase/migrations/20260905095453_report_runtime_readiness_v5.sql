-- Preserve V4 for the previously deployed binaries and compatible application rollback.
set role postgres;

-- Worker intentionally lacks USAGE on api; elevate catalog lookup only, while
-- V4 still checks session_user and supplies the complete forced-RLS check.
create function private.bound_report_schema_present_v1()
returns boolean
language sql security definer set search_path = '' set row_security = 'on'
as $function$
  select pg_catalog.to_regclass('api.campaign_lab_report_reviews') is not null
    and pg_catalog.to_regprocedure('api.review_campaign_lab_bound_report(uuid,text,text,jsonb,text,text,uuid)') is not null;
$function$;

create function private.runtime_schema_readiness_v5()
returns table (migration_version bigint, rls_force_enabled boolean)
language sql security invoker set search_path = ''
as $function$
  select 20260905095453::bigint,
    previous.rls_force_enabled and private.bound_report_schema_present_v1()
  from private.runtime_schema_readiness_v4() as previous;
$function$;

create function private.runtime_observability_snapshot_v5()
returns table (
  migration_version bigint, rls_force_enabled boolean,
  queued_count bigint, running_count bigint, retrying_count bigint,
  cancel_requested_count bigint, succeeded_count bigint, failed_count bigint,
  canceled_count bigint, stuck_lease_count bigint,
  oldest_cancel_requested_age_seconds numeric
)
language sql security invoker set search_path = ''
as $function$
  select readiness.migration_version, readiness.rls_force_enabled,
    previous.queued_count, previous.running_count, previous.retrying_count,
    previous.cancel_requested_count, previous.succeeded_count, previous.failed_count,
    previous.canceled_count, previous.stuck_lease_count,
    previous.oldest_cancel_requested_age_seconds
  from private.runtime_observability_snapshot_v4() as previous
  cross join private.runtime_schema_readiness_v5() as readiness;
$function$;

revoke all on function private.bound_report_schema_present_v1()
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner;
revoke all on function private.runtime_schema_readiness_v5()
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner;
revoke all on function private.runtime_observability_snapshot_v5()
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner;
grant execute on function private.bound_report_schema_present_v1() to simula_api, simula_worker;
grant execute on function private.runtime_schema_readiness_v5() to simula_api, simula_worker;
grant execute on function private.runtime_observability_snapshot_v5() to simula_api, simula_worker;
