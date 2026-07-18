-- Terminalize expired, unconfirmed tenth dispatch attempts.  Ambiguous transport
-- outcomes remain retryable until the claim lease expires; this helper then
-- provides one bounded, audited terminal outcome under run -> outbox locks.
grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create function private.finalize_poisoned_dispatches(requested_batch_size integer)
returns integer
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  selected_run api.simulation_runs%rowtype;
  selected_outbox private.run_outbox%rowtype;
  finalized_count integer := 0;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_batch_size is null or requested_batch_size not between 1 and 20 then
    raise exception using errcode = '22023', message = 'invalid_poison_finalization';
  end if;

  for selected_run in
    select runs.*
    from api.simulation_runs as runs
    where runs.state in ('queued', 'retrying')
      and (
        runs.worker_lease_expires_at is null
        or runs.worker_lease_expires_at <= pg_catalog.statement_timestamp()
      )
      and exists (
        select 1
        from private.run_outbox as outbox
        where outbox.run_id = runs.id
          and outbox.generation = runs.dispatch_generation
          and outbox.status = 'claimed'
          and outbox.dispatch_attempt_count >= 10
          and outbox.claim_expires_at <= pg_catalog.statement_timestamp()
      )
    order by runs.updated_at, runs.id
    for update skip locked
    limit requested_batch_size
  loop
    select * into selected_outbox
    from private.run_outbox as outbox
    where outbox.run_id = selected_run.id
      and outbox.generation = selected_run.dispatch_generation
      and outbox.status = 'claimed'
      and outbox.dispatch_attempt_count >= 10
      and outbox.claim_expires_at <= pg_catalog.statement_timestamp()
    for update;
    if not found then
      continue;
    end if;

    update private.run_outbox
    set status = 'terminal',
        claim_token = null,
        claim_expires_at = null,
        confirmed_at = null,
        terminal_error_code = 'dispatch_exhausted',
        updated_at = pg_catalog.statement_timestamp()
    where id = selected_outbox.id;
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
      nullif(selected_run.attempt_count, 0), 'dispatch_exhausted', 'worker',
      selected_run.correlation_id
    );
    insert into private.audit_events (
      organization_id, actor_type, action, object_type, object_id,
      correlation_id, outcome, source_service, metadata
    ) values (
      selected_run.organization_id, 'worker', 'run.dispatch_exhausted',
      'run_outbox', selected_outbox.id, selected_run.correlation_id, 'success',
      'worker', pg_catalog.jsonb_build_object(
        'dispatch_attempt_count', selected_outbox.dispatch_attempt_count,
        'dispatch_generation', selected_run.dispatch_generation
      )
    );
    finalized_count := finalized_count + 1;
  end loop;

  return finalized_count;
end
$function$;

revoke all on function private.finalize_poisoned_dispatches(integer)
  from public, anon, authenticated, simula_api, simula_command_owner;
grant execute on function private.finalize_poisoned_dispatches(integer) to simula_worker;
reset role;
revoke create on schema private from simula_worker_owner;
