begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(32);

-- 01
select extensions.ok(
  pg_catalog.has_schema_privilege('postgres', 'api', 'USAGE')
    and pg_catalog.has_schema_privilege('postgres', 'private', 'USAGE'),
  'api and private schemas exist'
);

-- 02
select extensions.is(
  (
    select pg_catalog.array_agg(
      pg_catalog.format('%I.%I', namespaces.nspname, relations.relname)
      order by namespaces.nspname, relations.relname
    )
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname in ('api', 'private')
      and relations.relkind = 'r'
  ),
  array[
    'api.audience_versions',
    'api.audiences',
    'api.organization_memberships',
    'api.organizations',
    'api.projects',
    'api.simulation_results',
    'api.simulation_runs',
    'api.stimuli',
    'api.stimulus_versions',
    'private.audit_events',
    'private.idempotency_keys',
    'private.run_attempts',
    'private.run_events',
    'private.run_outbox'
  ]::text[],
  'application table inventory is exact'
);

-- 03
select extensions.ok(
  (
    select pg_catalog.bool_and(relations.relrowsecurity)
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname in ('api', 'private')
      and relations.relkind = 'r'
  ),
  'RLS is enabled on every application table'
);

-- 04
select extensions.ok(
  (
    select pg_catalog.bool_and(relations.relforcerowsecurity)
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname in ('api', 'private')
      and relations.relkind = 'r'
  ),
  'RLS is forced on every application table'
);

-- 05
select extensions.is(
  (
    select pg_catalog.array_agg(policies.policyname order by policies.policyname)
    from pg_catalog.pg_policies as policies
    where policies.schemaname in ('api', 'private')
  ),
  array[
    'audience_versions_api_select',
    'audience_versions_command_select',
    'audiences_api_select',
    'audiences_command_select',
    'audit_events_command_insert',
    'audit_events_worker_owner_insert',
    'idempotency_keys_command_insert',
    'idempotency_keys_command_select',
    'idempotency_keys_command_update',
    'organization_memberships_api_or_command_select',
    'organization_memberships_command_insert',
    'organizations_api_select',
    'organizations_command_insert',
    'organizations_command_select',
    'organizations_worker_owner_select',
    'projects_api_select',
    'projects_command_insert',
    'projects_command_select',
    'projects_command_update',
    'run_attempts_worker_owner_insert',
    'run_attempts_worker_owner_select',
    'run_attempts_worker_owner_update',
    'run_events_command_insert',
    'run_events_worker_owner_insert',
    'run_outbox_command_insert',
    'run_outbox_worker_owner_select',
    'run_outbox_worker_owner_update',
    'simulation_results_api_select',
    'simulation_results_worker_owner_insert',
    'simulation_results_worker_owner_select',
    'simulation_runs_api_select',
    'simulation_runs_command_insert',
    'simulation_runs_command_select',
    'simulation_runs_worker_owner_select',
    'simulation_runs_worker_owner_update',
    'stimuli_api_select',
    'stimuli_command_insert',
    'stimuli_command_select',
    'stimulus_versions_api_select',
    'stimulus_versions_command_insert',
    'stimulus_versions_command_select'
  ]::name[],
  'RLS policy inventory is exact'
);

-- 06
select extensions.is(
  (
    select pg_catalog.array_agg(roles.rolname order by roles.rolname)
    from pg_catalog.pg_roles as roles
    where roles.rolname like 'simula\_%' escape '\'
  ),
  array[
    'simula_api',
    'simula_command_owner',
    'simula_worker',
    'simula_worker_owner'
  ]::name[],
  'application role inventory is exact'
);

-- 07
select extensions.ok(
  (
    select pg_catalog.bool_and(
      not roles.rolsuper
      and not roles.rolcreatedb
      and not roles.rolcreaterole
      and not roles.rolinherit
      and not roles.rolreplication
      and not roles.rolbypassrls
    )
    from pg_catalog.pg_roles as roles
    where roles.rolname like 'simula\_%' escape '\'
  ),
  'application roles have no elevated attributes and do not inherit'
);

-- 08
select extensions.ok(
  (
    select pg_catalog.bool_and(
      roles.rolcanlogin = (roles.rolname in ('simula_api', 'simula_worker'))
    )
    from pg_catalog.pg_roles as roles
    where roles.rolname like 'simula\_%' escape '\'
  ),
  'only runtime roles can login'
);

