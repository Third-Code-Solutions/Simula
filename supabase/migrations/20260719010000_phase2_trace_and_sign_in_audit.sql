-- Preserve the HTTP trace across durable run execution without putting tenant or
-- identity data in Redis.  Existing five-argument command and claim helpers stay
-- available for rollback-compatible application artifacts.

alter table api.simulation_runs
  add column traceparent text,
  add constraint simulation_runs_traceparent_valid check (
    traceparent is null
    or (
      traceparent ~ '^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$'
      and pg_catalog.substring(traceparent, 4, 32) <> pg_catalog.repeat('0', 32)
      and pg_catalog.substring(traceparent, 37, 16) <> pg_catalog.repeat('0', 16)
    )
  );

create unique index audit_events_sign_in_session_unique
  on private.audit_events (object_id)
  where action = 'auth.sign_in';

create policy audit_events_command_sign_in_insert
on private.audit_events
for insert
to simula_command_owner
with check (
  organization_id is null
  and actor_type = 'user'
  and private.is_verified_api_subject(actor_user_id)
  and action = 'auth.sign_in'
  and object_type = 'auth_session'
  and object_id is not null
  and outcome = 'success'
  and source_service = 'api'
  and metadata = '{}'::jsonb
);

create policy simulation_runs_command_trace_update
on api.simulation_runs
for update
to simula_command_owner
using (
  state = 'queued'
  and attempt_count = 0
  and traceparent is null
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
)
with check (
  state = 'queued'
  and attempt_count = 0
  and traceparent is not null
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);

grant create on schema private to simula_command_owner;
set role simula_command_owner;

