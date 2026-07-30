-- Feed dispatched BullMQ ready depth and age into durable run admission.
-- Critical conditions keep the existing operator-verified latch. Ordinary
-- queue pressure clears only after a healthy worker-only dispatcher observes
-- all three BullMQ signals below their approved thresholds.

set role postgres;

alter table private.runtime_controls
  add column bullmq_pressure_reason text,
  add constraint runtime_controls_bullmq_pressure_reason_valid check (
    bullmq_pressure_reason is null
    or bullmq_pressure_reason in (
      'bullmq_depth_high',
      'bullmq_oldest_ready_high',
      'redis_memory_high'
    )
  );

grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create function private.update_bullmq_run_pressure(
  requested_ready_depth integer,
  requested_oldest_ready_age_seconds numeric,
  requested_redis_memory_percent numeric
)
returns table (
  pressure_reason text,
  changed boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  current_reason text;
  next_reason text;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_ready_depth is null
    or requested_ready_depth < 0
    or requested_oldest_ready_age_seconds is null
    or requested_oldest_ready_age_seconds < 0
    or requested_oldest_ready_age_seconds > 2147483647
    or requested_redis_memory_percent is null
    or requested_redis_memory_percent < 0
    or requested_redis_memory_percent > 100
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_bullmq_pressure_snapshot';
  end if;

  select controls.bullmq_pressure_reason
    into strict current_reason
  from private.runtime_controls as controls
  where controls.control_name = 'run_creation'
  for update;

  next_reason := case
    when requested_redis_memory_percent >= 80 then 'redis_memory_high'
    when requested_ready_depth >= 100 then 'bullmq_depth_high'
    when requested_oldest_ready_age_seconds >= 60
      then 'bullmq_oldest_ready_high'
    else null
  end;

  if current_reason is not distinct from next_reason then
    return query select next_reason, false;
    return;
  end if;

  update private.runtime_controls as controls
  set bullmq_pressure_reason = next_reason,
      updated_at = pg_catalog.statement_timestamp()
  where controls.control_name = 'run_creation';

  return query select next_reason, true;
end
$function$;

revoke all on function private.update_bullmq_run_pressure(
  integer, numeric, numeric
)
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, postgres;
grant execute on function private.update_bullmq_run_pressure(
  integer, numeric, numeric
)
to simula_worker;

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
      and (
        not controls.enabled
        or controls.bullmq_pressure_reason is not null
      )
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
      and outbox.created_at
        <= pg_catalog.statement_timestamp() - interval '60 seconds'
  ) then
    raise exception using errcode = 'P0001', message = 'queue_backpressure';
  end if;

  return new;
end
$function$;

revoke all on function private.enforce_global_run_backpressure()
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, postgres;

set role postgres;
revoke create on schema private from simula_worker_owner;
reset role;
