-- Enforce bounded retention for Campaign Lab outputs and expire terminal rows
-- through the worker-only database capability boundary.

set role postgres;

alter table api.campaign_lab_artifacts
  alter column retention_until set default
    (pg_catalog.statement_timestamp() + interval '90 days');

update api.campaign_lab_artifacts
set retention_until = greatest(
  coalesce(retention_until, created_at + interval '90 days'),
  created_at + interval '90 days'
)
where retention_until is null or retention_until <= created_at;

alter table api.campaign_lab_artifacts
  alter column retention_until set not null;

alter table api.campaign_lab_artifacts
  add constraint campaign_lab_artifacts_retention_valid
  check (retention_until > created_at);

alter table api.campaign_lab_runs
  add column retention_until timestamptz not null
    default (pg_catalog.statement_timestamp() + interval '90 days');

alter table api.campaign_lab_runs
  add constraint campaign_lab_runs_retention_valid
  check (retention_until > created_at);

create index campaign_lab_artifacts_retention_idx
  on api.campaign_lab_artifacts (retention_until, id)
  where status in ('completed', 'blocked', 'rejected');

create index campaign_lab_runs_retention_idx
  on api.campaign_lab_runs (retention_until, id)
  where status in ('succeeded', 'failed', 'canceled');

grant select (id, organization_id, kind, status, retention_until, created_at),
  update (retention_until), delete
  on table api.campaign_lab_artifacts to simula_worker_owner;
grant delete on table api.campaign_lab_runs to simula_worker_owner;

create policy campaign_lab_artifacts_worker_delete
on api.campaign_lab_artifacts for delete to simula_worker_owner
using (
  status in ('completed', 'blocked', 'rejected')
  and retention_until <= pg_catalog.statement_timestamp()
);

create policy campaign_lab_artifacts_worker_select
on api.campaign_lab_artifacts for select to simula_worker_owner
using (
  status in ('completed', 'blocked', 'rejected')
  and retention_until <= pg_catalog.statement_timestamp()
);

create policy campaign_lab_runs_worker_delete
on api.campaign_lab_runs for delete to simula_worker_owner
using (
  status in ('succeeded', 'failed', 'canceled')
  and retention_until <= pg_catalog.statement_timestamp()
);

drop policy if exists audit_events_campaign_lab_worker_insert
on private.audit_events;
create policy audit_events_campaign_lab_worker_insert
on private.audit_events for insert to simula_worker_owner
with check (
  actor_type = 'worker'
  and actor_user_id is null
  and source_service = 'worker'
  and outcome in ('success', 'failure')
  and action in (
    'campaign_lab.run_started',
    'campaign_lab.run_completed',
    'campaign_lab.run_failed',
    'campaign_lab.run_canceled',
    'campaign_lab.retention_deleted'
  )
);

-- The managed migration runner cannot transfer ownership to the NOLOGIN
-- simula_worker_owner role. Keep this function postgres-owned like the other
-- privileged API wrappers and fail closed on the original worker session role.
create function private.expire_campaign_lab_runs(requested_batch_size integer)
returns integer
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  artifact_candidate record;
  run_candidate record;
  deleted_count integer := 0;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_batch_size is null or requested_batch_size not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_campaign_lab_retention_batch_size';
  end if;

  for artifact_candidate in
    select artifacts.id, artifacts.organization_id, artifacts.kind
    from api.campaign_lab_artifacts as artifacts
    where artifacts.status in ('completed', 'blocked', 'rejected')
      and artifacts.retention_until <= pg_catalog.statement_timestamp()
    order by artifacts.retention_until, artifacts.created_at, artifacts.id
    for update skip locked
    limit requested_batch_size
  loop
    insert into private.audit_events (
      organization_id, actor_type, actor_user_id, action, object_type, object_id,
      correlation_id, outcome, source_service, metadata
    ) values (
      artifact_candidate.organization_id, 'worker', null,
      'campaign_lab.retention_deleted', 'campaign_lab_artifact',
      artifact_candidate.id, artifact_candidate.id, 'success', 'worker',
      pg_catalog.jsonb_build_object('kind', artifact_candidate.kind)
    );
    delete from api.campaign_lab_artifacts where id = artifact_candidate.id;
    deleted_count := deleted_count + 1;
  end loop;

  for run_candidate in
    select runs.id, runs.organization_id, runs.run_type
    from api.campaign_lab_runs as runs
    where runs.status in ('succeeded', 'failed', 'canceled')
      and runs.retention_until <= pg_catalog.statement_timestamp()
    order by runs.retention_until, runs.created_at, runs.id
    for update skip locked
    limit requested_batch_size
  loop
    insert into private.audit_events (
      organization_id, actor_type, actor_user_id, action, object_type, object_id,
      correlation_id, outcome, source_service, metadata
    ) values (
      run_candidate.organization_id, 'worker', null,
      'campaign_lab.retention_deleted', 'campaign_lab_run',
      run_candidate.id, run_candidate.id, 'success', 'worker',
      pg_catalog.jsonb_build_object('run_type', run_candidate.run_type)
    );
    delete from api.campaign_lab_runs where id = run_candidate.id;
    deleted_count := deleted_count + 1;
  end loop;

  return deleted_count;
end
$function$;

revoke all on function private.expire_campaign_lab_runs(integer)
from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function private.expire_campaign_lab_runs(integer)
to simula_worker;

set role postgres;

drop function private.runtime_schema_readiness_v3();
drop function private.runtime_observability_snapshot_v3();

create function private.runtime_schema_readiness_v3()
returns table (migration_version bigint, rls_force_enabled boolean)
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
    20260803100000::bigint,
    not exists (
      select 1
      from pg_catalog.pg_class as relations
      join pg_catalog.pg_namespace as schemas on schemas.oid = relations.relnamespace
      where schemas.nspname in ('api', 'private')
        and relations.relkind in ('r', 'p')
        and (not relations.relrowsecurity or not relations.relforcerowsecurity)
    );
end
$function$;

revoke all on function private.runtime_schema_readiness_v3()
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function private.runtime_schema_readiness_v3()
  to simula_api, simula_worker;

create function private.runtime_observability_snapshot_v3()
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
    20260803100000::bigint,
    not exists (
      select 1
      from pg_catalog.pg_class as relations
      join pg_catalog.pg_namespace as schemas on schemas.oid = relations.relnamespace
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

revoke all on function private.runtime_observability_snapshot_v3()
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function private.runtime_observability_snapshot_v3()
  to simula_api, simula_worker;

set role postgres;


