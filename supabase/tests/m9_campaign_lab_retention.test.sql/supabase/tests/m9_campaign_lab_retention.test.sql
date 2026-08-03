begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(10);

select extensions.ok(
  (
    select columns.is_nullable = 'NO'
      and columns.column_default like '%90 days%'
    from information_schema.columns as columns
    where columns.table_schema = 'api'
      and columns.table_name = 'campaign_lab_artifacts'
      and columns.column_name = 'retention_until'
  ),
  'Campaign Lab artifacts have a required bounded retention deadline'
);

select extensions.ok(
  (
    select columns.is_nullable = 'NO'
      and columns.column_default like '%90 days%'
    from information_schema.columns as columns
    where columns.table_schema = 'api'
      and columns.table_name = 'campaign_lab_runs'
      and columns.column_name = 'retention_until'
  ),
  'Campaign Lab runs have a required bounded retention deadline'
);

select extensions.ok(
  (
    select pg_catalog.pg_get_constraintdef(constraints.oid) like '%retention_until > created_at%'
    from pg_catalog.pg_constraint as constraints
    join pg_catalog.pg_class as relations on relations.oid = constraints.conrelid
    join pg_catalog.pg_namespace as schemas on schemas.oid = relations.relnamespace
    where schemas.nspname = 'api'
      and relations.relname = 'campaign_lab_artifacts'
      and constraints.conname = 'campaign_lab_artifacts_retention_valid'
  )
  and (
    select pg_catalog.pg_get_constraintdef(constraints.oid) like '%retention_until > created_at%'
    from pg_catalog.pg_constraint as constraints
    join pg_catalog.pg_class as relations on relations.oid = constraints.conrelid
    join pg_catalog.pg_namespace as schemas on schemas.oid = relations.relnamespace
    where schemas.nspname = 'api'
      and relations.relname = 'campaign_lab_runs'
      and constraints.conname = 'campaign_lab_runs_retention_valid'
  ),
  'Campaign Lab retention deadlines cannot precede row creation'
);

select extensions.ok(
  pg_catalog.to_regclass('api.campaign_lab_artifacts_retention_idx') is not null
  and pg_catalog.to_regclass('api.campaign_lab_runs_retention_idx') is not null,
  'Campaign Lab retention indexes exist for terminal rows'
);

select extensions.ok(
  pg_catalog.has_table_privilege('simula_worker_owner', 'api.campaign_lab_artifacts', 'DELETE')
  and pg_catalog.has_table_privilege('simula_worker_owner', 'api.campaign_lab_runs', 'DELETE'),
  'the worker owner has only the table capability required by the retention function'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'simula_worker',
    'private.expire_campaign_lab_runs(integer)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'private.expire_campaign_lab_runs(integer)'::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'Campaign Lab retention cleanup is worker-only'
);

select extensions.ok(
  (
    select owner_roles.rolname = 'postgres'
      and functions.prosecdef
      and functions.proconfig @> array['search_path=""', 'row_security=on']::text[]
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_roles as owner_roles on owner_roles.oid = functions.proowner
    where functions.oid =
      'private.expire_campaign_lab_runs(integer)'::pg_catalog.regprocedure
  )
  and pg_catalog.pg_get_functiondef(
    'private.expire_campaign_lab_runs(integer)'::pg_catalog.regprocedure
  ) like '%campaign_lab.retention_deleted%'
  and pg_catalog.pg_get_functiondef(
    'private.expire_campaign_lab_runs(integer)'::pg_catalog.regprocedure
  ) like '%delete from api.campaign_lab_runs%',
  'Campaign Lab retention cleanup audits before deleting terminal runs'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.runtime_schema_readiness_v3()'::pg_catalog.regprocedure
  ) like '%20260803100000::bigint%'
  and pg_catalog.pg_get_functiondef(
    'private.runtime_observability_snapshot_v3()'::pg_catalog.regprocedure
  ) like '%20260803100000::bigint%',
  'runtime readiness and observability report the retention schema head'
);

select extensions.ok(
  exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'api'
      and tablename = 'campaign_lab_artifacts'
      and policyname = 'campaign_lab_artifacts_worker_delete'
  )
  and exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'api'
      and tablename = 'campaign_lab_runs'
      and policyname = 'campaign_lab_runs_worker_delete'
  ),
  'worker delete policies are present for terminal Campaign Lab rows'
);

select extensions.ok(
  (
    select pg_catalog.pg_get_expr(indexes.indexprs, indexes.indrelid) is null
      and pg_catalog.pg_get_indexdef(indexes.indexrelid) like '%retention_until%'
      and pg_catalog.pg_get_indexdef(indexes.indexrelid) like '%succeeded%'
    from pg_catalog.pg_index as indexes
    where indexes.indexrelid = 'api.campaign_lab_runs_retention_idx'::pg_catalog.regclass
  ),
  'Campaign Lab run retention index is partial on terminal deadlines'
);

select * from extensions.finish();
rollback;

