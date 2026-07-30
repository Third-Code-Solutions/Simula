begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(20);

select extensions.has_table(
  'api',
  'stimulus_visual_profiles',
  'durable visual profiles have a dedicated table'
);

select extensions.ok(
  (
    select relations.relrowsecurity and relations.relforcerowsecurity
    from pg_catalog.pg_class as relations
    where relations.oid =
      'api.stimulus_visual_profiles'::pg_catalog.regclass
  ),
  'visual profiles force RLS'
);

select extensions.is(
  (
    select pg_catalog.array_agg(policies.policyname order by policies.policyname)
    from pg_catalog.pg_policies as policies
    where policies.schemaname = 'api'
      and policies.tablename = 'stimulus_visual_profiles'
  ),
  array[
    'stimulus_visual_profiles_api_select',
    'stimulus_visual_profiles_command_delete',
    'stimulus_visual_profiles_command_insert',
    'stimulus_visual_profiles_command_select'
  ]::name[],
  'visual profile policy inventory is exact'
);

select extensions.is(
  (
    select pg_catalog.array_agg(attributes.attname order by attributes.attnum)
    from pg_catalog.pg_attribute as attributes
    where attributes.attrelid =
      'api.stimulus_visual_profiles'::pg_catalog.regclass
      and attributes.attnum > 0
      and not attributes.attisdropped
  ),
  array[
    'id',
    'organization_id',
    'stimulus_id',
    'asset_id',
    'asset_content_sha256',
    'methodology_version',
    'provider_id',
    'provider_version',
    'model_id',
    'template_id',
    'profile_checksum_sha256',
    'profile',
    'created_by',
    'created_at'
  ]::name[],
  'visual profile column inventory is exact'
);

select extensions.ok(
  (
    select pg_catalog.count(*) = 1
    from pg_catalog.pg_constraint as constraints
    where constraints.conrelid =
      'api.stimulus_visual_profiles'::pg_catalog.regclass
      and constraints.contype = 'u'
      and pg_catalog.pg_get_constraintdef(constraints.oid) = 'UNIQUE (asset_id)'
  ),
  'one immutable profile is retained per immutable asset'
);

select extensions.ok(
  (
    select pg_catalog.pg_get_constraintdef(constraints.oid)
      like '%behavioral_interpretation%'
      and pg_catalog.pg_get_constraintdef(constraints.oid)
        like '%population_inference%'
      and pg_catalog.pg_get_constraintdef(constraints.oid)
        like '%retained_embedded_metadata%'
      and pg_catalog.pg_get_constraintdef(constraints.oid)
        like '%profile_checksum_sha256%'
    from pg_catalog.pg_constraint as constraints
    where constraints.conrelid =
      'api.stimulus_visual_profiles'::pg_catalog.regclass
      and constraints.contype = 'c'
      and pg_catalog.pg_get_constraintdef(constraints.oid)
        like '%schema_version%'
  ),
  'profile JSON is bound to identity, checksum, and no-claim flags'
);

select extensions.ok(
  (
    select pg_catalog.pg_get_constraintdef(constraints.oid)
      like '%pillow-12.1.0%'
      and pg_catalog.pg_get_constraintdef(constraints.oid)
        like '%pillow-12.3.0%'
    from pg_catalog.pg_constraint as constraints
    where constraints.conrelid =
      'api.stimulus_visual_profiles'::pg_catalog.regclass
      and constraints.conname = 'stimulus_visual_profiles_model_id_valid'
  ),
  'historical Pillow 12.1 profiles remain readable while 12.3 is admitted'
);

select extensions.ok(
  (
    select pg_catalog.pg_get_expr(
      policies.polwithcheck,
      policies.polrelid
    ) like '%stimulus_visual_profile.created%'
      and pg_catalog.pg_get_expr(
        policies.polwithcheck,
        policies.polrelid
      ) like '%organization.deletion_requested%'
    from pg_catalog.pg_policy as policies
    where policies.polrelid = 'private.audit_events'::pg_catalog.regclass
      and policies.polname = 'audit_events_command_phase4_insert'
  ),
  'phase 4 audit policy admits both visual-profile and deletion events'
);

select extensions.ok(
  (
    select pg_catalog.pg_get_constraintdef(constraints.oid)
      like '%stimulus_visual_profile.create%'
    from pg_catalog.pg_constraint as constraints
    where constraints.conrelid =
      'private.phase4_command_receipts'::pg_catalog.regclass
      and constraints.conname = 'phase4_command_receipts_scope_valid'
  ),
  'visual profile creation has a durable command-receipt scope'
);

