\set ON_ERROR_STOP on

begin;
set session authorization simula_api;
set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1","aud":"authenticated","exp":4102444800}';
set local simula.release_sha =
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

create temporary table organization_deletion_test_state (
  organization_id uuid primary key,
  request_id uuid not null,
  project_id uuid not null,
  stimulus_id uuid not null,
  asset_id uuid not null
) on commit drop;

do $test$
declare
  created record;
  created_project record;
  created_stimulus record;
  created_asset jsonb;
  active_organization record;
  active_project record;
  active_stimulus record;
  requested jsonb;
  replayed jsonb;
  completed jsonb;
  completed_replay jsonb;
begin
  select * into created
  from api.create_organization(
    'Deletion Proof Workspace',
    'organization-create-delete-proof-0001',
    '1111111111111111111111111111111111111111111111111111111111111111',
    '10000000-0000-4000-8000-000000000081'::uuid
  );

  select * into created_project
  from api.create_project(
    created.organization_id,
    'Deletion proof project',
    'Prove durable workspace deletion',
    'philippines',
    'en',
    'campaign_message',
    'project-create-delete-proof-0001',
    '4444444444444444444444444444444444444444444444444444444444444444',
    '10000000-0000-4000-8000-000000000085'::uuid
  );
  select * into created_stimulus
  from api.create_stimulus(
    created_project.project_id,
    'Deletion proof stimulus',
    'Fictional deletion proof message.',
    '0194612882e4f8ad2bce55c74abdfc6ed53367c83b1e1624a8dd39d3faea4aae',
    'stimulus-create-delete-proof-0001',
    '5555555555555555555555555555555555555555555555555555555555555555',
    '10000000-0000-4000-8000-000000000086'::uuid
  );
  created_asset := api.create_stimulus_asset(
    created_stimulus.stimulus_id,
    'deletion-proof.png',
    'image/png',
    1,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    pg_catalog.statement_timestamp() + interval '1 day',
    'asset-create-delete-proof-0001',
    '6666666666666666666666666666666666666666666666666666666666666666',
    '10000000-0000-4000-8000-000000000087'::uuid
  );

  select * into active_organization
  from api.create_organization(
    'Active Run Workspace',
    'organization-create-active-proof-0001',
    '7777777777777777777777777777777777777777777777777777777777777777',
    '10000000-0000-4000-8000-000000000088'::uuid
  );
  select * into active_project
  from api.create_project(
    active_organization.organization_id,
    'Active run proof project',
    'Prove active runs block workspace deletion',
    'philippines',
    'en',
    'campaign_message',
    'project-create-active-proof-0001',
    '8888888888888888888888888888888888888888888888888888888888888888',
    '10000000-0000-4000-8000-000000000089'::uuid
  );
  select * into active_stimulus
  from api.create_stimulus(
    active_project.project_id,
    'Active run proof stimulus',
    'Fictional deletion proof message.',
    '0194612882e4f8ad2bce55c74abdfc6ed53367c83b1e1624a8dd39d3faea4aae',
    'stimulus-create-active-proof-0001',
    '9999999999999999999999999999999999999999999999999999999999999999',
    '10000000-0000-4000-8000-000000000090'::uuid
  );
  perform api.create_behavioral_demo_run(
    active_project.project_id,
    active_stimulus.stimulus_version_id,
    'baseline',
    'run-create-active-proof-0001',
    'abababababababababababababababababababababababababababababababab',
    '10000000-0000-4000-8000-000000000091'::uuid,
    '00-11111111111111111111111111111111-2222222222222222-01'
  );
  begin
    perform api.request_organization_deletion(
      active_organization.organization_id,
      'Active Run Workspace',
      'organization-delete-active-proof-0001',
      'cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd',
      '10000000-0000-4000-8000-000000000092'::uuid
    );
    raise exception 'workspace deletion accepted a non-terminal run';
  exception
    when sqlstate '55000' then
      if sqlerrm <> 'organization_deletion_active_runs' then
        raise;
      end if;
  end;

  requested := api.request_organization_deletion(
    created.organization_id,
    'Deletion Proof Workspace',
    'organization-delete-proof-key-0001',
    '2222222222222222222222222222222222222222222222222222222222222222',
    '10000000-0000-4000-8000-000000000082'::uuid
  );
  if requested ->> 'status' <> 'pending'
    or (requested ->> 'replayed')::boolean
    or requested -> 'resource_manifest' -> 'run_ids' <> '[]'::jsonb
    or pg_catalog.jsonb_array_length(
      requested -> 'resource_manifest' -> 'storage_objects'
    ) <> 1
    or requested -> 'resource_manifest' -> 'storage_objects' ->> 0
      <> created_asset ->> 'storage_object_name' then
    raise exception 'deletion request did not persist an exact pending manifest';
  end if;
  if private.has_org_role(
    created.organization_id,
    private.verified_subject(),
    array['owner']::api.organization_role[]
  ) then
    raise exception 'disabled organization retained command authorization';
  end if;

  begin
    perform api.request_organization_deletion(
      created.organization_id,
      'Deletion Proof Workspace',
      'organization-delete-proof-key-0002',
      '3333333333333333333333333333333333333333333333333333333333333333',
      '10000000-0000-4000-8000-000000000083'::uuid
    );
    raise exception 'changed deletion confirmation hash unexpectedly replayed';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'organization_deletion_confirmation_mismatch' then
        raise;
      end if;
  end;

  replayed := api.request_organization_deletion(
    created.organization_id,
    'Deletion Proof Workspace',
    'organization-delete-proof-key-0002',
    '2222222222222222222222222222222222222222222222222222222222222222',
    '10000000-0000-4000-8000-000000000084'::uuid
  );
  if not (replayed ->> 'replayed')::boolean
    or replayed ->> 'request_id' <> requested ->> 'request_id' then
    raise exception 'deletion request was not safely resumable';
  end if;

  completed := api.confirm_organization_deletion(
    (requested ->> 'request_id')::uuid,
    created.organization_id
  );
  if completed ->> 'status' <> 'completed'
    or completed ->> 'completed_at' is null
    or completed -> 'resource_manifest' <> pg_catalog.jsonb_build_object(
      'run_ids', '[]'::jsonb,
      'storage_objects', '[]'::jsonb
    ) then
    raise exception 'deletion confirmation did not complete and minimize state';
  end if;

  completed_replay := api.confirm_organization_deletion(
    (requested ->> 'request_id')::uuid,
    created.organization_id
  );
  if not (completed_replay ->> 'replayed')::boolean then
    raise exception 'completed deletion was not replay-safe';
  end if;

  insert into organization_deletion_test_state (
    organization_id,
    request_id,
    project_id,
    stimulus_id,
    asset_id
  )
  values (
    created.organization_id,
    (requested ->> 'request_id')::uuid,
    created_project.project_id,
    created_stimulus.stimulus_id,
    (created_asset ->> 'asset_id')::uuid
  );
