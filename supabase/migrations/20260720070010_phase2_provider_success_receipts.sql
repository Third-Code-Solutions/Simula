-- Persist a narrow, immutable successful-result receipt for the deterministic
-- Phase 2 provider. This is not a future billable provider-attempt ledger.

set role postgres;
alter table private.run_attempts
  add constraint run_attempts_organization_run_id_id_unique
  unique (organization_id, run_id, id);
grant create on schema private to simula_worker_owner;

create table private.provider_success_receipts (
  organization_id uuid not null,
  run_id uuid primary key,
  attempt_id uuid not null unique,
  request_id uuid not null,
  receipt_version smallint not null,
  receipt_kind text not null,
  provider_id text not null,
  provider_version smallint not null,
  model_id text not null,
  template_id text not null,
  response_schema_version smallint not null,
  finish_status text not null,
  input_tokens bigint not null,
  output_tokens bigint not null,
  cost_microusd bigint not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  safe_error_class text,
  artifact_sha256 text not null,
  receipt_sha256 text not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint provider_success_receipts_run_foreign_key
    foreign key (organization_id, run_id)
    references api.simulation_runs (organization_id, id)
    on delete cascade,
  constraint provider_success_receipts_attempt_foreign_key
    foreign key (organization_id, run_id, attempt_id)
    references private.run_attempts (organization_id, run_id, id)
    on delete cascade,
  constraint provider_success_receipts_phase2_contract check (
    request_id = attempt_id
    and receipt_version = 1
    and receipt_kind = 'successful_result'
    and provider_id = 'deterministic_mock'
    and provider_version = 1
    and model_id = 'deterministic_fixture_v1'
    and template_id = 'phase2_deterministic_mock_v1'
    and response_schema_version = 1
    and finish_status = 'completed'
    and input_tokens = 0
    and output_tokens = 0
    and cost_microusd = 0
    and safe_error_class is null
    and ended_at >= started_at
    and ended_at <= started_at + interval '30 seconds'
    and artifact_sha256 ~ '^[0-9a-f]{64}$'
    and receipt_sha256 ~ '^[0-9a-f]{64}$'
  )
);

alter table private.provider_success_receipts owner to simula_worker_owner;
set role simula_worker_owner;

alter table private.provider_success_receipts enable row level security;
alter table private.provider_success_receipts force row level security;

create policy provider_success_receipts_worker_owner_select
on private.provider_success_receipts
for select
to simula_worker_owner
using (true);

create policy provider_success_receipts_worker_owner_insert
on private.provider_success_receipts
for insert
to simula_worker_owner
with check (true);

create policy provider_success_receipts_command_owner_select
on private.provider_success_receipts
for select
to simula_command_owner
using (true);

grant select on table private.provider_success_receipts to simula_command_owner;

create function private.phase2_provider_success_receipt_is_valid(
  requested_receipt jsonb,
  requested_run_id uuid,
  requested_attempt_id uuid,
  requested_artifact jsonb
)
returns boolean
language plpgsql
stable
set search_path = ''
as $function$
declare
  receipt_started_at timestamptz;
  receipt_ended_at timestamptz;
begin
  if requested_receipt is null
    or pg_catalog.jsonb_typeof(requested_receipt) <> 'object'
    or pg_catalog.octet_length(requested_receipt::text) > 8192
    or (
      select pg_catalog.array_agg(keys.key order by keys.key)
      from pg_catalog.jsonb_object_keys(requested_receipt) as keys(key)
    ) <> array[
      'attempt_id', 'ended_at', 'finish_status', 'model_id', 'provider_id',
      'provider_version', 'receipt_kind', 'request_id', 'response_schema_version',
      'run_id', 'safe_error_class', 'schema_version', 'started_at', 'template_id',
      'usage'
    ]::text[]
    or requested_receipt -> 'schema_version' <> '1'::jsonb
    or requested_receipt ->> 'receipt_kind' <> 'successful_result'
    or requested_receipt ->> 'request_id' <> requested_attempt_id::text
    or requested_receipt ->> 'attempt_id' <> requested_attempt_id::text
    or requested_receipt ->> 'run_id' <> requested_run_id::text
    or requested_receipt ->> 'provider_id' <> 'deterministic_mock'
    or requested_receipt -> 'provider_version' <> '1'::jsonb
    or requested_receipt ->> 'model_id' <> 'deterministic_fixture_v1'
    or requested_receipt ->> 'template_id' <> 'phase2_deterministic_mock_v1'
    or requested_receipt -> 'response_schema_version' <> '1'::jsonb
    or requested_receipt ->> 'finish_status' <> 'completed'
    or requested_receipt -> 'safe_error_class' <> 'null'::jsonb
    or pg_catalog.jsonb_typeof(requested_receipt -> 'usage') <> 'object'
    or (
      select pg_catalog.array_agg(keys.key order by keys.key)
      from pg_catalog.jsonb_object_keys(requested_receipt -> 'usage') as keys(key)
    ) <> array['cost_microusd', 'input_tokens', 'output_tokens']::text[]
    or requested_receipt #> '{usage,input_tokens}' <> '0'::jsonb
    or requested_receipt #> '{usage,output_tokens}' <> '0'::jsonb
    or requested_receipt #> '{usage,cost_microusd}' <> '0'::jsonb
    or requested_receipt ->> 'provider_id'
      <> requested_artifact #>> '{provenance,provider_id}'
    or requested_receipt -> 'provider_version'
      <> requested_artifact #> '{provenance,provider_version}'
    or requested_receipt -> 'response_schema_version'
      <> requested_artifact #> '{provenance,output_schema_version}'
    or requested_receipt ->> 'started_at'
      !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
    or requested_receipt ->> 'ended_at'
      !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
  then
    return false;
  end if;

  receipt_started_at := (requested_receipt ->> 'started_at')::timestamptz;
  receipt_ended_at := (requested_receipt ->> 'ended_at')::timestamptz;
  return receipt_ended_at >= receipt_started_at
    and receipt_ended_at <= receipt_started_at + interval '30 seconds';
