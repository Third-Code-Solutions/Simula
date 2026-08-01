-- Bind runtime readiness and observability to the complete campaign-evidence
-- release head. The prior admission migration predates the evidence lab.

set role postgres;
grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

do $patch_runtime_migration_head$
declare
  original_definition text;
  replacement_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'private.runtime_schema_readiness()'::pg_catalog.regprocedure
  ) into original_definition;
  replacement_definition := pg_catalog.replace(
    original_definition,
    '20260730230000::bigint',
    '20260801135222::bigint'
  );
  if replacement_definition = original_definition then
    raise exception using
      errcode = '55000',
      message = 'runtime_schema_readiness_migration_head_patch_failed';
  end if;
  execute replacement_definition;

  select pg_catalog.pg_get_functiondef(
    'private.runtime_observability_snapshot()'::pg_catalog.regprocedure
  ) into original_definition;
  replacement_definition := pg_catalog.replace(
    original_definition,
    '20260730230000::bigint',
    '20260801135222::bigint'
  );
  if replacement_definition = original_definition then
    raise exception using
      errcode = '55000',
      message = 'runtime_observability_migration_head_patch_failed';
  end if;
  execute replacement_definition;
end
$patch_runtime_migration_head$;

set role postgres;
revoke create on schema private from simula_worker_owner;
