-- Complete Phase 4 team admission and authenticated report sharing.

set role postgres;

create type api.share_permission as enum ('view', 'download');

create table api.report_share_grants (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  report_artifact_id uuid not null,
  recipient_user_id uuid not null,
  permission api.share_permission not null,
  token_sha256 text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  access_count integer not null default 0,
  last_accessed_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint report_share_grants_report_foreign_key
    foreign key (organization_id, report_artifact_id)
    references api.report_artifacts (organization_id, id) on delete cascade,
  constraint report_share_grants_recipient_foreign_key
    foreign key (organization_id, recipient_user_id)
    references api.organization_memberships (organization_id, user_id) on delete cascade,
  constraint report_share_grants_token_valid check (
    token_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint report_share_grants_expiry_valid check (
    expires_at > created_at and expires_at <= created_at + interval '30 days'
  ),
  constraint report_share_grants_access_valid check (
    access_count >= 0
    and (access_count = 0 or last_accessed_at is not null)
  ),
  constraint report_share_grants_revocation_valid check (
    revoked_at is null or revoked_at >= created_at
  )
);

create index report_share_grants_report_created_idx
  on api.report_share_grants (report_artifact_id, created_at desc, id);
create index report_share_grants_recipient_active_idx
  on api.report_share_grants (recipient_user_id, expires_at)
  where revoked_at is null;

alter table private.phase4_command_receipts
  drop constraint phase4_command_receipts_scope_valid;
alter table private.phase4_command_receipts
  add constraint phase4_command_receipts_scope_valid check (
    scope in (
      'audience.create',
      'simulation_configuration.create',
      'variant_group.create',
      'report.create',
      'export.create',
      'feedback.create',
      'invitation.create',
      'invitation.accept',
      'share.create',
      'share.revoke',
      'feature_flag.set'
    )
  );

alter table api.report_share_grants enable row level security;
alter table api.report_share_grants force row level security;

create policy organization_invitations_command_accept_select
on api.organization_invitations for select to simula_command_owner
using (
  private.verified_subject() is not null
  and (
    status = 'pending'
    or accepted_by = private.verified_subject()
  )
);

create policy organization_invitations_command_accept_update
on api.organization_invitations for update to simula_command_owner
using (
  status = 'pending'
  and private.verified_subject() is not null
)
with check (
  status = 'accepted'
  and accepted_by = private.verified_subject()
  and accepted_at is not null
  and revoked_at is null
);

create policy organization_memberships_command_invitation_insert
on api.organization_memberships for insert to simula_command_owner
with check (
  private.is_verified_api_subject(user_id)
  and private.is_verified_api_subject(created_by)
  and role in ('editor', 'viewer')
  and exists (
    select 1
    from api.organization_invitations as invitation
    where invitation.organization_id = organization_memberships.organization_id
      and invitation.role = organization_memberships.role
      and invitation.status = 'pending'
      and invitation.expires_at > pg_catalog.statement_timestamp()
  )
);

create policy report_share_grants_api_select
on api.report_share_grants for select to simula_api
using (
  private.is_verified_api_subject(recipient_user_id)
  or private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);

create policy report_share_grants_command_select
on api.report_share_grants for select to simula_command_owner
using (
  private.is_verified_api_subject(recipient_user_id)
  or private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);

create policy report_share_grants_command_insert
on api.report_share_grants for insert to simula_command_owner
with check (
  private.is_verified_api_subject(created_by)
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);

create policy report_share_grants_command_update
on api.report_share_grants for update to simula_command_owner
using (
  private.is_verified_api_subject(recipient_user_id)
  or private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
)
with check (
  private.is_verified_api_subject(recipient_user_id)
  or private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);

create policy audit_events_command_sharing_insert
on private.audit_events for insert to simula_command_owner
with check (
  actor_type = 'user'
  and private.is_verified_api_subject(actor_user_id)
  and source_service = 'api'
  and outcome = 'success'
  and action in (
    'invitation.accepted',
    'share.created',
    'share.accessed',
    'share.revoked'
  )
  and private.is_org_member(organization_id, private.verified_subject())
);

grant select, update on table api.organization_invitations to simula_command_owner;
grant select on table api.report_share_grants to simula_api;
grant select, insert, update on table api.report_share_grants to simula_command_owner;
grant create on schema api, private to simula_command_owner;

set role simula_command_owner;

create function private.accept_organization_invitation_atomic(
  requested_token_sha256 text,
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
  selected_invitation api.organization_invitations%rowtype;
  command_record record;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_token_sha256 is null
    or requested_token_sha256 !~ '^[0-9a-f]{64}$'
    or requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_invitation';
  end if;
  select * into selected_invitation
  from api.organization_invitations
  where token_sha256 = requested_token_sha256;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if selected_invitation.status = 'accepted'
    and selected_invitation.accepted_by = subject then
    select * into command_record from private.begin_phase4_command(
      'invitation.accept', selected_invitation.organization_id,
      requested_idempotency_key, requested_sha256
    );
    if command_record.replayed then
      return command_record.existing_response;
    end if;
    raise exception using errcode = '40001', message = 'version_conflict';
  end if;
  if selected_invitation.status <> 'pending'
    or selected_invitation.expires_at <= pg_catalog.statement_timestamp() then
    raise exception using errcode = '40001', message = 'version_conflict';
  end if;
  if exists (
    select 1 from api.organization_memberships
    where organization_id = selected_invitation.organization_id
      and user_id = subject
  ) then
    raise exception using errcode = '40001', message = 'version_conflict';
  end if;
  insert into api.organization_memberships (
    organization_id, user_id, role, created_by
  ) values (
    selected_invitation.organization_id, subject,
    selected_invitation.role, subject
  );
  update api.organization_invitations
  set status = 'accepted', accepted_by = subject,
    accepted_at = pg_catalog.statement_timestamp()
  where id = selected_invitation.id;
  select * into command_record from private.begin_phase4_command(
    'invitation.accept', selected_invitation.organization_id,
    requested_idempotency_key, requested_sha256
  );
  response_payload := pg_catalog.jsonb_build_object(
    'invitation_id', selected_invitation.id,
    'organization_id', selected_invitation.organization_id,
    'user_id', subject,
    'role', selected_invitation.role,
    'status', 'accepted',
    'replayed', false
  );
  perform private.finish_phase4_command(
    command_record.receipt_id, selected_invitation.id, response_payload
  );
  insert into private.audit_events (
    organization_id, actor_type, actor_user_id, action, object_type,
    object_id, correlation_id, outcome, source_service, metadata
  ) values (
    selected_invitation.organization_id, 'user', subject,
    'invitation.accepted', 'organization_invitation',
    selected_invitation.id, requested_correlation_id,
    'success', 'api', pg_catalog.jsonb_build_object('role', selected_invitation.role)
  );
  return response_payload;
end
$function$;

create function api.accept_organization_invitation(
  requested_token_sha256 text,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.accept_organization_invitation_atomic(
    requested_token_sha256, requested_idempotency_key,
    requested_sha256, requested_correlation_id
  );
$function$;

create function private.create_report_share_grant_atomic(
  requested_report_id uuid,
  requested_recipient_user_id uuid,
  requested_permission api.share_permission,
  requested_token_sha256 text,
  requested_expires_at timestamptz,
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
  selected_report api.report_artifacts%rowtype;
  command_record record;
  created_grant api.report_share_grants%rowtype;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  select * into selected_report from api.report_artifacts
  where id = requested_report_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if not private.has_org_role(
    selected_report.organization_id, subject,
    array['owner', 'editor']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if requested_recipient_user_id is null
    or requested_permission is null
    or requested_token_sha256 is null
    or requested_token_sha256 !~ '^[0-9a-f]{64}$'
    or requested_expires_at is null
    or requested_expires_at <= pg_catalog.statement_timestamp()
    or requested_expires_at > pg_catalog.statement_timestamp() + interval '30 days'
    or requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_share_grant';
  end if;
  select * into command_record from private.begin_phase4_command(
    'share.create', selected_report.organization_id,
    requested_idempotency_key, requested_sha256
  );
  if command_record.replayed then
    return command_record.existing_response;
  end if;
  begin
    insert into api.report_share_grants (
      organization_id, report_artifact_id, recipient_user_id,
      permission, token_sha256, expires_at, created_by
    ) values (
      selected_report.organization_id, selected_report.id,
      requested_recipient_user_id, requested_permission,
      requested_token_sha256, requested_expires_at, subject
    ) returning * into created_grant;
  exception when foreign_key_violation then
    raise exception using errcode = '22023', message = 'invalid_share_recipient';
  end;
  response_payload := pg_catalog.jsonb_build_object(
    'share_id', created_grant.id,
    'report_id', created_grant.report_artifact_id,
    'recipient_user_id', created_grant.recipient_user_id,
    'permission', created_grant.permission,
    'expires_at', created_grant.expires_at,
    'created_at', created_grant.created_at,
    'replayed', false
  );
  perform private.finish_phase4_command(
    command_record.receipt_id, created_grant.id, response_payload
  );
  insert into private.audit_events (
    organization_id, actor_type, actor_user_id, action, object_type,
    object_id, correlation_id, outcome, source_service, metadata
  ) values (
    created_grant.organization_id, 'user', subject,
    'share.created', 'report_share_grant', created_grant.id,
    requested_correlation_id, 'success', 'api',
    pg_catalog.jsonb_build_object(
      'report_id', created_grant.report_artifact_id,
      'recipient_user_id', created_grant.recipient_user_id,
      'permission', created_grant.permission,
      'expires_at', created_grant.expires_at
    )
  );
  return response_payload;
end
$function$;

create function api.create_report_share_grant(
  requested_report_id uuid,
  requested_recipient_user_id uuid,
  requested_permission api.share_permission,
  requested_token_sha256 text,
  requested_expires_at timestamptz,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.create_report_share_grant_atomic(
    requested_report_id, requested_recipient_user_id,
    requested_permission, requested_token_sha256,
    requested_expires_at, requested_idempotency_key,
    requested_sha256, requested_correlation_id
  );
$function$;

create function private.access_shared_report_atomic(
  requested_token_sha256 text,
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
  selected_grant api.report_share_grants%rowtype;
  selected_report api.report_artifacts%rowtype;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  select * into selected_grant from api.report_share_grants
  where token_sha256 = requested_token_sha256
    and recipient_user_id = subject
  for update;
  if not found
    or selected_grant.revoked_at is not null
    or selected_grant.expires_at <= pg_catalog.statement_timestamp() then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  select * into selected_report from api.report_artifacts
  where id = selected_grant.report_artifact_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  update api.report_share_grants
  set access_count = access_count + 1,
    last_accessed_at = pg_catalog.statement_timestamp()
  where id = selected_grant.id;
  insert into private.audit_events (
    organization_id, actor_type, actor_user_id, action, object_type,
    object_id, correlation_id, outcome, source_service, metadata
  ) values (
    selected_grant.organization_id, 'user', subject,
    'share.accessed', 'report_share_grant', selected_grant.id,
    requested_correlation_id, 'success', 'api',
    pg_catalog.jsonb_build_object(
      'report_id', selected_grant.report_artifact_id,
      'permission', selected_grant.permission
    )
  );
  return pg_catalog.jsonb_build_object(
    'share_id', selected_grant.id,
    'report_id', selected_report.id,
    'permission', selected_grant.permission,
    'expires_at', selected_grant.expires_at,
    'artifact', selected_report.artifact,
    'content_sha256', selected_report.content_sha256
  );
end
$function$;

create function api.access_shared_report(
  requested_token_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.access_shared_report_atomic(
    requested_token_sha256, requested_correlation_id
  );
$function$;

create function private.revoke_report_share_grant_atomic(
  requested_share_id uuid,
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
  selected_grant api.report_share_grants%rowtype;
  command_record record;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  select * into selected_grant from api.report_share_grants
  where id = requested_share_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if not private.has_org_role(
    selected_grant.organization_id, subject,
    array['owner', 'editor']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  select * into command_record from private.begin_phase4_command(
    'share.revoke', selected_grant.organization_id,
    requested_idempotency_key, requested_sha256
  );
  if command_record.replayed then
    return command_record.existing_response;
  end if;
  update api.report_share_grants
  set revoked_at = coalesce(revoked_at, pg_catalog.statement_timestamp())
  where id = selected_grant.id
  returning * into selected_grant;
  response_payload := pg_catalog.jsonb_build_object(
    'share_id', selected_grant.id,
    'report_id', selected_grant.report_artifact_id,
    'revoked_at', selected_grant.revoked_at,
    'replayed', false
  );
  perform private.finish_phase4_command(
    command_record.receipt_id, selected_grant.id, response_payload
  );
  insert into private.audit_events (
    organization_id, actor_type, actor_user_id, action, object_type,
    object_id, correlation_id, outcome, source_service, metadata
  ) values (
    selected_grant.organization_id, 'user', subject,
    'share.revoked', 'report_share_grant', selected_grant.id,
    requested_correlation_id, 'success', 'api', '{}'::jsonb
  );
  return response_payload;
end
$function$;

create function api.revoke_report_share_grant(
  requested_share_id uuid,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.revoke_report_share_grant_atomic(
    requested_share_id, requested_idempotency_key,
    requested_sha256, requested_correlation_id
  );
$function$;

revoke all on function api.accept_organization_invitation(text, text, text, uuid)
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function api.create_report_share_grant(
  uuid, uuid, api.share_permission, text, timestamptz, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function api.access_shared_report(text, uuid)
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function api.revoke_report_share_grant(uuid, text, text, uuid)
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function private.accept_organization_invitation_atomic(
  text, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function private.create_report_share_grant_atomic(
  uuid, uuid, api.share_permission, text, timestamptz, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function private.access_shared_report_atomic(text, uuid)
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function private.revoke_report_share_grant_atomic(
  uuid, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;

grant execute on function api.accept_organization_invitation(
  text, text, text, uuid
) to simula_api;
grant execute on function api.create_report_share_grant(
  uuid, uuid, api.share_permission, text, timestamptz, text, text, uuid
) to simula_api;
grant execute on function api.access_shared_report(text, uuid) to simula_api;
grant execute on function api.revoke_report_share_grant(
  uuid, text, text, uuid
) to simula_api;
grant execute on function private.accept_organization_invitation_atomic(
  text, text, text, uuid
) to simula_api;
grant execute on function private.create_report_share_grant_atomic(
  uuid, uuid, api.share_permission, text, timestamptz, text, text, uuid
) to simula_api;
grant execute on function private.access_shared_report_atomic(
  text, uuid
) to simula_api;
grant execute on function private.revoke_report_share_grant_atomic(
  uuid, text, text, uuid
) to simula_api;

set role postgres;
revoke create on schema api, private from simula_command_owner;
