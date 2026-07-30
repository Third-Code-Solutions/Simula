\set ON_ERROR_STOP on

begin;

set session authorization simula_api;
set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1","aud":"authenticated","exp":4102444800}';
set local simula.release_sha =
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

create temporary table organization_deletion_recovery_state (
  organization_id uuid primary key,
  request_id uuid,
  run_id uuid not null,
  storage_object_name text not null
) on commit drop;

do $request_fixture$
declare
  created record;
  created_project record;
  created_stimulus record;
  created_run record;
  created_asset jsonb;
begin
  select * into created
  from api.create_organization(
    'Deletion Recovery Workspace',
    'organization-create-recovery-proof-0001',
    '1111111111111111111111111111111111111111111111111111111111111111',
    '20000000-0000-4000-8000-000000000081'::uuid
  );
  select * into created_project
  from api.create_project(
    created.organization_id,
    'Deletion recovery project',
    'Prove crash-safe deletion recovery',
    'philippines',
    'en',
    'campaign_message',
    'project-create-recovery-proof-0001',
    '2222222222222222222222222222222222222222222222222222222222222222',
    '20000000-0000-4000-8000-000000000082'::uuid
  );
  select * into created_stimulus
  from api.create_stimulus(
    created_project.project_id,
    'Deletion recovery stimulus',
    'Fictional recovery proof message.',
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to('Fictional recovery proof message.', 'UTF8')
      ),
      'hex'
    ),
    'stimulus-create-recovery-proof-0001',
    '3333333333333333333333333333333333333333333333333333333333333333',
    '20000000-0000-4000-8000-000000000083'::uuid
  );
  created_asset := api.create_stimulus_asset(
    created_stimulus.stimulus_id,
    'recovery-proof.png',
    'image/png',
    1,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    pg_catalog.statement_timestamp() + interval '1 day',
    'asset-create-recovery-proof-0001',
    '4444444444444444444444444444444444444444444444444444444444444444',
    '20000000-0000-4000-8000-000000000084'::uuid
  );
  select * into created_run
  from api.create_behavioral_demo_run(
    created_project.project_id,
    created_stimulus.stimulus_version_id,
    'baseline',
    'run-create-recovery-proof-0001',
    '5656565656565656565656565656565656565656565656565656565656565656',
    '20000000-0000-4000-8000-000000000086'::uuid,
    '00-11111111111111111111111111111111-2222222222222222-01'
  );

  insert into organization_deletion_recovery_state (
    organization_id,
    run_id,
    storage_object_name
  ) values (
    created.organization_id,
    created_run.run_id,
    created_asset ->> 'storage_object_name'
  );
end
$request_fixture$;

reset session authorization;

update api.simulation_runs
set state = 'failed',
    terminal_at = pg_catalog.statement_timestamp()
where id = (
  select run_id from organization_deletion_recovery_state
);

set session authorization simula_api;
set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1","aud":"authenticated","exp":4102444800}';

do $request$
declare
  state organization_deletion_recovery_state%rowtype;
  requested jsonb;
begin
  select * into strict state from organization_deletion_recovery_state;
  requested := api.request_organization_deletion(
    state.organization_id,
    'Deletion Recovery Workspace',
    'organization-delete-recovery-proof-0001',
    '5555555555555555555555555555555555555555555555555555555555555555',
    '20000000-0000-4000-8000-000000000085'::uuid
  );

  update organization_deletion_recovery_state
  set request_id = (requested ->> 'request_id')::uuid
  where organization_id = state.organization_id;

  begin
    perform private.claim_organization_deletion_resources(10);
    raise exception 'API session claimed worker deletion resources';
  exception
    when insufficient_privilege then null;
  end;
end
$request$;

reset session authorization;

do $verify_seed$
declare
  state organization_deletion_recovery_state%rowtype;
begin
  select * into strict state from organization_deletion_recovery_state;
  if (
    select pg_catalog.count(*) <> 3
      or pg_catalog.count(*) filter (
        where resources.resource_kind = 'cache'
          and resources.resource_key = state.organization_id::text
      ) <> 1
      or pg_catalog.count(*) filter (
        where resources.resource_kind = 'storage_object'
          and resources.resource_key = state.storage_object_name
      ) <> 1
      or pg_catalog.count(*) filter (
        where resources.resource_kind = 'run'
          and resources.resource_key = state.run_id::text
      ) <> 1
    from private.organization_deletion_resources as resources
    where resources.request_id = state.request_id
  ) then
    raise exception 'deletion request did not seed exact recovery resources';
  end if;
end
$verify_seed$;

