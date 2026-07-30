begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(18);

select extensions.is(
  (
    select pg_catalog.array_agg(relations.relname order by relations.relname)
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = relations.relnamespace
    where namespaces.nspname = 'api'
      and relations.relname in (
        'evidence_source_versions',
        'evidence_sources',
        'observed_outcome_sets',
        'observed_outcome_values',
        'stimulus_assets'
      )
      and relations.relkind = 'r'
  ),
  array[
    'evidence_source_versions',
    'evidence_sources',
    'observed_outcome_sets',
    'observed_outcome_values',
    'stimulus_assets'
  ]::name[],
  'M5 adds rights, aggregate outcome, and private asset metadata tables'
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
        'evidence_source_versions',
        'evidence_sources',
        'observed_outcome_sets',
        'observed_outcome_values',
        'stimulus_assets'
      )
  ),
  'rights, outcomes, and asset metadata all have forced RLS'
);

select extensions.ok(
  (
    select versions.organization_id is null
      and versions.rights_status = 'approved'
      and versions.consent_basis like 'No people%'
      and versions.allowed_uses =
        array['Local deterministic engineering rehearsal.']::text[]
    from api.evidence_source_versions as versions
    where versions.id =
      '00000000-0000-4000-8000-0000000005e1'::uuid
  ),
  'the only seeded evidence lineage is explicitly authored and non-human'
);

select extensions.has_trigger(
  'api',
  'evidence_source_versions',
  'evidence_source_versions_scope_guard',
  'evidence versions cannot cross source tenancy'
);

select extensions.has_trigger(
  'api',
  'observed_outcome_sets',
  'observed_outcome_sets_rights_guard',
  'admitted outcomes require current approved source rights'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.enforce_observed_outcome_rights()'::pg_catalog.regprocedure
  ) like '%source_rights_status <> ''approved''%'
  and pg_catalog.pg_get_functiondef(
    'private.enforce_observed_outcome_rights()'::pg_catalog.regprocedure
  ) like '%source_rights_expires_at <=%',
  'outcome admission rejects unapproved and expired source rights'
);

select extensions.ok(
  (
    select pg_catalog.pg_get_constraintdef(constraints.oid)
      like '%observation_count >= 50%'
    from pg_catalog.pg_constraint as constraints
    where constraints.conrelid =
      'api.observed_outcome_values'::pg_catalog.regclass
      and constraints.conname =
        'observed_outcome_values_sparse_cell_valid'
  ),
  'subgroup outcomes enforce the prespecified sparse-cell floor'
);

select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_attribute as attributes
    where attributes.attrelid = 'api.stimulus_assets'::pg_catalog.regclass
      and not attributes.attisdropped
      and attributes.atttypid = 'bytea'::pg_catalog.regtype
  ),
  'asset metadata stores no file bytes in the application table'
);

select extensions.ok(
  (
    select not buckets.public
      and buckets.file_size_limit = 16777216
      and buckets.allowed_mime_types @> array[
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'video/mp4'
      ]::text[]
    from storage.buckets as buckets
    where buckets.id = 'simula-private-assets'
  ),
  'stimulus asset bucket is private and strictly bounded'
);

select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_policies as policies
    where policies.schemaname = 'storage'
      and policies.tablename = 'objects'
      and (
        coalesce(policies.qual, '') like '%simula-private-assets%'
        or coalesce(policies.with_check, '')
          like '%simula-private-assets%'
      )
  ),
  'browser storage-object policies are absent; access stays server-mediated'
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
      and relations.relname in (
        'evidence_source_versions',
        'evidence_sources',
        'observed_outcome_sets',
        'observed_outcome_values',
        'stimulus_assets'
      )
  ),
  'API receives tenant-filtered reads and no direct mutation authority'
);

select extensions.ok(
  (
    select pg_catalog.array_agg(
      grants.column_name order by grants.column_name
    )
    from information_schema.role_column_grants as grants
    where grants.grantee = 'simula_command_owner'
      and grants.table_schema = 'api'
      and grants.table_name = 'stimulus_assets'
      and grants.privilege_type = 'UPDATE'
  ) = array[
    'byte_size',
    'content_sha256',
    'deleted_at',
    'deletion_requested_at',
    'status'
  ]::information_schema.sql_identifier[],
  'asset mutation authority is limited to lifecycle columns'
);

select extensions.ok(
  not exists (
    select 1
    from (values ('anon'), ('authenticated')) as browser_roles(role_name)
    cross join (
      values
        ('api.evidence_sources'),
        ('api.evidence_source_versions'),
        ('api.observed_outcome_sets'),
        ('api.observed_outcome_values'),
        ('api.stimulus_assets')
    ) as tables(table_name)
    where pg_catalog.has_table_privilege(
      browser_roles.role_name,
      tables.table_name,
      'SELECT,INSERT,UPDATE,DELETE'
    )
  ),
  'browser database roles cannot bypass the server domain'
);

select extensions.is(
  (
    select constraints.confdeltype::text
    from pg_catalog.pg_constraint as constraints
    where constraints.conname =
      'observed_outcome_sets_project_foreign_key'
  ),
  'c',
  'project deletion cascades through aggregate outcome sets'
);

select extensions.is(
  (
    select constraints.confdeltype::text
    from pg_catalog.pg_constraint as constraints
    where constraints.conname =
      'observed_outcome_sets_evidence_source_version_id_fkey'
  ),
  'r',
  'admitted evidence versions cannot be deleted under outcome history'
);

select extensions.is(
  (
    select constraints.confdeltype::text
    from pg_catalog.pg_constraint as constraints
    where constraints.conname =
      'stimulus_assets_stimulus_foreign_key'
  ),
  'c',
  'stimulus deletion cascades through asset metadata'
);

select extensions.has_index(
  'api',
  'observed_outcome_values',
  'observed_outcome_values_metric_idx',
  'aggregate evaluation lookups use the tenant and metric index'
);

select extensions.has_index(
  'api',
  'stimulus_assets',
  'stimulus_assets_retention_idx',
  'retention cleanup uses a partial lifecycle index'
);

select * from extensions.finish();
rollback;
