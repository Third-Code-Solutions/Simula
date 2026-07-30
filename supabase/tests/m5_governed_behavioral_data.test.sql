begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(17);

select extensions.is(
  (
    select pg_catalog.array_agg(
      pg_catalog.format('%I.%I', namespaces.nspname, relations.relname)
      order by namespaces.nspname, relations.relname
    )
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = relations.relnamespace
    where (
      namespaces.nspname,
      relations.relname
    ) in (
      ('api', 'behavioral_report_evidence'),
      ('api', 'context_graph_versions'),
      ('private', 'behavioral_action_events'),
      ('private', 'behavioral_agent_fleets'),
      ('private', 'behavioral_agent_memories')
    )
      and relations.relkind = 'r'
  ),
  array[
    'api.behavioral_report_evidence',
    'api.context_graph_versions',
    'private.behavioral_action_events',
    'private.behavioral_agent_fleets',
    'private.behavioral_agent_memories'
  ]::text[],
  'M5 normalizes the governed context, fleet, events, memories, and evidence'
);

select extensions.ok(
  (
    select pg_catalog.bool_and(
      relations.relrowsecurity and relations.relforcerowsecurity
    )
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = relations.relnamespace
    where (
      namespaces.nspname,
      relations.relname
    ) in (
      ('api', 'behavioral_report_evidence'),
      ('api', 'context_graph_versions'),
      ('private', 'behavioral_action_events'),
      ('private', 'behavioral_agent_fleets'),
      ('private', 'behavioral_agent_memories')
    )
  ),
  'every normalized behavioral table has forced RLS'
);

