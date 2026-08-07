-- Failure audit rows are already required by worker RLS policies and durable
-- failure functions. Admit that explicit outcome at the table boundary.

set role postgres;

alter table private.audit_events
  drop constraint audit_events_outcome_valid,
  add constraint audit_events_outcome_valid
    check (outcome in ('success', 'denied', 'failure'));

grant execute on function private.runtime_schema_readiness_v3() to postgres;
grant execute on function private.runtime_observability_snapshot_v3() to postgres;

do $patch_worker_failure_audit_runtime_head$
declare
  original_definition text;
  replacement_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'private.runtime_schema_readiness_v3()'::pg_catalog.regprocedure
  ) into original_definition;
  replacement_definition := pg_catalog.replace(
    original_definition,
    '20260807190000::bigint',
    '20260807200000::bigint'
  );
  if replacement_definition = original_definition then
    raise exception using errcode = '55000',
      message = 'worker_failure_audit_readiness_head_patch_failed';
  end if;
  execute replacement_definition;

  select pg_catalog.pg_get_functiondef(
    'private.runtime_observability_snapshot_v3()'::pg_catalog.regprocedure
  ) into original_definition;
  replacement_definition := pg_catalog.replace(
    original_definition,
    '20260807190000::bigint',
    '20260807200000::bigint'
  );
  if replacement_definition = original_definition then
    raise exception using errcode = '55000',
      message = 'worker_failure_audit_observability_head_patch_failed';
  end if;
  execute replacement_definition;
end
$patch_worker_failure_audit_runtime_head$;

revoke execute on function private.runtime_schema_readiness_v3() from postgres;
revoke execute on function private.runtime_observability_snapshot_v3() from postgres;
