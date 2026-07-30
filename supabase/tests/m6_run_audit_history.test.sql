begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(14);

select extensions.has_function(
  'private',
  'get_run_audit_history',
  array['uuid', 'integer']::text[],
  'private run-history authority exists'
);

select extensions.has_function(
  'api',
  'get_run_audit_history',
  array['uuid', 'integer']::text[],
  'API exposes the bounded run-history projection'
);

select extensions.ok(
  (
    select owners.rolname = 'simula_command_owner'
      and routines.prosecdef
      and routines.provolatile = 's'
      and routines.proconfig @> array[
        'search_path=""',
        'row_security=on'
      ]::text[]
    from pg_catalog.pg_proc as routines
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = routines.pronamespace
    join pg_catalog.pg_roles as owners
      on owners.oid = routines.proowner
    where namespaces.nspname = 'private'
      and routines.proname = 'get_run_audit_history'
  ),
  'private history authority is stable, RLS-on, empty-path security definer'
);

select extensions.ok(
  (
    select not routines.prosecdef
      and routines.provolatile = 's'
      and routines.proconfig @> array['search_path=""']::text[]
    from pg_catalog.pg_proc as routines
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = routines.pronamespace
    where namespaces.nspname = 'api'
      and routines.proname = 'get_run_audit_history'
  ),
  'API history wrapper is a stable empty-path invoker'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'simula_api',
    'api.get_run_audit_history(uuid,integer)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'simula_api',
    'private.get_run_audit_history(uuid,integer)'::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'only the control plane can traverse the run-history boundary'
);

select extensions.ok(
  not exists (
    select 1
    from (
      values ('public'), ('anon'), ('authenticated'), ('simula_worker')
    ) as roles(role_name)
    cross join (
      values
        ('api.get_run_audit_history(uuid,integer)'::pg_catalog.regprocedure),
        ('private.get_run_audit_history(uuid,integer)'::pg_catalog.regprocedure)
    ) as routines(routine_id)
    where pg_catalog.has_function_privilege(
      roles.role_name,
      routines.routine_id,
      'EXECUTE'
    )
  ),
  'browser, public, and worker roles cannot call either history function'
);

select extensions.ok(
  pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.get_run_audit_history(uuid,integer)'::pg_catalog.regprocedure
  )) like '%from private.run_events%',
  'history is derived from the durable run state ledger'
);

select extensions.ok(
  pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.get_run_audit_history(uuid,integer)'::pg_catalog.regprocedure
  )) like '%private.is_org_member%'
  and pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.get_run_audit_history(uuid,integer)'::pg_catalog.regprocedure
  )) like '%session_user <> ''simula_api''%',
  'history verifies both control-plane identity and tenant membership'
);

select extensions.ok(
  pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.get_run_audit_history(uuid,integer)'::pg_catalog.regprocedure
  )) not like '%audit_events%'
  and pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.get_run_audit_history(uuid,integer)'::pg_catalog.regprocedure
  )) not like '%actor_user_id%'
  and pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.get_run_audit_history(uuid,integer)'::pg_catalog.regprocedure
  )) not like '%metadata%'
  and pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.get_run_audit_history(uuid,integer)'::pg_catalog.regprocedure
  )) not like '%payload%',
  'history cannot project actor identity, free metadata, or payloads'
);

select extensions.ok(
  (
    select relations.relrowsecurity and relations.relforcerowsecurity
    from pg_catalog.pg_class as relations
    where relations.oid = 'private.run_events'::pg_catalog.regclass
  ),
  'the source run ledger retains forced RLS'
);

select extensions.ok(
  not pg_catalog.has_table_privilege(
    'simula_api',
    'private.run_events'::pg_catalog.regclass,
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'
  ),
  'control-plane runtime has no direct run-ledger table authority'
);

select extensions.has_index(
  'private',
  'run_events',
  'run_events_run_created_idx',
  'run-history reads retain the run and creation index'
);

select extensions.ok(
  (
    select routines.proretset
    from pg_catalog.pg_proc as routines
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = routines.pronamespace
    where namespaces.nspname = 'api'
      and routines.proname = 'get_run_audit_history'
  ),
  'the API wrapper returns a typed event set'
);

select extensions.ok(
  pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.get_run_audit_history(uuid,integer)'::pg_catalog.regprocedure
  )) like '%requested_limit not between 1 and 100%'
  and pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.get_run_audit_history(uuid,integer)'::pg_catalog.regprocedure
  )) like '%limit requested_limit%',
  'history enforces a hard one-to-one-hundred event budget'
);

select * from extensions.finish();
rollback;
