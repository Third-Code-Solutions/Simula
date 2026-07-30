begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(17);

select extensions.is(
  (
    select pg_catalog.array_agg(relations.relname order by relations.relname)
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = relations.relnamespace
    where namespaces.nspname = 'api'
      and relations.relname in (
        'behavioral_agent_public_summaries',
        'behavioral_fleet_summaries',
        'behavioral_round_summaries'
      )
      and relations.relkind = 'r'
  ),
  array[
    'behavioral_agent_public_summaries',
    'behavioral_fleet_summaries',
    'behavioral_round_summaries'
  ]::name[],
  'M6 persists only bounded public fleet, round, and agent projections'
);

select extensions.ok(
  (
    select pg_catalog.bool_and(
      relations.relrowsecurity and relations.relforcerowsecurity
    )
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = relations.relnamespace
    where namespaces.nspname = 'api'
      and relations.relname in (
        'behavioral_agent_public_summaries',
        'behavioral_fleet_summaries',
        'behavioral_round_summaries'
      )
  ),
  'every public behavioral summary table has forced RLS'
);

select extensions.ok(
  (
    select pg_catalog.bool_and(
      pg_catalog.has_table_privilege(
        'simula_api',
        relations.oid,
        'SELECT'
      )
      and not pg_catalog.has_table_privilege(
        'simula_api',
        relations.oid,
        'INSERT,UPDATE,DELETE,TRUNCATE'
      )
    )
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = relations.relnamespace
    where namespaces.nspname = 'api'
      and relations.relname in (
        'behavioral_agent_public_summaries',
        'behavioral_fleet_summaries',
        'behavioral_round_summaries'
      )
  ),
  'API can read tenant-filtered summaries but cannot mutate them'
);

select extensions.ok(
  not exists (
    select 1
    from (values ('anon'), ('authenticated')) as browser_roles(role_name)
    cross join pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = relations.relnamespace
    where namespaces.nspname = 'api'
      and relations.relname in (
        'behavioral_agent_public_summaries',
        'behavioral_fleet_summaries',
        'behavioral_round_summaries'
      )
      and pg_catalog.has_table_privilege(
        browser_roles.role_name,
        relations.oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'
      )
  ),
  'browser roles cannot bypass the control-plane authorization boundary'
);

select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = relations.relnamespace
    where namespaces.nspname = 'api'
      and relations.relname in (
        'behavioral_agent_public_summaries',
        'behavioral_fleet_summaries',
        'behavioral_round_summaries'
      )
      and pg_catalog.has_table_privilege(
        'simula_worker',
        relations.oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'
      )
  ),
  'worker runtime has no direct public-summary table authority'
);

select extensions.has_function(
  'private',
  'normalize_behavioral_public_summaries',
  array['uuid', 'uuid', 'bytea']::text[],
  'canonical artifacts have one bounded public-summary normalizer'
);

select extensions.has_function(
  'private',
  'normalize_behavioral_public_summaries_trigger',
  array[]::text[],
  'canonical artifact inserts invoke a dedicated summary wrapper'
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
        'normalize_behavioral_public_summaries',
        'normalize_behavioral_public_summaries_trigger'
      )
  ),
  'summary normalizers are worker-owner invokers with empty search paths'
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
          'private.normalize_behavioral_public_summaries(uuid,uuid,bytea)'
            ::pg_catalog.regprocedure
        ),
        (
          'private.normalize_behavioral_public_summaries_trigger()'
            ::pg_catalog.regprocedure
        )
    ) as routines(routine_id)
    where pg_catalog.has_function_privilege(
      roles.role_name,
      routines.routine_id,
      'EXECUTE'
    )
  ),
  'summary normalizers are unreachable outside the owner trigger path'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'simula_worker_owner',
    'private.normalize_behavioral_public_summaries(uuid,uuid,bytea)'
      ::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'simula_worker',
    'private.normalize_behavioral_public_summaries(uuid,uuid,bytea)'
      ::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'trigger owner alone can invoke bounded public-summary normalization'
);

select extensions.is(
  (
    select pg_catalog.count(*)::integer
    from pg_catalog.pg_trigger as triggers
    where triggers.tgrelid =
      'private.behavioral_result_payloads'::pg_catalog.regclass
      and triggers.tgname = 'behavioral_result_payload_public_summary'
      and not triggers.tgisinternal
  ),
  1,
  'one public-summary trigger is attached to canonical payload insertion'
);

select extensions.ok(
  (
    select triggers.tgenabled = 'O'
    from pg_catalog.pg_trigger as triggers
    where triggers.tgrelid =
      'private.behavioral_result_payloads'::pg_catalog.regclass
      and triggers.tgname = 'behavioral_result_payload_public_summary'
  ),
  'public-summary trigger is enabled'
);

select extensions.is(
  (
    select pg_catalog.count(*)::integer
    from pg_catalog.pg_constraint as constraints
    where constraints.conname in (
      'behavioral_agent_public_summaries_run_foreign_key',
      'behavioral_fleet_summaries_run_foreign_key',
      'behavioral_round_summaries_run_foreign_key'
    )
      and constraints.confdeltype = 'c'
  ),
  3,
  'run deletion cascades across every public behavioral summary'
);

select extensions.has_index(
  'api',
  'behavioral_fleet_summaries',
  'behavioral_fleet_summaries_organization_created_idx',
  'fleet reads use the tenant and creation index'
);

select extensions.has_index(
  'api',
  'behavioral_round_summaries',
  'behavioral_round_summaries_organization_run_idx',
  'timeline reads use the tenant, run, and round index'
);

select extensions.has_index(
  'api',
  'behavioral_agent_public_summaries',
  'behavioral_agent_public_summaries_organization_run_idx',
  'bounded synthetic interview reads use the tenant and run index'
);

select extensions.ok(
  pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.normalize_behavioral_public_summaries(uuid,uuid,bytea)'
      ::pg_catalog.regprocedure
  )) not like '%synthetic_rationale%'
  and pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.normalize_behavioral_public_summaries(uuid,uuid,bytea)'
      ::pg_catalog.regprocedure
  )) not like '%''traits''%'
  and pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.normalize_behavioral_public_summaries(uuid,uuid,bytea)'
      ::pg_catalog.regprocedure
  )) not like '%''dimensions''%'
  and pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.normalize_behavioral_public_summaries(uuid,uuid,bytea)'
      ::pg_catalog.regprocedure
  )) not like '%''memory''%',
  'public normalization cannot project rationale, traits, dimensions, or memory'
);

select * from extensions.finish();
rollback;