select extensions.ok(
  pg_catalog.has_table_privilege(
    'simula_api',
    'api.context_graph_versions'::pg_catalog.regclass,
    'SELECT'
  )
  and pg_catalog.has_table_privilege(
    'simula_api',
    'api.behavioral_report_evidence'::pg_catalog.regclass,
    'SELECT'
  )
  and not pg_catalog.has_table_privilege(
    'simula_api',
    'api.context_graph_versions'::pg_catalog.regclass,
    'INSERT,UPDATE,DELETE'
  )
  and not pg_catalog.has_table_privilege(
    'simula_api',
    'private.behavioral_action_events'::pg_catalog.regclass,
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'API reads tenant-filtered projections but never private execution rows'
);

select extensions.ok(
  not exists (
    select 1
    from (
      values
        ('api.context_graph_versions'),
        ('api.behavioral_report_evidence'),
        ('private.behavioral_action_events'),
        ('private.behavioral_agent_fleets'),
        ('private.behavioral_agent_memories')
    ) as tables(table_name)
    where pg_catalog.has_table_privilege(
      'simula_worker',
      tables.table_name,
      'SELECT,INSERT,UPDATE,DELETE'
    )
  ),
  'worker runtime has no direct normalized-table authority'
);

select extensions.has_function(
  'private',
  'normalize_behavioral_result_payload',
  array['uuid', 'uuid', 'bytea']::text[],
  'canonical artifacts have one internal normalization routine'
);

select extensions.has_function(
  'private',
  'normalize_behavioral_result_payload_trigger',
  array[]::text[],
  'canonical artifact inserts invoke a dedicated trigger wrapper'
);

select extensions.ok(
  (
    select pg_catalog.bool_and(
      owners.rolname = 'simula_worker_owner'
      and not routines.prosecdef
      and routines.proconfig @> array['search_path=""']::text[]
    )
    from pg_catalog.pg_proc as routines
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = routines.pronamespace
    join pg_catalog.pg_roles as owners on owners.oid = routines.proowner
    where namespaces.nspname = 'private'
      and routines.proname in (
        'normalize_behavioral_result_payload',
        'normalize_behavioral_result_payload_trigger'
      )
  ),
  'normalizers are worker-owner invokers with an empty search path'
);

select extensions.ok(
  not exists (
    select 1
    from (
      values ('simula_api'), ('simula_worker'), ('anon'), ('authenticated')
    ) as roles(role_name)
    cross join (
      values
        (
          'private.normalize_behavioral_result_payload(uuid,uuid,bytea)'
            ::pg_catalog.regprocedure
        ),
        (
          'private.normalize_behavioral_result_payload_trigger()'
            ::pg_catalog.regprocedure
        )
    ) as routines(routine_id)
    where pg_catalog.has_function_privilege(
      roles.role_name,
      routines.routine_id,
      'EXECUTE'
    )
  ),
  'normalizers are unreachable outside the worker-owner trigger path'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'simula_worker_owner',
    'private.normalize_behavioral_result_payload(uuid,uuid,bytea)'
      ::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'simula_worker',
    'private.normalize_behavioral_result_payload(uuid,uuid,bytea)'
      ::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and pg_catalog.has_column_privilege(
    'simula_worker_owner',
    'private.behavioral_action_events'::pg_catalog.regclass,
    'event_id',
    'UPDATE'
  ),
  'trigger owner alone can normalize and satisfy evidence FK row locks'
);

select extensions.is(
  (
    select pg_catalog.count(*)::integer
    from pg_catalog.pg_trigger as triggers
    where triggers.tgrelid =
      'private.behavioral_result_payloads'::pg_catalog.regclass
      and triggers.tgname = 'behavioral_result_payload_normalize'
      and not triggers.tgisinternal
  ),
  1,
  'one normalization trigger is attached to canonical payload insertion'
);

select extensions.ok(
  (
    select triggers.tgenabled = 'O'
    from pg_catalog.pg_trigger as triggers
    where triggers.tgrelid =
      'private.behavioral_result_payloads'::pg_catalog.regclass
      and triggers.tgname = 'behavioral_result_payload_normalize'
  ),
  'behavioral normalization trigger is enabled'
);

select extensions.is(
  (
    select pg_catalog.count(*)::integer
    from pg_catalog.pg_constraint as constraints
    where constraints.conname in (
      'behavioral_action_events_run_foreign_key',
      'behavioral_agent_fleets_run_foreign_key',
      'behavioral_agent_memories_run_foreign_key',
      'behavioral_report_evidence_run_foreign_key',
      'context_graph_versions_run_foreign_key'
    )
      and constraints.confdeltype = 'c'
  ),
  5,
  'run deletion cascades across every normalized execution table'
);

select extensions.is(
  (
    select constraints.confdeltype::text
    from pg_catalog.pg_constraint as constraints
    where constraints.conname =
      'behavioral_report_evidence_action_foreign_key'
  ),
  'c',
  'action deletion cascades through report evidence links'
);

select extensions.has_index(
  'private',
  'behavioral_action_events',
  'behavioral_action_events_run_round_sequence_idx',
  'timeline reads use the run, round, sequence index'
);

select extensions.has_index(
  'api',
  'behavioral_report_evidence',
  'behavioral_report_evidence_run_key_idx',
  'report evidence reads use the tenant, run, kind, key index'
);

select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_attribute as attributes
    join pg_catalog.pg_class as relations on relations.oid = attributes.attrelid
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = relations.relnamespace
    join pg_catalog.pg_type as types on types.oid = attributes.atttypid
    where namespaces.nspname in ('api', 'private')
      and relations.relkind = 'r'
      and not attributes.attisdropped
      and types.typname = 'vector'
      and not (
        namespaces.nspname = 'private'
        and relations.relname = 'context_node_embeddings'
        and attributes.attname = 'embedding'
      )
  ),
  'vector storage is limited to the governed private context embedding column'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.normalize_behavioral_result_payload(uuid,uuid,bytea)'
      ::pg_catalog.regprocedure
  ) like '%jsonb_array_elements(artifact -> ''rounds'')%'
  and pg_catalog.pg_get_functiondef(
    'private.normalize_behavioral_result_payload(uuid,uuid,bytea)'
      ::pg_catalog.regprocedure
  ) like '%behavioral_report_evidence%',
  'normalization source binds rounds and report evidence to the canonical artifact'
);

select * from extensions.finish();
rollback;