-- 09
select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_authid as roles
    where roles.rolname like 'simula\_%' escape '\'
      and roles.rolpassword is not null
  ),
  'repository bootstrap leaves application role passwords unset'
);

-- 10
select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_auth_members as memberships
    join pg_catalog.pg_roles as granted_role on granted_role.oid = memberships.roleid
    join pg_catalog.pg_roles as member_role on member_role.oid = memberships.member
    where member_role.rolname in ('simula_api', 'simula_worker')
      and granted_role.rolname in ('simula_command_owner', 'simula_worker_owner')
  ),
  'runtime roles cannot assume owner roles'
);

-- 11
select extensions.ok(
  (
    select pg_catalog.bool_and(not memberships.inherit_option)
    from pg_catalog.pg_auth_members as memberships
    join pg_catalog.pg_roles as granted_role on granted_role.oid = memberships.roleid
    join pg_catalog.pg_roles as member_role on member_role.oid = memberships.member
    where member_role.rolname = 'postgres'
      and granted_role.rolname in ('simula_command_owner', 'simula_worker_owner')
      and memberships.set_option
  )
  and (
    select pg_catalog.count(*) = 2
    from pg_catalog.pg_auth_members as memberships
    join pg_catalog.pg_roles as granted_role on granted_role.oid = memberships.roleid
    join pg_catalog.pg_roles as member_role on member_role.oid = memberships.member
    where member_role.rolname = 'postgres'
      and granted_role.rolname in ('simula_command_owner', 'simula_worker_owner')
      and memberships.set_option
  ),
  'migration role receives SET-only owner-role memberships'
);

-- 12
select extensions.ok(
  not exists (
    select 1
    from (values ('anon'), ('authenticated')) as browser_roles(role_name)
    cross join (values ('api'), ('private')) as application_schemas(schema_name)
    where pg_catalog.has_schema_privilege(
      browser_roles.role_name,
      application_schemas.schema_name,
      'USAGE'
    )
  ),
  'browser database roles cannot use application schemas'
);

-- 13
select extensions.ok(
  pg_catalog.has_schema_privilege('simula_api', 'api', 'USAGE')
    and pg_catalog.has_schema_privilege('simula_api', 'private', 'USAGE')
    and not pg_catalog.has_schema_privilege('simula_api', 'api', 'CREATE')
    and not pg_catalog.has_schema_privilege('simula_api', 'private', 'CREATE'),
  'API role has resolution-only schema access'
);

-- 14
select extensions.ok(
  pg_catalog.has_schema_privilege('simula_worker', 'private', 'USAGE')
    and not pg_catalog.has_schema_privilege('simula_worker', 'api', 'USAGE')
    and not pg_catalog.has_schema_privilege('simula_worker', 'private', 'CREATE'),
  'worker role reaches only private schema names and cannot create'
);

-- 15
select extensions.ok(
  not exists (
    select 1
    from (values ('anon'), ('authenticated')) as browser_roles(role_name)
    cross join pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname in ('api', 'private')
      and relations.relkind = 'r'
      and pg_catalog.has_table_privilege(browser_roles.role_name, relations.oid, 'SELECT')
  ),
  'browser database roles have no application table reads'
);

-- 16
select extensions.ok(
  (
    select pg_catalog.count(*) = 9
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname = 'api'
      and relations.relkind = 'r'
      and pg_catalog.has_table_privilege('simula_api', relations.oid, 'SELECT')
  )
  and not exists (
    select 1
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname = 'private'
      and relations.relkind = 'r'
      and pg_catalog.has_table_privilege('simula_api', relations.oid, 'SELECT')
  ),
  'API role reads exactly the nine named API tables'
);

-- 17
select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname in ('api', 'private')
      and relations.relkind = 'r'
      and pg_catalog.has_table_privilege(
        'simula_api',
        relations.oid,
        'INSERT,UPDATE,DELETE,TRUNCATE'
      )
  ),
  'API role has no direct application-table mutation privilege'
);

-- 18
select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname in ('api', 'private')
      and relations.relkind = 'r'
      and pg_catalog.has_table_privilege(
        'simula_worker',
        relations.oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'
      )
  ),
  'worker role has no direct application-table privilege'
);

