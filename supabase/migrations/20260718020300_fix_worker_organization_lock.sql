-- Serialize per-organization worker claims without requiring UPDATE on the
-- organization table. The worker owner remains unable to mutate organizations.

grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

do $migration$
declare
  function_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'private.claim_run_execution(uuid,smallint,text)'::regprocedure
  ) into function_definition;

  if position(
    E'  perform 1 from api.organizations\n    where id = located_organization_id\n    for update;'
    in function_definition
  ) = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'expected_claim_organization_lock_not_found';
  end if;

  function_definition := replace(
    function_definition,
    E'  perform 1 from api.organizations\n    where id = located_organization_id\n    for update;',
    E'  perform pg_catalog.pg_advisory_xact_lock(\n    pg_catalog.hashtextextended(located_organization_id::text, 0)\n  );'
  );
  execute function_definition;
end
$migration$;

revoke create on schema private from simula_worker_owner;
reset role;
