-- Phase 2 operational run control. Critical queue conditions latch admission
-- closed until a postgres operator explicitly verifies recovery and re-enables
-- it. Existing runs, reads, cancellation, dispatch, and recovery remain live.

set role postgres;

create table private.runtime_controls (
  control_name text primary key,
  enabled boolean not null,
  reason text,
  correlation_id uuid not null,
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint runtime_controls_name_valid check (control_name = 'run_creation'),
  constraint runtime_controls_reason_valid check (
    (enabled and reason is null)
    or (
      not enabled
      and reason in (
        'oldest_undispatched_critical',
        'operator_manual',
        'poison_outbox',
        'redis_memory_critical'
      )
    )
  )
);

alter table private.runtime_controls enable row level security;
alter table private.runtime_controls force row level security;

insert into private.runtime_controls (
  control_name,
  enabled,
  reason,
  correlation_id
) values (
  'run_creation',
  true,
  null,
  '00000000-0000-4000-8000-000000000001'::uuid
);

create policy runtime_controls_worker_owner_select
on private.runtime_controls
for select
to simula_worker_owner
using (control_name = 'run_creation');

create policy runtime_controls_worker_owner_update
on private.runtime_controls
for update
to simula_worker_owner
using (control_name = 'run_creation')
with check (control_name = 'run_creation');

create policy audit_events_worker_control_insert
on private.audit_events
for insert
to simula_worker_owner
with check (
  organization_id is null
  and actor_type = 'system'
  and actor_user_id is null
  and action = 'operator.run_creation_disabled'
  and object_type = 'runtime_control'
  and object_id is null
  and outcome = 'success'
  and source_service = 'worker'
  and metadata = '{}'::jsonb
);

grant select, update on table private.runtime_controls to simula_worker_owner;
grant insert on table private.audit_events to simula_worker_owner;
grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create function private.evaluate_run_creation_control(
  requested_redis_memory_percent numeric,
  requested_poisoned_count integer
)
returns table (
  run_creation_enabled boolean,
  alert_reason text,
  changed boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  current_control private.runtime_controls%rowtype;
  critical_reason text;
  event_correlation_id uuid;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_redis_memory_percent is null
    or requested_redis_memory_percent < 0
    or requested_redis_memory_percent > 100
    or requested_poisoned_count is null
    or requested_poisoned_count < 0
  then
    raise exception using errcode = '22023', message = 'invalid_operational_snapshot';
  end if;

  select controls.* into strict current_control
  from private.runtime_controls as controls
  where controls.control_name = 'run_creation'
  for update;

  if not current_control.enabled then
    return query select false, current_control.reason, false;
    return;
  end if;

  if requested_poisoned_count > 0 then
    critical_reason := 'poison_outbox';
  elsif requested_redis_memory_percent >= 90 then
    critical_reason := 'redis_memory_critical';
  elsif exists (
    select 1
    from private.run_outbox as outbox
    where outbox.status in ('pending', 'claimed')
      and outbox.created_at <= pg_catalog.statement_timestamp() - interval '5 minutes'
  ) then
    critical_reason := 'oldest_undispatched_critical';
  end if;

  if critical_reason is null then
    return query select true, null::text, false;
    return;
  end if;

  event_correlation_id := pg_catalog.gen_random_uuid();
  update private.runtime_controls as controls
  set enabled = false,
      reason = critical_reason,
      correlation_id = event_correlation_id,
      updated_at = pg_catalog.statement_timestamp()
  where controls.control_name = 'run_creation';

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
    'operator.run_creation_disabled',
    'runtime_control',
    null,
    event_correlation_id,
    'success',
    'worker',
    '{}'::jsonb
  );

  return query select false, critical_reason, true;
end
$function$;

revoke all on function private.evaluate_run_creation_control(numeric, integer)
  from public, anon, authenticated, simula_api, simula_worker;
grant execute on function private.evaluate_run_creation_control(numeric, integer)
  to simula_worker;

set role postgres;
revoke create on schema private from simula_worker_owner;

create function private.set_run_creation_control(
  requested_enabled boolean,
  requested_reason text,
  requested_correlation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  prior_enabled boolean;
begin
  if requested_enabled is null
    or requested_correlation_id is null
    or (
      requested_enabled
      and requested_reason <> 'operator_recovery_verified'
    )
    or (
      not requested_enabled
      and requested_reason <> 'operator_manual'
    )
  then
    raise exception using errcode = '22023', message = 'invalid_operator_control';
  end if;

  select controls.enabled into strict prior_enabled
  from private.runtime_controls as controls
  where controls.control_name = 'run_creation'
  for update;

  if prior_enabled = requested_enabled then
    return false;
  end if;

  update private.runtime_controls as controls
  set enabled = requested_enabled,
      reason = case when requested_enabled then null else 'operator_manual' end,
      correlation_id = requested_correlation_id,
      updated_at = pg_catalog.statement_timestamp()
  where controls.control_name = 'run_creation';

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
    case
      when requested_enabled then 'operator.run_creation_enabled'
      else 'operator.run_creation_disabled'
    end,
    'runtime_control',
    null,
    requested_correlation_id,
    'success',
    'operator',
    pg_catalog.jsonb_build_object('reason', requested_reason)
  );

  return true;
end
$function$;

revoke all on function private.set_run_creation_control(boolean, text, uuid)
  from public, anon, authenticated, simula_api, simula_worker,
    simula_command_owner, simula_worker_owner;
grant execute on function private.set_run_creation_control(boolean, text, uuid)
  to postgres;

grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create or replace function private.enforce_global_run_backpressure()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  if session_user <> 'simula_api' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('simula.global_run_admission', 0)
  );

  if exists (
    select 1
    from private.runtime_controls as controls
    where controls.control_name = 'run_creation'
      and not controls.enabled
  )
  or (
    select pg_catalog.count(*)
    from private.run_outbox as outbox
    where outbox.status in ('pending', 'claimed')
  ) >= 100
  or exists (
    select 1
    from private.run_outbox as outbox
    where outbox.status in ('pending', 'claimed')
      and outbox.created_at <= pg_catalog.statement_timestamp() - interval '60 seconds'
  ) then
    raise exception using errcode = 'P0001', message = 'queue_backpressure';
  end if;

  return new;
end
$function$;

alter function private.enforce_global_run_backpressure()
  owner to simula_worker_owner;
revoke all on function private.enforce_global_run_backpressure()
  from public, anon, authenticated, simula_api, simula_worker, postgres;

set role postgres;
revoke create on schema private from simula_worker_owner;
