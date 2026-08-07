-- Restore the v3 Campaign Lab admission function to the least-privilege
-- command-owner boundary used by the rest of the authenticated API commands.

set role postgres;
grant create on schema private to simula_command_owner;

alter function private.create_campaign_lab_run_atomic_v3(
  uuid, uuid, text, jsonb, jsonb, text, text, uuid
) owner to simula_command_owner;

revoke create on schema private from simula_command_owner;

set role simula_command_owner;

revoke all on function private.create_campaign_lab_run_atomic_v3(
  uuid, uuid, text, jsonb, jsonb, text, text, uuid
) from public, anon, authenticated, simula_worker, simula_worker_owner, postgres;

grant execute on function private.create_campaign_lab_run_atomic_v3(
  uuid, uuid, text, jsonb, jsonb, text, text, uuid
) to simula_api;

reset role;
set role postgres;

grant execute on function private.runtime_schema_readiness_v3() to postgres;
grant execute on function private.runtime_observability_snapshot_v3() to postgres;

do $patch_campaign_lab_v3_command_owner_runtime_head$
declare
  original_definition text;
  replacement_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'private.runtime_schema_readiness_v3()'::pg_catalog.regprocedure
  ) into original_definition;
  replacement_definition := pg_catalog.replace(
    original_definition,
    '20260807104033::bigint',
    '20260807190000::bigint'
  );
  if replacement_definition = original_definition then
    raise exception using errcode = '55000',
      message = 'campaign_lab_v3_command_owner_readiness_head_patch_failed';
  end if;
  execute replacement_definition;

  select pg_catalog.pg_get_functiondef(
    'private.runtime_observability_snapshot_v3()'::pg_catalog.regprocedure
  ) into original_definition;
  replacement_definition := pg_catalog.replace(
    original_definition,
    '20260807104033::bigint',
    '20260807190000::bigint'
  );
  if replacement_definition = original_definition then
    raise exception using errcode = '55000',
      message = 'campaign_lab_v3_command_owner_observability_head_patch_failed';
  end if;
  execute replacement_definition;
end
$patch_campaign_lab_v3_command_owner_runtime_head$;

revoke execute on function private.runtime_schema_readiness_v3() from postgres;
revoke execute on function private.runtime_observability_snapshot_v3() from postgres;
