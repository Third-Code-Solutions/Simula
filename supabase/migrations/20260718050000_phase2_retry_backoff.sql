-- Retry delay is decided atomically with the lease-bound failure transition.
-- The worker receives only a typed state/delay token and never reads tables.
grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

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
  if not found then
    return 'no_work';
  end if;
  select * into selected_attempt from private.run_attempts
  where id = requested_attempt_id and run_id = requested_run_id for update;
  if not found or selected_attempt.status <> 'running'
    or selected_attempt.lease_token <> requested_lease_token
    or selected_run.worker_lease_token <> requested_lease_token then
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

reset role;
revoke create on schema private from simula_worker_owner;
