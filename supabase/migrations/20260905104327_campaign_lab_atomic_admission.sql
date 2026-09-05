-- Close every Campaign Lab write path, including older compatible API wrappers,
-- with the same durable operator latch used by legacy runs. Replayed commands
-- return before INSERT and therefore remain available while admission is paused.
set role postgres;
grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create function private.enforce_campaign_lab_run_admission()
returns trigger
language plpgsql security definer set search_path = '' set row_security = 'on'
as $function$
declare
  control_enabled boolean;
  pressure_reason text;
begin
  if session_user <> 'simula_api' then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('simula.global_run_admission', 0)
  );
  -- A completed operator pause cannot race an uncommitted admission: the
  -- operator's row UPDATE waits for this transaction's shared row lock.
  select enabled, bullmq_pressure_reason into control_enabled, pressure_reason
    from private.runtime_controls where control_name = 'run_creation'
    for share;
  if not found or not control_enabled or pressure_reason is not null then
    raise exception using errcode = 'P0001', message = 'queue_backpressure';
  end if;
  -- The bound covers the whole durable Campaign Lab workload across tenants,
  -- including canceled work whose evaluator/lease has not yet been finalized.
  if (select count(*) from (
        select 1 from api.campaign_lab_runs
        where status in ('queued','running','retrying','cancel_requested')
        limit 100
      ) as pending) >= 100 then
    raise exception using errcode = 'P0001', message = 'queue_backpressure';
  end if;
  return new;
end
$function$;
revoke all on function private.enforce_campaign_lab_run_admission()
  from public, anon, authenticated, simula_api, simula_worker,
       simula_command_owner, postgres;

grant execute on function private.enforce_campaign_lab_run_admission() to postgres;
set role postgres;
create trigger campaign_lab_runs_atomic_admission
before insert on api.campaign_lab_runs
for each row execute function private.enforce_campaign_lab_run_admission();
create index campaign_lab_runs_nonterminal_admission_idx
on api.campaign_lab_runs(status)
where status in ('queued','running','retrying','cancel_requested');
set role simula_worker_owner;
revoke execute on function private.enforce_campaign_lab_run_admission() from postgres;
set role postgres;
revoke create on schema private from simula_worker_owner;
set role postgres;

-- Keep the deployed V4 contract intact; V5 must now prove the admission guard
-- is installed and enabled before accepting new-format work.
create or replace function private.bound_report_schema_present_v1()
returns boolean
language sql security definer set search_path = '' set row_security = 'on'
as $function$
  select pg_catalog.to_regclass('api.campaign_lab_report_reviews') is not null
    and pg_catalog.to_regprocedure('api.review_campaign_lab_bound_report(uuid,text,text,jsonb,text,text,uuid)') is not null
    and exists (
      select 1 from pg_catalog.pg_trigger t
      where t.tgrelid = pg_catalog.to_regclass('api.campaign_lab_runs')
        and t.tgname = 'campaign_lab_runs_atomic_admission'
        and t.tgfoid = pg_catalog.to_regprocedure('private.enforce_campaign_lab_run_admission()')
        and t.tgenabled in ('O', 'A') and not t.tgisinternal
        and t.tgtype = 7
    );
$function$;

create or replace function private.runtime_schema_readiness_v5()
returns table (migration_version bigint, rls_force_enabled boolean)
language sql security invoker set search_path = ''
as $function$
  select 20260905104327::bigint,
    previous.rls_force_enabled and private.bound_report_schema_present_v1()
  from private.runtime_schema_readiness_v4() as previous;
$function$;
