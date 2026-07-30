-- PostgreSQL-authoritative ARQ/BullMQ ownership. Environment flags select a
-- runtime, but this fence is the final authority for dispatch and execution.
-- A transport change is serialized against run admission and in-flight claim
-- transactions and is accepted only after the durable run pipeline is empty.

set check_function_bodies = on;
set lock_timeout = '5s';
set statement_timeout = '30s';

set role postgres;

create table private.queue_transport_control (
  singleton boolean primary key default true,
  active_transport text not null,
  correlation_id uuid not null,
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint queue_transport_control_singleton check (singleton),
  constraint queue_transport_control_transport_valid check (
    active_transport in ('arq', 'bullmq')
  )
);

alter table private.queue_transport_control enable row level security;
alter table private.queue_transport_control force row level security;

insert into private.queue_transport_control (
  singleton,
  active_transport,
  correlation_id
) values (
  true,
  'arq',
  '00000000-0000-4000-8000-000000000001'::uuid
);

create policy queue_transport_control_worker_owner_select
on private.queue_transport_control
for select
to simula_worker_owner
using (singleton);

grant select on table private.queue_transport_control to simula_worker_owner;
grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create function private.require_queue_transport(requested_transport text)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  selected_transport text;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_transport is null
    or requested_transport not in ('arq', 'bullmq')
  then
    raise exception using errcode = '22023', message = 'invalid_queue_transport';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('simula.queue_transport', 0)
  );
  select control.active_transport into strict selected_transport
  from private.queue_transport_control as control
  where control.singleton;

  if selected_transport <> requested_transport then
    raise exception using errcode = '55000', message = 'queue_transport_inactive';
  end if;
  return true;
end
$function$;

alter function private.claim_due_run_outbox(integer)
  rename to claim_due_run_outbox_unfenced;
revoke all on function private.claim_due_run_outbox_unfenced(integer)
  from public, anon, authenticated, simula_api, simula_worker,
    simula_command_owner, postgres;

