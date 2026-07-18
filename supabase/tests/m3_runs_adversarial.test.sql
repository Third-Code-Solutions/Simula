begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(11);

select extensions.has_function(
  'api',
  'create_simulation_run',
  array['uuid', 'uuid', 'text', 'text', 'uuid']::text[],
  'API exposes the sole run-creation wrapper'
);

select extensions.has_function(
  'private',
  'create_simulation_run_atomic',
  array['uuid', 'uuid', 'text', 'text', 'uuid']::text[],
  'run creation is one private atomic transaction'
);

select extensions.has_function(
  'private',
  'claim_due_run_outbox',
  array['integer']::text[],
  'dispatcher can claim durable outbox work'
);

select extensions.has_function(
  'private',
  'confirm_run_dispatch',
  array['uuid', 'uuid']::text[],
  'dispatcher alone can confirm queue dispatch'
);

select extensions.has_function(
  'private',
  'claim_run_execution',
  array['uuid', 'smallint', 'text']::text[],
  'worker must claim an exact confirmed job before manifest access'
);

select extensions.has_function(
  'private',
  'complete_run_execution',
  array['uuid', 'uuid', 'uuid', 'jsonb']::text[],
  'worker completes one terminal result through a lease helper'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'simula_api',
    'api.create_simulation_run(uuid,uuid,text,text,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'simula_worker',
    'api.create_simulation_run(uuid,uuid,text,text,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'API command is unreachable to the worker runtime role'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'simula_worker',
    'private.claim_run_execution(uuid,smallint,text)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'simula_api',
    'private.claim_run_execution(uuid,smallint,text)'::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'execution claim is reachable only to the worker runtime role'
);

select extensions.ok(
  not pg_catalog.has_table_privilege(
    'simula_worker',
    'api.simulation_runs'::pg_catalog.regclass,
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not pg_catalog.has_table_privilege(
    'simula_worker',
    'private.run_outbox'::pg_catalog.regclass,
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'worker runtime role has no direct run or outbox table access'
);

select extensions.is(
  (
    select constraints.confdeltype::text
    from pg_catalog.pg_constraint as constraints
    where constraints.conname = 'simulation_runs_project_foreign_key'
      and constraints.conrelid = 'api.simulation_runs'::pg_catalog.regclass
  ),
  'c',
  'project deletion cascades through the complete run graph'
);

select extensions.is(
  (
    select constraints.confdeltype::text
    from pg_catalog.pg_constraint as constraints
    where constraints.conname = 'simulation_runs_stimulus_version_foreign_key'
      and constraints.conrelid = 'api.simulation_runs'::pg_catalog.regclass
  ),
  'c',
  'stimulus-version deletion cascades through the complete run graph'
);

select * from extensions.finish();
rollback;
