-- P2-04: durable deterministic run authority. Redis remains transport-only;
-- every run, outbox, lease, result, and audit transition is authoritative here.

do $role_precondition$
begin
  if exists (
    select 1
    from (values
      ('simula_api'),
      ('simula_worker'),
      ('simula_command_owner'),
      ('simula_worker_owner')
    ) as required_roles (role_name)
    where not exists (
      select 1 from pg_catalog.pg_roles where rolname = required_roles.role_name
    )
  ) then
    raise exception using errcode = '55000', message = 'simula_role_bootstrap_missing';
  end if;
end
$role_precondition$;

alter table api.simulation_runs
  add column version integer not null default 1,
  add constraint simulation_runs_version_positive check (version > 0),
  add constraint simulation_runs_terminal_lease_valid check (
    state not in ('canceled', 'succeeded', 'failed')
    or (worker_lease_token is null and worker_lease_expires_at is null)
  );

alter table api.simulation_results
  add constraint simulation_results_artifact_size_valid check (
    pg_catalog.octet_length(artifact::text) <= 131072
  ),
  add constraint simulation_results_phase2_schema_valid check (
    artifact ->> 'schema_version' = '1.0.0'
  );

alter table private.run_attempts
  add constraint run_attempts_lifecycle_valid check (
    (status = 'running' and finished_at is null and safe_error_code is null)
    or (status <> 'running' and finished_at is not null)
  );

alter table private.run_outbox
  add constraint run_outbox_status_shape_valid check (
    (status = 'pending'
      and claim_token is null
      and claim_expires_at is null
      and confirmed_at is null
      and terminal_error_code is null)
    or (status = 'claimed'
      and claim_token is not null
      and claim_expires_at is not null
      and confirmed_at is null
      and terminal_error_code is null)
    or (status = 'dispatched'
      and claim_token is null
      and claim_expires_at is null
      and confirmed_at is not null
      and terminal_error_code is null)
    or (status = 'terminal'
      and claim_token is null
      and claim_expires_at is null
      and confirmed_at is null
      and terminal_error_code is not null)
  );

-- The fixture is globally scoped, immutable, and explicitly non-representative.
-- It is migration data, not customer data, so hosted and local behavior match.
insert into api.audiences (
  id, organization_id, name, is_public_demo, created_by
)
values (
  '00000000-0000-4000-8000-0000000000d0'::uuid,
  null,
  'Authored deterministic demo audience',
  true,
  null
)
on conflict (id) do nothing;

with fixture as (
  select
    '00000000-0000-4000-8000-0000000000d0'::uuid as audience_id,
    '00000000-0000-4000-8000-0000000000d1'::uuid as audience_version_id,
    pg_catalog.jsonb_build_object(
      'audience_cells', pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('key', 'authored_demo', 'weight', 1.0)
      ),
      'disclosure_version', 'phase2_demo_v1',
      'kind', 'authored_demo',
      'method_version', 'phase2_demo_v1',
      'non_representative', true
    ) as manifest
)
insert into api.audience_versions (
  id,
  organization_id,
  audience_id,
  version,
  kind,
  admission_status,
  manifest,
  checksum_sha256,
  is_non_representative,
  limitations
)
select
  fixture.audience_version_id,
  null,
  fixture.audience_id,
  1,
  'authored_demo',
  'approved_demo',
  fixture.manifest,
  pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(fixture.manifest::text, 'UTF8'), 'sha256'),
    'hex'
  ),
  true,
  'Estimates nobody and is not representative of any population.'
from fixture
on conflict (id) do nothing;

drop policy idempotency_keys_command_select on private.idempotency_keys;
drop policy idempotency_keys_command_insert on private.idempotency_keys;
drop policy idempotency_keys_command_update on private.idempotency_keys;
drop policy audit_events_command_insert on private.audit_events;

create policy audiences_command_select
on api.audiences
for select
to simula_command_owner
using (
  is_public_demo and organization_id is null
  or private.is_org_member(organization_id, private.verified_subject())
);