create function private.claim_due_run_outbox(requested_batch_size integer)
returns table (
  outbox_id uuid,
  run_id uuid,
  generation smallint,
  job_id text,
  claim_token uuid,
  claim_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  perform private.require_queue_transport('arq');
  return query
  select *
  from private.claim_due_run_outbox_unfenced(requested_batch_size);
end
$function$;

create function private.claim_due_run_outbox_v2(requested_batch_size integer)
returns table (
  outbox_id uuid,
  run_id uuid,
  generation smallint,
  job_id text,
  claim_token uuid,
  claim_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  perform private.require_queue_transport('bullmq');
  return query
  select *
  from private.claim_due_run_outbox_unfenced(requested_batch_size);
end
$function$;

alter function private.claim_run_execution(uuid, smallint, text)
  rename to claim_run_execution_unfenced;
revoke all on function private.claim_run_execution_unfenced(uuid, smallint, text)
  from public, anon, authenticated, simula_api, simula_worker,
    simula_command_owner, postgres;

create function private.claim_run_execution(
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
  deterministic_seed bigint
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  perform private.require_queue_transport('arq');
  return query
  select *
  from private.claim_run_execution_unfenced(
    requested_run_id,
    requested_generation,
    requested_job_id
  );
end
$function$;

create function private.claim_run_execution_unfenced_traced(
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
  from private.claim_run_execution_unfenced(
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
    case
      when claim_result.claim_status = 'claimed'
        then selected_run.correlation_id
      else null
    end,
    case
      when claim_result.claim_status <> 'claimed' then null
      when selected_run.traceparent is not null then selected_run.traceparent
      else '00-'
        || pg_catalog.replace(selected_run.correlation_id::text, '-', '')
        || '-'
        || pg_catalog.substring(
          pg_catalog.encode(
            extensions.digest(
              pg_catalog.convert_to(selected_run.id::text, 'UTF8'),
              'sha256'
            ),
            'hex'
          ),
          1,
          16
        )
        || '-00'
    end;
end
$function$;

revoke all on function private.claim_run_execution_unfenced_traced(
  uuid, smallint, text
)
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, postgres;

create or replace function private.claim_run_execution_traced(
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
begin
  perform private.require_queue_transport('arq');
  return query
  select *
  from private.claim_run_execution_unfenced_traced(
    requested_run_id,
    requested_generation,
    requested_job_id
  );
end
$function$;

create or replace function private.claim_run_execution_v2_traced(
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
begin
  perform private.require_queue_transport('bullmq');
  if requested_run_id is null
    or requested_generation is null
    or requested_generation not between 1 and 3
    or requested_job_id is null
    or requested_job_id <> (
      'run-' || requested_run_id::text || '-generation-' || requested_generation::text
    )
  then
    return query select
      'no_work',
      null::uuid,
      null::uuid,
      null::timestamptz,
      null::jsonb,
      null::text,
      null::bigint,
      null::uuid,
      null::text;
    return;
  end if;

  return query
  select *
  from private.claim_run_execution_unfenced_traced(
    requested_run_id,
    requested_generation,
    'run:' || requested_run_id::text || ':dispatch:' || requested_generation::text
  );
end
$function$;

revoke all on function private.require_queue_transport(text)
  from public, anon, authenticated, simula_api, simula_worker,
    simula_command_owner, postgres;
revoke all on function private.claim_due_run_outbox(integer)
  from public, anon, authenticated, simula_api, simula_worker,
    simula_command_owner, postgres;
revoke all on function private.claim_due_run_outbox_v2(integer)
  from public, anon, authenticated, simula_api, simula_worker,
    simula_command_owner, postgres;
revoke all on function private.claim_run_execution(uuid, smallint, text)
  from public, anon, authenticated, simula_api, simula_worker,
    simula_command_owner, postgres;
revoke all on function private.claim_run_execution_traced(uuid, smallint, text)
  from public, anon, authenticated, simula_api, simula_worker,
    simula_command_owner, postgres;
revoke all on function private.claim_run_execution_v2_traced(uuid, smallint, text)
  from public, anon, authenticated, simula_api, simula_worker,
    simula_command_owner, postgres;

grant execute on function private.require_queue_transport(text)
  to simula_worker;
grant execute on function private.claim_due_run_outbox(integer)
  to simula_worker;
grant execute on function private.claim_due_run_outbox_v2(integer)
  to simula_worker;
grant execute on function private.claim_run_execution(uuid, smallint, text)
  to simula_worker;
grant execute on function private.claim_run_execution_traced(uuid, smallint, text)
  to simula_worker;
grant execute on function private.claim_run_execution_v2_traced(uuid, smallint, text)
  to simula_worker;

set role postgres;
revoke create on schema private from simula_worker_owner;

create function private.set_queue_transport(
  requested_transport text,
  requested_correlation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  prior_transport text;
  run_creation_enabled boolean;
begin
  if session_user not in ('postgres', 'supabase_admin', 'simula_operator') then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_transport is null
    or requested_transport not in ('arq', 'bullmq')
    or requested_correlation_id is null
  then
    raise exception using errcode = '22023', message = 'invalid_queue_transport_control';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('simula.global_run_admission', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('simula.queue_transport', 0)
  );

  select controls.enabled into strict run_creation_enabled
  from private.runtime_controls as controls
  where controls.control_name = 'run_creation'
  for update;

  select control.active_transport into strict prior_transport
  from private.queue_transport_control as control
  where control.singleton
  for update;

  if prior_transport = requested_transport then
    return false;
  end if;
  if run_creation_enabled then
    raise exception using
      errcode = '55000',
      message = 'run_admission_must_be_disabled';
  end if;
  if exists (
    select 1
    from api.simulation_runs as runs
    where runs.state in ('queued', 'running', 'retrying', 'cancel_requested')
  )
  or exists (
    select 1
    from private.run_outbox as outbox
    where outbox.status in ('pending', 'claimed')
  ) then
    raise exception using errcode = '55000', message = 'queue_transport_not_drained';
  end if;

  update private.queue_transport_control as control
  set active_transport = requested_transport,
      correlation_id = requested_correlation_id,
      updated_at = pg_catalog.statement_timestamp()
  where control.singleton;

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
    'system',
    null,
    'operator.queue_transport_changed',
    'queue_transport_control',
    null,
    requested_correlation_id,
    'success',
    'operator',
    pg_catalog.jsonb_build_object(
      'from_transport', prior_transport,
      'to_transport', requested_transport
    )
  );
  return true;
end
$function$;

create function private.get_queue_transport_control()
returns table (
  active_transport text,
  correlation_id uuid,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  if session_user not in ('postgres', 'supabase_admin', 'simula_operator') then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  return query
  select
    control.active_transport,
    control.correlation_id,
    control.updated_at
  from private.queue_transport_control as control
  where control.singleton;
end
$function$;

revoke all on function private.set_queue_transport(text, uuid)
  from public, anon, authenticated, simula_api, simula_worker,
    simula_operator, simula_command_owner, simula_worker_owner;
revoke all on function private.get_queue_transport_control()
  from public, anon, authenticated, simula_api, simula_worker,
    simula_operator, simula_command_owner, simula_worker_owner;
grant execute on function private.set_queue_transport(text, uuid)
  to simula_operator;
grant execute on function private.get_queue_transport_control()
  to simula_operator;

do $least_privilege$
begin
  if pg_catalog.has_table_privilege(
    'simula_operator',
    'private.queue_transport_control',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  )
  or not pg_catalog.has_function_privilege(
    'simula_operator',
    'private.set_queue_transport(text,uuid)',
    'EXECUTE'
  )
  or not pg_catalog.has_function_privilege(
    'simula_operator',
    'private.get_queue_transport_control()',
    'EXECUTE'
  )
  or pg_catalog.has_function_privilege(
    'simula_api',
    'private.require_queue_transport(text)',
    'EXECUTE'
  )
  or not pg_catalog.has_function_privilege(
    'simula_worker',
    'private.require_queue_transport(text)',
    'EXECUTE'
  )
  or pg_catalog.has_function_privilege(
    'simula_worker',
    'private.claim_due_run_outbox_unfenced(integer)',
    'EXECUTE'
  )
  or pg_catalog.has_function_privilege(
    'simula_worker',
    'private.claim_run_execution_unfenced(uuid,smallint,text)',
    'EXECUTE'
  )
  or pg_catalog.has_function_privilege(
    'simula_worker',
    'private.claim_run_execution_unfenced_traced(uuid,smallint,text)',
    'EXECUTE'
  ) then
    raise exception 'queue transport fence privilege drift';
  end if;
end
$least_privilege$;

reset role;

-- Supabase records migration history in the same session after this script.
set role postgres;