update api.simulation_runs
set state = 'queued',
    terminal_at = null
where id = (
  select run_id from organization_deletion_recovery_state
);

set session authorization simula_worker;

do $first_worker_pass$
declare
  claimed record;
  saw_cache boolean := false;
  saw_run boolean := false;
  saw_storage boolean := false;
begin
  for claimed in
    select * from private.claim_organization_deletion_resources(10)
  loop
    if claimed.resource_kind = 'cache' then
      saw_cache := true;
      if not private.complete_organization_deletion_resource(
        claimed.resource_id,
        claimed.claim_token
      ) then
        raise exception 'cache resource completion lost its current lease';
      end if;
      if private.complete_organization_deletion_resource(
        claimed.resource_id,
        claimed.claim_token
      ) then
        raise exception 'completed resource accepted duplicate lease completion';
      end if;
    elsif claimed.resource_kind = 'storage_object' then
      saw_storage := true;
      if not private.release_organization_deletion_resource(
        claimed.resource_id,
        claimed.claim_token,
        'storage_cleanup_failed'
      ) then
        raise exception 'storage resource release lost its current lease';
      end if;
    elsif claimed.resource_kind = 'run' then
      saw_run := true;
      if not private.complete_organization_deletion_resource(
        claimed.resource_id,
        claimed.claim_token
      ) then
        raise exception 'run resource completion lost its current lease';
      end if;
    else
      raise exception 'unexpected recovery resource kind %',
        claimed.resource_kind;
    end if;
  end loop;
  if not saw_cache or not saw_run or not saw_storage then
    raise exception 'worker did not claim every seeded recovery resource';
  end if;
  if private.finalize_ready_organization_deletions(10) <> 0 then
    raise exception 'request finalized before every external resource completed';
  end if;
end
$first_worker_pass$;

reset session authorization;

do $verify_retry$
declare
  state organization_deletion_recovery_state%rowtype;
  storage_resource private.organization_deletion_resources%rowtype;
begin
  select * into strict state from organization_deletion_recovery_state;
  select * into strict storage_resource
  from private.organization_deletion_resources
  where request_id = state.request_id
    and resource_kind = 'storage_object';
  if storage_resource.status <> 'pending'
    or storage_resource.cleanup_attempt_count <> 1
    or storage_resource.cleanup_claim_token is not null
    or storage_resource.cleanup_claim_expires_at is not null
    or storage_resource.last_error_code <> 'storage_cleanup_failed'
    or storage_resource.next_attempt_at <= pg_catalog.statement_timestamp() then
    raise exception 'failed storage cleanup did not persist bounded backoff';
  end if;
  update private.organization_deletion_resources
  set next_attempt_at = pg_catalog.statement_timestamp()
  where id = storage_resource.id;
end
$verify_retry$;

set session authorization simula_worker;

do $second_worker_pass$
declare
  claimed record;
  claim_count integer := 0;
begin
  for claimed in
    select * from private.claim_organization_deletion_resources(10)
  loop
    claim_count := claim_count + 1;
    if claimed.resource_kind <> 'storage_object'
      or claimed.attempt_count <> 2 then
      raise exception 'retry claimed an unexpected resource or attempt';
    end if;
    if not private.complete_organization_deletion_resource(
      claimed.resource_id,
      claimed.claim_token
    ) then
      raise exception 'retried storage resource did not complete';
    end if;
  end loop;
  if claim_count <> 1 then
    raise exception 'retry did not claim exactly one due resource';
  end if;
  if private.finalize_ready_organization_deletions(10) <> 0 then
    raise exception 'active run guard did not block worker finalization';
  end if;
end
$second_worker_pass$;

reset session authorization;

update api.simulation_runs
set state = 'failed',
    terminal_at = pg_catalog.statement_timestamp()
where id = (
  select run_id from organization_deletion_recovery_state
);

set session authorization simula_worker;

do $finalize$
begin
  if private.finalize_ready_organization_deletions(10) <> 1 then
    raise exception 'completed external cleanup did not finalize one request';
  end if;
end
$finalize$;

reset session authorization;

do $verify_final$
declare
  state organization_deletion_recovery_state%rowtype;
begin
  select * into strict state from organization_deletion_recovery_state;
  if exists (
    select 1 from api.organizations where id = state.organization_id
  ) or exists (
    select 1
    from private.organization_deletion_resources
    where request_id = state.request_id
  ) then
    raise exception 'worker finalization left organization or resource residue';
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
    raise exception 'worker finalization did not retain minimal tombstone';
  end if;
end
$verify_final$;

rollback;

\echo organization deletion recovery adversarial database tests: PASS