-- 19
select extensions.is(
  (
    select pg_catalog.array_agg(
      grants.grantee || '|' || grants.table_schema || '.' || grants.table_name
        || '|' || grants.privilege_type
      order by grants.grantee, grants.table_schema, grants.table_name, grants.privilege_type
    )
    from information_schema.role_table_grants as grants
    where grants.table_schema in ('api', 'private')
      and grants.grantee like 'simula\_%' escape '\'
  ),
  array[
    'simula_api|api.audience_versions|SELECT',
    'simula_api|api.audiences|SELECT',
    'simula_api|api.organization_memberships|SELECT',
    'simula_api|api.organizations|SELECT',
    'simula_api|api.projects|SELECT',
    'simula_api|api.simulation_results|SELECT',
    'simula_api|api.simulation_runs|SELECT',
    'simula_api|api.stimuli|SELECT',
    'simula_api|api.stimulus_versions|SELECT',
    'simula_command_owner|api.audience_versions|SELECT',
    'simula_command_owner|api.audiences|SELECT',
    'simula_command_owner|api.organization_memberships|INSERT',
    'simula_command_owner|api.organization_memberships|SELECT',
    'simula_command_owner|api.organizations|INSERT',
    'simula_command_owner|api.organizations|SELECT',
    'simula_command_owner|api.projects|INSERT',
    'simula_command_owner|api.projects|SELECT',
    'simula_command_owner|api.projects|UPDATE',
    'simula_command_owner|api.simulation_runs|INSERT',
    'simula_command_owner|api.simulation_runs|SELECT',
    'simula_command_owner|api.stimuli|INSERT',
    'simula_command_owner|api.stimuli|SELECT',
    'simula_command_owner|api.stimulus_versions|INSERT',
    'simula_command_owner|api.stimulus_versions|SELECT',
    'simula_command_owner|private.audit_events|INSERT',
    'simula_command_owner|private.idempotency_keys|INSERT',
    'simula_command_owner|private.idempotency_keys|SELECT',
    'simula_command_owner|private.idempotency_keys|UPDATE',
    'simula_command_owner|private.run_events|INSERT',
    'simula_command_owner|private.run_outbox|INSERT',
    'simula_worker_owner|api.organizations|SELECT',
    'simula_worker_owner|api.simulation_results|INSERT',
    'simula_worker_owner|api.simulation_results|SELECT',
    'simula_worker_owner|api.simulation_runs|SELECT',
    'simula_worker_owner|api.simulation_runs|UPDATE',
    'simula_worker_owner|private.audit_events|INSERT',
    'simula_worker_owner|private.run_attempts|INSERT',
    'simula_worker_owner|private.run_attempts|SELECT',
    'simula_worker_owner|private.run_attempts|UPDATE',
    'simula_worker_owner|private.run_events|INSERT',
    'simula_worker_owner|private.run_outbox|SELECT',
    'simula_worker_owner|private.run_outbox|UPDATE'
  ]::text[],
  'application table grant inventory is exact'
);

-- 20
select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        functions.proacl,
        pg_catalog.acldefault('f', functions.proowner)
      )
    ) as grants
    where namespaces.nspname in ('api', 'private')
      and grants.grantee = 0
      and grants.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute any application function'
);

-- 21
select extensions.ok(
  not exists (
    select 1
    from (values ('anon'), ('authenticated')) as browser_roles(role_name)
    cross join pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
    where namespaces.nspname in ('api', 'private')
      and pg_catalog.has_function_privilege(browser_roles.role_name, functions.oid, 'EXECUTE')
  )
  and (
    select pg_catalog.array_agg(
      functions.oid::pg_catalog.regprocedure::text
      order by functions.oid::pg_catalog.regprocedure::text
    )
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
    where namespaces.nspname in ('api', 'private')
      and pg_catalog.has_function_privilege('simula_worker', functions.oid, 'EXECUTE')
  ) = array[
    'private.claim_due_run_outbox(integer)',
    'private.claim_run_execution(uuid,smallint,text)',
    'private.complete_run_execution(uuid,uuid,uuid,jsonb)',
    'private.confirm_run_dispatch(uuid,uuid)',
    'private.fail_run_dispatch(uuid,uuid,text)',
    'private.fail_run_execution(uuid,uuid,uuid,text,boolean)',
    'private.heartbeat_run_execution(uuid,uuid,uuid)'
  ]::text[],
  'browser roles execute no application functions; worker has the exact helper allowlist'
);

