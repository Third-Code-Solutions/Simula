-- Reconcile stale or operator-declared Redis-loss dispatches without granting
-- table access to the worker. Every transition follows run -> outbox locking.
grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create function private.reconcile_run_dispatch(
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

revoke all on function private.reconcile_run_dispatch(integer, boolean)
  from public, anon, authenticated, simula_api, simula_command_owner;
grant execute on function private.reconcile_run_dispatch(integer, boolean) to simula_worker;
reset role;
grant insert on table private.run_outbox to simula_worker_owner;
create policy run_outbox_worker_owner_recovery_insert
on private.run_outbox
for insert
to simula_worker_owner
with check (
  generation between 2 and 3
  and status = 'pending'
  and claim_token is null
  and claim_expires_at is null
  and confirmed_at is null
  and terminal_error_code is null
  and job_id = 'run:' || run_id::text || ':dispatch:' || generation::text
  and exists (
    select 1
    from api.simulation_runs as runs
    where runs.id = run_outbox.run_id
      and runs.organization_id = run_outbox.organization_id
      and runs.dispatch_generation = run_outbox.generation
      and runs.state in ('queued', 'retrying')
  )
);
revoke create on schema private from simula_worker_owner;
