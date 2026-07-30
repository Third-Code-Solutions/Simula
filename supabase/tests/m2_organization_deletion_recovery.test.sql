begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(17);

select extensions.has_table(
  'private',
  'organization_deletion_resources',
  'pending workspace deletion has a durable external-resource ledger'
);

select extensions.ok(
  (
    select relations.relrowsecurity and relations.relforcerowsecurity
    from pg_catalog.pg_class as relations
    where relations.oid =
      'private.organization_deletion_resources'::pg_catalog.regclass
  ),
  'external-resource ledger is forced-RLS'
);

select extensions.is(
  (
    select pg_catalog.count(*)::integer
    from pg_catalog.pg_constraint as constraints
    where constraints.conrelid =
      'private.organization_deletion_resources'::pg_catalog.regclass
      and constraints.contype = 'u'
      and constraints.conname =
        'organization_deletion_resources_identity_unique'
  ),
  1,
  'one request-kind-key identity prevents duplicate cleanup work'
);

select extensions.ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as constraints
    where constraints.conrelid =
      'private.organization_deletion_resources'::pg_catalog.regclass
      and constraints.contype = 'f'
      and constraints.confrelid =
        'private.organization_deletion_requests'::pg_catalog.regclass
      and constraints.confdeltype = 'c'
  ),
  'deletion request removal cascades to its recovery resources'
);

select extensions.is(
  (
    select pg_catalog.array_agg(policies.policyname order by policies.policyname)
    from pg_catalog.pg_policies as policies
    where policies.schemaname = 'private'
      and policies.tablename = 'organization_deletion_resources'
  ),
  array[
    'organization_deletion_resources_command_delete',
    'organization_deletion_resources_command_insert',
    'organization_deletion_resources_worker_select',
    'organization_deletion_resources_worker_update'
  ]::name[],
  'external-resource ledger policy surface is exact'
);

select extensions.ok(
  exists (
    select 1
    from pg_catalog.pg_policies as policies
    where policies.schemaname = 'api'
      and policies.tablename = 'organizations'
      and policies.policyname =
        'organizations_command_select_for_worker_deletion'
      and policies.roles = array['simula_command_owner']::name[]
      and policies.cmd = 'SELECT'
      and policies.qual like '%session_user%'
      and policies.qual like '%simula_worker%'
  )
  and exists (
    select 1
    from pg_catalog.pg_policies as policies
    where policies.schemaname = 'api'
      and policies.tablename = 'organizations'
      and policies.policyname =
        'organizations_command_delete_after_worker_cleanup'
      and policies.roles = array['simula_command_owner']::name[]
      and policies.cmd = 'DELETE'
  )
  and exists (
    select 1
    from pg_catalog.pg_policies as policies
    where policies.schemaname = 'api'
      and policies.tablename = 'simulation_runs'
      and policies.policyname =
        'simulation_runs_command_select_for_worker_deletion'
      and policies.roles = array['simula_command_owner']::name[]
      and policies.cmd = 'SELECT'
      and policies.qual like '%session_user%'
      and policies.qual like '%simula_worker%'
  ),
  'worker command owner can inspect deletion-bound organizations and active runs'
);

select extensions.has_function(
  'private',
  'claim_organization_deletion_resources',
  array['integer']::text[],
  'worker leases bounded recovery resources'
);

select extensions.has_function(
  'private',
  'complete_organization_deletion_resource',
  array['uuid', 'uuid']::text[],
  'worker completes only a current resource lease'
);

select extensions.has_function(
  'private',
  'release_organization_deletion_resource',
  array['uuid', 'uuid', 'text']::text[],
  'worker releases failed cleanup with a safe error code'
);

select extensions.has_function(
  'private',
  'finalize_ready_organization_deletions',
  array['integer']::text[],
  'worker finalizes only requests whose cleanup ledger is complete'
);

select extensions.ok(
  (
    select pg_catalog.bool_and(
      owners.rolname = 'simula_command_owner'
      and routines.prosecdef
      and routines.proconfig @> array[
        'search_path=""',
        'row_security=on'
      ]::text[]
    )
    from pg_catalog.pg_proc as routines
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = routines.pronamespace
    join pg_catalog.pg_roles as owners on owners.oid = routines.proowner
    where namespaces.nspname = 'private'
      and routines.proname in (
        'claim_organization_deletion_resources',
        'complete_organization_deletion_resource',
        'release_organization_deletion_resource',
        'finalize_ready_organization_deletions'
      )
  ),
  'recovery commands use the narrow command owner with forced row security'
);

