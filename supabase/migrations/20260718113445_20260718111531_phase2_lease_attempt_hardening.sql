-- Expired worker authority is never renewable or mutation-capable. Recovery
-- also closes the attempt it supersedes so terminal/recovered runs cannot
-- retain an authoritative `running` attempt.
grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create or replace function private.heartbeat_run_execution(
  requested_run_id uuid,
  requested_attempt_id uuid,
  requested_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  selected_run api.simulation_runs%rowtype;
  selected_attempt private.run_attempts%rowtype;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  select * into selected_run from api.simulation_runs
  where id = requested_run_id for update;
  if not found or selected_run.state <> 'running'
    or selected_run.worker_lease_token <> requested_lease_token
    or selected_run.worker_lease_expires_at is null
    or selected_run.worker_lease_expires_at <= pg_catalog.statement_timestamp() then
    return false;
  end if;
  select * into selected_attempt from private.run_attempts
  where id = requested_attempt_id and run_id = requested_run_id for update;
  if not found or selected_attempt.status <> 'running'
    or selected_attempt.lease_token <> requested_lease_token
    or selected_attempt.lease_expires_at is null
    or selected_attempt.lease_expires_at <= pg_catalog.statement_timestamp() then
    return false;
  end if;
  update api.simulation_runs
  set worker_lease_expires_at = pg_catalog.statement_timestamp() + interval '30 seconds',
      last_progress_at = pg_catalog.statement_timestamp(),
      updated_at = pg_catalog.statement_timestamp(),
      version = version + 1
  where id = requested_run_id;
  update private.run_attempts
  set lease_expires_at = pg_catalog.statement_timestamp() + interval '30 seconds'
  where id = requested_attempt_id;
  return true;
end
$function$;

create or replace function private.fail_run_execution(
  requested_run_id uuid,
  requested_attempt_id uuid,
  requested_lease_token uuid,
  requested_safe_error_code text,
  requested_retryable boolean
)
returns text
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  selected_run api.simulation_runs%rowtype;
  selected_attempt private.run_attempts%rowtype;
  next_state api.run_state;
  recorded_safe_error_code text;
  retry_delay_seconds smallint;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_safe_error_code is null
    or requested_safe_error_code !~ '^[a-z][a-z0-9_]{0,63}$'
    or requested_retryable is null then
    raise exception using errcode = '22023', message = 'invalid_run_failure';
  end if;
  select * into selected_run from api.simulation_runs
  where id = requested_run_id for update;
  if not found
    or selected_run.worker_lease_token <> requested_lease_token
    or selected_run.worker_lease_expires_at is null
    or selected_run.worker_lease_expires_at <= pg_catalog.statement_timestamp() then
    return 'no_work';
  end if;
  select * into selected_attempt from private.run_attempts
  where id = requested_attempt_id and run_id = requested_run_id for update;
  if not found or selected_attempt.status <> 'running'
    or selected_attempt.lease_token <> requested_lease_token
    or selected_attempt.lease_expires_at is null
    or selected_attempt.lease_expires_at <= pg_catalog.statement_timestamp() then
    return 'no_work';
  end if;

  if selected_run.state = 'cancel_requested' then
    next_state := 'canceled';
    recorded_safe_error_code := 'canceled_by_user';
  elsif selected_run.state = 'running'
    and requested_retryable
    and selected_run.attempt_count < 3 then
    next_state := 'retrying';
    recorded_safe_error_code := requested_safe_error_code;
    retry_delay_seconds := case selected_run.attempt_count
      when 1 then 5
      when 2 then 30
      else null
    end;
  elsif selected_run.state in ('running', 'retrying') then
    next_state := 'failed';
    recorded_safe_error_code := requested_safe_error_code;
  else
    return 'no_work';
  end if;

  update private.run_attempts
  set status = case
        when next_state = 'retrying' then 'retrying'::private.attempt_status
        when next_state = 'canceled' then 'canceled'::private.attempt_status
        else 'failed'::private.attempt_status
      end,
      finished_at = pg_catalog.statement_timestamp(),
      safe_error_code = recorded_safe_error_code
  where id = selected_attempt.id;
  update api.simulation_runs
  set state = next_state,
      worker_lease_token = null,
      worker_lease_expires_at = null,
      terminal_at = case when next_state in ('canceled', 'failed')
        then pg_catalog.statement_timestamp() else null end,
      updated_at = pg_catalog.statement_timestamp(),
      version = version + 1
  where id = selected_run.id;
  if next_state = 'canceled' then
    update private.run_outbox
    set status = 'terminal',
        claim_token = null,
        claim_expires_at = null,
        confirmed_at = null,
        terminal_error_code = 'canceled',
        updated_at = pg_catalog.statement_timestamp()
    where run_id = selected_run.id
      and status <> 'terminal';
  end if;
  insert into private.run_events (
    organization_id, run_id, previous_state, new_state, attempt_number,
    safe_reason, actor_type, correlation_id
  ) values (
    selected_run.organization_id, selected_run.id, selected_run.state, next_state,
    selected_attempt.attempt_number, recorded_safe_error_code, 'worker',
    selected_run.correlation_id
  );
  insert into private.audit_events (
    organization_id, actor_type, action, object_type, object_id,
    correlation_id, outcome, source_service, metadata
  ) values (
    selected_run.organization_id, 'worker',
    case when next_state = 'canceled' then 'run.canceled' else 'run.failed' end,
    'simulation_run', selected_run.id, selected_run.correlation_id, 'success', 'worker',
    pg_catalog.jsonb_build_object(
      'safe_error_code', recorded_safe_error_code,
      'next_state', next_state,
      'retry_after_seconds', retry_delay_seconds
    )
  );
  if next_state = 'retrying' then
    return 'retrying:' || retry_delay_seconds::text;
  end if;
  return next_state::text;
end
$function$;

create or replace function private.finalize_requested_cancellations(requested_batch_size integer)
returns integer
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  selected_run api.simulation_runs%rowtype;
  finalized_count integer := 0;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_batch_size is null or requested_batch_size not between 1 and 20 then
    raise exception using errcode = '22023', message = 'invalid_cancel_batch_size';
  end if;

  for selected_run in
    select *
    from api.simulation_runs as runs
    where runs.state = 'cancel_requested'
      and (
        runs.worker_lease_expires_at is null
        or runs.worker_lease_expires_at <= pg_catalog.statement_timestamp()
      )
    order by runs.updated_at, runs.id
    for update skip locked
    limit requested_batch_size
  loop
    update private.run_attempts
    set status = 'canceled',
        finished_at = pg_catalog.statement_timestamp(),
        safe_error_code = 'canceled_by_user'
    where run_id = selected_run.id
      and status = 'running'
      and lease_expires_at <= pg_catalog.statement_timestamp();
    update private.run_outbox
    set status = 'terminal',
        claim_token = null,
        claim_expires_at = null,
        confirmed_at = null,
        terminal_error_code = 'canceled',
        updated_at = pg_catalog.statement_timestamp()
    where run_id = selected_run.id
      and status <> 'terminal';
    update api.simulation_runs
    set state = 'canceled',
        worker_lease_token = null,
        worker_lease_expires_at = null,
        terminal_at = pg_catalog.statement_timestamp(),
        updated_at = pg_catalog.statement_timestamp(),
        version = version + 1
    where id = selected_run.id;
    insert into private.run_events (
      organization_id, run_id, previous_state, new_state, attempt_number,
      safe_reason, actor_type, correlation_id
    ) values (
      selected_run.organization_id, selected_run.id, 'cancel_requested',
      'canceled', nullif(selected_run.attempt_count, 0),
      'canceled_before_execution', 'worker', selected_run.correlation_id
    );
    insert into private.audit_events (
      organization_id, actor_type, action, object_type, object_id,
      correlation_id, outcome, source_service, metadata
    ) values (
      selected_run.organization_id, 'worker', 'run.canceled', 'simulation_run',
      selected_run.id, selected_run.correlation_id, 'success', 'worker',
      pg_catalog.jsonb_build_object('reason', 'canceled_before_execution')
    );
    finalized_count := finalized_count + 1;
  end loop;
  return finalized_count;
end
$function$;

create or replace function private.reconcile_run_dispatch(
  requested_batch_size integer,
  requested_force_recovery boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  selected_run api.simulation_runs%rowtype;
  selected_outbox private.run_outbox%rowtype;
  next_generation smallint;
  recovered_state api.run_state;
  reconciled_count integer := 0;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_batch_size is null or requested_batch_size not between 1 and 20
    or requested_force_recovery is null then
    raise exception using errcode = '22023', message = 'invalid_dispatch_reconciliation';
  end if;

  for selected_run in
    select runs.*
    from api.simulation_runs as runs
    where runs.state in ('queued', 'running', 'retrying')
      and (
        runs.worker_lease_expires_at is null
        or runs.worker_lease_expires_at <= pg_catalog.statement_timestamp()
      )
      and (
        requested_force_recovery
        or coalesce(runs.last_progress_at, runs.created_at)
          <= pg_catalog.statement_timestamp() - interval '120 seconds'
      )
    order by coalesce(runs.last_progress_at, runs.created_at), runs.id
    for update skip locked
    limit requested_batch_size
  loop
    select * into selected_outbox
    from private.run_outbox as outbox
    where outbox.run_id = selected_run.id
      and outbox.generation = selected_run.dispatch_generation
    for update;

    if selected_run.attempt_count >= 3 or selected_run.dispatch_generation >= 3 then
      update private.run_attempts
      set status = 'superseded',
          finished_at = pg_catalog.statement_timestamp(),
          safe_error_code = 'recovery_exhausted'
      where run_id = selected_run.id
        and status = 'running'
        and lease_expires_at <= pg_catalog.statement_timestamp();
      update private.run_outbox
      set status = 'terminal',
          claim_token = null,
          claim_expires_at = null,
          confirmed_at = null,
          terminal_error_code = 'recovery_exhausted',
          updated_at = pg_catalog.statement_timestamp()
      where id = selected_outbox.id
        and status <> 'terminal';
      update api.simulation_runs
      set state = 'failed',
          worker_lease_token = null,
          worker_lease_expires_at = null,
          terminal_at = pg_catalog.statement_timestamp(),
          updated_at = pg_catalog.statement_timestamp(),
          version = version + 1
      where id = selected_run.id;
      insert into private.run_events (
        organization_id, run_id, previous_state, new_state, attempt_number,
        safe_reason, actor_type, correlation_id
      ) values (
        selected_run.organization_id, selected_run.id, selected_run.state, 'failed',
        nullif(selected_run.attempt_count, 0), 'recovery_exhausted', 'worker',
        selected_run.correlation_id
      );
      insert into private.audit_events (
        organization_id, actor_type, action, object_type, object_id,
        correlation_id, outcome, source_service, metadata
      ) values (
        selected_run.organization_id, 'worker', 'run.recovery_exhausted',
        'simulation_run', selected_run.id, selected_run.correlation_id, 'success',
        'worker', pg_catalog.jsonb_build_object(
          'attempt_count', selected_run.attempt_count,
          'dispatch_generation', selected_run.dispatch_generation,
          'force_recovery', requested_force_recovery
        )
      );
      reconciled_count := reconciled_count + 1;
      continue;
    end if;

    update private.run_attempts
    set status = 'superseded',
        finished_at = pg_catalog.statement_timestamp(),
        safe_error_code = 'recovered_stale_dispatch'
    where run_id = selected_run.id
      and status = 'running'
      and lease_expires_at <= pg_catalog.statement_timestamp();
    next_generation := selected_run.dispatch_generation + 1;
    recovered_state := case
      when selected_run.state = 'running' then 'retrying'::api.run_state
      else selected_run.state
    end;
    update private.run_outbox
    set status = 'terminal',
        claim_token = null,
        claim_expires_at = null,
        confirmed_at = null,
        terminal_error_code = 'recovery_replaced',
        updated_at = pg_catalog.statement_timestamp()
    where id = selected_outbox.id
      and status <> 'terminal';
    update api.simulation_runs
    set state = recovered_state,
        dispatch_generation = next_generation,
        worker_lease_token = null,
        worker_lease_expires_at = null,
        last_progress_at = pg_catalog.statement_timestamp(),
        updated_at = pg_catalog.statement_timestamp(),
        version = version + 1
    where id = selected_run.id;
    insert into private.run_outbox (
      organization_id, run_id, generation, job_id, status, next_attempt_at
    ) values (
      selected_run.organization_id,
      selected_run.id,
      next_generation,
      'run:' || selected_run.id::text || ':dispatch:' || next_generation::text,
      'pending',
      pg_catalog.statement_timestamp()
    );
    insert into private.run_events (
      organization_id, run_id, previous_state, new_state, attempt_number,
      safe_reason, actor_type, correlation_id
    ) values (
      selected_run.organization_id, selected_run.id, selected_run.state, recovered_state,
      nullif(selected_run.attempt_count, 0), 'recovered_stale_dispatch', 'worker',
      selected_run.correlation_id
    );
    insert into private.audit_events (
      organization_id, actor_type, action, object_type, object_id,
      correlation_id, outcome, source_service, metadata
    ) values (
      selected_run.organization_id, 'worker', 'run.dispatch_recovered',
      'simulation_run', selected_run.id, selected_run.correlation_id, 'success', 'worker',
      pg_catalog.jsonb_build_object(
        'previous_generation', selected_run.dispatch_generation,
        'next_generation', next_generation,
        'force_recovery', requested_force_recovery
      )
    );
    reconciled_count := reconciled_count + 1;
  end loop;

  return reconciled_count;
end
$function$;

reset role;
revoke create on schema private from simula_worker_owner;
