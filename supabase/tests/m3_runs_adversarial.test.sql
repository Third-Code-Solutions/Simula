begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(24);

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

select extensions.has_column(
  'api',
  'simulation_runs',
  'traceparent',
  'run intent retains the originating W3C trace context'
);

select extensions.has_function(
  'api',
  'create_simulation_run',
  array['uuid', 'uuid', 'text', 'text', 'uuid', 'text']::text[],
  'API has an additive traced run-creation wrapper'
);

select extensions.has_function(
  'private',
  'create_simulation_run_traced',
  array['uuid', 'uuid', 'text', 'text', 'uuid', 'text']::text[],
  'trace storage remains inside the atomic command transaction'
);

select extensions.has_function(
  'api',
  'record_sign_in_success',
  array['uuid', 'uuid']::text[],
  'API exposes the fixed successful-session audit command'
);

select extensions.has_function(
  'private',
  'claim_run_execution_traced',
  array['uuid', 'smallint', 'text']::text[],
  'worker claim continues the durable trace without Redis payload expansion'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'simula_api',
    'api.create_simulation_run(uuid,uuid,text,text,uuid,text)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'simula_api',
    'api.record_sign_in_success(uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'simula_worker',
    'api.record_sign_in_success(uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'simula_worker',
    'private.claim_run_execution_traced(uuid,smallint,text)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'simula_api',
    'private.claim_run_execution_traced(uuid,smallint,text)'::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'traced run and sign-in helpers retain exact runtime-role separation'
);

select extensions.ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as constraints
    where constraints.conrelid = 'api.simulation_runs'::pg_catalog.regclass
      and constraints.conname = 'simulation_runs_traceparent_valid'
      and constraints.contype = 'c'
  ),
  'traceparent shape and nonzero identifiers are database constrained'
);

select extensions.ok(
  exists (
    select 1
    from pg_catalog.pg_class as indexes
    join pg_catalog.pg_index as definitions on definitions.indexrelid = indexes.oid
    where indexes.relname = 'audit_events_sign_in_session_unique'
      and definitions.indisunique
  ),
  'one successful sign-in audit exists per Supabase session'
);

select extensions.has_table(
  'private',
  'runtime_controls',
  'run admission has one durable operator-controlled latch'
);

select extensions.has_function(
  'private',
  'evaluate_run_creation_control',
  array['numeric', 'integer']::text[],
  'worker evaluates only a bounded critical operational snapshot'
);

select extensions.has_function(
  'private',
  'set_run_creation_control',
  array['boolean', 'text', 'uuid']::text[],
  'operator can explicitly disable or re-enable run admission'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'simula_worker',
    'private.evaluate_run_creation_control(numeric,integer)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'simula_api',
    'private.evaluate_run_creation_control(numeric,integer)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'postgres',
    'private.set_run_creation_control(boolean,text,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'simula_api',
    'private.set_run_creation_control(boolean,text,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'simula_worker',
    'private.set_run_creation_control(boolean,text,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_table_privilege(
    'simula_worker',
    'private.runtime_controls'::pg_catalog.regclass,
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'runtime and operator control capabilities remain exactly separated'
);

select extensions.is(
  (
    select controls.enabled
    from private.runtime_controls as controls
    where controls.control_name = 'run_creation'
  ),
  true,
  'fresh environments admit runs until a critical signal latches them closed'
);

select * from extensions.finish();
rollback;