create function private.create_simulation_run_traced(
  requested_project_id uuid,
  requested_stimulus_version_id uuid,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid,
  requested_traceparent text
)
returns table (
  run_id uuid,
  organization_id uuid,
  project_id uuid,
  stimulus_version_id uuid,
  audience_version_id uuid,
  run_state api.run_state,
  schema_version integer,
  dispatch_generation smallint,
  job_id text,
  run_version integer,
  created_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  command_result record;
begin
  if session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_traceparent is null
    or requested_traceparent !~ '^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$'
    or pg_catalog.substring(requested_traceparent, 4, 32) = pg_catalog.repeat('0', 32)
    or pg_catalog.substring(requested_traceparent, 37, 16) = pg_catalog.repeat('0', 16)
  then
    raise exception using errcode = '22023', message = 'invalid_traceparent';
  end if;

  select * into command_result
  from private.create_simulation_run_atomic(
    requested_project_id,
    requested_stimulus_version_id,
    requested_idempotency_key,
    requested_sha256,
    requested_correlation_id
  );

  if not command_result.replayed then
    update api.simulation_runs as runs
    set traceparent = requested_traceparent
    where runs.id = command_result.run_id;
  end if;

  return query select
    command_result.run_id,
    command_result.organization_id,
    command_result.project_id,
    command_result.stimulus_version_id,
    command_result.audience_version_id,
    command_result.run_state,
    command_result.schema_version,
    command_result.dispatch_generation,
    command_result.job_id,
    command_result.run_version,
    command_result.created_at,
    command_result.replayed;
end
$function$;

create function private.record_sign_in_success(
  requested_session_id uuid,
  requested_correlation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  subject uuid;
  inserted boolean;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_session_id is null or requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_auth_event';
  end if;

  insert into private.audit_events (
    organization_id,
    actor_type,
    actor_user_id,
    action,
    object_type,
    object_id,
    correlation_id,
    outcome,
    source_service,
    metadata
  ) values (
    null,
    'user',
    subject,
    'auth.sign_in',
    'auth_session',
    requested_session_id,
    requested_correlation_id,
    'success',
    'api',
    '{}'::jsonb
  )
  on conflict do nothing
  returning true into inserted;

  return coalesce(inserted, false);
end
$function$;

alter function private.create_simulation_run_traced(uuid, uuid, text, text, uuid, text)
  owner to simula_command_owner;
alter function private.record_sign_in_success(uuid, uuid)
  owner to simula_command_owner;
revoke all on function private.create_simulation_run_traced(uuid, uuid, text, text, uuid, text)
  from public, anon, authenticated, simula_api, simula_worker;
revoke all on function private.record_sign_in_success(uuid, uuid)
  from public, anon, authenticated, simula_api, simula_worker;
grant execute on function private.create_simulation_run_traced(uuid, uuid, text, text, uuid, text)
  to simula_api;
grant execute on function private.record_sign_in_success(uuid, uuid)
  to simula_api;
set role postgres;
revoke create on schema private from simula_command_owner;
reset role;

create function api.create_simulation_run(
  requested_project_id uuid,
  requested_stimulus_version_id uuid,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid,
  requested_traceparent text
)
returns table (
  run_id uuid,
  organization_id uuid,
  project_id uuid,
  stimulus_version_id uuid,
  audience_version_id uuid,
  run_state api.run_state,
  schema_version integer,
  dispatch_generation smallint,
  job_id text,
  run_version integer,
  created_at timestamptz,
  replayed boolean
)
language sql
security invoker
set search_path = ''
as $function$
  select * from private.create_simulation_run_traced(
    requested_project_id,
    requested_stimulus_version_id,
    requested_idempotency_key,
    requested_sha256,
    requested_correlation_id,
    requested_traceparent
  )
$function$;

create function api.record_sign_in_success(
  requested_session_id uuid,
  requested_correlation_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.record_sign_in_success(requested_session_id, requested_correlation_id)
$function$;

revoke all on function api.create_simulation_run(uuid, uuid, text, text, uuid, text)
  from public, anon, authenticated;
revoke all on function api.record_sign_in_success(uuid, uuid)
  from public, anon, authenticated;
grant execute on function api.create_simulation_run(uuid, uuid, text, text, uuid, text)
  to simula_api;
grant execute on function api.record_sign_in_success(uuid, uuid)
  to simula_api;

grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create function private.claim_run_execution_traced(
  requested_run_id uuid,
  requested_generation smallint,
  requested_job_id text
)
returns table (
  claim_status text,
  attempt_id uuid,
  lease_token uuid,
  lease_expires_at timestamptz,
  frozen_manifest jsonb,
  frozen_manifest_sha256 text,
  deterministic_seed bigint,
  correlation_id uuid,
  traceparent text
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  claim_result record;
  selected_run api.simulation_runs%rowtype;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  select * into claim_result
  from private.claim_run_execution(
    requested_run_id,
    requested_generation,
    requested_job_id
  );

  if claim_result.claim_status = 'claimed' then
    select * into selected_run
    from api.simulation_runs as runs
    where runs.id = requested_run_id;
    if not found then
      raise exception using errcode = '55000', message = 'claimed_run_missing';
    end if;
  end if;

  return query select
    claim_result.claim_status,
    claim_result.attempt_id,
    claim_result.lease_token,
    claim_result.lease_expires_at,
    claim_result.frozen_manifest,
    claim_result.frozen_manifest_sha256,
    claim_result.deterministic_seed,
    case when claim_result.claim_status = 'claimed' then selected_run.correlation_id else null end,
    case
      when claim_result.claim_status <> 'claimed' then null
      when selected_run.traceparent is not null then selected_run.traceparent
      else '00-'
        || pg_catalog.replace(selected_run.correlation_id::text, '-', '')
        || '-'
        || pg_catalog.substring(
          pg_catalog.encode(
            extensions.digest(pg_catalog.convert_to(selected_run.id::text, 'UTF8'), 'sha256'),
            'hex'
          ),
          1,
          16
        )
        || '-00'
    end;
end
$function$;

alter function private.claim_run_execution_traced(uuid, smallint, text)
  owner to simula_worker_owner;
revoke all on function private.claim_run_execution_traced(uuid, smallint, text)
  from public, anon, authenticated, simula_api, simula_worker;
grant execute on function private.claim_run_execution_traced(uuid, smallint, text)
  to simula_worker;
set role postgres;
revoke create on schema private from simula_worker_owner;
reset role;
