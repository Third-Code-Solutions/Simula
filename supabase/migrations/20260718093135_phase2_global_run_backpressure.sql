-- P2-07: make durable run admission fail closed when the global outbox has
-- saturated or is no longer making progress. The trigger executes only for
-- new API-created runs, so a valid idempotency replay remains available while
-- the system recovers.

create index run_outbox_pending_admission_idx
on private.run_outbox (created_at)
where status in ('pending', 'claimed');

-- The worker owner already has the exact private outbox read policy needed by
-- this trigger; the API command owner receives no new table privilege.
grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create function private.enforce_global_run_backpressure()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  -- Local fixtures and privileged operational repair do not become application
  -- admission paths. The API runtime is the only unprivileged caller allowed
  -- to insert a simulation run.
  if session_user <> 'simula_api' then
    return new;
  end if;

  -- Serialize only new-run admission. This makes the count check correct
  -- across API replicas without holding a global lock for normal reads/cancel.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('simula.global_run_admission', 0)
  );

  if (
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

-- The migration runner creates the trigger as postgres. Function execution is
-- default-denied in this private schema, so grant it only for trigger DDL and
-- immediately revoke it after the trigger is installed.
grant execute on function private.enforce_global_run_backpressure() to postgres;
reset role;
revoke create on schema private from simula_worker_owner;

create trigger simulation_runs_global_backpressure_before_insert
before insert on api.simulation_runs
for each row
execute function private.enforce_global_run_backpressure();

set role simula_worker_owner;
revoke all on function private.enforce_global_run_backpressure()
  from public, anon, authenticated, simula_api, simula_worker, postgres;
reset role;
