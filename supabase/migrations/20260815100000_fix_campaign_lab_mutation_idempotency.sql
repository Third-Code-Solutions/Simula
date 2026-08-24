-- Repair Campaign Lab mutation idempotency after the tenant-scoped key index
-- replaced the original three-column unique constraint. These commands must
-- bind the idempotency row to the same organization and resource as the
-- mutation; otherwise update/cancel fail at the database boundary or can look
-- up a sibling resource's key.

set role postgres;
grant create on schema private to simula_command_owner;
set role simula_command_owner;

create or replace function private.cancel_campaign_lab_run_atomic(
  requested_run_id uuid,
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
  current_run api.campaign_lab_runs%rowtype;
  idempotency_id uuid;
  existing_sha256 text;
  existing_response jsonb;
  next_status text;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_idempotency_key is null
    or requested_idempotency_key !~ '^[ -~]{16,128}$'
    or requested_sha256 is null
    or requested_sha256 !~ '^[0-9a-f]{64}$'
    or requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_campaign_lab_cancellation';
  end if;

  select * into current_run
  from api.campaign_lab_runs
  where id = requested_run_id and private.is_org_member(organization_id, subject)
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if not private.has_org_role(
    current_run.organization_id, subject, array['owner', 'editor']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  insert into private.idempotency_keys (
    actor_user_id,
    scope,
    idempotency_key,
    request_sha256,
    organization_id,
    scope_organization_id,
    scope_resource_id
  ) values (
    subject,
    'campaign_lab.run.cancel',
    requested_idempotency_key,
    requested_sha256,
    current_run.organization_id,
    current_run.organization_id,
    current_run.id
  )
  on conflict do nothing
  returning id into idempotency_id;

  if idempotency_id is null then
    select keys.request_sha256, keys.response
      into existing_sha256, existing_response
      from private.idempotency_keys as keys
      where keys.actor_user_id = subject
        and keys.scope_organization_id = current_run.organization_id
        and keys.scope_resource_id = current_run.id
        and keys.scope = 'campaign_lab.run.cancel'
        and keys.idempotency_key = requested_idempotency_key
      for update;
    if not found or existing_response is null then
      raise exception using errcode = '55000', message = 'idempotency_state_incomplete';
    end if;
    if existing_sha256 <> requested_sha256 then
      raise exception using errcode = '22000', message = 'idempotency_key_reused';
    end if;
    return existing_response || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  if current_run.status in ('succeeded', 'failed', 'canceled') then
    response_payload := pg_catalog.jsonb_build_object(
      'run_id', current_run.id,
      'campaign_id', current_run.campaign_id,
      'status', current_run.status,
      'stage', current_run.stage,
      'progress', current_run.progress,
      'replayed', false
    );
  else
    next_status := case when current_run.status = 'running' then 'cancel_requested' else 'canceled' end;
    update api.campaign_lab_runs
    set status = next_status,
        stage = next_status,
        completed_at = case when next_status = 'canceled' then pg_catalog.statement_timestamp() else null end
    where id = current_run.id;
    insert into api.campaign_lab_events (
      organization_id, campaign_id, run_id, stage, progress, event_kind, message
    ) values (
      current_run.organization_id, current_run.campaign_id, current_run.id,
      next_status, current_run.progress, 'canceled',
      'Campaign lab run cancellation requested.'
    );
    insert into private.audit_events (
      organization_id, actor_type, actor_user_id, action, object_type, object_id,
      correlation_id, outcome, source_service, metadata
    ) values (
      current_run.organization_id, 'user', subject, 'campaign_lab.run_canceled',
      'campaign_lab_run', current_run.id, requested_correlation_id, 'success', 'api',
      pg_catalog.jsonb_build_object('previous_status', current_run.status)
    );
    response_payload := pg_catalog.jsonb_build_object(
      'run_id', current_run.id,
      'campaign_id', current_run.campaign_id,
      'status', next_status,
      'stage', next_status,
      'progress', current_run.progress,
      'replayed', false
    );
  end if;

  update private.idempotency_keys
  set organization_id = current_run.organization_id,
      resource_id = current_run.id,
      response = response_payload
  where id = idempotency_id;
  return response_payload;
end
$function$;

create or replace function private.update_campaign_lab_campaign_atomic(
  requested_campaign_id uuid,
  requested_expected_version integer,
  requested_name text,
  requested_objective text,
  requested_decision jsonb,
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
  current_campaign api.campaign_lab_campaigns%rowtype;
  updated_campaign api.campaign_lab_campaigns%rowtype;
  idempotency_id uuid;
  existing_sha256 text;
  existing_response jsonb;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_idempotency_key is null
    or requested_idempotency_key !~ '^[ -~]{16,128}$'
    or requested_sha256 is null
    or requested_sha256 !~ '^[0-9a-f]{64}$'
    or requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_campaign_lab_update';
  end if;

  select * into current_campaign
  from api.campaign_lab_campaigns
  where id = requested_campaign_id and private.is_org_member(organization_id, subject)
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if not private.has_org_role(
    current_campaign.organization_id, subject, array['owner', 'editor']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  insert into private.idempotency_keys (
    actor_user_id,
    scope,
    idempotency_key,
    request_sha256,
    organization_id,
    scope_organization_id,
    scope_resource_id
  ) values (
    subject,
    'campaign_lab.campaign.update',
    requested_idempotency_key,
    requested_sha256,
    current_campaign.organization_id,
    current_campaign.organization_id,
    current_campaign.id
  )
  on conflict do nothing
  returning id into idempotency_id;

  if idempotency_id is null then
    select keys.request_sha256, keys.response
      into existing_sha256, existing_response
      from private.idempotency_keys as keys
      where keys.actor_user_id = subject
        and keys.scope_organization_id = current_campaign.organization_id
        and keys.scope_resource_id = current_campaign.id
        and keys.scope = 'campaign_lab.campaign.update'
        and keys.idempotency_key = requested_idempotency_key
      for update;
    if not found or existing_response is null then
      raise exception using errcode = '55000', message = 'idempotency_state_incomplete';
    end if;
    if existing_sha256 <> requested_sha256 then
      raise exception using errcode = '22000', message = 'idempotency_key_reused';
    end if;
    return existing_response || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  if current_campaign.version <> requested_expected_version then
    raise exception using errcode = '40001', message = 'version_conflict';
  end if;
  if current_campaign.status in ('running', 'completed', 'archived') then
    raise exception using errcode = '55000', message = 'campaign_lab_campaign_immutable';
  end if;
  if requested_name is null
    or pg_catalog.char_length(pg_catalog.btrim(requested_name)) not between 2 and 120
    or requested_objective is null
    or pg_catalog.char_length(requested_objective) not between 2 and 2000
    or requested_decision is null
    or pg_catalog.jsonb_typeof(requested_decision) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_campaign_lab_campaign_patch';
  end if;

  update api.campaign_lab_campaigns
  set name = pg_catalog.btrim(requested_name),
      objective = requested_objective,
      decision_definition = requested_decision,
      version = version + 1,
      status = case when status = 'draft' then 'active' else status end,
      updated_at = pg_catalog.statement_timestamp()
  where id = current_campaign.id
  returning * into updated_campaign;
  insert into api.campaign_lab_events (
    organization_id, campaign_id, stage, progress, event_kind, message
  ) values (
    updated_campaign.organization_id, updated_campaign.id, updated_campaign.current_stage,
    0, 'progress', 'Campaign lab workspace updated.'
  );
  insert into private.audit_events (
    organization_id, actor_type, actor_user_id, action, object_type, object_id,
    correlation_id, outcome, source_service, metadata
  ) values (
    updated_campaign.organization_id, 'user', subject, 'campaign_lab.campaign_updated',
    'campaign_lab_campaign', updated_campaign.id, requested_correlation_id, 'success', 'api',
    pg_catalog.jsonb_build_object('version', updated_campaign.version)
  );
  response_payload := pg_catalog.jsonb_build_object(
    'campaign_id', updated_campaign.id,
    'organization_id', updated_campaign.organization_id,
    'project_id', updated_campaign.project_id,
    'name', updated_campaign.name,
    'objective', updated_campaign.objective,
    'purpose', updated_campaign.purpose,
    'status', updated_campaign.status,
    'current_stage', updated_campaign.current_stage,
    'compliance_status', updated_campaign.compliance_status,
    'version', updated_campaign.version,
    'created_at', updated_campaign.created_at,
    'updated_at', updated_campaign.updated_at,
    'replayed', false
  );
  update private.idempotency_keys
  set organization_id = updated_campaign.organization_id,
      resource_id = updated_campaign.id,
      response = response_payload
  where id = idempotency_id;
  return response_payload;
end
$function$;

reset role;
set role postgres;
revoke create on schema private from simula_command_owner;

-- The Campaign Lab command functions use the same private idempotency table,
-- but the original RLS policies predate these scopes. Keep the existing
-- command scopes intact and admit only fully tenant/resource-bound Campaign
-- Lab rows for owner/editor members.
drop policy idempotency_keys_command_select on private.idempotency_keys;
drop policy idempotency_keys_command_insert on private.idempotency_keys;
drop policy idempotency_keys_command_update on private.idempotency_keys;

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
    or (
      scope in ('campaign_lab.campaign.update', 'campaign_lab.run.cancel')
      and scope_organization_id is not null
      and scope_resource_id is not null
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
    or (
      scope in ('campaign_lab.campaign.update', 'campaign_lab.run.cancel')
      and scope_organization_id is not null
      and scope_resource_id is not null
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
    or (
      scope in ('campaign_lab.campaign.update', 'campaign_lab.run.cancel')
      and scope_organization_id is not null
      and scope_resource_id is not null
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
    or (
      scope in ('campaign_lab.campaign.update', 'campaign_lab.run.cancel')
      and scope_organization_id = organization_id
      and scope_resource_id is not null
      and private.has_org_role(
        scope_organization_id,
        private.verified_subject(),
        array['owner', 'editor']::api.organization_role[]
      )
    )
  )
);

create policy campaign_lab_runs_command_update
on api.campaign_lab_runs
for update
to simula_command_owner
using (
  private.is_org_member(organization_id, private.verified_subject())
)
with check (
  private.is_org_member(organization_id, private.verified_subject())
);

-- Keep the legacy API/dispatcher functions bound to the repository-derived
-- migration head while preserving their worker-owner security boundary.
set role postgres;
grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

do $patch_legacy_simula_migration_head$
declare
  targets pg_catalog.regprocedure[] := array[
    'private.runtime_schema_readiness()'::pg_catalog.regprocedure,
    'private.runtime_observability_snapshot()'::pg_catalog.regprocedure
  ];
  target pg_catalog.regprocedure;
  original_definition text;
  replacement_definition text;
begin
  foreach target in array targets loop
    select pg_catalog.pg_get_functiondef(target::oid)
      into original_definition;
    if original_definition like '%20260815100000::bigint%' then
      continue;
    end if;
    replacement_definition := pg_catalog.replace(
      original_definition,
      '20260802105930::bigint',
      '20260815100000::bigint'
    );
    if replacement_definition = original_definition then
      raise exception using errcode = '55000',
        message = 'simula_runtime_migration_head_patch_failed';
    end if;
    execute replacement_definition;
  end loop;
end
$patch_legacy_simula_migration_head$;

-- The v3 functions are owned by the local postgres migration role.
reset role;
set role postgres;
revoke create on schema private from simula_worker_owner;
grant execute on function private.runtime_schema_readiness_v3() to postgres;
grant execute on function private.runtime_observability_snapshot_v3() to postgres;

do $patch_v3_simula_migration_head$
declare
  targets pg_catalog.regprocedure[] := array[
    'private.runtime_schema_readiness_v3()'::pg_catalog.regprocedure,
    'private.runtime_observability_snapshot_v3()'::pg_catalog.regprocedure
  ];
  target pg_catalog.regprocedure;
  original_definition text;
  replacement_definition text;
begin
  foreach target in array targets loop
    select pg_catalog.pg_get_functiondef(target::oid)
      into original_definition;
    if original_definition like '%20260815100000::bigint%' then
      continue;
    end if;
    replacement_definition := pg_catalog.replace(
      original_definition,
      '20260807200000::bigint',
      '20260815100000::bigint'
    );
    if replacement_definition = original_definition then
      raise exception using errcode = '55000',
        message = 'simula_v3_runtime_migration_head_patch_failed';
    end if;
    execute replacement_definition;
  end loop;
end
$patch_v3_simula_migration_head$;

revoke execute on function private.runtime_schema_readiness_v3() from postgres;
revoke execute on function private.runtime_observability_snapshot_v3() from postgres;
