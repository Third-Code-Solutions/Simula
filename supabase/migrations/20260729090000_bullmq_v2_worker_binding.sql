set check_function_bodies = on;
set lock_timeout = '5s';
set statement_timeout = '30s';

set role postgres;
grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create function private.claim_run_execution_v2_traced(
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
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_run_id is null
    or requested_generation is null
    or requested_generation not between 1 and 3
    or requested_job_id is null
    or requested_job_id <> (
      'run-' || requested_run_id::text || '-generation-' || requested_generation::text
    ) then
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
  from private.claim_run_execution_traced(
    requested_run_id,
    requested_generation,
    'run:' || requested_run_id::text || ':dispatch:' || requested_generation::text
  );
end
$function$;

alter function private.claim_run_execution_v2_traced(uuid, smallint, text)
  owner to simula_worker_owner;
revoke all on function private.claim_run_execution_v2_traced(uuid, smallint, text)
  from public, anon, authenticated, simula_api, simula_worker;
grant execute on function private.claim_run_execution_v2_traced(uuid, smallint, text)
  to simula_worker;

set role postgres;
revoke create on schema private from simula_worker_owner;
