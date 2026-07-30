-- M6 private stimulus-asset reservation and storage state transitions.
-- Object bytes remain in the private bucket and are reachable only through
-- the authenticated API storage port.

set role postgres;

grant select, update
on table api.stimulus_assets
to postgres;

alter table api.stimulus_assets
  add column expected_byte_size integer,
  add column expected_content_sha256 text;

update api.stimulus_assets
set expected_byte_size = byte_size,
    expected_content_sha256 = content_sha256
where byte_size is not null
  and content_sha256 is not null;

do $migration$
begin
  if exists (
    select 1
    from api.stimulus_assets
    where expected_byte_size is null
      or expected_content_sha256 is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'legacy_pending_stimulus_assets_require_remediation';
  end if;
end
$migration$;

alter table api.stimulus_assets
  alter column expected_byte_size set not null,
  alter column expected_content_sha256 set not null;

alter table api.stimulus_assets
  drop constraint stimulus_assets_content_valid,
  add constraint stimulus_assets_expected_content_valid check (
    expected_byte_size between 1 and 16777216
    and expected_content_sha256 ~ '^[0-9a-f]{64}$'
  ),
  add constraint stimulus_assets_content_valid check (
    (
      status = 'pending_upload'
      and byte_size is null
      and content_sha256 is null
    )
    or (
      status = 'available'
      and byte_size between 1 and 16777216
      and content_sha256 ~ '^[0-9a-f]{64}$'
    )
    or (
      status in ('deletion_requested', 'deleted')
      and (
        (
          byte_size is null
          and content_sha256 is null
        )
        or (
          byte_size between 1 and 16777216
          and content_sha256 ~ '^[0-9a-f]{64}$'
        )
      )
    )
  ),
  add constraint stimulus_assets_available_matches_expected check (
    status <> 'available'
    or (
      byte_size = expected_byte_size
      and content_sha256 = expected_content_sha256
    )
  );

alter table private.phase4_command_receipts
  drop constraint phase4_command_receipts_scope_valid,
  add constraint phase4_command_receipts_scope_valid check (
    scope in (
      'audience.create',
      'simulation_configuration.create',
      'variant_group.create',
      'report.create',
      'export.create',
      'feedback.create',
      'invitation.create',
      'feature_flag.set',
      'stimulus_asset.reserve',
      'stimulus_asset.delete'
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
    'stimulus_asset.deleted'
  )
  and private.is_org_member(organization_id, private.verified_subject())
);

grant create on schema api, private to simula_command_owner;
set role simula_command_owner;

create function private.create_stimulus_asset_atomic(
  requested_stimulus_id uuid,
  requested_filename text,
  requested_media_type text,
  requested_expected_byte_size integer,
  requested_expected_content_sha256 text,
  requested_retention_until timestamptz,
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
  selected_stimulus api.stimuli%rowtype;
  command_record record;
  created_asset api.stimulus_assets%rowtype;
  created_asset_id uuid;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  select * into selected_stimulus
  from api.stimuli
  where id = requested_stimulus_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if not private.has_org_role(
    selected_stimulus.organization_id,
    subject,
    array['owner', 'editor']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if requested_filename is null
    or requested_filename !~ '^[A-Za-z0-9][A-Za-z0-9_. -]{0,119}$'
    or requested_filename ~ '\.\.'
    or requested_media_type is null
    or requested_media_type not in (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4'
    )
    or requested_expected_byte_size is null
    or requested_expected_byte_size not between 1 and 16777216
    or requested_expected_content_sha256 is null
    or requested_expected_content_sha256 !~ '^[0-9a-f]{64}$'
    or requested_retention_until is null
    or requested_retention_until
      <= pg_catalog.statement_timestamp() + interval '5 minutes'
    or requested_retention_until
      > pg_catalog.statement_timestamp() + interval '90 days'
    or requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_stimulus_asset';
  end if;
  select * into command_record
  from private.begin_phase4_command(
    'stimulus_asset.reserve',
    selected_stimulus.organization_id,
    requested_idempotency_key,
    requested_sha256
  );
  if command_record.replayed then
    return command_record.existing_response;
  end if;
  created_asset_id := pg_catalog.gen_random_uuid();
  insert into api.stimulus_assets (
    id,
    organization_id,
    stimulus_id,
    storage_object_name,
    filename,
    media_type,
    expected_byte_size,
    expected_content_sha256,
    retention_until,
    created_by
  ) values (
    created_asset_id,
    selected_stimulus.organization_id,
    selected_stimulus.id,
    selected_stimulus.organization_id::text
      || '/' || selected_stimulus.id::text
      || '/' || created_asset_id::text
      || '/' || requested_expected_content_sha256,
    requested_filename,
    requested_media_type,
    requested_expected_byte_size,
    requested_expected_content_sha256,
    requested_retention_until,
    subject
  )
  returning * into created_asset;
  response_payload := pg_catalog.jsonb_build_object(
    'asset_id', created_asset.id,
    'organization_id', created_asset.organization_id,
    'stimulus_id', created_asset.stimulus_id,
    'storage_bucket_id', created_asset.storage_bucket_id,
    'storage_object_name', created_asset.storage_object_name,
    'filename', created_asset.filename,
    'media_type', created_asset.media_type,
    'expected_byte_size', created_asset.expected_byte_size,
    'expected_content_sha256', created_asset.expected_content_sha256,
    'byte_size', created_asset.byte_size,
    'content_sha256', created_asset.content_sha256,
    'status', created_asset.status,
    'retention_until', created_asset.retention_until,
    'created_at', created_asset.created_at,
    'replayed', false
  );
  perform private.finish_phase4_command(
    command_record.receipt_id,
    created_asset.id,
    response_payload
  );
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
    created_asset.organization_id,
    'user',
    subject,
    'stimulus_asset.reserved',
    'stimulus_asset',
    created_asset.id,
    requested_correlation_id,
    'success',
    'api',
    pg_catalog.jsonb_build_object(
      'stimulus_id', created_asset.stimulus_id,
      'media_type', created_asset.media_type,
      'byte_size', created_asset.expected_byte_size,
      'content_sha256', created_asset.expected_content_sha256,
      'retention_until', created_asset.retention_until
    )
  );
  return response_payload;
end
$function$;

create function api.create_stimulus_asset(
  requested_stimulus_id uuid,
  requested_filename text,
  requested_media_type text,
  requested_expected_byte_size integer,
  requested_expected_content_sha256 text,
  requested_retention_until timestamptz,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.create_stimulus_asset_atomic(
    requested_stimulus_id,
    requested_filename,
    requested_media_type,
    requested_expected_byte_size,
    requested_expected_content_sha256,
    requested_retention_until,
    requested_idempotency_key,
    requested_sha256,
    requested_correlation_id
  );
$function$;

create function private.confirm_stimulus_asset_upload_atomic(
  requested_asset_id uuid,
  requested_byte_size integer,
  requested_content_sha256 text,
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
  selected_asset api.stimulus_assets%rowtype;
  replayed boolean := false;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  select * into selected_asset
  from api.stimulus_assets
  where id = requested_asset_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if not private.has_org_role(
    selected_asset.organization_id,
    subject,
    array['owner', 'editor']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if requested_byte_size is null
    or requested_content_sha256 is null
    or requested_correlation_id is null
    or selected_asset.retention_until <= pg_catalog.statement_timestamp()
    or selected_asset.expected_byte_size is null
    or selected_asset.expected_content_sha256 is null
    or requested_byte_size <> selected_asset.expected_byte_size
    or requested_content_sha256 <> selected_asset.expected_content_sha256
    or requested_content_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'stimulus_asset_mismatch';
  end if;
  if selected_asset.status = 'available' then
    if selected_asset.byte_size <> requested_byte_size
      or selected_asset.content_sha256 <> requested_content_sha256 then
      raise exception using errcode = '22023', message = 'stimulus_asset_mismatch';
    end if;
    replayed := true;
  elsif selected_asset.status = 'pending_upload' then
    update api.stimulus_assets
    set byte_size = requested_byte_size,
        content_sha256 = requested_content_sha256,
        status = 'available'
    where id = selected_asset.id
    returning * into selected_asset;
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
      selected_asset.organization_id,
      'user',
      subject,
      'stimulus_asset.available',
      'stimulus_asset',
      selected_asset.id,
      requested_correlation_id,
      'success',
      'api',
      pg_catalog.jsonb_build_object(
        'stimulus_id', selected_asset.stimulus_id,
        'media_type', selected_asset.media_type,
        'byte_size', selected_asset.byte_size,
        'content_sha256', selected_asset.content_sha256
      )
    );
  else
    raise exception using errcode = '55000', message = 'stimulus_asset_unavailable';
  end if;
  response_payload := pg_catalog.jsonb_build_object(
    'asset_id', selected_asset.id,
    'organization_id', selected_asset.organization_id,
    'stimulus_id', selected_asset.stimulus_id,
    'storage_bucket_id', selected_asset.storage_bucket_id,
    'storage_object_name', selected_asset.storage_object_name,
    'filename', selected_asset.filename,
    'media_type', selected_asset.media_type,
    'expected_byte_size', selected_asset.expected_byte_size,
    'expected_content_sha256', selected_asset.expected_content_sha256,
    'byte_size', selected_asset.byte_size,
    'content_sha256', selected_asset.content_sha256,
    'status', selected_asset.status,
    'retention_until', selected_asset.retention_until,
    'created_at', selected_asset.created_at,
    'replayed', replayed
  );
  return response_payload;
end
$function$;

create function api.confirm_stimulus_asset_upload(
  requested_asset_id uuid,
  requested_byte_size integer,
  requested_content_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.confirm_stimulus_asset_upload_atomic(
    requested_asset_id,
    requested_byte_size,
    requested_content_sha256,
    requested_correlation_id
  );
$function$;

create function private.request_stimulus_asset_deletion_atomic(
  requested_asset_id uuid,
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
  selected_asset api.stimulus_assets%rowtype;
  command_record record;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  select * into selected_asset
  from api.stimulus_assets
  where id = requested_asset_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if not private.has_org_role(
    selected_asset.organization_id,
    subject,
    array['owner', 'editor']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_stimulus_asset';
  end if;
  select * into command_record
  from private.begin_phase4_command(
    'stimulus_asset.delete',
    selected_asset.organization_id,
    requested_idempotency_key,
    requested_sha256
  );
  if command_record.replayed then
    return command_record.existing_response;
  end if;
  if selected_asset.status in ('pending_upload', 'available') then
    update api.stimulus_assets
    set status = 'deletion_requested',
        deletion_requested_at = pg_catalog.statement_timestamp()
    where id = selected_asset.id
    returning * into selected_asset;
  elsif selected_asset.status not in ('deletion_requested', 'deleted') then
    raise exception using errcode = '55000', message = 'stimulus_asset_unavailable';
  end if;
  response_payload := pg_catalog.jsonb_build_object(
    'asset_id', selected_asset.id,
    'organization_id', selected_asset.organization_id,
    'stimulus_id', selected_asset.stimulus_id,
    'storage_bucket_id', selected_asset.storage_bucket_id,
    'storage_object_name', selected_asset.storage_object_name,
    'filename', selected_asset.filename,
    'media_type', selected_asset.media_type,
    'expected_byte_size', selected_asset.expected_byte_size,
    'expected_content_sha256', selected_asset.expected_content_sha256,
    'byte_size', selected_asset.byte_size,
    'content_sha256', selected_asset.content_sha256,
    'status', selected_asset.status,
    'retention_until', selected_asset.retention_until,
    'created_at', selected_asset.created_at,
    'replayed', false
  );
  perform private.finish_phase4_command(
    command_record.receipt_id,
    selected_asset.id,
    response_payload
  );
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
    selected_asset.organization_id,
    'user',
    subject,
    'stimulus_asset.deletion_requested',
    'stimulus_asset',
    selected_asset.id,
    requested_correlation_id,
    'success',
    'api',
    pg_catalog.jsonb_build_object(
      'stimulus_id', selected_asset.stimulus_id,
      'status', selected_asset.status,
      'content_sha256', selected_asset.content_sha256
    )
  );
  return response_payload;
end
$function$;

create function api.request_stimulus_asset_deletion(
  requested_asset_id uuid,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.request_stimulus_asset_deletion_atomic(
    requested_asset_id,
    requested_idempotency_key,
    requested_sha256,
    requested_correlation_id
  );
$function$;

create function private.confirm_stimulus_asset_deletion_atomic(
  requested_asset_id uuid,
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
  selected_asset api.stimulus_assets%rowtype;
  replayed boolean := false;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  select * into selected_asset
  from api.stimulus_assets
  where id = requested_asset_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if not private.has_org_role(
    selected_asset.organization_id,
    subject,
    array['owner', 'editor']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_stimulus_asset';
  end if;
  if selected_asset.status = 'deleted' then
    replayed := true;
  elsif selected_asset.status = 'deletion_requested' then
    update api.stimulus_assets
    set status = 'deleted',
        deleted_at = pg_catalog.statement_timestamp()
    where id = selected_asset.id
    returning * into selected_asset;
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
      selected_asset.organization_id,
      'user',
      subject,
      'stimulus_asset.deleted',
      'stimulus_asset',
      selected_asset.id,
      requested_correlation_id,
      'success',
      'api',
      pg_catalog.jsonb_build_object(
        'stimulus_id', selected_asset.stimulus_id,
        'content_sha256', selected_asset.content_sha256
      )
    );
  else
    raise exception using errcode = '55000', message = 'stimulus_asset_unavailable';
  end if;
  response_payload := pg_catalog.jsonb_build_object(
    'asset_id', selected_asset.id,
    'organization_id', selected_asset.organization_id,
    'stimulus_id', selected_asset.stimulus_id,
    'storage_bucket_id', selected_asset.storage_bucket_id,
    'storage_object_name', selected_asset.storage_object_name,
    'filename', selected_asset.filename,
    'media_type', selected_asset.media_type,
    'expected_byte_size', selected_asset.expected_byte_size,
    'expected_content_sha256', selected_asset.expected_content_sha256,
    'byte_size', selected_asset.byte_size,
    'content_sha256', selected_asset.content_sha256,
    'status', selected_asset.status,
    'retention_until', selected_asset.retention_until,
    'created_at', selected_asset.created_at,
    'replayed', replayed
  );
  return response_payload;
end
$function$;

create function api.confirm_stimulus_asset_deletion(
  requested_asset_id uuid,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.confirm_stimulus_asset_deletion_atomic(
    requested_asset_id,
    requested_correlation_id
  );
$function$;

set role postgres;
revoke create on schema api, private from simula_command_owner;

revoke all on function private.create_stimulus_asset_atomic(
  uuid, text, text, integer, text, timestamptz, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function api.create_stimulus_asset(
  uuid, text, text, integer, text, timestamptz, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
grant execute on function private.create_stimulus_asset_atomic(
  uuid, text, text, integer, text, timestamptz, text, text, uuid
) to simula_api;
grant execute on function api.create_stimulus_asset(
  uuid, text, text, integer, text, timestamptz, text, text, uuid
) to simula_api;

revoke all on function private.confirm_stimulus_asset_upload_atomic(
  uuid, integer, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function api.confirm_stimulus_asset_upload(
  uuid, integer, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
grant execute on function private.confirm_stimulus_asset_upload_atomic(
  uuid, integer, text, uuid
) to simula_api;
grant execute on function api.confirm_stimulus_asset_upload(
  uuid, integer, text, uuid
) to simula_api;

revoke all on function private.request_stimulus_asset_deletion_atomic(
  uuid, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function api.request_stimulus_asset_deletion(
  uuid, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
grant execute on function private.request_stimulus_asset_deletion_atomic(
  uuid, text, text, uuid
) to simula_api;
grant execute on function api.request_stimulus_asset_deletion(
  uuid, text, text, uuid
) to simula_api;

revoke all on function private.confirm_stimulus_asset_deletion_atomic(
  uuid, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function api.confirm_stimulus_asset_deletion(uuid, uuid)
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
grant execute on function private.confirm_stimulus_asset_deletion_atomic(
  uuid, uuid
) to simula_api;
grant execute on function api.confirm_stimulus_asset_deletion(uuid, uuid)
to simula_api;

revoke all on all sequences in schema api, private
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner;

revoke select, update
on table api.stimulus_assets
from postgres;
set role postgres;
