-- Make Campaign Lab update and cancellation commands replay-safe.

set role postgres;
grant create on schema private to simula_command_owner;
set role simula_command_owner;

create function private.cancel_campaign_lab_run_atomic(
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
    actor_user_id, scope, idempotency_key, request_sha256
  ) values (
    subject, 'campaign_lab.run.cancel', requested_idempotency_key, requested_sha256
  )
  on conflict (actor_user_id, scope, idempotency_key) do nothing
  returning id into idempotency_id;

  if idempotency_id is null then
    select keys.request_sha256, keys.response
      into existing_sha256, existing_response
      from private.idempotency_keys as keys
      where keys.actor_user_id = subject
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

create function private.update_campaign_lab_campaign_atomic(
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
    actor_user_id, scope, idempotency_key, request_sha256
  ) values (
    subject, 'campaign_lab.campaign.update', requested_idempotency_key, requested_sha256
  )
  on conflict (actor_user_id, scope, idempotency_key) do nothing
  returning id into idempotency_id;

  if idempotency_id is null then
    select keys.request_sha256, keys.response
      into existing_sha256, existing_response
      from private.idempotency_keys as keys
      where keys.actor_user_id = subject
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

drop function api.cancel_campaign_lab_run(uuid, uuid);
drop function api.update_campaign_lab_campaign(uuid, integer, text, text, jsonb, uuid);

create function api.cancel_campaign_lab_run(
  requested_run_id uuid,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.cancel_campaign_lab_run_atomic(
    requested_run_id, requested_idempotency_key, requested_sha256, requested_correlation_id
  );
$function$;

create function api.update_campaign_lab_campaign(
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
language sql
set search_path = ''
as $function$
  select private.update_campaign_lab_campaign_atomic(
    requested_campaign_id, requested_expected_version, requested_name,
    requested_objective, requested_decision, requested_idempotency_key,
    requested_sha256, requested_correlation_id
  );
$function$;

revoke all on function api.cancel_campaign_lab_run(uuid, text, text, uuid)
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function api.cancel_campaign_lab_run(uuid, text, text, uuid) to simula_api;
revoke all on function api.update_campaign_lab_campaign(uuid, integer, text, text, jsonb, text, text, uuid)
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function api.update_campaign_lab_campaign(uuid, integer, text, text, jsonb, text, text, uuid)
  to simula_api;

set role simula_command_owner;
revoke all on function private.cancel_campaign_lab_run_atomic(uuid, uuid)
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
revoke all on function private.cancel_campaign_lab_run_atomic(uuid, text, text, uuid)
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function private.cancel_campaign_lab_run_atomic(uuid, text, text, uuid) to simula_api;
revoke all on function private.update_campaign_lab_campaign_atomic(uuid, integer, text, text, jsonb, uuid)
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
revoke all on function private.update_campaign_lab_campaign_atomic(uuid, integer, text, text, jsonb, text, text, uuid)
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function private.update_campaign_lab_campaign_atomic(uuid, integer, text, text, jsonb, text, text, uuid)
  to simula_api;

reset role;
set role postgres;
revoke create on schema private from simula_command_owner;

do $patch_campaign_lab_runtime_head$
declare
  original_definition text;
  replacement_definition text;
begin
  select pg_catalog.pg_get_functiondef('private.runtime_schema_readiness()'::pg_catalog.regprocedure)
    into original_definition;
  replacement_definition := pg_catalog.replace(
    original_definition, '20260802063625::bigint', '20260802105930::bigint'
  );
  if replacement_definition = original_definition then
    raise exception using errcode = '55000', message = 'campaign_lab_runtime_schema_head_patch_failed';
  end if;
  execute replacement_definition;

  select pg_catalog.pg_get_functiondef('private.runtime_observability_snapshot()'::pg_catalog.regprocedure)
    into original_definition;
  replacement_definition := pg_catalog.replace(
    original_definition, '20260802063625::bigint', '20260802105930::bigint'
  );
  if replacement_definition = original_definition then
    raise exception using errcode = '55000', message = 'campaign_lab_runtime_observability_head_patch_failed';
  end if;
  execute replacement_definition;
end
$patch_campaign_lab_runtime_head$;
