-- Cover both tenant/run and tenant/run/attempt receipt foreign keys with one
-- narrow immutable-table index, and report this exact compatibility head.

set role postgres;
grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create index provider_success_receipts_organization_run_attempt_idx
on private.provider_success_receipts (organization_id, run_id, attempt_id);

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
    '20260720070010::bigint',
    '20260720072350::bigint'
  );
  if replacement_definition = original_definition then
    raise exception using
      errcode = '55000',
      message = 'runtime_observability_provider_receipt_index_migration_patch_failed';
  end if;
  execute replacement_definition;
end
$patch_runtime_migration$;

set role postgres;
revoke create on schema private from simula_worker_owner;
