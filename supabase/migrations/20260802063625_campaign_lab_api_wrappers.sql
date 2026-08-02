-- Keep the public API contract as security-invoker wrappers. The first
-- Campaign Lab migration created the command implementations in api while
-- bootstrapping the hosted schema; move those implementations behind the
-- existing private owner boundary before exposing the final contract.

set role postgres;
grant create on schema private to simula_command_owner;
set role simula_command_owner;

alter function api.create_campaign_lab_campaign(uuid, uuid, text, text, text, jsonb, text, text, uuid)
  set schema private;
alter function private.create_campaign_lab_campaign(uuid, uuid, text, text, text, jsonb, text, text, uuid)
  rename to create_campaign_lab_campaign_atomic;

alter function api.create_campaign_lab_artifact(uuid, uuid, text, text, jsonb, jsonb, text, jsonb, text, text, uuid)
  set schema private;
alter function private.create_campaign_lab_artifact(uuid, uuid, text, text, jsonb, jsonb, text, jsonb, text, text, uuid)
  rename to create_campaign_lab_artifact_atomic;

alter function api.create_campaign_lab_run(uuid, uuid, text, jsonb, jsonb, text, text, uuid)
  set schema private;
alter function private.create_campaign_lab_run(uuid, uuid, text, jsonb, jsonb, text, text, uuid)
  rename to create_campaign_lab_run_atomic;

alter function api.cancel_campaign_lab_run(uuid, uuid)
  set schema private;
alter function private.cancel_campaign_lab_run(uuid, uuid)
  rename to cancel_campaign_lab_run_atomic;

alter function api.update_campaign_lab_campaign(uuid, integer, text, text, jsonb, uuid)
  set schema private;
alter function private.update_campaign_lab_campaign(uuid, integer, text, text, jsonb, uuid)
  rename to update_campaign_lab_campaign_atomic;

reset role;
set role postgres;

create function api.create_campaign_lab_campaign(
  requested_organization_id uuid,
  requested_project_id uuid,
  requested_name text,
  requested_objective text,
  requested_purpose text,
  requested_decision jsonb,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.create_campaign_lab_campaign_atomic(
    requested_organization_id, requested_project_id, requested_name,
    requested_objective, requested_purpose, requested_decision,
    requested_idempotency_key, requested_sha256, requested_correlation_id
  );
$function$;

create function api.create_campaign_lab_artifact(
  requested_organization_id uuid,
  requested_campaign_id uuid,
  requested_kind text,
  requested_title text,
  requested_payload jsonb,
  requested_provenance jsonb,
  requested_checksum text,
  requested_secret jsonb,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.create_campaign_lab_artifact_atomic(
    requested_organization_id, requested_campaign_id, requested_kind,
    requested_title, requested_payload, requested_provenance,
    requested_checksum, requested_secret, requested_idempotency_key,
    requested_sha256, requested_correlation_id
  );
$function$;

create function api.create_campaign_lab_run(
  requested_organization_id uuid,
  requested_campaign_id uuid,
  requested_run_type text,
  requested_request jsonb,
  requested_secret jsonb,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.create_campaign_lab_run_atomic(
    requested_organization_id, requested_campaign_id, requested_run_type,
    requested_request, requested_secret, requested_idempotency_key,
    requested_sha256, requested_correlation_id
  );
$function$;

create function api.cancel_campaign_lab_run(requested_run_id uuid, requested_correlation_id uuid)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.cancel_campaign_lab_run_atomic(requested_run_id, requested_correlation_id);
$function$;

create function api.update_campaign_lab_campaign(
  requested_campaign_id uuid,
  requested_expected_version integer,
  requested_name text,
  requested_objective text,
  requested_decision jsonb,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.update_campaign_lab_campaign_atomic(
    requested_campaign_id, requested_expected_version, requested_name,
    requested_objective, requested_decision, requested_correlation_id
  );
$function$;

revoke all on function api.create_campaign_lab_campaign(uuid, uuid, text, text, text, jsonb, text, text, uuid)
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function api.create_campaign_lab_campaign(uuid, uuid, text, text, text, jsonb, text, text, uuid)
  to simula_api;
revoke all on function api.create_campaign_lab_artifact(uuid, uuid, text, text, jsonb, jsonb, text, jsonb, text, text, uuid)
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function api.create_campaign_lab_artifact(uuid, uuid, text, text, jsonb, jsonb, text, jsonb, text, text, uuid)
  to simula_api;
revoke all on function api.create_campaign_lab_run(uuid, uuid, text, jsonb, jsonb, text, text, uuid)
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function api.create_campaign_lab_run(uuid, uuid, text, jsonb, jsonb, text, text, uuid)
  to simula_api;
revoke all on function api.cancel_campaign_lab_run(uuid, uuid)
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function api.cancel_campaign_lab_run(uuid, uuid) to simula_api;
revoke all on function api.update_campaign_lab_campaign(uuid, integer, text, text, jsonb, uuid)
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function api.update_campaign_lab_campaign(uuid, integer, text, text, jsonb, uuid)
  to simula_api;

set role simula_command_owner;
revoke all on function private.create_campaign_lab_campaign_atomic(uuid, uuid, text, text, text, jsonb, text, text, uuid)
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function private.create_campaign_lab_campaign_atomic(uuid, uuid, text, text, text, jsonb, text, text, uuid)
  to simula_api;
revoke all on function private.create_campaign_lab_artifact_atomic(uuid, uuid, text, text, jsonb, jsonb, text, jsonb, text, text, uuid)
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function private.create_campaign_lab_artifact_atomic(uuid, uuid, text, text, jsonb, jsonb, text, jsonb, text, text, uuid)
  to simula_api;
revoke all on function private.create_campaign_lab_run_atomic(uuid, uuid, text, jsonb, jsonb, text, text, uuid)
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function private.create_campaign_lab_run_atomic(uuid, uuid, text, jsonb, jsonb, text, text, uuid)
  to simula_api;
revoke all on function private.cancel_campaign_lab_run_atomic(uuid, uuid)
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function private.cancel_campaign_lab_run_atomic(uuid, uuid) to simula_api;
revoke all on function private.update_campaign_lab_campaign_atomic(uuid, integer, text, text, jsonb, uuid)
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function private.update_campaign_lab_campaign_atomic(uuid, integer, text, text, jsonb, uuid)
  to simula_api;

reset role;
set role postgres;
revoke create on schema private from simula_command_owner;
grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

do $patch_campaign_lab_runtime_head$
declare
  original_definition text;
  replacement_definition text;
begin
  select pg_catalog.pg_get_functiondef('private.runtime_schema_readiness()'::pg_catalog.regprocedure)
    into original_definition;
  replacement_definition := pg_catalog.replace(
    original_definition, '20260802060315::bigint', '20260802063625::bigint'
  );
  if replacement_definition = original_definition then
    raise exception using errcode = '55000', message = 'campaign_lab_runtime_schema_head_patch_failed';
  end if;
  execute replacement_definition;

  select pg_catalog.pg_get_functiondef('private.runtime_observability_snapshot()'::pg_catalog.regprocedure)
    into original_definition;
  replacement_definition := pg_catalog.replace(
    original_definition, '20260802060315::bigint', '20260802063625::bigint'
  );
  if replacement_definition = original_definition then
    raise exception using errcode = '55000', message = 'campaign_lab_runtime_observability_head_patch_failed';
  end if;
  execute replacement_definition;
end
$patch_campaign_lab_runtime_head$;

reset role;
set role postgres;
revoke create on schema private from simula_worker_owner;
