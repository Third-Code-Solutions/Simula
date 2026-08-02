begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(23);

select extensions.has_table(
  'api',
  'behavioral_run_results',
  'behavioral result summaries are durable API-domain records'
);

select extensions.has_table(
  'private',
  'behavioral_result_payloads',
  'full canonical behavioral artifacts remain private'
);

select extensions.has_table(
  'private',
  'behavioral_provider_receipts',
  'behavioral provider receipts remain private'
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
      ('api', 'behavioral_run_results'),
      ('private', 'behavioral_result_payloads'),
      ('private', 'behavioral_provider_receipts')
    )
  ),
  'every behavioral artifact table has forced RLS'
);

select extensions.has_function(
  'private',
  'complete_behavioral_run_execution',
  array['uuid', 'uuid', 'uuid', 'bytea', 'jsonb']::text[],
  'worker completion has one separate behavioral result boundary'
);

select extensions.function_owner_is(
  'private',
  'complete_behavioral_run_execution',
  array['uuid', 'uuid', 'uuid', 'bytea', 'jsonb']::text[],
  'simula_worker_owner',
  'behavioral completion is owned by the worker command owner'
);

select extensions.ok(
  (
    select routines.prosecdef
      and 'search_path=""' = any(routines.proconfig)
      and 'row_security=on' = any(routines.proconfig)
    from pg_catalog.pg_proc as routines
    where routines.oid =
      'private.complete_behavioral_run_execution(uuid,uuid,uuid,bytea,jsonb)'
        ::pg_catalog.regprocedure
  ),
  'behavioral completion is a fail-closed security definer'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'simula_worker',
    'private.complete_behavioral_run_execution(uuid,uuid,uuid,bytea,jsonb)'
      ::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'simula_api',
    'private.complete_behavioral_run_execution(uuid,uuid,uuid,bytea,jsonb)'
      ::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'private.complete_behavioral_run_execution(uuid,uuid,uuid,bytea,jsonb)'
      ::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'only the worker runtime can invoke behavioral completion'
);