select extensions.ok(
  (
    select pg_catalog.bool_and(
      pg_catalog.has_function_privilege(
        'simula_worker',
        routines.oid,
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'simula_api',
        routines.oid,
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'authenticated',
        routines.oid,
        'EXECUTE'
      )
    )
    from pg_catalog.pg_proc as routines
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = routines.pronamespace
    where namespaces.nspname = 'private'
      and routines.proname in (
        'claim_organization_deletion_resources',
        'complete_organization_deletion_resource',
        'release_organization_deletion_resource',
        'finalize_ready_organization_deletions'
      )
  ),
  'only worker runtime can execute recovery commands'
);

select extensions.ok(
  not pg_catalog.has_table_privilege(
    'simula_worker',
    'private.organization_deletion_resources'::pg_catalog.regclass,
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not pg_catalog.has_table_privilege(
    'simula_api',
    'private.organization_deletion_resources'::pg_catalog.regclass,
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and pg_catalog.has_table_privilege(
    'simula_command_owner',
    'private.organization_deletion_resources'::pg_catalog.regclass,
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'runtime roles cannot bypass recovery commands with direct table access'
);

select extensions.is(
  (
    select pg_catalog.array_agg(triggers.tgname order by triggers.tgname)
    from pg_catalog.pg_trigger as triggers
    where triggers.tgrelid =
      'private.organization_deletion_requests'::pg_catalog.regclass
      and triggers.tgname in (
        'purge_completed_organization_deletion_resources',
        'seed_organization_deletion_resources'
      )
      and not triggers.tgisinternal
  ),
  array[
    'purge_completed_organization_deletion_resources',
    'seed_organization_deletion_resources'
  ]::name[],
  'request lifecycle has one seeding and one tombstone-purge trigger'
);

select extensions.ok(
  (
    select pg_catalog.bool_and(
      owners.rolname = 'simula_command_owner'
      and routines.prosecdef
      and not pg_catalog.has_function_privilege(
        'simula_worker',
        routines.oid,
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'simula_api',
        routines.oid,
        'EXECUTE'
      )
    )
    from pg_catalog.pg_proc as routines
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = routines.pronamespace
    join pg_catalog.pg_roles as owners on owners.oid = routines.proowner
    where namespaces.nspname = 'private'
      and routines.proname in (
        'purge_completed_organization_deletion_resources',
        'seed_organization_deletion_resources'
      )
  ),
  'resource lifecycle triggers are owner-only security definers'
);

select extensions.ok(
  pg_catalog.strpos(
    pg_catalog.lower(
      pg_catalog.pg_get_functiondef(
        'private.claim_organization_deletion_resources(integer)'
          ::pg_catalog.regprocedure
      )
    ),
    'skip locked'
  ) > 0
  and pg_catalog.strpos(
    pg_catalog.lower(
      pg_catalog.pg_get_functiondef(
        'private.claim_organization_deletion_resources(integer)'
          ::pg_catalog.regprocedure
      )
    ),
    '15 minutes'
  ) > 0
  and pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'private.claim_organization_deletion_resources(integer)'
        ::pg_catalog.regprocedure
    ),
    'cleanup_attempt_count < 10'
  ) > 0,
  'claims are skip-locked, leased, and capped at ten attempts'
);

select extensions.ok(
  pg_catalog.lower(
    pg_catalog.pg_get_functiondef(
      'private.release_organization_deletion_resource(uuid,uuid,text)'
        ::pg_catalog.regprocedure
    )
  ) ~ 'least[[:space:]]*\([[:space:]]*300'
  and pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'private.finalize_ready_organization_deletions(integer)'
        ::pg_catalog.regprocedure
    ),
    'resources.status <> ''completed'''
  ) > 0
  and pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'private.finalize_ready_organization_deletions(integer)'
        ::pg_catalog.regprocedure
    ),
    '''storage_objects'', ''[]''::jsonb'
  ) > 0,
  'retry backoff is bounded and finalization requires a complete ledger'
);

select * from extensions.finish();
rollback;