exception
  when others then
    return false;
end
$function$;

set role postgres;
grant create on schema private to simula_command_owner;
set role simula_command_owner;

create function private.provider_success_receipt_for_run(requested_run_id uuid)
returns table (
  receipt_version smallint,
  receipt_kind text,
  provider_id text,
  provider_version smallint,
  model_id text,
  template_id text,
  response_schema_version smallint,
  finish_status text,
  input_tokens bigint,
  output_tokens bigint,
  cost_microusd bigint,
  started_at timestamptz,
  ended_at timestamptz,
  safe_error_class text
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  if session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  return query
  select
    receipts.receipt_version,
    receipts.receipt_kind,
    receipts.provider_id,
    receipts.provider_version,
    receipts.model_id,
    receipts.template_id,
    receipts.response_schema_version,
    receipts.finish_status,
    receipts.input_tokens,
    receipts.output_tokens,
    receipts.cost_microusd,
    receipts.started_at,
    receipts.ended_at,
    receipts.safe_error_class
  from private.provider_success_receipts as receipts
  where receipts.run_id = requested_run_id
    and private.is_org_member(
      receipts.organization_id,
      private.verified_subject()
    );
end
$function$;

revoke all on function private.provider_success_receipt_for_run(uuid)
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
grant execute on function private.provider_success_receipt_for_run(uuid) to simula_api;
set role postgres;
revoke create on schema private from simula_command_owner;
set role simula_worker_owner;

create function private.complete_run_execution(
  requested_run_id uuid,
  requested_attempt_id uuid,
  requested_lease_token uuid,
  requested_artifact jsonb,
  requested_receipt jsonb
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
  receipt_sha256 text;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  select * into selected_run from api.simulation_runs
  where id = requested_run_id for update;
  if not found
    or selected_run.worker_lease_token <> requested_lease_token
    or selected_run.worker_lease_expires_at is null
    or selected_run.worker_lease_expires_at <= pg_catalog.statement_timestamp() then
    return false;
  end if;
  select * into selected_attempt from private.run_attempts
  where id = requested_attempt_id and run_id = requested_run_id for update;
  if not found or selected_attempt.status <> 'running'
    or selected_attempt.lease_token <> requested_lease_token
    or selected_attempt.lease_expires_at is null
    or selected_attempt.lease_expires_at <= pg_catalog.statement_timestamp() then
    return false;
  end if;

  if selected_run.state = 'cancel_requested' then
    update private.run_attempts
    set status = 'canceled',
        finished_at = pg_catalog.statement_timestamp(),
        safe_error_code = 'canceled_by_user'
    where id = selected_attempt.id;
    update private.run_outbox
    set status = 'terminal',
        claim_token = null,
        claim_expires_at = null,
        confirmed_at = null,
        terminal_error_code = 'canceled',
        updated_at = pg_catalog.statement_timestamp()
    where run_id = selected_run.id
      and status <> 'terminal';
    update api.simulation_runs
    set state = 'canceled',
        worker_lease_token = null,
        worker_lease_expires_at = null,
        terminal_at = pg_catalog.statement_timestamp(),
        updated_at = pg_catalog.statement_timestamp(),
        version = version + 1
    where id = selected_run.id;
    insert into private.run_events (
      organization_id, run_id, previous_state, new_state, attempt_number,
      safe_reason, actor_type, correlation_id
    ) values (
      selected_run.organization_id, selected_run.id, 'cancel_requested',
      'canceled', selected_attempt.attempt_number, 'canceled_by_user',
      'worker', selected_run.correlation_id
    );
    insert into private.audit_events (
      organization_id, actor_type, action, object_type, object_id,
      correlation_id, outcome, source_service, metadata
    ) values (
      selected_run.organization_id, 'worker', 'run.canceled', 'simulation_run',
      selected_run.id, selected_run.correlation_id, 'success', 'worker',
      pg_catalog.jsonb_build_object('reason', 'canceled_by_user')
    );
    return true;
  end if;

  if selected_run.state <> 'running'
    or requested_artifact is null
    or pg_catalog.jsonb_typeof(requested_artifact) <> 'object'
    or pg_catalog.octet_length(requested_artifact::text) > 131072
    or not private.phase2_result_artifact_is_valid(
      requested_artifact,
      requested_run_id,
      selected_run.frozen_manifest_sha256,
      selected_run.deterministic_seed
    )
    or not private.phase2_provider_success_receipt_is_valid(
      requested_receipt,
      requested_run_id,
      requested_attempt_id,
      requested_artifact
    ) then
    raise exception using errcode = '22023', message = 'invalid_result_contract';
  end if;
  perform 1 from api.simulation_results where run_id = requested_run_id;
  if found then
    return false;
  end if;
  artifact_sha256 := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(requested_artifact::text, 'UTF8'), 'sha256'),
    'hex'
  );
  receipt_sha256 := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'organization_id', selected_run.organization_id,
          'run_id', selected_run.id,
          'attempt_id', selected_attempt.id,
          'request_id', requested_receipt ->> 'request_id',
          'receipt_version', 1,
          'receipt_kind', 'successful_result',
          'provider_id', 'deterministic_mock',
          'provider_version', 1,
          'model_id', 'deterministic_fixture_v1',
          'template_id', 'phase2_deterministic_mock_v1',
          'response_schema_version', 1,
          'finish_status', 'completed',
          'input_tokens', 0,
          'output_tokens', 0,
          'cost_microusd', 0,
          'started_at', requested_receipt ->> 'started_at',
          'ended_at', requested_receipt ->> 'ended_at',
          'safe_error_class', null,
          'artifact_sha256', artifact_sha256
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  insert into api.simulation_results (
    organization_id, run_id, schema_version, artifact, artifact_sha256
  ) values (
    selected_run.organization_id, selected_run.id, 1, requested_artifact, artifact_sha256
  );
  insert into private.provider_success_receipts (
    organization_id, run_id, attempt_id, request_id, receipt_version, receipt_kind,
    provider_id, provider_version, model_id, template_id, response_schema_version,
    finish_status, input_tokens, output_tokens, cost_microusd, started_at, ended_at,
    safe_error_class, artifact_sha256, receipt_sha256
  ) values (
    selected_run.organization_id, selected_run.id, selected_attempt.id,
    (requested_receipt ->> 'request_id')::uuid, 1, 'successful_result',
    'deterministic_mock', 1, 'deterministic_fixture_v1',
    'phase2_deterministic_mock_v1', 1, 'completed', 0, 0, 0,
    (requested_receipt ->> 'started_at')::timestamptz,
    (requested_receipt ->> 'ended_at')::timestamptz,
    null, artifact_sha256, receipt_sha256
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
    pg_catalog.jsonb_build_object(
      'artifact_sha256', artifact_sha256,
      'provider_receipt_sha256', receipt_sha256
    )
  );
  return true;
