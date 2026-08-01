begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(14);

grant usage on schema extensions to simula_api;
grant execute on all functions in schema extensions to simula_api;

set role postgres;
grant insert on table api.stimulus_assets to postgres;

set role simula_command_owner;
create function pg_temp.visual_fk_privilege_debug()
returns text
language sql
security definer
set search_path = ''
as $function$
  select pg_catalog.format(
    'effective=%s session=%s command_update=%s command_references=%s api_update=%s api_references=%s postgres_update=%s postgres_references=%s',
    current_user,
    session_user,
    pg_catalog.has_table_privilege(current_user, 'api.stimulus_assets', 'UPDATE'),
    pg_catalog.has_table_privilege(current_user, 'api.stimulus_assets', 'REFERENCES'),
    pg_catalog.has_table_privilege('simula_api', 'api.stimulus_assets', 'UPDATE'),
    pg_catalog.has_table_privilege('simula_api', 'api.stimulus_assets', 'REFERENCES'),
    pg_catalog.has_table_privilege('postgres', 'api.stimulus_assets', 'UPDATE'),
    pg_catalog.has_table_privilege('postgres', 'api.stimulus_assets', 'REFERENCES')
  )
$function$;

set role postgres;

create function pg_temp.visual_profile_payload(
  requested_analysis_id uuid,
  requested_asset_id uuid,
  requested_organization_id uuid,
  requested_stimulus_id uuid,
  requested_content_sha256 text,
  requested_profile_sha256 text
)
returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'schema_version', '1.0.0',
    'analysis_id', requested_analysis_id,
    'asset', pg_catalog.jsonb_build_object(
      'asset_id', requested_asset_id,
      'organization_id', requested_organization_id,
      'stimulus_id', requested_stimulus_id,
      'media_type', 'image/png',
      'byte_size', 128,
      'content_sha256', requested_content_sha256
    ),
    'provider', pg_catalog.jsonb_build_object(
      'provider_id', 'simula_technical_image_signals',
      'provider_version', '1.0.0',
      'model_id', 'pillow-12.3.0',
      'template_id', 'technical_image_signals_v1',
      'analysis_kind', 'image_signal_profile'
    ),
    'methodology_version', 'technical_image_signals_v1',
    'analysis_scope', 'technical_image_signals_only',
    'validation_label', 'experimental',
    'behavioral_interpretation', false,
    'population_inference', false,
    'retained_embedded_metadata', false,
    'checksum_sha256', requested_profile_sha256
  )
$function$;

grant execute on function pg_temp.visual_profile_payload(
  uuid, uuid, uuid, uuid, text, text
) to simula_api;

insert into api.organizations (id, name, created_by)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'Visual profile tenant A',
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'Visual profile tenant B',
    '00000000-0000-4000-8000-000000000003'
  );

insert into api.organization_memberships (
  organization_id,
  user_id,
  role,
  created_by
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'owner',
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    'viewer',
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    'owner',
    '00000000-0000-4000-8000-000000000003'
  );

insert into api.projects (
  id,
  organization_id,
  name,
  objective,
  market,
  language,
  category,
  created_by,
  updated_by
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Visual project A',
    'Exercise tenant-bound visual profile commands.',
    'Local test',
    'English',
    'Test',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    'Visual project B',
    'Exercise cross-tenant denial.',
    'Local test',
    'English',
    'Test',
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000003'
  );

insert into api.stimuli (
  id,
  organization_id,
  project_id,
  name,
  created_by
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Visual stimulus A',
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    'Visual stimulus B',
    '00000000-0000-4000-8000-000000000003'
  );

insert into api.stimulus_assets (
  id,
  organization_id,
  stimulus_id,
  storage_object_name,
  filename,
  media_type,
  byte_size,
  content_sha256,
  status,
  retention_until,
  created_by,
  expected_byte_size,
  expected_content_sha256
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001/'
      '30000000-0000-4000-8000-000000000001/'
      '40000000-0000-4000-8000-000000000001/'
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png',
    'tenant-a.png',
    'image/png',
    128,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'available',
    pg_catalog.statement_timestamp() + interval '1 day',
    '00000000-0000-4000-8000-000000000001',
    128,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002/'
      '30000000-0000-4000-8000-000000000002/'
      '40000000-0000-4000-8000-000000000002/'
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png',
    'tenant-b.png',
    'image/png',
    128,
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'available',
    pg_catalog.statement_timestamp() + interval '1 day',
    '00000000-0000-4000-8000-000000000003',
    128,
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  );

set role postgres;

select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'iss', 'simula-pgtap',
    'aud', 'authenticated',
    'exp', 4102444800
  )::text,
  true
);
set session authorization simula_api;

do $function$
begin
  raise notice 'visual_fk_privilege_debug=%', pg_temp.visual_fk_privilege_debug();
end
$function$;

select extensions.is(
  (
    api.create_stimulus_visual_profile(
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      pg_temp.visual_profile_payload(
        '50000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
      ),
      'visual-profile-key-0001',
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      '60000000-0000-4000-8000-000000000001'
    ) ->> 'replayed'
  )::boolean,
  false,
  'an owner creates the asset-bound profile exactly once'
);

select extensions.is(
  (
    select pg_catalog.count(*)::integer
    from api.stimulus_visual_profiles as profiles
    where profiles.id = '50000000-0000-4000-8000-000000000001'
      and profiles.organization_id =
        '10000000-0000-4000-8000-000000000001'
      and profiles.asset_id = '40000000-0000-4000-8000-000000000001'
      and profiles.asset_content_sha256 =
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  ),
  1,
  'the durable profile remains bound to tenant, asset, and content digest'
);