end
$test$;

reset session authorization;

do $verify$
declare
  state organization_deletion_test_state%rowtype;
begin
  select * into strict state from organization_deletion_test_state;
  if exists (
    select 1 from api.organizations where id = state.organization_id
  ) or exists (
    select 1
    from api.organization_memberships
    where organization_id = state.organization_id
  ) or exists (
    select 1
    from private.idempotency_keys
    where organization_id = state.organization_id
  ) or exists (
    select 1
    from private.audit_events
    where organization_id = state.organization_id
  ) or exists (
    select 1 from api.projects where id = state.project_id
  ) or exists (
    select 1 from api.stimuli where id = state.stimulus_id
  ) or exists (
    select 1 from api.stimulus_assets where id = state.asset_id
  ) then
    raise exception 'organization deletion left database graph residue';
  end if;
  if not exists (
    select 1
    from private.organization_deletion_requests
    where id = state.request_id
      and organization_id = state.organization_id
      and status = 'completed'
      and completed_at is not null
      and resource_manifest = pg_catalog.jsonb_build_object(
        'run_ids', '[]'::jsonb,
        'storage_objects', '[]'::jsonb
      )
  ) then
    raise exception 'minimal completed deletion evidence did not survive';
  end if;
end
$verify$;

rollback;

\echo organization deletion adversarial database tests: PASS
