-- Bounded aggregate runtime observability. The worker/API receive no row IDs,
-- tenant labels, content, or arbitrary query surface.

set role postgres;
grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create function private.runtime_observability_snapshot()
returns table (
  migration_version bigint,
  rls_force_enabled boolean,
  queued_count bigint,
  running_count bigint,
  retrying_count bigint,
  cancel_requested_count bigint,
  succeeded_count bigint,
  failed_count bigint,
  canceled_count bigint,
  stuck_lease_count bigint,
  oldest_cancel_requested_age_seconds numeric
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  if session_user not in ('simula_api', 'simula_worker') then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  return query
  select
    20260719040000::bigint,
    not exists (
      select 1
      from pg_catalog.pg_class as relations
      join pg_catalog.pg_namespace as schemas
        on schemas.oid = relations.relnamespace
      where schemas.nspname in ('api', 'private')
        and relations.relkind in ('r', 'p')
        and (not relations.relrowsecurity or not relations.relforcerowsecurity)
    ),
    pg_catalog.count(*) filter (where runs.state = 'queued'),
    pg_catalog.count(*) filter (where runs.state = 'running'),
    pg_catalog.count(*) filter (where runs.state = 'retrying'),
    pg_catalog.count(*) filter (where runs.state = 'cancel_requested'),
    pg_catalog.count(*) filter (where runs.state = 'succeeded'),
    pg_catalog.count(*) filter (where runs.state = 'failed'),
    pg_catalog.count(*) filter (where runs.state = 'canceled'),
    pg_catalog.count(*) filter (
      where runs.state in ('running', 'retrying')
        and runs.worker_lease_expires_at < pg_catalog.statement_timestamp()
    ),
    coalesce(
      extract(
        epoch from pg_catalog.statement_timestamp()
          - pg_catalog.min(
            case when runs.state = 'cancel_requested' then runs.updated_at end
          )
      ),
      0::numeric
    )
  from api.simulation_runs as runs;
end
$function$;

revoke all on function private.runtime_observability_snapshot()
  from public, anon, authenticated, simula_api, simula_worker;
grant execute on function private.runtime_observability_snapshot()
  to simula_api, simula_worker;

set role postgres;
revoke create on schema private from simula_worker_owner;
