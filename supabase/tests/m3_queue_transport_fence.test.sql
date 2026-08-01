begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(12);

select extensions.has_table(
  'private',
  'queue_transport_control',
  'queue transport ownership is durable'
);

select extensions.ok(
  (
    select relations.relrowsecurity
    from pg_catalog.pg_class as relations
    where relations.oid =
      'private.queue_transport_control'::pg_catalog.regclass
  ),
  'queue transport control has RLS enabled'
);

select extensions.col_is_pk(
  'private',
  'queue_transport_control',
  'singleton',
  'queue transport control is an exact singleton'
);

select extensions.is(
  (
    select control.active_transport
    from private.queue_transport_control as control
    where control.singleton
  ),
  'arq',
  'additive migration preserves ARQ as the rollback-safe default'
);

select extensions.has_function(
  'private',
  'set_queue_transport',
  array['text', 'uuid']::text[],
  'operator has one audited transport mutation'
);

select extensions.has_function(
  'private',
  'get_queue_transport_control',
  array[]::text[],
  'operator has one bounded transport status read'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'simula_operator',
    'private.set_queue_transport(text,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'simula_operator',
    'private.get_queue_transport_control()'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'simula_api',
    'private.set_queue_transport(text,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'simula_worker',
    'private.set_queue_transport(text,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'only the operator can mutate or inspect transport ownership'
);

select extensions.ok(
  not pg_catalog.has_table_privilege(
    'simula_operator',
    'private.queue_transport_control'::pg_catalog.regclass,
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  )
  and not pg_catalog.has_table_privilege(
    'simula_worker',
    'private.queue_transport_control'::pg_catalog.regclass,
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  ),
  'runtime and operator roles have no direct transport-table authority'
);

select extensions.throws_ok(
  $sql$
    select private.set_queue_transport(
      'bullmq',
      '00000000-0000-4000-8000-000000000099'::uuid
    )
  $sql$,
  '55000',
  'run_admission_must_be_disabled',
  'transport cannot change while new-run admission is open'
);

select private.set_run_creation_control(
  false,
  'operator_manual',
  '00000000-0000-4000-8000-000000000098'::uuid
);

select extensions.lives_ok(
  $sql$
    select private.set_queue_transport(
      'bullmq',
      '00000000-0000-4000-8000-000000000099'::uuid
    )
  $sql$,
  'a disabled and drained pipeline can cut over to BullMQ'
);

select extensions.is(
  (
    select control.active_transport
    from private.queue_transport_control as control
    where control.singleton
  ),
  'bullmq',
  'successful cutover changes the single durable owner'
);

select extensions.is(
  (
    select pg_catalog.count(*)::integer
    from private.audit_events as audit
    where audit.action = 'operator.queue_transport_changed'
      and audit.correlation_id =
        '00000000-0000-4000-8000-000000000099'::uuid
  ),
  1,
  'successful cutover writes one correlation-bound audit'
);

select * from extensions.finish();
rollback;