select extensions.is(
  (
    api.create_stimulus_visual_profile(
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      pg_temp.visual_profile_payload(
        '50000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
      ),
      'visual-profile-key-0001',
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      '60000000-0000-4000-8000-000000000001'
    ) ->> 'replayed'
  )::boolean,
  true,
  'the exact idempotent replay is explicit'
);

reset session authorization;

select extensions.is(
  (
    select pg_catalog.count(*)::integer
    from private.audit_events as events
    where events.action = 'stimulus_visual_profile.created'
      and events.object_id = '50000000-0000-4000-8000-000000000001'
  ),
  1,
  'replay creates no duplicate profile audit event'
);

set session authorization simula_api;

select extensions.throws_ok(
  $sql$
    select api.create_stimulus_visual_profile(
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      pg_temp.visual_profile_payload(
        '50000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
      ),
      'visual-profile-key-0001',
      'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      '60000000-0000-4000-8000-000000000002'
    )
  $sql$,
  '22000',
  'idempotency_key_reused',
  'an idempotency key cannot be rebound to another request'
);

select extensions.throws_ok(
  $sql$
    select api.create_stimulus_visual_profile(
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      pg_temp.visual_profile_payload(
        '50000000-0000-4000-8000-000000000002',
        '40000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      ),
      'visual-profile-key-0002',
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      '60000000-0000-4000-8000-000000000003'
    )
  $sql$,
  '22023',
  'visual_profile_immutable_conflict',
  'one asset cannot be rebound to a different analysis'
);

select extensions.throws_ok(
  $sql$
    select api.create_stimulus_visual_profile(
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      pg_temp.visual_profile_payload(
        '50000000-0000-4000-8000-000000000002',
        '40000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      ),
      'visual-profile-key-0003',
      '1111111111111111111111111111111111111111111111111111111111111111',
      '60000000-0000-4000-8000-000000000004'
    )
  $sql$,
  '22023',
  'visual_profile_mismatch',
  'profile content cannot disagree with immutable asset content'
);

reset session authorization;
select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000002',
    'role', 'authenticated',
    'iss', 'simula-pgtap',
    'aud', 'authenticated',
    'exp', 4102444800
  )::text,
  true
);
set session authorization simula_api;

select extensions.throws_ok(
  $sql$
    select api.create_stimulus_visual_profile(
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      pg_temp.visual_profile_payload(
        '50000000-0000-4000-8000-000000000002',
        '40000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      ),
      'visual-profile-key-0004',
      '2222222222222222222222222222222222222222222222222222222222222222',
      '60000000-0000-4000-8000-000000000005'
    )
  $sql$,
  'P0002',
  'not_found',
  'a viewer cannot acquire the editor-only asset lock'
);

reset session authorization;
select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000003',
    'role', 'authenticated',
    'iss', 'simula-pgtap',
    'aud', 'authenticated',
    'exp', 4102444800
  )::text,
  true
);
set session authorization simula_api;

select extensions.throws_ok(
  $sql$
    select api.create_stimulus_visual_profile(
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      pg_temp.visual_profile_payload(
        '50000000-0000-4000-8000-000000000002',
        '40000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      ),
      'visual-profile-key-0005',
      '3333333333333333333333333333333333333333333333333333333333333333',
      '60000000-0000-4000-8000-000000000006'
    )
  $sql$,
  'P0002',
  'not_found',
  'cross-tenant profile creation fails closed without disclosing the asset'
);

select extensions.is(
  (
    select pg_catalog.count(*)::integer
    from api.stimulus_visual_profiles
    where asset_id = '40000000-0000-4000-8000-000000000001'
  ),
  0,
  'cross-tenant readers cannot see the retained profile'
);

reset session authorization;
select pg_catalog.set_config('request.jwt.claims', '{}', true);
set session authorization simula_api;

select extensions.throws_ok(
  $sql$
    select api.create_stimulus_visual_profile(
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      '{}'::jsonb,
      'visual-profile-key-0006',
      '4444444444444444444444444444444444444444444444444444444444444444',
      '60000000-0000-4000-8000-000000000007'
    )
  $sql$,
  '42501',
  'unauthorized',
  'missing verified claims are rejected'
);

reset session authorization;
select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'iss', 'simula-pgtap',
    'aud', 'authenticated',
    'exp', 4102444800
  )::text,
  true
);
set session authorization simula_api;

select extensions.is(
  api.request_stimulus_asset_deletion(
    '40000000-0000-4000-8000-000000000001',
    'visual-delete-key-0001',
    '5555555555555555555555555555555555555555555555555555555555555555',
    '60000000-0000-4000-8000-000000000008'
  ) ->> 'status',
  'deletion_requested',
  'the governed asset-retirement path transitions the source asset'
);

select extensions.is(
  (
    select pg_catalog.count(*)::integer
    from api.stimulus_visual_profiles
    where asset_id = '40000000-0000-4000-8000-000000000001'
  ),
  0,
  'asset retirement erases the derived visual profile'
);

reset session authorization;

select extensions.is(
  (
    select pg_catalog.count(*)::integer
    from private.phase4_command_receipts as receipts
    where receipts.scope = 'stimulus_visual_profile.create'
      and receipts.organization_id =
        '10000000-0000-4000-8000-000000000001'
  ),
  1,
  'failed and replayed requests create no extra durable command receipt'
);

select * from extensions.finish();
rollback;
