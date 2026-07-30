-- Bind deployed API/dispatcher readiness to the exact additive migration head
-- without granting application roles access to migration history or catalogs.

set role postgres;
grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create function private.runtime_schema_readiness()
returns table (
  migration_version bigint,
  rls_force_enabled boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  if session_user not in ('simula_api', 'simula_worker') then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  return query
  select
    20260730230000::bigint,
    not exists (
      select 1
      from pg_catalog.pg_class as relations
      join pg_catalog.pg_namespace as schemas
        on schemas.oid = relations.relnamespace
      where schemas.nspname in ('api', 'private')
        and relations.relkind in ('r', 'p')
        and (not relations.relrowsecurity or not relations.relforcerowsecurity)
    );
end
$function$;

do $patch_runtime_migration$
declare
  original_definition text;
  replacement_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'private.runtime_observability_snapshot()'::pg_catalog.regprocedure
  ) into original_definition;
  replacement_definition := pg_catalog.replace(
    original_definition,
    '20260720072350::bigint',
    '20260730230000::bigint'
  );
  if replacement_definition = original_definition then
    raise exception using
      errcode = '55000',
      message = 'runtime_observability_production_admission_migration_patch_failed';
  end if;
  execute replacement_definition;
end
$patch_runtime_migration$;

revoke all on function private.runtime_schema_readiness()
  from public, anon, authenticated, simula_api, simula_worker, postgres;
grant execute on function private.runtime_schema_readiness()
  to simula_api, simula_worker;

set role postgres;
revoke create on schema private from simula_worker_owner;
