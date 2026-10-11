-- Terminal run functions validate the worker session and matching run lease
-- before updating their campaign. Their non-login owner needs only this
-- projection; runtime roles retain no direct campaign write privileges.
set role postgres;

grant select (id), update (status, current_stage, updated_at)
  on api.campaign_lab_campaigns to simula_worker_owner;

create policy campaign_lab_campaigns_worker_select
  on api.campaign_lab_campaigns for select to simula_worker_owner
  using (true);

create policy campaign_lab_campaigns_worker_update
  on api.campaign_lab_campaigns for update to simula_worker_owner
  using (true) with check (true);

-- Preserve V5 for deployed binaries and application rollback.
create function private.runtime_schema_readiness_v6()
returns table (migration_version bigint, rls_force_enabled boolean)
language sql security invoker set search_path = ''
as $function$
  select 20261010155547::bigint, previous.rls_force_enabled
  from private.runtime_schema_readiness_v5() as previous;
$function$;

create function private.runtime_observability_snapshot_v6()
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
  from private.runtime_observability_snapshot_v5() as previous
  cross join private.runtime_schema_readiness_v6() as readiness;
$function$;

revoke all on function private.runtime_schema_readiness_v6()
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner;
revoke all on function private.runtime_observability_snapshot_v6()
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner;
grant execute on function private.runtime_schema_readiness_v6() to simula_api, simula_worker;
grant execute on function private.runtime_observability_snapshot_v6() to simula_api, simula_worker;