create policy audience_versions_command_select
on api.audience_versions
for select
to simula_command_owner
using (
  (
    organization_id is null
    and kind = 'authored_demo'
    and admission_status = 'approved_demo'
    and is_non_representative
  )
  or private.is_org_member(organization_id, private.verified_subject())
);

create policy simulation_runs_command_select
on api.simulation_runs
for select
to simula_command_owner
using (private.is_org_member(organization_id, private.verified_subject()));

create policy simulation_runs_command_insert
on api.simulation_runs
for insert
to simula_command_owner
with check (
  private.is_verified_api_subject(created_by)
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
  and state = 'queued'
  and attempt_count = 0
  and dispatch_generation = 1
  and worker_lease_token is null
  and worker_lease_expires_at is null
  and terminal_at is null
  and version = 1
  and exists (
    select 1
    from api.projects as projects
    where projects.id = project_id
      and projects.organization_id = simulation_runs.organization_id
      and projects.status = 'active'
  )
  and exists (
    select 1
    from api.stimulus_versions as versions
    join api.stimuli as stimuli on stimuli.id = versions.stimulus_id
    where versions.id = stimulus_version_id
      and versions.organization_id = simulation_runs.organization_id
      and stimuli.project_id = simulation_runs.project_id
      and stimuli.status = 'active'
  )
  and exists (
    select 1
    from api.audience_versions as versions
    where versions.id = audience_version_id
      and versions.organization_id is null
      and versions.kind = 'authored_demo'
      and versions.admission_status = 'approved_demo'
      and versions.is_non_representative
  )
);

create policy run_events_command_insert
on private.run_events
for insert
to simula_command_owner
with check (
  actor_type = 'user'
  and private.is_verified_api_subject(actor_user_id)
  and previous_state is null
  and new_state = 'queued'
  and attempt_number is null
  and safe_reason = 'created'
  and exists (
    select 1
    from api.simulation_runs as runs
    where runs.id = run_events.run_id
      and runs.organization_id = run_events.organization_id
      and runs.created_by = private.verified_subject()
  )
);

create policy run_outbox_command_insert
on private.run_outbox
for insert
to simula_command_owner
with check (
  generation = 1
  and status = 'pending'
  and dispatch_attempt_count = 0
  and claim_token is null
  and claim_expires_at is null
  and confirmed_at is null
  and terminal_error_code is null
  and exists (
    select 1
    from api.simulation_runs as runs
    where runs.id = run_outbox.run_id
      and runs.organization_id = run_outbox.organization_id
      and runs.created_by = private.verified_subject()
      and runs.state = 'queued'
  )
);

create policy idempotency_keys_command_select
on private.idempotency_keys
for select
to simula_command_owner
using (
  private.is_verified_api_subject(actor_user_id)
  and (
    (scope = 'organization.create' and scope_resource_id is null)
    or (
      scope in (
        'project.create', 'stimulus.create', 'stimulus.version.append', 'run.create'
      )
      and scope_organization_id is not null
      and private.has_org_role(
        scope_organization_id,
        private.verified_subject(),
        array['owner', 'editor']::api.organization_role[]
      )
    )
  )
);

create policy idempotency_keys_command_insert
on private.idempotency_keys
for insert
to simula_command_owner
with check (
  private.is_verified_api_subject(actor_user_id)
  and (
    (
      scope = 'organization.create'
      and scope_organization_id is null
      and scope_resource_id is null
    )
    or (
      scope in (
        'project.create', 'stimulus.create', 'stimulus.version.append', 'run.create'
      )
      and scope_organization_id is not null
      and organization_id = scope_organization_id
      and private.has_org_role(
        scope_organization_id,
        private.verified_subject(),
        array['owner', 'editor']::api.organization_role[]
      )
    )
  )
);