end
$function$;

revoke all on table private.provider_success_receipts
from public, anon, authenticated, simula_api, simula_worker, postgres;
revoke all on function private.phase2_provider_success_receipt_is_valid(jsonb, uuid, uuid, jsonb)
from public, anon, authenticated, simula_api, simula_worker, simula_command_owner, postgres;
revoke all on function private.complete_run_execution(uuid, uuid, uuid, jsonb, jsonb)
from public, anon, authenticated, simula_api, simula_worker, simula_command_owner, postgres;
grant execute on function private.complete_run_execution(uuid, uuid, uuid, jsonb, jsonb)
to simula_worker;
revoke all on function private.complete_run_execution(uuid, uuid, uuid, jsonb)
from public, anon, authenticated, simula_api, simula_worker, simula_command_owner, postgres;

do $patch_runtime_migration$
declare
  original_definition text;
  replacement_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'private.runtime_observability_snapshot()'::pg_catalog.regprocedure
  ) into original_definition;
  replacement_definition := pg_catalog.replace(
    original_definition,
    '20260720063411::bigint',
    '20260720070010::bigint'
  );
  if replacement_definition = original_definition then
    raise exception using
      errcode = '55000',
      message = 'runtime_observability_provider_receipt_migration_patch_failed';
  end if;
  execute replacement_definition;
end
$patch_runtime_migration$;

set role postgres;
revoke create on schema private from simula_worker_owner;
