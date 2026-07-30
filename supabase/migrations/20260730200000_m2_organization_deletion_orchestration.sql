-- M2 owner-triggered organization deletion orchestration.
--
-- The request row survives organization deletion. It is the durable resume
-- point between PostgreSQL, private object storage, BullMQ, and Redis cleanup.

set role postgres;

create table private.organization_deletion_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null unique,
  actor_user_id uuid not null,
  request_sha256 text not null,
  idempotency_key_sha256 text not null,
  correlation_id uuid not null,
  status text not null default 'pending',
  resource_manifest jsonb not null,
  requested_at timestamptz not null default pg_catalog.statement_timestamp(),
  completed_at timestamptz,
  constraint organization_deletion_requests_request_sha256_valid
    check (request_sha256 ~ '^[0-9a-f]{64}$'),
  constraint organization_deletion_requests_idempotency_sha256_valid
    check (idempotency_key_sha256 ~ '^[0-9a-f]{64}$'),
  constraint organization_deletion_requests_status_valid
    check (status in ('pending', 'completed')),
  constraint organization_deletion_requests_manifest_valid check (
    pg_catalog.jsonb_typeof(resource_manifest) = 'object'
    and resource_manifest ?& array['run_ids', 'storage_objects']
    and resource_manifest - array['run_ids', 'storage_objects'] = '{}'::jsonb
    and pg_catalog.jsonb_typeof(resource_manifest -> 'run_ids') = 'array'
    and pg_catalog.jsonb_typeof(resource_manifest -> 'storage_objects') = 'array'
  ),
  constraint organization_deletion_requests_completion_valid check (
    (
      status = 'pending'
      and completed_at is null
    )
    or (
      status = 'completed'
      and completed_at is not null
      and resource_manifest = pg_catalog.jsonb_build_object(
        'run_ids', '[]'::jsonb,
        'storage_objects', '[]'::jsonb
      )
    )
  )
);

alter table private.organization_deletion_requests enable row level security;
alter table private.organization_deletion_requests force row level security;

grant select, insert, update
on table private.organization_deletion_requests
to simula_command_owner;

create policy organization_deletion_requests_command_select
on private.organization_deletion_requests
for select
to simula_command_owner
using (private.is_verified_api_subject(actor_user_id));

create policy organization_deletion_requests_command_insert
on private.organization_deletion_requests
for insert
to simula_command_owner
with check (private.is_verified_api_subject(actor_user_id));

create policy organization_deletion_requests_command_update
on private.organization_deletion_requests
for update
to simula_command_owner
using (private.is_verified_api_subject(actor_user_id))
with check (private.is_verified_api_subject(actor_user_id));

grant update, delete on table api.organizations to simula_command_owner;

create policy organizations_command_update_for_deletion
on api.organizations
for update
to simula_command_owner
using (
  (
    status = 'active'
    and exists (
      select 1
      from api.organization_memberships as memberships
      where memberships.organization_id = organizations.id
        and private.is_verified_api_subject(memberships.user_id)
        and memberships.role = 'owner'
    )
  )
  or exists (
      select 1
      from private.organization_deletion_requests as requests
      where requests.organization_id = organizations.id
        and requests.status = 'pending'
        and private.is_verified_api_subject(requests.actor_user_id)
  )
)
with check (
  status = 'disabled'
  and exists (
    select 1
    from private.organization_deletion_requests as requests
    where requests.organization_id = organizations.id
      and requests.status = 'pending'
      and private.is_verified_api_subject(requests.actor_user_id)
  )
);

create policy organizations_command_delete_after_cleanup
on api.organizations
for delete
to simula_command_owner
using (
  status = 'disabled'
  and exists (
    select 1
    from private.organization_deletion_requests as requests
    where requests.organization_id = organizations.id
      and requests.status = 'pending'
      and private.is_verified_api_subject(requests.actor_user_id)
  )
);

alter policy audit_events_command_phase4_insert
on private.audit_events
with check (
  actor_type = 'user'
  and private.is_verified_api_subject(actor_user_id)
  and source_service = 'api'
  and outcome = 'success'
  and action in (
    'audience.created',
    'simulation_configuration.created',
    'variant_group.created',
    'report.created',
    'export.created',
    'feedback.created',
    'invitation.created',
    'feature_flag.updated',
    'stimulus_asset.reserved',
    'stimulus_asset.available',
    'stimulus_asset.deletion_requested',
    'stimulus_asset.deleted',
    'organization.deletion_requested'
  )
  and private.is_org_member(organization_id, private.verified_subject())
);

