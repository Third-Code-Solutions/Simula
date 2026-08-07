begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(9);

select extensions.ok(
  'api.create_campaign_lab_run_v3(uuid,uuid,text,jsonb,jsonb,text,text,uuid)'::pg_catalog.regprocedure
    is not null,
  'durable Campaign Lab API wrapper exists'
);

select extensions.ok(
  (
    select owner_roles.rolname = 'postgres'
      and not functions.prosecdef
      and functions.proconfig @> array['search_path=""']::text[]
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
    join pg_catalog.pg_roles as owner_roles on owner_roles.oid = functions.proowner
    where functions.oid =
      'api.create_campaign_lab_run_v3(uuid,uuid,text,jsonb,jsonb,text,text,uuid)'::pg_catalog.regprocedure
  ),
  'durable Campaign Lab API wrapper preserves the published security-invoker boundary'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'simula_api',
    'api.create_campaign_lab_run_v3(uuid,uuid,text,jsonb,jsonb,text,text,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'api.create_campaign_lab_run_v3(uuid,uuid,text,jsonb,jsonb,text,text,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'only the API service role can invoke the durable Campaign Lab API wrapper'
);

select extensions.ok(
  (
    select functions.prosecdef
      and functions.proconfig @> array['search_path=""', 'row_security=on']::text[]
    from pg_catalog.pg_proc as functions
    where functions.oid =
      'private.create_campaign_lab_run_atomic_v3(uuid,uuid,text,jsonb,jsonb,text,text,uuid)'::pg_catalog.regprocedure
  )
  and pg_catalog.pg_get_functiondef(
    'private.create_campaign_lab_run_atomic_v3(uuid,uuid,text,jsonb,jsonb,text,text,uuid)'::pg_catalog.regprocedure
  ) like '%research_ingestion%'
  and pg_catalog.pg_get_functiondef(
    'private.create_campaign_lab_run_atomic_v3(uuid,uuid,text,jsonb,jsonb,text,text,uuid)'::pg_catalog.regprocedure
  ) like '%survey_import%'
  and pg_catalog.pg_get_functiondef(
    'private.create_campaign_lab_run_atomic_v3(uuid,uuid,text,jsonb,jsonb,text,text,uuid)'::pg_catalog.regprocedure
  ) like '%compliance_review%',
  'durable run admission is a security-definer function with the new run types'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'simula_api',
    'private.create_campaign_lab_run_atomic_v3(uuid,uuid,text,jsonb,jsonb,text,text,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'private.create_campaign_lab_run_atomic_v3(uuid,uuid,text,jsonb,jsonb,text,text,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'the private durable run admission function is unavailable to browser roles'
);

select extensions.ok(
  (
    select owner_roles.rolname = 'postgres'
      and functions.prosecdef
      and functions.proconfig @> array['search_path=""', 'row_security=on']::text[]
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
    join pg_catalog.pg_roles as owner_roles on owner_roles.oid = functions.proowner
    where functions.oid =
      'private.complete_campaign_lab_run_v3(uuid,uuid,jsonb)'::pg_catalog.regprocedure
  )
  and pg_catalog.has_function_privilege(
    'simula_worker',
    'private.complete_campaign_lab_run_v3(uuid,uuid,jsonb)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'private.complete_campaign_lab_run_v3(uuid,uuid,jsonb)'::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'worker completion is lease-bound behind a worker-only security-definer function'
);

select extensions.ok(
  (
    select owner_roles.rolname = 'postgres'
      and functions.prosecdef
      and functions.proconfig @> array['search_path=""', 'row_security=on']::text[]
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
    join pg_catalog.pg_roles as owner_roles on owner_roles.oid = functions.proowner
    where functions.oid = 'private.runtime_schema_readiness_v3()'::pg_catalog.regprocedure
  )
  and pg_catalog.pg_get_functiondef(
    'private.runtime_schema_readiness_v3()'::pg_catalog.regprocedure
  ) like '%20260807104033::bigint%'
  and pg_catalog.has_function_privilege(
    'simula_api',
    'private.runtime_schema_readiness_v3()'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'simula_worker',
    'private.runtime_schema_readiness_v3()'::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'runtime readiness reports the durable-workflow schema head'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.runtime_observability_snapshot_v3()'::pg_catalog.regprocedure
  ) like '%20260807104033::bigint%'
  and pg_catalog.has_function_privilege(
    'simula_api',
    'private.runtime_observability_snapshot_v3()'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'simula_worker',
    'private.runtime_observability_snapshot_v3()'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'private.runtime_observability_snapshot_v3()'::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'runtime observability is aggregate-only at the durable-workflow head'
);

select extensions.ok(
  (
    select pg_catalog.pg_get_constraintdef(constraints.oid) like '%research_ingestion%'
      and pg_catalog.pg_get_constraintdef(constraints.oid) like '%survey_import%'
      and pg_catalog.pg_get_constraintdef(constraints.oid) like '%interview%'
      and pg_catalog.pg_get_constraintdef(constraints.oid) like '%compliance_review%'
      and pg_catalog.pg_get_constraintdef(constraints.oid) like '%report%'
    from pg_catalog.pg_constraint as constraints
    join pg_catalog.pg_class as relations on relations.oid = constraints.conrelid
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname = 'api'
      and relations.relname = 'campaign_lab_runs'
      and constraints.conname = 'campaign_lab_runs_type_valid'
  ),
  'Campaign Lab run types are enforced by the database constraint'
);

select * from extensions.finish();
rollback;