create policy idempotency_keys_command_update
on private.idempotency_keys
for update
to simula_command_owner
using (
  private.is_verified_api_subject(actor_user_id)
  and (
    scope = 'organization.create'
    or (
      scope in (
        'project.create', 'stimulus.create', 'stimulus.version.append', 'run.create'
      )
      and scope_organization_id is not null
      and private.has_org_role(
        scope_organization_id,
        private.verified_subject(),
        array['owner', 'editor']::api.organization_role[]
      )
    )
  )
)
with check (
  private.is_verified_api_subject(actor_user_id)
  and organization_id is not null
  and resource_id is not null
  and response is not null
  and (
    scope = 'organization.create'
    or (
      scope in (
        'project.create', 'stimulus.create', 'stimulus.version.append', 'run.create'
      )
      and scope_organization_id = organization_id
      and private.has_org_role(
        scope_organization_id,
        private.verified_subject(),
        array['owner', 'editor']::api.organization_role[]
      )
    )
  )
);

create policy audit_events_command_insert
on private.audit_events
for insert
to simula_command_owner
with check (
  actor_type = 'user'
  and private.is_verified_api_subject(actor_user_id)
  and source_service = 'api'
  and (
    (
      outcome = 'success'
      and (
        (
          action = 'organization.created'
          and object_type = 'organization'
          and organization_id = object_id
        )
        or (
          action in (
            'project.created',
            'project.updated',
            'stimulus.created',
            'stimulus.version_appended',
            'run.created'
          )
          and private.has_org_role(
            organization_id,
            private.verified_subject(),
            array['owner', 'editor']::api.organization_role[]
          )
        )
      )
    )
    or (
      outcome = 'denied'
      and action in (
        'project.create_denied',
        'project.update_denied',
        'stimulus.create_denied',
        'stimulus.version_append_denied'
      )
      and private.is_org_member(organization_id, private.verified_subject())
    )
  )
);

grant select on table api.audiences, api.audience_versions, api.simulation_runs
  to simula_command_owner;
grant insert on table api.simulation_runs to simula_command_owner;
grant insert on table private.run_events, private.run_outbox to simula_command_owner;

grant create on schema private to simula_command_owner;
set role simula_command_owner;