-- 22
select extensions.is(
  (
    select pg_catalog.array_agg(
      functions.oid::pg_catalog.regprocedure::text
      order by functions.oid::pg_catalog.regprocedure::text
    )
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
    where namespaces.nspname in ('api', 'private')
      and pg_catalog.has_function_privilege('simula_api', functions.oid, 'EXECUTE')
  ),
  array[
    'api.append_stimulus_version(uuid,text,text,text,text,uuid)',
    'api.create_organization(text,text,text,uuid)',
    'api.create_project(uuid,text,text,text,text,text,text,text,uuid)',
    'api.create_simulation_run(uuid,uuid,text,text,uuid)',
    'api.create_stimulus(uuid,text,text,text,text,text,uuid)',
    'api.list_organizations()',
    'api.record_privileged_denial(uuid,text,text,uuid,uuid)',
    'api.update_project(uuid,integer,text,text,text,text,text,uuid)',
    'private.append_stimulus_version_atomic(uuid,text,text,text,text,uuid)',
    'private.create_organization_atomic(text,text,text,uuid)',
    'private.create_project_atomic(uuid,text,text,text,text,text,text,text,uuid)',
    'private.create_simulation_run_atomic(uuid,uuid,text,text,uuid)',
    'private.create_stimulus_atomic(uuid,text,text,text,text,text,uuid)',
    'private.has_org_role(uuid,uuid,api.organization_role[])',
    'private.is_org_member(uuid,uuid)',
    'private.is_verified_api_subject(uuid)',
    'private.record_privileged_denial_atomic(uuid,text,text,uuid,uuid)',
    'private.update_project_atomic(uuid,integer,text,text,text,text,text,uuid)',
    'private.verified_subject()'
  ]::text[],
  'API role function allowlist is exact'
);

-- 23
select extensions.ok(
  (
    select pg_catalog.bool_and(
      (
        functions.proname in (
          'claim_due_run_outbox',
          'claim_run_execution',
          'complete_run_execution',
          'confirm_run_dispatch',
          'fail_run_dispatch',
          'fail_run_execution',
          'heartbeat_run_execution'
        )
        and owner_roles.rolname = 'simula_worker_owner'
        and functions.prosecdef
      )
      or (
        functions.proname not in (
          'claim_due_run_outbox',
          'claim_run_execution',
          'complete_run_execution',
          'confirm_run_dispatch',
          'fail_run_dispatch',
          'fail_run_execution',
          'heartbeat_run_execution'
        )
        and owner_roles.rolname = 'simula_command_owner'
        and functions.prosecdef = (
          functions.proname in (
            'append_stimulus_version_atomic',
            'create_organization_atomic',
            'create_project_atomic',
            'create_simulation_run_atomic',
            'create_stimulus_atomic',
            'has_org_role',
            'is_org_member',
            'record_privileged_denial_atomic',
            'update_project_atomic'
          )
        )
      )
    )
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
    join pg_catalog.pg_roles as owner_roles on owner_roles.oid = functions.proowner
    where namespaces.nspname = 'private'
      and functions.proname in (
        'append_stimulus_version_atomic',
        'create_organization_atomic',
        'create_project_atomic',
        'create_simulation_run_atomic',
        'create_stimulus_atomic',
        'claim_due_run_outbox',
        'claim_run_execution',
        'complete_run_execution',
        'confirm_run_dispatch',
        'fail_run_dispatch',
        'fail_run_execution',
        'heartbeat_run_execution',
        'has_org_role',
        'is_org_member',
        'is_verified_api_subject',
        'record_privileged_denial_atomic',
        'update_project_atomic',
        'verified_subject'
      )
  ),
  'private authorization, command, and worker helpers have exact owners and definer modes'
);

-- 24
select extensions.ok(
  (
    select pg_catalog.bool_and(not functions.prosecdef)
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
    where namespaces.nspname = 'api'
  ),
  'API wrappers are security invokers'
);

-- 25
select extensions.ok(
  (
    select pg_catalog.bool_and(
      functions.proconfig @> array['search_path=""']::text[]
    )
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
    where namespaces.nspname in ('api', 'private')
  ),
  'every application function fixes an empty search path'
);

-- 26
select extensions.ok(
  (
    select pg_catalog.bool_and(
      functions.proconfig @> array['row_security=on']::text[]
    )
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
    where namespaces.nspname = 'private'
      and functions.prosecdef
  ),
  'every security-definer helper forces row security on'
);

-- 27
select extensions.is(
  (
    select pg_catalog.array_agg(triggers.tgname order by triggers.tgname)
    from pg_catalog.pg_trigger as triggers
    join pg_catalog.pg_class as relations on relations.oid = triggers.tgrelid
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname in ('api', 'private')
      and not triggers.tgisinternal
  ),
  array[
    'audience_versions_organization_guard',
    'simulation_runs_audience_guard'
  ]::name[],
  'tenant-scope guard trigger inventory is exact'
);