select extensions.has_function(
  'api',
  'create_stimulus_visual_profile',
  array['uuid', 'uuid', 'jsonb', 'text', 'text', 'uuid'],
  'public visual profile command wrapper exists'
);

select extensions.has_function(
  'private',
  'create_stimulus_visual_profile_atomic',
  array['uuid', 'uuid', 'jsonb', 'text', 'text', 'uuid'],
  'atomic visual profile command exists'
);

select extensions.ok(
  (
    select owner_roles.rolname = 'simula_command_owner'
      and functions.prosecdef
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_roles as owner_roles
      on owner_roles.oid = functions.proowner
    where functions.oid =
      'private.create_stimulus_visual_profile_atomic(uuid,uuid,jsonb,text,text,uuid)'::pg_catalog.regprocedure
  ),
  'atomic visual profile command is command-owner security definer'
);

select extensions.is(
  (
    select functions.proconfig
    from pg_catalog.pg_proc as functions
    where functions.oid =
      'private.create_stimulus_visual_profile_atomic(uuid,uuid,jsonb,text,text,uuid)'::pg_catalog.regprocedure
  ),
  array['search_path=""', 'row_security=on']::text[],
  'atomic visual profile command fixes search path and RLS'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'simula_api',
    'api.create_stimulus_visual_profile(uuid,uuid,jsonb,text,text,uuid)',
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'simula_api',
    'private.create_stimulus_visual_profile_atomic(uuid,uuid,jsonb,text,text,uuid)',
    'EXECUTE'
  ),
  'only the least-privilege API path can execute the visual profile command'
);

select extensions.ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'api.create_stimulus_visual_profile(uuid,uuid,jsonb,text,text,uuid)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'api.create_stimulus_visual_profile(uuid,uuid,jsonb,text,text,uuid)',
    'EXECUTE'
  ),
  'browser database roles cannot execute visual profile creation'
);

select extensions.is(
  (
    select pg_catalog.array_agg(
      grants.grantee || '|' || grants.privilege_type
      order by grants.grantee, grants.privilege_type
    )
    from information_schema.role_table_grants as grants
    where grants.table_schema = 'api'
      and grants.table_name = 'stimulus_visual_profiles'
      and grants.grantee like 'simula\_%' escape '\'
  ),
  array[
    'simula_api|SELECT',
    'simula_command_owner|DELETE',
    'simula_command_owner|INSERT',
    'simula_command_owner|SELECT'
  ]::text[],
  'visual profile table grants are least privilege'
);

select extensions.ok(
  exists (
    select 1
    from pg_catalog.pg_trigger as triggers
    where triggers.tgrelid = 'api.stimulus_assets'::pg_catalog.regclass
      and triggers.tgname =
        'purge_stimulus_visual_profile_on_asset_retirement'
      and not triggers.tgisinternal
  ),
  'asset retirement installs visual-profile erasure'
);

select extensions.ok(
  (
    select owner_roles.rolname = 'simula_command_owner'
      and functions.prosecdef
      and functions.proconfig =
        array['search_path=""', 'row_security=on']::text[]
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_roles as owner_roles
      on owner_roles.oid = functions.proowner
    where functions.oid =
      'private.purge_stimulus_visual_profile_on_asset_retirement()'::pg_catalog.regprocedure
  ),
  'retirement erasure is a fixed-path command-owner function'
);

select extensions.ok(
  (
    select pg_catalog.pg_get_functiondef(functions.oid)
      like '%selected_asset.status <> ''available''%'
      and pg_catalog.pg_get_functiondef(functions.oid)
        like '%technical_image_signals_v1%'
      and pg_catalog.pg_get_functiondef(functions.oid)
        like '%simula_technical_image_signals%'
      and pg_catalog.pg_get_functiondef(functions.oid)
        like '%retained_embedded_metadata%'
      and pg_catalog.pg_get_functiondef(functions.oid)
        like '%visual_profile_immutable_conflict%'
    from pg_catalog.pg_proc as functions
    where functions.oid =
      'private.create_stimulus_visual_profile_atomic(uuid,uuid,jsonb,text,text,uuid)'::pg_catalog.regprocedure
  ),
  'atomic command checks lifecycle, provider, method, privacy, and immutability'
);

select extensions.ok(
  exists (
    select 1
    from pg_catalog.pg_indexes as indexes
    where indexes.schemaname = 'api'
      and indexes.tablename = 'stimulus_visual_profiles'
      and indexes.indexname = 'stimulus_visual_profiles_org_created_idx'
  ),
  'organization and creation ordering is indexed'
);

select * from extensions.finish();
rollback;
