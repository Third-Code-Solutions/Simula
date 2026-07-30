begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(15);

select extensions.is(
  (
    select pg_catalog.array_agg(relations.relname order by relations.relname)
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = relations.relnamespace
    where namespaces.nspname = 'api'
      and relations.relname in (
        'behavioral_evaluation_members',
        'behavioral_evaluation_protocol_versions',
        'behavioral_evaluation_protocols',
        'behavioral_evaluation_runs'
      )
      and relations.relkind = 'r'
  ),
  array[
    'behavioral_evaluation_members',
    'behavioral_evaluation_protocol_versions',
    'behavioral_evaluation_protocols',
    'behavioral_evaluation_runs'
  ]::name[],
  'M5 persists prespecified protocols, benchmark runs, and exact members'
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
      and relations.relname like 'behavioral_evaluation_%'
      and relations.relkind = 'r'
  ),
  'every behavioral evaluation table has forced RLS'
);

select extensions.is(
  (
    select pg_catalog.count(*)::integer
    from api.behavioral_evaluation_protocol_versions
  ),
  0,
  'no benchmark protocol or outcome corpus is silently bundled'
);

select extensions.has_trigger(
  'api',
  'behavioral_evaluation_protocol_versions',
  'behavioral_evaluation_protocol_versions_guard',
  'protocol versions enforce exact tenant and split integrity'
);

select extensions.has_trigger(
  'api',
  'behavioral_evaluation_runs',
  'behavioral_evaluation_runs_scope_guard',
  'benchmark runs enforce protocol, outcome, and tenant scope'
);

select extensions.ok(
  pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.enforce_behavioral_evaluation_protocol()'
      ::pg_catalog.regprocedure
  )) like '%count(distinct campaign_id)%'
  and pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.enforce_behavioral_evaluation_protocol()'
      ::pg_catalog.regprocedure
  )) like '%development_campaign_ids && new.holdout_campaign_ids%',
  'protocol admission rejects duplicate and overlapping split identifiers'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.enforce_behavioral_evaluation_run_scope()'
      ::pg_catalog.regprocedure
  ) like '%outcome_status <> ''admitted''%'
  and pg_catalog.pg_get_functiondef(
    'private.enforce_behavioral_evaluation_run_scope()'
      ::pg_catalog.regprocedure
  ) like '%protocol_validation_label <> ''benchmark_only''%',
  'evaluation admission requires admitted outcomes and benchmark-only protocol'
);

select extensions.ok(
  (
    select pg_catalog.pg_get_constraintdef(constraints.oid)
      like '%validation_label = ''benchmark_only''%'
    from pg_catalog.pg_constraint as constraints
    where constraints.conrelid =
      'api.behavioral_evaluation_runs'::pg_catalog.regclass
      and constraints.conname = 'behavioral_evaluation_runs_label_valid'
  ),
  'durable evaluation runs cannot claim a stronger validation label'
);

select extensions.is(
  (
    select constraints.confdeltype::text
    from pg_catalog.pg_constraint as constraints
    where constraints.conname =
      'behavioral_evaluation_members_evaluation_foreign_key'
  ),
  'c',
  'evaluation deletion cascades through exact member rows'
);

select extensions.is(
  (
    select pg_catalog.count(*)::integer
    from pg_catalog.pg_constraint as constraints
    where constraints.conname in (
      'behavioral_evaluation_members_behavioral_run_foreign_key',
      'behavioral_evaluation_members_outcome_foreign_key',
      'behavioral_evaluation_runs_outcome_set_foreign_key'
    )
      and constraints.confdeltype = 'r'
  ),
  3,
  'benchmark evidence cannot be deleted under retained evaluation history'
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
        'INSERT,UPDATE,DELETE'
      )
    )
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = relations.relnamespace
    where namespaces.nspname = 'api'
      and relations.relname like 'behavioral_evaluation_%'
      and relations.relkind = 'r'
  ),
  'API can read tenant-filtered benchmark records but cannot mutate them'
);

select extensions.ok(
  not exists (
    select 1
    from (values ('anon'), ('authenticated')) as browser_roles(role_name)
    cross join pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = relations.relnamespace
    where namespaces.nspname = 'api'
      and relations.relname like 'behavioral_evaluation_%'
      and pg_catalog.has_table_privilege(
        browser_roles.role_name,
        relations.oid,
        'SELECT,INSERT,UPDATE,DELETE'
      )
  ),
  'browser roles cannot bypass benchmark domain authorization'
);

select extensions.ok(
  (
    select pg_catalog.bool_and(
      owners.rolname = 'postgres'
      and not routines.prosecdef
      and routines.proconfig @> array['search_path=""']::text[]
    )
    from pg_catalog.pg_proc as routines
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = routines.pronamespace
    join pg_catalog.pg_roles as owners on owners.oid = routines.proowner
    where namespaces.nspname = 'private'
      and routines.proname in (
        'enforce_behavioral_evaluation_protocol',
        'enforce_behavioral_evaluation_run_scope'
      )
  ),
  'evaluation guards are inaccessible migration-owned invokers'
);

select extensions.has_index(
  'api',
  'behavioral_evaluation_members',
  'behavioral_evaluation_members_behavioral_run_idx',
  'prediction provenance lookup is indexed by behavioral run'
);

select extensions.has_index(
  'api',
  'behavioral_evaluation_runs',
  'behavioral_evaluation_runs_outcome_set_idx',
  'outcome benchmark history is indexed by admitted outcome set'
);

select * from extensions.finish();
rollback;