select extensions.ok(
  not pg_catalog.has_function_privilege(
    'simula_worker',
    'private.behavioral_result_artifact_is_valid(bytea,uuid,uuid,jsonb,bigint)'
      ::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'worker runtime cannot bypass the completion boundary through its validator'
);

select extensions.ok(
  pg_catalog.has_table_privilege(
    'simula_api',
    'api.behavioral_run_results'::pg_catalog.regclass,
    'SELECT'
  )
  and not pg_catalog.has_table_privilege(
    'simula_api',
    'api.behavioral_run_results'::pg_catalog.regclass,
    'INSERT,UPDATE,DELETE'
  )
  and not pg_catalog.has_table_privilege(
    'simula_api',
    'private.behavioral_result_payloads'::pg_catalog.regclass,
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'API can read tenant-filtered summaries but never private payloads'
);

select extensions.ok(
  not pg_catalog.has_table_privilege(
    'simula_worker',
    'api.behavioral_run_results'::pg_catalog.regclass,
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not pg_catalog.has_table_privilege(
    'simula_worker',
    'private.behavioral_result_payloads'::pg_catalog.regclass,
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not pg_catalog.has_table_privilege(
    'simula_worker',
    'private.behavioral_provider_receipts'::pg_catalog.regclass,
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'worker runtime has no direct behavioral artifact table authority'
);

select extensions.ok(
  pg_catalog.has_table_privilege(
    'simula_worker_owner',
    'api.behavioral_run_results'::pg_catalog.regclass,
    'SELECT,INSERT'
  )
  and pg_catalog.has_column_privilege(
    'simula_worker_owner',
    'api.behavioral_run_results'::pg_catalog.regclass,
    'run_id',
    'UPDATE'
  )
  and pg_catalog.has_table_privilege(
    'simula_worker_owner',
    'api.behavioral_run_results'::pg_catalog.regclass,
    'DELETE'
  )
  and not exists (
    select 1
    from pg_catalog.pg_attribute as attributes
    where attributes.attrelid =
        'api.behavioral_run_results'::pg_catalog.regclass
      and attributes.attnum > 0
      and not attributes.attisdropped
      and attributes.attname <> 'run_id'
      and pg_catalog.has_column_privilege(
        'simula_worker_owner',
        attributes.attrelid,
        attributes.attname,
        'UPDATE'
      )
  ),
  'behavioral completion owner has insert, FK row-lock, and cascade-delete capabilities'
);

select extensions.is(
  (
    select constraints.confdeltype::text
    from pg_catalog.pg_constraint as constraints
    where constraints.conname =
      'behavioral_run_results_run_foreign_key'
      and constraints.conrelid =
        'api.behavioral_run_results'::pg_catalog.regclass
  ),
  'c',
  'run deletion cascades through the behavioral artifact graph'
);

select extensions.ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as constraints
    where constraints.conname =
      'behavioral_run_results_organization_run_unique'
      and constraints.conrelid =
        'api.behavioral_run_results'::pg_catalog.regclass
      and constraints.contype = 'u'
      and (
        select pg_catalog.array_agg(attributes.attname order by keys.ordinality)
        from pg_catalog.unnest(constraints.conkey)
          with ordinality as keys(attnum, ordinality)
        join pg_catalog.pg_attribute as attributes
          on attributes.attrelid = constraints.conrelid
          and attributes.attnum = keys.attnum
      ) = array['organization_id', 'run_id']::name[]
  ),
  'behavioral results expose the tenant-bound key required by child artifacts'
);

select extensions.has_function(
  'private',
  'create_behavioral_demo_run_atomic',
  array['uuid', 'uuid', 'text', 'text', 'text', 'uuid', 'text']::text[],
  'behavioral demo admission has one atomic private command'
);

select extensions.has_function(
  'api',
  'create_behavioral_demo_run',
  array['uuid', 'uuid', 'text', 'text', 'text', 'uuid', 'text']::text[],
  'behavioral demo admission has one API wrapper'
);

select extensions.function_owner_is(
  'private',
  'create_behavioral_demo_run_atomic',
  array['uuid', 'uuid', 'text', 'text', 'text', 'uuid', 'text']::text[],
  'simula_command_owner',
  'behavioral demo admission is owned by the command owner'
);

select extensions.ok(
  (
    select routines.prosecdef
      and 'search_path=""' = any(routines.proconfig)
      and 'row_security=on' = any(routines.proconfig)
    from pg_catalog.pg_proc as routines
    where routines.oid =
      'private.create_behavioral_demo_run_atomic(uuid,uuid,text,text,text,uuid,text)'
        ::pg_catalog.regprocedure
  ),
  'behavioral demo admission is a fail-closed security definer'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'simula_api',
    'api.create_behavioral_demo_run(uuid,uuid,text,text,text,uuid,text)'
      ::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'simula_api',
    'private.create_behavioral_demo_run_atomic(uuid,uuid,text,text,text,uuid,text)'
      ::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'simula_worker',
    'api.create_behavioral_demo_run(uuid,uuid,text,text,text,uuid,text)'
      ::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'private.create_behavioral_demo_run_atomic(uuid,uuid,text,text,text,uuid,text)'
      ::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'only the authenticated API runtime can invoke behavioral demo admission'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.create_behavioral_demo_run_atomic(uuid,uuid,text,text,text,uuid,text)'
      ::pg_catalog.regprocedure
  ) like '%behavioral_demo_run_v1%'
  and pg_catalog.pg_get_functiondef(
    'private.create_behavioral_demo_run_atomic(uuid,uuid,text,text,text,uuid,text)'
      ::pg_catalog.regprocedure
  ) like '%''schema_version'', 2%'
  and pg_catalog.pg_get_functiondef(
    'private.create_behavioral_demo_run_atomic(uuid,uuid,text,text,text,uuid,text)'
      ::pg_catalog.regprocedure
  ) like '%current_setting(''simula.release_sha'', true)%',
  'behavioral admission freezes the v1 contract, schema, and release identity'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.create_behavioral_demo_run_atomic(uuid,uuid,text,text,text,uuid,text)'
      ::pg_catalog.regprocedure
  ) like
    '%versions.audience_id = ''00000000-0000-4000-8000-0000000000d0''::uuid%'
  and pg_catalog.pg_get_functiondef(
    'private.create_behavioral_demo_run_atomic(uuid,uuid,text,text,text,uuid,text)'
      ::pg_catalog.regprocedure
  ) like '%versions.admission_status = ''approved_demo''%'
  and pg_catalog.pg_get_functiondef(
    'private.create_behavioral_demo_run_atomic(uuid,uuid,text,text,text,uuid,text)'
      ::pg_catalog.regprocedure
  ) not like
    '%versions.id = ''00000000-0000-4000-8000-0000000000d1''::uuid%',
  'behavioral admission resolves the active governed audience, never retired v1'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.create_behavioral_demo_run_atomic(uuid,uuid,text,text,text,uuid,text)'
      ::pg_catalog.regprocedure
  ) like '%''created'', ''user'', subject, requested_correlation_id%'
  and pg_catalog.pg_get_functiondef(
    'private.create_behavioral_demo_run_atomic(uuid,uuid,text,text,text,uuid,text)'
      ::pg_catalog.regprocedure
  ) not like '%''behavioral_demo_created''%',
  'behavioral admission writes the canonical RLS-admitted queued event'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.behavioral_result_artifact_is_valid(bytea,uuid,uuid,jsonb,bigint)'
      ::pg_catalog.regprocedure
  ) like
    '%''organization_id'', ''run_id'', ''stimulus'', ''study_id'', ''variant_key''%'
  and pg_catalog.pg_get_functiondef(
    'private.behavioral_result_artifact_is_valid(bytea,uuid,uuid,jsonb,bigint)'
      ::pg_catalog.regprocedure
  ) not like
    '%''organization_id'', ''run_id'', ''study_id'', ''stimulus'', ''variant_key''%',
  'behavioral artifact validation compares sorted demo input keys canonically'
);

select * from extensions.finish();
rollback;
