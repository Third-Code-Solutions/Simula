begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(8);

select extensions.has_function(
  'private',
  'runtime_schema_readiness',
  array[]::text[],
  'runtime has one bounded schema-readiness function'
);

select extensions.ok(
  (
    select owner_roles.rolname = 'simula_worker_owner'
      and functions.prosecdef
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = functions.pronamespace
    join pg_catalog.pg_roles as owner_roles
      on owner_roles.oid = functions.proowner
    where functions.oid =
      'private.runtime_schema_readiness()'::pg_catalog.regprocedure
  ),
  'schema readiness is a worker-owned security definer'
);

select extensions.ok(
  (
    select functions.proconfig @> array[
      'search_path=""',
      'row_security=on'
    ]::text[]
    from pg_catalog.pg_proc as functions
    where functions.oid =
      'private.runtime_schema_readiness()'::pg_catalog.regprocedure
  ),
  'schema readiness fixes search path and enables row security'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'simula_api',
    'private.runtime_schema_readiness()'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'simula_worker',
    'private.runtime_schema_readiness()'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'private.runtime_schema_readiness()'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'private.runtime_schema_readiness()'::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'only server runtime roles can execute schema readiness'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.runtime_schema_readiness()'::pg_catalog.regprocedure
  ) like '%session_user not in (''simula_api'', ''simula_worker'')%',
  'schema readiness verifies the non-inherited login role'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.runtime_schema_readiness()'::pg_catalog.regprocedure
  ) like '%20260801135222::bigint%',
  'schema readiness reports the exact repository migration head'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.runtime_schema_readiness()'::pg_catalog.regprocedure
  ) like '%not relations.relrowsecurity or not relations.relforcerowsecurity%',
  'schema readiness fails when an application table lacks forced RLS'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.runtime_observability_snapshot()'::pg_catalog.regprocedure
  ) like '%20260801135222::bigint%'
  and pg_catalog.pg_get_functiondef(
    'private.runtime_observability_snapshot()'::pg_catalog.regprocedure
  ) not like '%20260730230000::bigint%',
  'runtime metrics report the same exact migration head'
);

select * from extensions.finish();
rollback;
