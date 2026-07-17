-- The global authored-demo audience is immutable after migration
-- 20260718010000.  FOR SHARE therefore adds no correctness protection and
-- requires a table-write privilege that the command owner intentionally lacks.
-- Keep the read under the existing SECURITY DEFINER boundary without widening
-- the role's DML authority.

grant create on schema private to simula_command_owner;
set role simula_command_owner;

create or replace function private.create_simulation_run_atomic(
  requested_project_id uuid,
  requested_stimulus_version_id uuid,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns table (
  run_id uuid,
  organization_id uuid,
  project_id uuid,
  stimulus_version_id uuid,
  audience_version_id uuid,
  run_state api.run_state,
  schema_version integer,
  dispatch_generation smallint,
  job_id text,
  run_version integer,
  created_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  subject uuid;
  selected_project api.projects%rowtype;
  selected_stimulus api.stimulus_versions%rowtype;
  selected_audience api.audience_versions%rowtype;
  idempotency_id uuid;
  existing_sha256 text;
  existing_response jsonb;
  created_run api.simulation_runs%rowtype;
  frozen jsonb;
  frozen_sha256 text;
  seed bigint;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_project_id is null or requested_stimulus_version_id is null then
    raise exception using errcode = '22023', message = 'invalid_run_reference';
  end if;
  if requested_idempotency_key is null
    or requested_idempotency_key !~ '^[ -~]{16,128}$' then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;
  if requested_sha256 is null or requested_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_request_hash';
  end if;
  if requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_correlation_id';
  end if;

  select * into selected_project
  from api.projects as projects
  where projects.id = requested_project_id
    and projects.status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if not private.has_org_role(
    selected_project.organization_id,
    subject,
    array['owner', 'editor']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  select versions.* into selected_stimulus
  from api.stimulus_versions as versions
  join api.stimuli as stimuli on stimuli.id = versions.stimulus_id
  where versions.id = requested_stimulus_version_id
    and versions.organization_id = selected_project.organization_id
    and stimuli.project_id = selected_project.id
    and stimuli.status = 'active';
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;

  select * into selected_audience
  from api.audience_versions as versions
  where versions.id = '00000000-0000-4000-8000-0000000000d1'::uuid
    and versions.organization_id is null
    and versions.kind = 'authored_demo'
    and versions.admission_status = 'approved_demo'
    and versions.is_non_representative;
  if not found then
    raise exception using errcode = '55000', message = 'demo_audience_unavailable';
  end if;

  insert into private.idempotency_keys (
    actor_user_id,
    scope,
    idempotency_key,
    request_sha256,
    organization_id,
    scope_organization_id,
    scope_resource_id
  )
  values (
    subject,
    'run.create',
    requested_idempotency_key,
    requested_sha256,
    selected_project.organization_id,
    selected_project.organization_id,
    selected_project.id
  )
  on conflict do nothing
  returning id into idempotency_id;

  if idempotency_id is null then
    select keys.request_sha256, keys.response
      into existing_sha256, existing_response
      from private.idempotency_keys as keys
      where keys.actor_user_id = subject
        and keys.scope_organization_id = selected_project.organization_id
        and keys.scope_resource_id = selected_project.id
        and keys.scope = 'run.create'
        and keys.idempotency_key = requested_idempotency_key
      for update;
    if not found or existing_response is null then
      raise exception using errcode = '55000', message = 'idempotency_state_incomplete';
    end if;
    if existing_sha256 <> requested_sha256 then
      raise exception using errcode = '22000', message = 'idempotency_key_reused';
    end if;
    return query
    select
      (existing_response ->> 'run_id')::uuid,
      (existing_response ->> 'organization_id')::uuid,
      (existing_response ->> 'project_id')::uuid,
      (existing_response ->> 'stimulus_version_id')::uuid,
      (existing_response ->> 'audience_version_id')::uuid,
      (existing_response ->> 'state')::api.run_state,
      (existing_response ->> 'schema_version')::integer,
      (existing_response ->> 'dispatch_generation')::smallint,
      existing_response ->> 'job_id',
      (existing_response ->> 'version')::integer,
      (existing_response ->> 'created_at')::timestamptz,
      true;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(selected_project.organization_id::text, 0)
  );
  if (
    select pg_catalog.count(*)
    from api.simulation_runs as runs
    where runs.organization_id = selected_project.organization_id
      and runs.state in ('queued', 'running', 'retrying', 'cancel_requested')
  ) >= 20 then
    raise exception using errcode = '54000', message = 'pending_run_quota_exceeded';
  end if;
  if (
    select pg_catalog.count(*)
    from api.simulation_runs as runs
    where runs.organization_id = selected_project.organization_id
  ) >= 100 then
    raise exception using errcode = '54000', message = 'run_retention_quota_exceeded';
  end if;

  frozen := pg_catalog.jsonb_build_object(
    'audience', pg_catalog.jsonb_build_object(
      'checksum_sha256', selected_audience.checksum_sha256,
      'kind', selected_audience.kind,
      'manifest', selected_audience.manifest,
      'non_representative', selected_audience.is_non_representative,
      'version_id', selected_audience.id
    ),
    'disclosure_version', 'phase2_demo_v1',
    'method_version', 'phase2_demo_v1',
    'mock_provider_version', 1,
    'schema_version', 1,
    'stimulus', pg_catalog.jsonb_build_object(
      'content', selected_stimulus.content,
      'content_sha256', selected_stimulus.content_sha256,
      'version_id', selected_stimulus.id
    )
  );
  frozen_sha256 := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(frozen::text, 'UTF8'), 'sha256'), 'hex'
  );
  seed := pg_catalog.hashtextextended(frozen_sha256, 0);

  insert into api.simulation_runs (
    organization_id,
    project_id,
    stimulus_version_id,
    audience_version_id,
    frozen_manifest,
    frozen_manifest_sha256,
    schema_version,
    deterministic_seed,
    created_by,
    correlation_id
  )
  values (
    selected_project.organization_id,
    selected_project.id,
    selected_stimulus.id,
    selected_audience.id,
    frozen,
    frozen_sha256,
    1,
    seed,
    subject,
    requested_correlation_id
  )
  returning * into created_run;

  insert into private.run_events (
    organization_id,
    run_id,
    previous_state,
    new_state,
    attempt_number,
    safe_reason,
    actor_type,
    actor_user_id,
    correlation_id
  )
  values (
    created_run.organization_id,
    created_run.id,
    null,
    'queued',
    null,
    'created',
    'user',
    subject,
    requested_correlation_id
  );

  insert into private.run_outbox (
    organization_id,
    run_id,
    generation,
    job_id
  )
  values (
    created_run.organization_id,
    created_run.id,
    1,
    'run:' || created_run.id::text || ':dispatch:1'
  );

  response_payload := pg_catalog.jsonb_build_object(
    'audience_version_id', created_run.audience_version_id,
    'created_at', created_run.created_at,
    'dispatch_generation', created_run.dispatch_generation,
    'job_id', 'run:' || created_run.id::text || ':dispatch:1',
    'organization_id', created_run.organization_id,
    'project_id', created_run.project_id,
    'run_id', created_run.id,
    'schema_version', created_run.schema_version,
    'state', created_run.state,
    'stimulus_version_id', created_run.stimulus_version_id,
    'version', created_run.version
  );
  update private.idempotency_keys
    set resource_id = created_run.id,
        response = response_payload
    where id = idempotency_id;

  insert into private.audit_events (
    organization_id,
    actor_type,
    actor_user_id,
    action,
    object_type,
    object_id,
    correlation_id,
    outcome,
    source_service,
    metadata
  )
  values (
    created_run.organization_id,
    'user',
    subject,
    'run.created',
    'simulation_run',
    created_run.id,
    requested_correlation_id,
    'success',
    'api',
    pg_catalog.jsonb_build_object(
      'idempotency_scope', 'run.create',
      'schema_version', created_run.schema_version
    )
  );

  return query
  select
    created_run.id,
    created_run.organization_id,
    created_run.project_id,
    created_run.stimulus_version_id,
    created_run.audience_version_id,
    created_run.state,
    created_run.schema_version,
    created_run.dispatch_generation,
    'run:' || created_run.id::text || ':dispatch:1',
    created_run.version,
    created_run.created_at,
    false;
end
$function$;

revoke create on schema private from simula_command_owner;
reset role;