-- 28
select extensions.is(
  (
    select pg_catalog.array_agg(constraints.conname order by constraints.conname)
    from pg_catalog.pg_constraint as constraints
    join pg_catalog.pg_class as relations on relations.oid = constraints.conrelid
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname in ('api', 'private')
      and constraints.contype = 'f'
      and pg_catalog.array_length(constraints.conkey, 1) = 2
  ),
  array[
    'run_attempts_run_foreign_key',
    'run_events_run_foreign_key',
    'run_outbox_run_foreign_key',
    'simulation_results_run_foreign_key',
    'simulation_runs_project_foreign_key',
    'simulation_runs_stimulus_version_foreign_key',
    'stimuli_project_foreign_key',
    'stimulus_versions_stimulus_foreign_key'
  ]::name[],
  'composite tenant foreign-key inventory is exact'
);

-- 29
select extensions.is(
  (
    select pg_catalog.array_agg(types.typname order by types.typname)
    from pg_catalog.pg_type as types
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = types.typnamespace
    where namespaces.nspname in ('api', 'private')
      and types.typtype = 'e'
  ),
  array[
    'attempt_status',
    'audience_admission_status',
    'audience_kind',
    'audit_actor_type',
    'organization_role',
    'organization_status',
    'outbox_status',
    'project_status',
    'run_state',
    'stimulus_status'
  ]::name[],
  'application enum inventory is exact'
);

-- 30
select extensions.is(
  (
    select pg_catalog.array_agg(users.id::text || '|' || users.email order by users.id)
    from auth.users as users
    where users.id in (
      '00000000-0000-4000-8000-000000000001'::uuid,
      '00000000-0000-4000-8000-000000000002'::uuid,
      '00000000-0000-4000-8000-000000000003'::uuid
    )
      and users.email_confirmed_at is not null
  ),
  array[
    '00000000-0000-4000-8000-000000000001|owner-a@simula.local',
    '00000000-0000-4000-8000-000000000002|viewer-a@simula.local',
    '00000000-0000-4000-8000-000000000003|owner-b@simula.local'
  ]::text[],
  'authored local Auth fixtures are exact and confirmed'
);

-- 31
select extensions.ok(
  (
    select pg_catalog.count(*) = 3
    from auth.identities as identities
    where identities.user_id in (
      '00000000-0000-4000-8000-000000000001'::uuid,
      '00000000-0000-4000-8000-000000000002'::uuid,
      '00000000-0000-4000-8000-000000000003'::uuid
    )
      and identities.provider = 'email'
      and identities.identity_data ->> 'email' = identities.email
  ),
  'each Auth fixture has one generated-email identity'
);

-- 32
select extensions.ok(
  (
    (select pg_catalog.count(*) from api.organizations)
    + (select pg_catalog.count(*) from api.organization_memberships)
    + (select pg_catalog.count(*) from api.projects)
    + (select pg_catalog.count(*) from api.stimuli)
    + (select pg_catalog.count(*) from api.stimulus_versions)
    + (select pg_catalog.count(*) from api.audiences where id <> '00000000-0000-4000-8000-0000000000d0'::uuid)
    + (select pg_catalog.count(*) from api.audience_versions where id <> '00000000-0000-4000-8000-0000000000d1'::uuid)
    + (select pg_catalog.count(*) from api.simulation_runs)
    + (select pg_catalog.count(*) from api.simulation_results)
    + (select pg_catalog.count(*) from private.run_attempts)
    + (select pg_catalog.count(*) from private.run_events)
    + (select pg_catalog.count(*) from private.run_outbox)
    + (select pg_catalog.count(*) from private.idempotency_keys)
    + (select pg_catalog.count(*) from private.audit_events)
  ) = 0
  and exists (
    select 1
    from api.audiences as audiences
    join api.audience_versions as versions on versions.audience_id = audiences.id
    where audiences.id = '00000000-0000-4000-8000-0000000000d0'::uuid
      and audiences.organization_id is null
      and audiences.is_public_demo
      and versions.id = '00000000-0000-4000-8000-0000000000d1'::uuid
      and versions.organization_id is null
      and versions.kind = 'authored_demo'
      and versions.admission_status = 'approved_demo'
      and versions.is_non_representative
  ),
  'only the immutable global demo fixture is seeded; tenant and run data remain empty'
);

select * from extensions.finish();
rollback;
