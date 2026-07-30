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
      'stimulus_asset.delete',
      'stimulus_visual_profile.create'
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
    'stimulus_visual_profile.created'
  )
  and private.is_org_member(organization_id, private.verified_subject())
);

create table api.stimulus_visual_profiles (
  id uuid primary key,
  organization_id uuid not null references api.organizations(id),
  stimulus_id uuid not null references api.stimuli(id),
  asset_id uuid not null unique references api.stimulus_assets(id),
  asset_content_sha256 text not null
    check (asset_content_sha256 ~ '^[0-9a-f]{64}$'),
  methodology_version text not null
    check (methodology_version = 'technical_image_signals_v1'),
  provider_id text not null
    check (provider_id = 'simula_technical_image_signals'),
  provider_version text not null check (provider_version = '1.0.0'),
  model_id text not null check (model_id = 'pillow-12.1.0'),
  template_id text not null check (template_id = 'technical_image_signals_v1'),
  profile_checksum_sha256 text not null
    check (profile_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  profile jsonb not null check (
    pg_catalog.jsonb_typeof(profile) = 'object'
    and pg_catalog.pg_column_size(profile) <= 64000
    and profile ->> 'schema_version' = '1.0.0'
    and profile ->> 'analysis_id' = id::text
    and profile #>> '{asset,asset_id}' = asset_id::text
    and profile #>> '{asset,organization_id}' = organization_id::text
    and profile #>> '{asset,stimulus_id}' = stimulus_id::text
    and profile #>> '{asset,content_sha256}' = asset_content_sha256
    and profile #>> '{provider,provider_id}' = provider_id
    and profile #>> '{provider,provider_version}' = provider_version
    and profile #>> '{provider,model_id}' = model_id
    and profile #>> '{provider,template_id}' = template_id
    and profile ->> 'methodology_version' = methodology_version
    and profile ->> 'analysis_scope' = 'technical_image_signals_only'
    and profile ->> 'validation_label' = 'experimental'
    and profile -> 'behavioral_interpretation' = 'false'::jsonb
    and profile -> 'population_inference' = 'false'::jsonb
    and profile -> 'retained_embedded_metadata' = 'false'::jsonb
    and profile ->> 'checksum_sha256' = profile_checksum_sha256
  ),
  created_by uuid not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp()
);

create index stimulus_visual_profiles_org_created_idx
  on api.stimulus_visual_profiles (organization_id, created_at desc, id desc);

alter table api.stimulus_visual_profiles enable row level security;
alter table api.stimulus_visual_profiles force row level security;

create policy stimulus_visual_profiles_api_select
on api.stimulus_visual_profiles
for select
to simula_api
using (
  private.is_org_member(organization_id, private.verified_subject())
);

create policy stimulus_visual_profiles_command_select
on api.stimulus_visual_profiles
for select
to simula_command_owner
using (
  private.is_org_member(organization_id, private.verified_subject())
);

create policy stimulus_visual_profiles_command_insert
on api.stimulus_visual_profiles
for insert
to simula_command_owner
with check (
  private.is_verified_api_subject(created_by)
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);

create policy stimulus_visual_profiles_command_delete
on api.stimulus_visual_profiles
for delete
to simula_command_owner
using (
  private.is_org_member(organization_id, private.verified_subject())
);

revoke all on table api.stimulus_visual_profiles from public, anon, authenticated;
grant select on table api.stimulus_visual_profiles to simula_api;
grant select, insert, delete on table api.stimulus_visual_profiles
  to simula_command_owner;

grant create on schema api, private to simula_command_owner;
grant trigger on table api.stimulus_assets to simula_command_owner;
set role simula_command_owner;

create function private.create_stimulus_visual_profile_atomic(
  requested_asset_id uuid,
  requested_analysis_id uuid,
  requested_profile jsonb,
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
  selected_profile api.stimulus_visual_profiles%rowtype;
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
  if selected_asset.status <> 'available'
    or selected_asset.media_type not in ('image/jpeg', 'image/png', 'image/webp')
    or selected_asset.byte_size is null
    or selected_asset.content_sha256 is null
    or selected_asset.retention_until <= pg_catalog.statement_timestamp() then
    raise exception using errcode = '55000', message = 'visual_profile_unavailable';
  end if;
  if requested_analysis_id is null
    or requested_profile is null
    or pg_catalog.jsonb_typeof(requested_profile) <> 'object'
    or pg_catalog.pg_column_size(requested_profile) > 64000
    or requested_correlation_id is null
    or requested_profile ->> 'schema_version' <> '1.0.0'
    or requested_profile ->> 'analysis_id' <> requested_analysis_id::text
    or requested_profile #>> '{asset,asset_id}' <> selected_asset.id::text
    or requested_profile #>> '{asset,organization_id}'
      <> selected_asset.organization_id::text
    or requested_profile #>> '{asset,stimulus_id}'
      <> selected_asset.stimulus_id::text
    or requested_profile #>> '{asset,media_type}' <> selected_asset.media_type
    or requested_profile #>> '{asset,byte_size}'
      <> selected_asset.byte_size::text
    or requested_profile #>> '{asset,content_sha256}'
      <> selected_asset.content_sha256
    or requested_profile #>> '{provider,provider_id}'
      <> 'simula_technical_image_signals'
    or requested_profile #>> '{provider,provider_version}' <> '1.0.0'
    or requested_profile #>> '{provider,model_id}' <> 'pillow-12.1.0'
    or requested_profile #>> '{provider,template_id}'
      <> 'technical_image_signals_v1'
    or requested_profile ->> 'methodology_version'
      <> 'technical_image_signals_v1'
    or requested_profile ->> 'analysis_scope'
      <> 'technical_image_signals_only'
    or requested_profile ->> 'validation_label' <> 'experimental'
    or requested_profile -> 'behavioral_interpretation' <> 'false'::jsonb
    or requested_profile -> 'population_inference' <> 'false'::jsonb
    or requested_profile -> 'retained_embedded_metadata' <> 'false'::jsonb
    or requested_profile ->> 'checksum_sha256' !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'visual_profile_mismatch';
  end if;
  select * into command_record
  from private.begin_phase4_command(
    'stimulus_visual_profile.create',
    selected_asset.organization_id,
    requested_idempotency_key,
    requested_sha256
  );
  if command_record.replayed then
    return command_record.existing_response;
  end if;

  select * into selected_profile
  from api.stimulus_visual_profiles
  where asset_id = selected_asset.id;
  if not found then
    insert into api.stimulus_visual_profiles (
      id,
      organization_id,
      stimulus_id,
      asset_id,
      asset_content_sha256,
      methodology_version,
      provider_id,
      provider_version,
      model_id,
      template_id,
      profile_checksum_sha256,
      profile,
      created_by
    ) values (
      requested_analysis_id,
      selected_asset.organization_id,
      selected_asset.stimulus_id,
      selected_asset.id,
      selected_asset.content_sha256,
      'technical_image_signals_v1',
      'simula_technical_image_signals',
      '1.0.0',
      'pillow-12.1.0',
      'technical_image_signals_v1',
      requested_profile ->> 'checksum_sha256',
      requested_profile,
      subject
    )
    returning * into selected_profile;
  elsif selected_profile.id <> requested_analysis_id
    or selected_profile.profile_checksum_sha256
      <> requested_profile ->> 'checksum_sha256'
    or selected_profile.profile <> requested_profile then
    raise exception using
      errcode = '22023',
      message = 'visual_profile_immutable_conflict';
  end if;

  response_payload := pg_catalog.jsonb_build_object(
    'analysis_id', selected_profile.id,
    'asset_id', selected_profile.asset_id,
    'organization_id', selected_profile.organization_id,
    'stimulus_id', selected_profile.stimulus_id,
    'asset_content_sha256', selected_profile.asset_content_sha256,
    'asset_media_type', selected_asset.media_type,
    'asset_byte_size', selected_asset.byte_size,
    'profile_checksum_sha256', selected_profile.profile_checksum_sha256,
    'profile', selected_profile.profile,
    'created_at', selected_profile.created_at,
    'replayed', false
  );
  perform private.finish_phase4_command(
    command_record.receipt_id,
    selected_profile.id,
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
    selected_profile.organization_id,
    'user',
    subject,
    'stimulus_visual_profile.created',
    'stimulus_visual_profile',
    selected_profile.id,
    requested_correlation_id,
    'success',
    'api',
    pg_catalog.jsonb_build_object(
      'asset_id', selected_profile.asset_id,
      'stimulus_id', selected_profile.stimulus_id,
      'asset_content_sha256', selected_profile.asset_content_sha256,
      'profile_checksum_sha256', selected_profile.profile_checksum_sha256,
      'methodology_version', selected_profile.methodology_version,
      'provider_id', selected_profile.provider_id,
      'provider_version', selected_profile.provider_version
    )
  );
  return response_payload;
end
$function$;

create function api.create_stimulus_visual_profile(
  requested_asset_id uuid,
  requested_analysis_id uuid,
  requested_profile jsonb,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.create_stimulus_visual_profile_atomic(
    requested_asset_id,
    requested_analysis_id,
    requested_profile,
    requested_idempotency_key,
    requested_sha256,
    requested_correlation_id
  );
$function$;

create function private.purge_stimulus_visual_profile_on_asset_retirement()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  if old.status = 'available' and new.status <> 'available' then
    delete from api.stimulus_visual_profiles
    where asset_id = new.id;
  end if;
  return new;
end
$function$;

create trigger purge_stimulus_visual_profile_on_asset_retirement
after update of status on api.stimulus_assets
for each row
when (old.status is distinct from new.status)
execute function private.purge_stimulus_visual_profile_on_asset_retirement();

reset role;
revoke create on schema api, private from simula_command_owner;
revoke trigger on table api.stimulus_assets from simula_command_owner;

revoke all on function private.create_stimulus_visual_profile_atomic(
  uuid, uuid, jsonb, text, text, uuid
) from public, anon, authenticated;
revoke all on function api.create_stimulus_visual_profile(
  uuid, uuid, jsonb, text, text, uuid
) from public, anon, authenticated;
revoke all on function private.purge_stimulus_visual_profile_on_asset_retirement()
  from public, anon, authenticated;

grant execute on function private.create_stimulus_visual_profile_atomic(
  uuid, uuid, jsonb, text, text, uuid
) to simula_api;
grant execute on function api.create_stimulus_visual_profile(
  uuid, uuid, jsonb, text, text, uuid
) to simula_api;