create function private.create_simulation_run_atomic(
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
    and versions.is_non_representative
  for share;
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

  perform 1 from api.organizations
    where id = selected_project.organization_id
    for update;
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

alter function private.create_simulation_run_atomic(uuid, uuid, text, text, uuid)
  owner to simula_command_owner;
revoke create on schema private from simula_command_owner;
reset role;

-- Worker helpers are owned by a separate NOLOGIN role. The runtime worker has
-- EXECUTE-only access and never receives direct table privileges.
grant usage on schema api to simula_worker_owner;
grant select on table api.organizations to simula_worker_owner;
grant select, update on table api.simulation_runs to simula_worker_owner;
grant select, insert on table api.simulation_results to simula_worker_owner;
grant select, insert, update on table private.run_attempts to simula_worker_owner;
grant insert on table private.run_events, private.audit_events to simula_worker_owner;
grant select, update on table private.run_outbox to simula_worker_owner;

create policy organizations_worker_owner_select
on api.organizations
for select
to simula_worker_owner
using (true);

create policy simulation_runs_worker_owner_select
on api.simulation_runs
for select
to simula_worker_owner
using (true);

create policy simulation_runs_worker_owner_update
on api.simulation_runs
for update
to simula_worker_owner
using (true)
with check (true);

create policy simulation_results_worker_owner_select
on api.simulation_results
for select
to simula_worker_owner
using (true);

create policy simulation_results_worker_owner_insert
on api.simulation_results
for insert
to simula_worker_owner
with check (true);

create policy run_attempts_worker_owner_select
on private.run_attempts
for select
to simula_worker_owner
using (true);

create policy run_attempts_worker_owner_insert
on private.run_attempts
for insert
to simula_worker_owner
with check (true);

create policy run_attempts_worker_owner_update
on private.run_attempts
for update
to simula_worker_owner
using (true)
with check (true);

create policy run_events_worker_owner_insert
on private.run_events
for insert
to simula_worker_owner
with check (true);

create policy run_outbox_worker_owner_select
on private.run_outbox
for select
to simula_worker_owner
using (true);

create policy run_outbox_worker_owner_update
on private.run_outbox
for update
to simula_worker_owner
using (true)
with check (true);

create policy audit_events_worker_owner_insert
on private.audit_events
for insert
to simula_worker_owner
with check (true);

grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create function private.claim_due_run_outbox(requested_batch_size integer)
returns table (
  outbox_id uuid,
  run_id uuid,
  generation smallint,
  job_id text,
  claim_token uuid,
  claim_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_batch_size is null or requested_batch_size not between 1 and 20 then
    raise exception using errcode = '22023', message = 'invalid_dispatch_batch_size';
  end if;

  return query
  with due as (
    select outbox.id
    from private.run_outbox as outbox
    where (
      (outbox.status = 'pending' and outbox.next_attempt_at <= pg_catalog.statement_timestamp())
      or (
        outbox.status = 'claimed'
        and outbox.claim_expires_at <= pg_catalog.statement_timestamp()
      )
    )
      and outbox.dispatch_attempt_count < 10
    order by outbox.next_attempt_at, outbox.created_at, outbox.id
    for update skip locked
    limit requested_batch_size
  ), claimed as (
    update private.run_outbox as outbox
    set status = 'claimed',
        claim_token = pg_catalog.gen_random_uuid(),
        claim_expires_at = pg_catalog.statement_timestamp() + interval '15 seconds',
        dispatch_attempt_count = outbox.dispatch_attempt_count + 1,
        updated_at = pg_catalog.statement_timestamp()
    from due
    where outbox.id = due.id
    returning
      outbox.id,
      outbox.run_id,
      outbox.generation,
      outbox.job_id,
      outbox.claim_token,
      outbox.claim_expires_at
  )
  select * from claimed;
end
$function$;

create function private.confirm_run_dispatch(
  requested_outbox_id uuid,
  requested_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  changed boolean;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_outbox_id is null or requested_claim_token is null then
    raise exception using errcode = '22023', message = 'invalid_dispatch_claim';
  end if;

  update private.run_outbox as outbox
  set status = 'dispatched',
      claim_token = null,
      claim_expires_at = null,
      confirmed_at = pg_catalog.statement_timestamp(),
      updated_at = pg_catalog.statement_timestamp()
  where outbox.id = requested_outbox_id
    and outbox.status = 'claimed'
    and outbox.claim_token = requested_claim_token
    and outbox.claim_expires_at > pg_catalog.statement_timestamp()
  returning true into changed;

  return coalesce(changed, false);
end
$function$;

create function private.fail_run_dispatch(
  requested_outbox_id uuid,
  requested_claim_token uuid,
  requested_safe_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  selected_run_id uuid;
  selected_run api.simulation_runs%rowtype;
  selected_outbox private.run_outbox%rowtype;
  terminal_reason text;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_outbox_id is null
    or requested_claim_token is null
    or requested_safe_error_code is null
    or requested_safe_error_code !~ '^[a-z][a-z0-9_]{0,63}$' then
    raise exception using errcode = '22023', message = 'invalid_dispatch_failure';
  end if;

  select outbox.run_id into selected_run_id
  from private.run_outbox as outbox
  where outbox.id = requested_outbox_id;
  if not found then
    return false;
  end if;

  -- Shared helpers that touch both rows lock run before outbox.
  select * into selected_run
  from api.simulation_runs as runs
  where runs.id = selected_run_id
  for update;
  if not found then
    return false;
  end if;
  select * into selected_outbox
  from private.run_outbox as outbox
  where outbox.id = requested_outbox_id
  for update;
  if not found
    or selected_outbox.status <> 'claimed'
    or selected_outbox.claim_token <> requested_claim_token then
    return false;
  end if;

  if selected_outbox.dispatch_attempt_count >= 10 then
    terminal_reason := 'dispatch_exhausted';
    update private.run_outbox
    set status = 'terminal',
        claim_token = null,
        claim_expires_at = null,
        terminal_error_code = terminal_reason,
        updated_at = pg_catalog.statement_timestamp()
    where id = selected_outbox.id;

    if selected_run.state in ('queued', 'retrying')
      and (
        selected_run.worker_lease_expires_at is null
        or selected_run.worker_lease_expires_at <= pg_catalog.statement_timestamp()
      ) then
      update api.simulation_runs
      set state = 'failed',
          worker_lease_token = null,
          worker_lease_expires_at = null,
          terminal_at = pg_catalog.statement_timestamp(),
          updated_at = pg_catalog.statement_timestamp(),
          version = version + 1
      where id = selected_run.id;
      insert into private.run_events (
        organization_id, run_id, previous_state, new_state, safe_reason,
        actor_type, correlation_id
      ) values (
        selected_run.organization_id, selected_run.id, selected_run.state, 'failed',
        terminal_reason, 'worker', selected_run.correlation_id
      );
    end if;
  else
    update private.run_outbox
    set status = 'pending',
        claim_token = null,
        claim_expires_at = null,
        next_attempt_at = pg_catalog.statement_timestamp() + interval '5 seconds',
        updated_at = pg_catalog.statement_timestamp()
    where id = selected_outbox.id;
  end if;

  insert into private.audit_events (
    organization_id, actor_type, action, object_type, object_id,
    correlation_id, outcome, source_service, metadata
  ) values (
    selected_run.organization_id, 'worker', 'run.dispatch_failed', 'run_outbox',
    selected_outbox.id, selected_run.correlation_id, 'success', 'worker',
    pg_catalog.jsonb_build_object('safe_error_code', requested_safe_error_code)
  );
  return true;
end
$function$;

create function private.claim_run_execution(
  requested_run_id uuid,
  requested_generation smallint,
  requested_job_id text
)
returns table (
  claim_status text,
  attempt_id uuid,
  lease_token uuid,
  lease_expires_at timestamptz,
  frozen_manifest jsonb,
  frozen_manifest_sha256 text,
  deterministic_seed bigint
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  located_organization_id uuid;
  selected_run api.simulation_runs%rowtype;
  selected_outbox private.run_outbox%rowtype;
  created_attempt private.run_attempts%rowtype;
  active_count integer;
  previous_state api.run_state;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_run_id is null
    or requested_generation not between 1 and 3
    or requested_job_id <> (
      'run:' || requested_run_id::text || ':dispatch:' || requested_generation::text
    ) then
    return query select 'no_work', null::uuid, null::uuid, null::timestamptz,
      null::jsonb, null::text, null::bigint;
    return;
  end if;

  select runs.organization_id into located_organization_id
  from api.simulation_runs as runs
  where runs.id = requested_run_id;
  if not found then
    return query select 'no_work', null::uuid, null::uuid, null::timestamptz,
      null::jsonb, null::text, null::bigint;
    return;
  end if;
  perform 1 from api.organizations
    where id = located_organization_id
    for update;
  select * into selected_run
  from api.simulation_runs as runs
  where runs.id = requested_run_id
  for update;
  select * into selected_outbox
  from private.run_outbox as outbox
  where outbox.run_id = requested_run_id
    and outbox.generation = requested_generation
  for update;
  if not found
    or selected_run.dispatch_generation <> requested_generation
    or selected_outbox.job_id <> requested_job_id then
    return query select 'no_work', null::uuid, null::uuid, null::timestamptz,
      null::jsonb, null::text, null::bigint;
    return;
  end if;
  if selected_outbox.status <> 'dispatched' or selected_outbox.confirmed_at is null then
    return query select 'awaiting_confirmation', null::uuid, null::uuid,
      null::timestamptz, null::jsonb, null::text, null::bigint;
    return;
  end if;
  if selected_run.state not in ('queued', 'retrying') then
    return query select 'no_work', null::uuid, null::uuid, null::timestamptz,
      null::jsonb, null::text, null::bigint;
    return;
  end if;
  if selected_run.worker_lease_expires_at > pg_catalog.statement_timestamp() then
    return query select 'busy', null::uuid, null::uuid, null::timestamptz,
      null::jsonb, null::text, null::bigint;
    return;
  end if;
  if selected_run.attempt_count >= 3 then
    return query select 'no_work', null::uuid, null::uuid, null::timestamptz,
      null::jsonb, null::text, null::bigint;
    return;
  end if;
  select pg_catalog.count(*) into active_count
  from api.simulation_runs as runs
  where runs.organization_id = located_organization_id
    and (
      runs.state = 'running'
      or (
        runs.state = 'cancel_requested'
        and runs.worker_lease_expires_at > pg_catalog.statement_timestamp()
      )
    );
  if active_count >= 3 then
    return query select 'organization_capacity', null::uuid, null::uuid,
      null::timestamptz, null::jsonb, null::text, null::bigint;
    return;
  end if;

  previous_state := selected_run.state;

  update api.simulation_runs
  set state = 'running',
      attempt_count = attempt_count + 1,
      worker_lease_token = pg_catalog.gen_random_uuid(),
      worker_lease_expires_at = pg_catalog.statement_timestamp() + interval '30 seconds',
      last_progress_at = pg_catalog.statement_timestamp(),
      updated_at = pg_catalog.statement_timestamp(),
      version = version + 1
  where id = selected_run.id
  returning * into selected_run;

  insert into private.run_attempts (
    organization_id, run_id, attempt_number, status, lease_token, lease_expires_at
  ) values (
    selected_run.organization_id, selected_run.id, selected_run.attempt_count,
    'running', selected_run.worker_lease_token, selected_run.worker_lease_expires_at
  ) returning * into created_attempt;
  insert into private.run_events (
    organization_id, run_id, previous_state, new_state, attempt_number,
    safe_reason, actor_type, correlation_id
  ) values (
    selected_run.organization_id, selected_run.id, previous_state, 'running',
    selected_run.attempt_count, 'claimed', 'worker', selected_run.correlation_id
  );
  insert into private.audit_events (
    organization_id, actor_type, action, object_type, object_id,
    correlation_id, outcome, source_service, metadata
  ) values (
    selected_run.organization_id, 'worker', 'run.claimed', 'simulation_run',
    selected_run.id, selected_run.correlation_id, 'success', 'worker',
    pg_catalog.jsonb_build_object('attempt_number', selected_run.attempt_count)
  );

  return query
  select 'claimed', created_attempt.id, selected_run.worker_lease_token,
    selected_run.worker_lease_expires_at, selected_run.frozen_manifest,
    selected_run.frozen_manifest_sha256, selected_run.deterministic_seed;
end
$function$;

create function private.heartbeat_run_execution(
  requested_run_id uuid,
  requested_attempt_id uuid,
  requested_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  selected_run api.simulation_runs%rowtype;
  selected_attempt private.run_attempts%rowtype;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  select * into selected_run from api.simulation_runs
  where id = requested_run_id for update;
  if not found or selected_run.state <> 'running'
    or selected_run.worker_lease_token <> requested_lease_token then
    return false;
  end if;
  select * into selected_attempt from private.run_attempts
  where id = requested_attempt_id and run_id = requested_run_id for update;
  if not found or selected_attempt.status <> 'running'
    or selected_attempt.lease_token <> requested_lease_token then
    return false;
  end if;
  update api.simulation_runs
  set worker_lease_expires_at = pg_catalog.statement_timestamp() + interval '30 seconds',
      last_progress_at = pg_catalog.statement_timestamp(),
      updated_at = pg_catalog.statement_timestamp(),
      version = version + 1
  where id = requested_run_id;
  update private.run_attempts
  set lease_expires_at = pg_catalog.statement_timestamp() + interval '30 seconds'
  where id = requested_attempt_id;
  return true;
end
$function$;

create function private.complete_run_execution(
  requested_run_id uuid,
  requested_attempt_id uuid,
  requested_lease_token uuid,
  requested_artifact jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  selected_run api.simulation_runs%rowtype;
  selected_attempt private.run_attempts%rowtype;
  artifact_sha256 text;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_artifact is null
    or pg_catalog.jsonb_typeof(requested_artifact) <> 'object'
    or pg_catalog.octet_length(requested_artifact::text) > 131072
    or requested_artifact ->> 'schema_version' <> '1.0.0'
    or requested_artifact ->> 'run_id' <> requested_run_id::text then
    raise exception using errcode = '22023', message = 'invalid_result_contract';
  end if;
  select * into selected_run from api.simulation_runs
  where id = requested_run_id for update;
  if not found or selected_run.state <> 'running'
    or selected_run.worker_lease_token <> requested_lease_token
    or selected_run.worker_lease_expires_at <= pg_catalog.statement_timestamp() then
    return false;
  end if;
  select * into selected_attempt from private.run_attempts
  where id = requested_attempt_id and run_id = requested_run_id for update;
  if not found or selected_attempt.status <> 'running'
    or selected_attempt.lease_token <> requested_lease_token then
    return false;
  end if;
  perform 1 from api.simulation_results where run_id = requested_run_id for update;
  if found then
    return false;
  end if;
  artifact_sha256 := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(requested_artifact::text, 'UTF8'), 'sha256'),
    'hex'
  );
  insert into api.simulation_results (
    organization_id, run_id, schema_version, artifact, artifact_sha256
  ) values (
    selected_run.organization_id, selected_run.id, 1, requested_artifact, artifact_sha256
  );
  update private.run_attempts
  set status = 'succeeded', finished_at = pg_catalog.statement_timestamp()
  where id = selected_attempt.id;
  update api.simulation_runs
  set state = 'succeeded', worker_lease_token = null, worker_lease_expires_at = null,
      terminal_at = pg_catalog.statement_timestamp(),
      updated_at = pg_catalog.statement_timestamp(), version = version + 1
  where id = selected_run.id;
  insert into private.run_events (
    organization_id, run_id, previous_state, new_state, attempt_number,
    safe_reason, actor_type, correlation_id
  ) values (
    selected_run.organization_id, selected_run.id, 'running', 'succeeded',
    selected_attempt.attempt_number, 'completed', 'worker', selected_run.correlation_id
  );
  insert into private.audit_events (
    organization_id, actor_type, action, object_type, object_id,
    correlation_id, outcome, source_service, metadata
  ) values (
    selected_run.organization_id, 'worker', 'run.completed', 'simulation_run',
    selected_run.id, selected_run.correlation_id, 'success', 'worker',
    pg_catalog.jsonb_build_object('artifact_sha256', artifact_sha256)
  );
  return true;
end
$function$;

create function private.fail_run_execution(
  requested_run_id uuid,
  requested_attempt_id uuid,
  requested_lease_token uuid,
  requested_safe_error_code text,
  requested_retryable boolean
)
returns text
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  selected_run api.simulation_runs%rowtype;
  selected_attempt private.run_attempts%rowtype;
  next_state api.run_state;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_safe_error_code is null
    or requested_safe_error_code !~ '^[a-z][a-z0-9_]{0,63}$'
    or requested_retryable is null then
    raise exception using errcode = '22023', message = 'invalid_run_failure';
  end if;
  select * into selected_run from api.simulation_runs
  where id = requested_run_id for update;
  if not found then
    return 'no_work';
  end if;
  select * into selected_attempt from private.run_attempts
  where id = requested_attempt_id and run_id = requested_run_id for update;
  if not found or selected_attempt.status <> 'running'
    or selected_attempt.lease_token <> requested_lease_token
    or selected_run.worker_lease_token <> requested_lease_token then
    return 'no_work';
  end if;
  if selected_run.state = 'cancel_requested' then
    next_state := 'canceled';
  elsif selected_run.state = 'running'
    and requested_retryable
    and selected_run.attempt_count < 3 then
    next_state := 'retrying';
  elsif selected_run.state in ('running', 'retrying') then
    next_state := 'failed';
  else
    return 'no_work';
  end if;
  update private.run_attempts
  set status = case
        when next_state = 'retrying' then 'retrying'
        when next_state = 'canceled' then 'canceled'
        else 'failed'
      end,
      finished_at = pg_catalog.statement_timestamp(),
      safe_error_code = requested_safe_error_code
  where id = selected_attempt.id;
  update api.simulation_runs
  set state = next_state,
      worker_lease_token = null,
      worker_lease_expires_at = null,
      terminal_at = case when next_state in ('canceled', 'failed')
        then pg_catalog.statement_timestamp() else null end,
      updated_at = pg_catalog.statement_timestamp(),
      version = version + 1
  where id = selected_run.id;
  insert into private.run_events (
    organization_id, run_id, previous_state, new_state, attempt_number,
    safe_reason, actor_type, correlation_id
  ) values (
    selected_run.organization_id, selected_run.id, selected_run.state, next_state,
    selected_attempt.attempt_number, requested_safe_error_code, 'worker',
    selected_run.correlation_id
  );
  insert into private.audit_events (
    organization_id, actor_type, action, object_type, object_id,
    correlation_id, outcome, source_service, metadata
  ) values (
    selected_run.organization_id, 'worker', 'run.failed', 'simulation_run',
    selected_run.id, selected_run.correlation_id, 'success', 'worker',
    pg_catalog.jsonb_build_object(
      'safe_error_code', requested_safe_error_code,
      'next_state', next_state
    )
  );
  return next_state::text;
end
$function$;

alter function private.claim_due_run_outbox(integer) owner to simula_worker_owner;
alter function private.confirm_run_dispatch(uuid, uuid) owner to simula_worker_owner;
alter function private.fail_run_dispatch(uuid, uuid, text) owner to simula_worker_owner;
alter function private.claim_run_execution(uuid, smallint, text) owner to simula_worker_owner;
alter function private.heartbeat_run_execution(uuid, uuid, uuid) owner to simula_worker_owner;
alter function private.complete_run_execution(uuid, uuid, uuid, jsonb) owner to simula_worker_owner;
alter function private.fail_run_execution(uuid, uuid, uuid, text, boolean)
  owner to simula_worker_owner;

revoke create on schema private from simula_worker_owner;

revoke all on function private.claim_due_run_outbox(integer)
  from public, anon, authenticated, simula_api, simula_command_owner;
revoke all on function private.confirm_run_dispatch(uuid, uuid)
  from public, anon, authenticated, simula_api, simula_command_owner;
revoke all on function private.fail_run_dispatch(uuid, uuid, text)
  from public, anon, authenticated, simula_api, simula_command_owner;
revoke all on function private.claim_run_execution(uuid, smallint, text)
  from public, anon, authenticated, simula_api, simula_command_owner;
revoke all on function private.heartbeat_run_execution(uuid, uuid, uuid)
  from public, anon, authenticated, simula_api, simula_command_owner;
revoke all on function private.complete_run_execution(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, simula_api, simula_command_owner;
revoke all on function private.fail_run_execution(uuid, uuid, uuid, text, boolean)
  from public, anon, authenticated, simula_api, simula_command_owner;

grant execute on function private.claim_due_run_outbox(integer) to simula_worker;
grant execute on function private.confirm_run_dispatch(uuid, uuid) to simula_worker;
grant execute on function private.fail_run_dispatch(uuid, uuid, text) to simula_worker;
grant execute on function private.claim_run_execution(uuid, smallint, text) to simula_worker;
grant execute on function private.heartbeat_run_execution(uuid, uuid, uuid) to simula_worker;
grant execute on function private.complete_run_execution(uuid, uuid, uuid, jsonb)
  to simula_worker;
grant execute on function private.fail_run_execution(uuid, uuid, uuid, text, boolean)
  to simula_worker;

reset role;

revoke all on all sequences in schema api, private
  from public, anon, authenticated, simula_api, simula_worker;

create function api.create_simulation_run(
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
language sql
security invoker
set search_path = ''
as $function$
  select *
  from private.create_simulation_run_atomic(
    requested_project_id,
    requested_stimulus_version_id,
    requested_idempotency_key,
    requested_sha256,
    requested_correlation_id
  )
$function$;

revoke all on function api.create_simulation_run(uuid, uuid, text, text, uuid)
  from public, anon, authenticated, simula_worker;
grant execute on function api.create_simulation_run(uuid, uuid, text, text, uuid)
  to simula_api;

set role simula_command_owner;
revoke all on function private.create_simulation_run_atomic(uuid, uuid, text, text, uuid)
  from public, anon, authenticated, simula_worker;
grant execute on function private.create_simulation_run_atomic(uuid, uuid, text, text, uuid)
  to simula_api;
reset role;