grant create on schema api, private to simula_command_owner;
set role simula_command_owner;

create or replace function private.has_org_role(
  requested_organization_id uuid,
  requested_user_id uuid,
  allowed_roles api.organization_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $function$
  select private.is_verified_api_subject(requested_user_id)
    and allowed_roles is not null
    and exists (
      select 1
      from api.organizations as organizations
      where organizations.id = requested_organization_id
        and organizations.status = 'active'
    )
    and (
      private.is_platform_superadmin(requested_user_id)
      or exists (
        select 1
        from api.organization_memberships as memberships
        where memberships.organization_id = requested_organization_id
          and memberships.user_id = requested_user_id
          and memberships.role = any(allowed_roles)
      )
    )
$function$;

create function private.request_organization_deletion_atomic(
  requested_organization_id uuid,
  requested_confirmation text,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  subject uuid;
  selected_organization api.organizations%rowtype;
  selected_request private.organization_deletion_requests%rowtype;
  storage_objects jsonb;
  run_ids jsonb;
  manifest jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_organization_id is null
    or requested_confirmation is null
    or requested_idempotency_key is null
    or pg_catalog.char_length(requested_idempotency_key) not between 16 and 128
    or requested_sha256 is null
    or requested_sha256 !~ '^[0-9a-f]{64}$'
    or requested_correlation_id is null then
    raise exception using
      errcode = '22023',
      message = 'invalid_organization_deletion';
  end if;

  select * into selected_request
  from private.organization_deletion_requests
  where organization_id = requested_organization_id
  for update;
  if found then
    if selected_request.actor_user_id <> subject then
      raise exception using errcode = 'P0002', message = 'not_found';
    end if;
    if selected_request.request_sha256 <> requested_sha256 then
      raise exception using
        errcode = '22023',
        message = 'organization_deletion_confirmation_mismatch';
    end if;
    return pg_catalog.jsonb_build_object(
      'request_id', selected_request.id,
      'organization_id', selected_request.organization_id,
      'status', selected_request.status,
      'resource_manifest', selected_request.resource_manifest,
      'requested_at', selected_request.requested_at,
      'completed_at', selected_request.completed_at,
      'replayed', true
    );
  end if;

  select * into selected_organization
  from api.organizations
  where id = requested_organization_id
  for update;
  if not found or selected_organization.status <> 'active' then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if not exists (
    select 1
    from api.organization_memberships as memberships
    where memberships.organization_id = selected_organization.id
      and memberships.user_id = subject
      and memberships.role = 'owner'
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if requested_confirmation <> selected_organization.name then
    raise exception using
      errcode = '22023',
      message = 'organization_deletion_confirmation_mismatch';
  end if;
  if exists (
    select 1
    from api.simulation_runs as runs
    where runs.organization_id = selected_organization.id
      and runs.state in (
        'queued',
        'running',
        'retrying',
        'cancel_requested'
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'organization_deletion_active_runs';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(assets.storage_object_name order by assets.id),
    '[]'::jsonb
  ) into storage_objects
  from api.stimulus_assets as assets
  where assets.organization_id = selected_organization.id
    and assets.status <> 'deleted';

  select coalesce(
    pg_catalog.jsonb_agg(runs.id order by runs.id),
    '[]'::jsonb
  ) into run_ids
  from api.simulation_runs as runs
  where runs.organization_id = selected_organization.id;

  manifest := pg_catalog.jsonb_build_object(
    'run_ids', run_ids,
    'storage_objects', storage_objects
  );

  insert into private.organization_deletion_requests (
    organization_id,
    actor_user_id,
    request_sha256,
    idempotency_key_sha256,
    correlation_id,
    resource_manifest
  ) values (
    selected_organization.id,
    subject,
    requested_sha256,
    pg_catalog.encode(
      extensions.digest(requested_idempotency_key, 'sha256'),
      'hex'
    ),
    requested_correlation_id,
    manifest
  )
  returning * into selected_request;

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
  ) values (
    selected_organization.id,
    'user',
    subject,
    'organization.deletion_requested',
    'organization',
    selected_organization.id,
    requested_correlation_id,
    'success',
    'api',
    pg_catalog.jsonb_build_object(
      'run_count', pg_catalog.jsonb_array_length(run_ids),
      'storage_object_count', pg_catalog.jsonb_array_length(storage_objects)
    )
  );

  update api.organizations
  set status = 'disabled',
      updated_at = pg_catalog.statement_timestamp()
  where id = selected_organization.id;

  return pg_catalog.jsonb_build_object(
    'request_id', selected_request.id,
    'organization_id', selected_request.organization_id,
    'status', selected_request.status,
    'resource_manifest', selected_request.resource_manifest,
    'requested_at', selected_request.requested_at,
    'completed_at', selected_request.completed_at,
    'replayed', false
  );
end
$function$;

create function api.request_organization_deletion(
  requested_organization_id uuid,
  requested_confirmation text,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.request_organization_deletion_atomic(
    requested_organization_id,
    requested_confirmation,
    requested_idempotency_key,
    requested_sha256,
    requested_correlation_id
  )
$function$;

create function private.confirm_organization_deletion_atomic(
  requested_request_id uuid,
  requested_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  subject uuid;
  selected_request private.organization_deletion_requests%rowtype;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  select * into selected_request
  from private.organization_deletion_requests
  where id = requested_request_id
    and organization_id = requested_organization_id
  for update;
  if not found
    or selected_request.actor_user_id <> subject then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if selected_request.status = 'completed' then
    return pg_catalog.jsonb_build_object(
      'request_id', selected_request.id,
      'organization_id', selected_request.organization_id,
      'status', selected_request.status,
      'resource_manifest', selected_request.resource_manifest,
      'requested_at', selected_request.requested_at,
      'completed_at', selected_request.completed_at,
      'replayed', true
    );
  end if;
  if exists (
    select 1
    from api.simulation_runs as runs
    where runs.organization_id = selected_request.organization_id
      and runs.state in (
        'queued',
        'running',
        'retrying',
        'cancel_requested'
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'organization_deletion_active_runs';
  end if;

  delete from api.organizations
  where id = selected_request.organization_id
    and status = 'disabled';
  if not found then
    raise exception using
      errcode = '55000',
      message = 'organization_deletion_unavailable';
  end if;

  update private.organization_deletion_requests
  set status = 'completed',
      resource_manifest = pg_catalog.jsonb_build_object(
        'run_ids', '[]'::jsonb,
        'storage_objects', '[]'::jsonb
      ),
      completed_at = pg_catalog.statement_timestamp()
  where id = selected_request.id
  returning * into selected_request;

  return pg_catalog.jsonb_build_object(
    'request_id', selected_request.id,
    'organization_id', selected_request.organization_id,
    'status', selected_request.status,
    'resource_manifest', selected_request.resource_manifest,
    'requested_at', selected_request.requested_at,
    'completed_at', selected_request.completed_at,
    'replayed', false
  );
end
$function$;

create function api.confirm_organization_deletion(
  requested_request_id uuid,
  requested_organization_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.confirm_organization_deletion_atomic(
    requested_request_id,
    requested_organization_id
  )
$function$;

set role postgres;
revoke create on schema api, private from simula_command_owner;

set role simula_command_owner;
revoke all on function private.request_organization_deletion_atomic(
  uuid, text, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function api.request_organization_deletion(
  uuid, text, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
grant execute on function private.request_organization_deletion_atomic(
  uuid, text, text, text, uuid
) to simula_api;
grant execute on function api.request_organization_deletion(
  uuid, text, text, text, uuid
) to simula_api;

revoke all on function private.confirm_organization_deletion_atomic(uuid, uuid)
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function api.confirm_organization_deletion(uuid, uuid)
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
grant execute on function private.confirm_organization_deletion_atomic(uuid, uuid)
to simula_api;
grant execute on function api.confirm_organization_deletion(uuid, uuid)
to simula_api;

set role postgres;
revoke all on table private.organization_deletion_requests
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner;

revoke all on all sequences in schema api, private
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner;

-- Supabase records migration history in the same session after this script.
set role postgres;
