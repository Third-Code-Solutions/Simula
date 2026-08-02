begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(16);

select extensions.has_function(
  'private',
  'claim_run_execution_v2_traced',
  array['uuid', 'smallint', 'text']::text[],
  'BullMQ worker has one exact v2 execution-claim boundary'
);

select extensions.function_owner_is(
  'private',
  'claim_run_execution_v2_traced',
  array['uuid', 'smallint', 'text']::text[],
  'simula_worker_owner',
  'v2 execution claim is owned by the worker command owner'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'simula_worker',
    'private.claim_run_execution_v2_traced(uuid,smallint,text)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'simula_api',
    'private.claim_run_execution_v2_traced(uuid,smallint,text)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'private.claim_run_execution_v2_traced(uuid,smallint,text)'::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'v2 execution claim is executable only by the worker runtime role'
);

select extensions.ok(
  (
    select routines.prosecdef
      and 'search_path=""' = any(routines.proconfig)
      and 'row_security=on' = any(routines.proconfig)
    from pg_catalog.pg_proc as routines
    where routines.oid =
      'private.claim_run_execution_v2_traced(uuid,smallint,text)'::pg_catalog.regprocedure
  ),
  'v2 execution claim is a fail-closed security definer'
);

select extensions.has_function(
  'private',
  'update_bullmq_run_pressure',
  array['integer', 'numeric', 'numeric']::text[],
  'BullMQ dispatcher has one exact pressure snapshot boundary'
);

select extensions.function_owner_is(
  'private',
  'update_bullmq_run_pressure',
  array['integer', 'numeric', 'numeric']::text[],
  'simula_worker_owner',
  'BullMQ pressure snapshot is owned by the worker command owner'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'simula_worker',
    'private.update_bullmq_run_pressure(integer,numeric,numeric)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'simula_api',
    'private.update_bullmq_run_pressure(integer,numeric,numeric)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'private.update_bullmq_run_pressure(integer,numeric,numeric)'::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'BullMQ pressure snapshot is executable only by the worker runtime role'
);

select extensions.ok(
  (
    select routines.prosecdef
      and 'search_path=""' = any(routines.proconfig)
      and 'row_security=on' = any(routines.proconfig)
    from pg_catalog.pg_proc as routines
    where routines.oid =
      'private.update_bullmq_run_pressure(integer,numeric,numeric)'::pg_catalog.regprocedure
  ),
  'BullMQ pressure snapshot is a fail-closed security definer'
);

select extensions.has_function(
  'private',
  'claim_due_run_outbox_v2',
  array['integer']::text[],
  'BullMQ dispatcher has a transport-fenced outbox claim'
);

select extensions.function_owner_is(
  'private',
  'claim_due_run_outbox_v2',
  array['integer']::text[],
  'simula_worker_owner',
  'BullMQ outbox claim is owned by the worker command owner'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'simula_worker',
    'private.claim_due_run_outbox_v2(integer)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'simula_api',
    'private.claim_due_run_outbox_v2(integer)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'simula_worker',
    'private.claim_due_run_outbox_unfenced(integer)'::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'worker can execute only the fenced BullMQ outbox claim'
);

select extensions.ok(
  (
    select routines.prosecdef
      and 'search_path=""' = any(routines.proconfig)
      and 'row_security=on' = any(routines.proconfig)
    from pg_catalog.pg_proc as routines
    where routines.oid =
      'private.claim_due_run_outbox_v2(integer)'::pg_catalog.regprocedure
  ),
  'BullMQ outbox claim is a fail-closed security definer'
);

select extensions.has_function(
  'private',
  'require_queue_transport',
  array['text']::text[],
  'worker runtimes have one exact durable transport assertion'
);

select extensions.function_owner_is(
  'private',
  'require_queue_transport',
  array['text']::text[],
  'simula_worker_owner',
  'transport assertion is owned by the worker command owner'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'simula_worker',
    'private.require_queue_transport(text)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'simula_api',
    'private.require_queue_transport(text)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_table_privilege(
    'simula_worker',
    'private.queue_transport_control'::pg_catalog.regclass,
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'runtime can assert transport without direct control-table access'
);

select extensions.ok(
  (
    select routines.prosecdef
      and 'search_path=""' = any(routines.proconfig)
      and 'row_security=on' = any(routines.proconfig)
    from pg_catalog.pg_proc as routines
    where routines.oid =
      'private.require_queue_transport(text)'::pg_catalog.regprocedure
  ),
  'transport assertion is a fail-closed security definer'
);

select * from extensions.finish();
rollback;
