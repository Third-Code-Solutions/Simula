-- The execution row is already locked before this check and results are
-- uniquely keyed by run_id. Avoid a redundant FOR UPDATE that would require
-- granting result-table UPDATE to the worker owner.

grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

do $migration$
declare
  function_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'private.complete_run_execution(uuid,uuid,uuid,jsonb)'::regprocedure
  ) into function_definition;

  if position(
    E'  perform 1 from api.simulation_results where run_id = requested_run_id for update;'
    in function_definition
  ) = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'expected_completion_result_lock_not_found';
  end if;

  function_definition := replace(
    function_definition,
    E'  perform 1 from api.simulation_results where run_id = requested_run_id for update;',
    E'  perform 1 from api.simulation_results where run_id = requested_run_id;'
  );
  execute function_definition;
end
$migration$;

revoke create on schema private from simula_worker_owner;
reset role;
