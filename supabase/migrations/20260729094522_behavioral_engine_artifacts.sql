-- Durable, lease-bound persistence for the governed behavioral engine.
-- This is deliberately separate from the 128 KiB Phase 2 demonstration result.

set role postgres;

grant create on schema private to simula_worker_owner;

create table api.behavioral_run_results (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  run_id uuid not null,
  study_id uuid not null,
  variant_key text not null,
  schema_version smallint not null,
  methodology_version text not null,
  validation_label text not null,
  provider_id text not null,
  provider_version text not null,
  model_id text not null,
  template_id text not null,
  provider_calls integer not null,
  input_tokens bigint not null,
  output_tokens bigint not null,
  cost_microusd bigint not null,
  context_graph_sha256 text not null,
  agent_fleet_sha256 text not null,
  input_sha256 text not null,
  stimulus_sha256 text not null,
  output_sha256 text not null,
  artifact_sha256 text not null,
  artifact_size_bytes integer not null,
  report jsonb not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint behavioral_run_results_organization_id_id_unique
    unique (organization_id, id),
  constraint behavioral_run_results_organization_run_unique
    unique (organization_id, run_id),
  constraint behavioral_run_results_run_unique unique (run_id),
  constraint behavioral_run_results_run_foreign_key
    foreign key (organization_id, run_id)
    references api.simulation_runs (organization_id, id)
    on delete cascade,
  constraint behavioral_run_results_contract check (
    schema_version = 1
    and variant_key ~ '^[a-z][a-z0-9_]{0,63}$'
    and methodology_version ~ '^[a-z][a-z0-9_]{0,63}$'
    and validation_label = 'experimental'
    and provider_id = 'deterministic_tiered'
    and provider_version = '1'
    and model_id = 'deterministic_behavior_fixture_v1'
    and template_id = 'behavioral_action_v1'
    and provider_calls between 1 and 10000
    and input_tokens = 0
    and output_tokens = 0
    and cost_microusd = 0
    and context_graph_sha256 ~ '^[0-9a-f]{64}$'
    and agent_fleet_sha256 ~ '^[0-9a-f]{64}$'
    and input_sha256 ~ '^[0-9a-f]{64}$'
    and stimulus_sha256 ~ '^[0-9a-f]{64}$'
    and output_sha256 ~ '^[0-9a-f]{64}$'
    and artifact_sha256 ~ '^[0-9a-f]{64}$'
    and artifact_size_bytes between 1 and 16000000
    and pg_catalog.jsonb_typeof(report) = 'object'
    and report ? 'validation_label'
    and report ->> 'validation_label' = 'experimental'
    and pg_catalog.octet_length(report::text) <= 524288
  )
);

create index behavioral_run_results_organization_created_idx
  on api.behavioral_run_results (organization_id, created_at desc, id);

create table private.behavioral_result_payloads (
  organization_id uuid not null,
  run_id uuid primary key,
  canonical_artifact bytea not null,
  artifact_sha256 text not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint behavioral_result_payloads_result_foreign_key
    foreign key (organization_id, run_id)
    references api.behavioral_run_results (organization_id, run_id)
    on delete cascade,
  constraint behavioral_result_payloads_contract check (
    pg_catalog.octet_length(canonical_artifact) between 1 and 16000000
    and artifact_sha256 ~ '^[0-9a-f]{64}$'
  )
);

create table private.behavioral_provider_receipts (
  organization_id uuid not null,
  run_id uuid primary key,
  attempt_id uuid not null unique,
  request_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  provider_id text not null,
  provider_version text not null,
  model_id text not null,
  template_id text not null,
  provider_calls integer not null,
  input_tokens bigint not null,
  output_tokens bigint not null,
  cost_microusd bigint not null,
  artifact_sha256 text not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint behavioral_provider_receipts_run_foreign_key
    foreign key (organization_id, run_id)
    references api.behavioral_run_results (organization_id, run_id)
    on delete cascade,
  constraint behavioral_provider_receipts_attempt_foreign_key
    foreign key (organization_id, run_id, attempt_id)
    references private.run_attempts (organization_id, run_id, id)
    on delete cascade,
  constraint behavioral_provider_receipts_contract check (
    request_id = attempt_id
    and provider_id = 'deterministic_tiered'
    and provider_version = '1'
    and model_id = 'deterministic_behavior_fixture_v1'
    and template_id = 'behavioral_action_v1'
    and provider_calls between 1 and 10000
    and input_tokens = 0
    and output_tokens = 0
    and cost_microusd = 0
    and artifact_sha256 ~ '^[0-9a-f]{64}$'
    and ended_at >= started_at
    and ended_at <= started_at + interval '300 seconds'
  )
);

alter table api.behavioral_run_results owner to simula_worker_owner;
alter table private.behavioral_result_payloads owner to simula_worker_owner;
alter table private.behavioral_provider_receipts owner to simula_worker_owner;

set role simula_worker_owner;

alter table api.behavioral_run_results enable row level security;
alter table api.behavioral_run_results force row level security;
alter table private.behavioral_result_payloads enable row level security;
alter table private.behavioral_result_payloads force row level security;
alter table private.behavioral_provider_receipts enable row level security;
alter table private.behavioral_provider_receipts force row level security;

create policy behavioral_run_results_api_select
on api.behavioral_run_results
for select
to simula_api
using (
  private.is_org_member(
    behavioral_run_results.organization_id,
    private.verified_subject()
  )
);

create policy behavioral_run_results_command_select
on api.behavioral_run_results
for select
to simula_command_owner
using (
  private.is_org_member(
    behavioral_run_results.organization_id,
    private.verified_subject()
  )
);

create policy behavioral_run_results_worker_owner_select
on api.behavioral_run_results
for select
to simula_worker_owner
using (true);

create policy behavioral_run_results_worker_owner_insert
on api.behavioral_run_results
for insert
to simula_worker_owner
with check (true);

create policy behavioral_result_payloads_worker_owner_select
on private.behavioral_result_payloads
for select
to simula_worker_owner
using (true);

create policy behavioral_result_payloads_worker_owner_insert
on private.behavioral_result_payloads
for insert
to simula_worker_owner
with check (true);

create policy behavioral_provider_receipts_worker_owner_select
on private.behavioral_provider_receipts
for select
to simula_worker_owner
using (true);

create policy behavioral_provider_receipts_worker_owner_insert
on private.behavioral_provider_receipts
for insert
to simula_worker_owner
with check (true);

grant select on table api.behavioral_run_results to simula_api, simula_command_owner;

create function private.behavioral_result_artifact_is_valid(
  requested_artifact bytea,
  requested_run_id uuid,
  requested_organization_id uuid,
  requested_manifest jsonb,
  requested_seed bigint
)
returns boolean
language plpgsql
stable
set search_path = ''
as $function$
declare
  artifact jsonb;
  configuration jsonb;
  context_graph jsonb;
  fleet jsonb;
  provider jsonb;
  receipt jsonb;
  report jsonb;
  demo_input jsonb;
  round_count integer;
  agent_count integer;
  expected_stimulus_sha256 text;
begin
  if requested_artifact is null
    or pg_catalog.octet_length(requested_artifact) not between 1 and 16000000
    or requested_manifest is null
    or pg_catalog.jsonb_typeof(requested_manifest) <> 'object'
    or (
      select pg_catalog.array_agg(keys.key order by keys.key)
      from pg_catalog.jsonb_object_keys(requested_manifest) as keys(key)
    ) <> array['behavioral_demo_input', 'code', 'contract']::text[]
    or requested_manifest ->> 'contract'
      is distinct from 'behavioral_demo_run_v1'
    or pg_catalog.jsonb_typeof(requested_manifest -> 'code') <> 'object'
    or (
      select pg_catalog.array_agg(keys.key order by keys.key)
      from pg_catalog.jsonb_object_keys(requested_manifest -> 'code') as keys(key)
    ) <> array['release_sha']::text[]
    or not coalesce(
      requested_manifest #>> '{code,release_sha}' ~ '^[0-9a-f]{40}$',
      false
    )
    or pg_catalog.jsonb_typeof(requested_manifest -> 'behavioral_demo_input')
      <> 'object'
    or (
      select pg_catalog.array_agg(keys.key order by keys.key)
      from pg_catalog.jsonb_object_keys(
        requested_manifest -> 'behavioral_demo_input'
      ) as keys(key)
    ) <> array[
      'organization_id', 'run_id', 'study_id', 'stimulus', 'variant_key'
    ]::text[]
  then
    return false;
  end if;

  artifact := pg_catalog.convert_from(requested_artifact, 'UTF8')::jsonb;
  if pg_catalog.jsonb_typeof(artifact) <> 'object'
    or (
      select pg_catalog.array_agg(keys.key order by keys.key)
      from pg_catalog.jsonb_object_keys(artifact) as keys(key)
    ) <> array[
      'configuration', 'context_graph', 'fleet', 'memory', 'receipt', 'report',
      'rounds', 'run_id', 'schema_version', 'study_id', 'variant_key'
    ]::text[]
    or artifact -> 'schema_version' is distinct from '1'::jsonb
    or artifact ->> 'run_id' is distinct from requested_run_id::text
    or artifact ->> 'run_id'
      is distinct from requested_manifest #>> '{behavioral_demo_input,run_id}'
    or artifact ->> 'study_id'
      is distinct from requested_manifest #>> '{behavioral_demo_input,study_id}'
    or artifact ->> 'variant_key'
      is distinct from requested_manifest #>> '{behavioral_demo_input,variant_key}'
  then
    return false;
  end if;

  configuration := artifact -> 'configuration';
  context_graph := artifact -> 'context_graph';
  fleet := artifact -> 'fleet';
  provider := artifact #> '{receipt,provider}';
  receipt := artifact -> 'receipt';
  report := artifact -> 'report';
  demo_input := requested_manifest -> 'behavioral_demo_input';

  if pg_catalog.jsonb_typeof(configuration) <> 'object'
    or pg_catalog.jsonb_typeof(context_graph) <> 'object'
    or pg_catalog.jsonb_typeof(fleet) <> 'object'
    or pg_catalog.jsonb_typeof(artifact -> 'rounds') <> 'array'
    or pg_catalog.jsonb_typeof(artifact -> 'memory') <> 'array'
    or pg_catalog.jsonb_typeof(receipt) <> 'object'
    or pg_catalog.jsonb_typeof(provider) <> 'object'
    or pg_catalog.jsonb_typeof(report) <> 'object'
    or pg_catalog.octet_length(report::text) > 524288
  then
    return false;
  end if;

  round_count := (configuration ->> 'round_count')::integer;
  agent_count := pg_catalog.jsonb_array_length(fleet -> 'agents');
  expected_stimulus_sha256 := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.to_jsonb(demo_input ->> 'stimulus')::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  return coalesce(
    demo_input ->> 'organization_id' = requested_organization_id::text
      and context_graph ->> 'organization_id'
        = requested_organization_id::text
      and context_graph ->> 'graph_id'
        = '00000000-0000-4000-8000-000000000002'
      and context_graph -> 'version' = '1'::jsonb
      and fleet ->> 'study_id' = demo_input ->> 'study_id'
      and configuration ->> 'methodology_version'
        = 'behavioral_engine_v1'
      and configuration -> 'round_count' = '1'::jsonb
      and configuration -> 'maximum_memory_entries_per_agent' = '1'::jsonb
      and configuration -> 'maximum_provider_calls' = '10'::jsonb
      and configuration -> 'cost_ceiling_microusd' = '0'::jsonb
      and configuration -> 'deadline_seconds' = '30.0'::jsonb
      and configuration -> 'seed' = '17'::jsonb
      and (configuration ->> 'seed')::bigint = requested_seed
      and receipt ->> 'seed' = configuration ->> 'seed'
      and receipt ->> 'methodology_version'
        = configuration ->> 'methodology_version'
      and receipt ->> 'context_graph_checksum_sha256'
        = context_graph ->> 'checksum_sha256'
      and receipt ->> 'agent_fleet_checksum_sha256'
        = fleet ->> 'checksum_sha256'
      and receipt ->> 'input_sha256' ~ '^[0-9a-f]{64}$'
      and receipt ->> 'stimulus_sha256' ~ '^[0-9a-f]{64}$'
      and receipt ->> 'stimulus_sha256' = expected_stimulus_sha256
      and receipt ->> 'output_sha256' ~ '^[0-9a-f]{64}$'
      and receipt ->> 'provider_calls' ~ '^[0-9]+$'
      and (receipt ->> 'provider_calls')::integer = agent_count * round_count
      and pg_catalog.jsonb_array_length(artifact -> 'rounds') = round_count
      and pg_catalog.jsonb_array_length(artifact -> 'memory') = agent_count
      and provider ->> 'provider_id' = 'deterministic_tiered'
      and provider ->> 'provider_version' = '1'
      and provider ->> 'model_id' = 'deterministic_behavior_fixture_v1'
      and provider ->> 'template_id' = 'behavioral_action_v1'
      and provider -> 'supported_tiers' = '["llm", "rule"]'::jsonb
      and receipt #>> '{usage,input_tokens}' = '0'
      and receipt #>> '{usage,output_tokens}' = '0'
      and receipt #>> '{usage,cost_microusd}' = '0'
      and report ->> 'validation_label' = 'experimental',
    false
  );
exception
  when others then
    return false;
end
$function$;

create function private.complete_behavioral_run_execution(
  requested_run_id uuid,
  requested_attempt_id uuid,
  requested_lease_token uuid,
  requested_artifact bytea,
  requested_execution_receipt jsonb
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
  artifact jsonb;
  artifact_sha256 text;
  provider jsonb;
  receipt jsonb;
  report jsonb;
  receipt_started_at timestamptz;
  receipt_ended_at timestamptz;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  select * into selected_run
  from api.simulation_runs
  where id = requested_run_id
  for update;

  if not found
    or selected_run.worker_lease_token <> requested_lease_token
    or selected_run.worker_lease_expires_at is null
    or selected_run.worker_lease_expires_at
      <= pg_catalog.statement_timestamp()
  then
    return false;
  end if;

  select * into selected_attempt
  from private.run_attempts
  where id = requested_attempt_id
    and run_id = requested_run_id
  for update;

  if not found
    or selected_attempt.status <> 'running'
    or selected_attempt.lease_token <> requested_lease_token
    or selected_attempt.lease_expires_at is null
    or selected_attempt.lease_expires_at
      <= pg_catalog.statement_timestamp()
  then
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
    or selected_run.schema_version <> 2
    or not private.behavioral_result_artifact_is_valid(
      requested_artifact,
      requested_run_id,
      selected_run.organization_id,
      selected_run.frozen_manifest,
      selected_run.deterministic_seed
    )
    or requested_execution_receipt is null
    or pg_catalog.jsonb_typeof(requested_execution_receipt) <> 'object'
    or pg_catalog.octet_length(requested_execution_receipt::text) > 8192
    or (
      select pg_catalog.array_agg(keys.key order by keys.key)
      from pg_catalog.jsonb_object_keys(requested_execution_receipt) as keys(key)
    ) <> array[
      'artifact_sha256', 'attempt_id', 'ended_at', 'receipt_kind',
      'request_id', 'run_id', 'schema_version', 'started_at'
    ]::text[]
    or requested_execution_receipt -> 'schema_version'
      is distinct from '1'::jsonb
    or requested_execution_receipt ->> 'receipt_kind'
      is distinct from 'behavioral_success'
    or requested_execution_receipt ->> 'request_id'
      is distinct from requested_attempt_id::text
    or requested_execution_receipt ->> 'attempt_id'
      is distinct from requested_attempt_id::text
    or requested_execution_receipt ->> 'run_id'
      is distinct from requested_run_id::text
    or not coalesce(
      requested_execution_receipt ->> 'artifact_sha256'
        ~ '^[0-9a-f]{64}$',
      false
    )
    or not coalesce(
      requested_execution_receipt ->> 'started_at'
        ~ '(Z|[+-][0-9]{2}:[0-9]{2})$',
      false
    )
    or not coalesce(
      requested_execution_receipt ->> 'ended_at'
        ~ '(Z|[+-][0-9]{2}:[0-9]{2})$',
      false
    )
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_behavioral_result_contract';
  end if;

  perform 1
  from api.behavioral_run_results
  where run_id = requested_run_id;
  if found then
    return false;
  end if;

  artifact_sha256 := pg_catalog.encode(
    extensions.digest(requested_artifact, 'sha256'),
    'hex'
  );
  if artifact_sha256
    is distinct from requested_execution_receipt ->> 'artifact_sha256'
  then
    raise exception using
      errcode = '22023',
      message = 'behavioral_result_checksum_mismatch';
  end if;

  receipt_started_at :=
    (requested_execution_receipt ->> 'started_at')::timestamptz;
  receipt_ended_at :=
    (requested_execution_receipt ->> 'ended_at')::timestamptz;
  if receipt_ended_at < receipt_started_at
    or receipt_ended_at > receipt_started_at + interval '300 seconds'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_behavioral_execution_window';
  end if;

  artifact := pg_catalog.convert_from(requested_artifact, 'UTF8')::jsonb;
  provider := artifact #> '{receipt,provider}';
  receipt := artifact -> 'receipt';
  report := artifact -> 'report';

  insert into api.behavioral_run_results (
    organization_id, run_id, study_id, variant_key, schema_version,
    methodology_version, validation_label, provider_id, provider_version,
    model_id, template_id, provider_calls, input_tokens, output_tokens,
    cost_microusd, context_graph_sha256, agent_fleet_sha256, input_sha256,
    stimulus_sha256, output_sha256, artifact_sha256, artifact_size_bytes,
    report
  ) values (
    selected_run.organization_id,
    selected_run.id,
    (artifact ->> 'study_id')::uuid,
    artifact ->> 'variant_key',
    1,
    receipt ->> 'methodology_version',
    report ->> 'validation_label',
    provider ->> 'provider_id',
    provider ->> 'provider_version',
    provider ->> 'model_id',
    provider ->> 'template_id',
    (receipt ->> 'provider_calls')::integer,
    (receipt #>> '{usage,input_tokens}')::bigint,
    (receipt #>> '{usage,output_tokens}')::bigint,
    (receipt #>> '{usage,cost_microusd}')::bigint,
    receipt ->> 'context_graph_checksum_sha256',
    receipt ->> 'agent_fleet_checksum_sha256',
    receipt ->> 'input_sha256',
    receipt ->> 'stimulus_sha256',
    receipt ->> 'output_sha256',
    artifact_sha256,
    pg_catalog.octet_length(requested_artifact),
    report
  );

  insert into private.behavioral_result_payloads (
    organization_id, run_id, canonical_artifact, artifact_sha256
  ) values (
    selected_run.organization_id, selected_run.id, requested_artifact,
    artifact_sha256
  );

  insert into private.behavioral_provider_receipts (
    organization_id, run_id, attempt_id, request_id, started_at, ended_at,
    provider_id, provider_version, model_id, template_id, provider_calls,
    input_tokens, output_tokens, cost_microusd, artifact_sha256
  ) values (
    selected_run.organization_id, selected_run.id, selected_attempt.id,
    (requested_execution_receipt ->> 'request_id')::uuid,
    receipt_started_at, receipt_ended_at,
    provider ->> 'provider_id',
    provider ->> 'provider_version',
    provider ->> 'model_id',
    provider ->> 'template_id',
    (receipt ->> 'provider_calls')::integer,
    (receipt #>> '{usage,input_tokens}')::bigint,
    (receipt #>> '{usage,output_tokens}')::bigint,
    (receipt #>> '{usage,cost_microusd}')::bigint,
    artifact_sha256
  );

  update private.run_attempts
  set status = 'succeeded',
      finished_at = pg_catalog.statement_timestamp()
  where id = selected_attempt.id;

  update api.simulation_runs
  set state = 'succeeded',
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
    selected_run.organization_id, selected_run.id, 'running', 'succeeded',
    selected_attempt.attempt_number, 'behavioral_completed', 'worker',
    selected_run.correlation_id
  );

  insert into private.audit_events (
    organization_id, actor_type, action, object_type, object_id,
    correlation_id, outcome, source_service, metadata
  ) values (
    selected_run.organization_id, 'worker', 'run.completed', 'simulation_run',
    selected_run.id, selected_run.correlation_id, 'success', 'worker',
    pg_catalog.jsonb_build_object(
      'artifact_sha256', artifact_sha256,
      'methodology_version', receipt ->> 'methodology_version',
      'provider_id', provider ->> 'provider_id',
      'validation_label', report ->> 'validation_label'
    )
  );
  return true;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using
      errcode = '22023',
      message = 'invalid_behavioral_result_contract';
end
$function$;

revoke all on table api.behavioral_run_results
from public, anon, authenticated, simula_worker, simula_worker_owner, postgres;
revoke all on table private.behavioral_result_payloads
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, postgres;
revoke all on table private.behavioral_provider_receipts
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, postgres;

grant select on table api.behavioral_run_results
to simula_api, simula_command_owner;

revoke all on function private.behavioral_result_artifact_is_valid(
  bytea, uuid, uuid, jsonb, bigint
)
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, postgres;

revoke all on function private.complete_behavioral_run_execution(
  uuid, uuid, uuid, bytea, jsonb
)
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, postgres;

grant execute on function private.complete_behavioral_run_execution(
  uuid, uuid, uuid, bytea, jsonb
)
to simula_worker;

set role postgres;
revoke create on schema private from simula_worker_owner;
reset role;

-- Public admission for the visibly synthetic, zero-cost behavioral demo only.
set role postgres;
grant create on schema api, private to simula_command_owner;
set role simula_command_owner;

create function private.create_behavioral_demo_run_atomic(
  requested_project_id uuid,
  requested_stimulus_version_id uuid,
  requested_variant_key text,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid,
  requested_traceparent text
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
  created_run_id uuid;
  frozen jsonb;
  frozen_sha256 text;
  response_payload jsonb;
  release_sha text;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  release_sha := nullif(
    pg_catalog.current_setting('simula.release_sha', true),
    ''
  );
  if requested_project_id is null
    or requested_stimulus_version_id is null
    or requested_variant_key is null
    or requested_variant_key !~ '^[a-z][a-z0-9_]{0,63}$'
    or requested_idempotency_key is null
    or requested_idempotency_key !~ '^[ -~]{16,128}$'
    or requested_sha256 is null
    or requested_sha256 !~ '^[0-9a-f]{64}$'
    or requested_correlation_id is null
    or requested_traceparent is null
    or requested_traceparent
      !~ '^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$'
    or pg_catalog.substring(requested_traceparent, 4, 32)
      = pg_catalog.repeat('0', 32)
    or pg_catalog.substring(requested_traceparent, 37, 16)
      = pg_catalog.repeat('0', 16)
    or release_sha is null
    or release_sha !~ '^[0-9a-f]{40}$'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_behavioral_demo_run_request';
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
  join api.stimuli as stimuli
    on stimuli.id = versions.stimulus_id
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
    raise exception using
      errcode = '55000',
      message = 'demo_audience_unavailable';
  end if;

  insert into private.idempotency_keys (
    actor_user_id, scope, idempotency_key, request_sha256, organization_id,
    scope_organization_id, scope_resource_id
  ) values (
    subject, 'run.create', requested_idempotency_key, requested_sha256,
    selected_project.organization_id, selected_project.organization_id,
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
      raise exception using
        errcode = '55000',
        message = 'idempotency_state_incomplete';
    end if;
    if existing_sha256 <> requested_sha256 then
      raise exception using
        errcode = '22000',
        message = 'idempotency_key_reused';
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
    raise exception using
      errcode = '54000',
      message = 'pending_run_quota_exceeded';
  end if;
  if (
    select pg_catalog.count(*)
    from api.simulation_runs as runs
    where runs.organization_id = selected_project.organization_id
  ) >= 100 then
    raise exception using
      errcode = '54000',
      message = 'run_retention_quota_exceeded';
  end if;

  created_run_id := pg_catalog.gen_random_uuid();
  frozen := pg_catalog.jsonb_build_object(
    'behavioral_demo_input', pg_catalog.jsonb_build_object(
      'organization_id', selected_project.organization_id,
      'run_id', created_run_id,
      'study_id', selected_project.id,
      'stimulus', selected_stimulus.content,
      'variant_key', requested_variant_key
    ),
    'code', pg_catalog.jsonb_build_object('release_sha', release_sha),
    'contract', 'behavioral_demo_run_v1'
  );
  frozen_sha256 := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(frozen::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  insert into api.simulation_runs (
    id, organization_id, project_id, stimulus_version_id,
    audience_version_id, frozen_manifest, frozen_manifest_sha256,
    schema_version, deterministic_seed, created_by, correlation_id,
    traceparent
  ) values (
    created_run_id, selected_project.organization_id, selected_project.id,
    selected_stimulus.id, selected_audience.id, frozen, frozen_sha256,
    2, 17, subject, requested_correlation_id, requested_traceparent
  )
  returning * into created_run;

  insert into private.run_events (
    organization_id, run_id, previous_state, new_state, attempt_number,
    safe_reason, actor_type, actor_user_id, correlation_id
  ) values (
    created_run.organization_id, created_run.id, null, 'queued', null,
    'behavioral_demo_created', 'user', subject, requested_correlation_id
  );

  insert into private.run_outbox (
    organization_id, run_id, generation, job_id
  ) values (
    created_run.organization_id, created_run.id, 1,
    'run:' || created_run.id::text || ':dispatch:1'
  );

  response_payload := pg_catalog.jsonb_build_object(
    'audience_version_id', created_run.audience_version_id,
    'created_at', created_run.created_at,
    'dispatch_generation', created_run.dispatch_generation,
    'job_id', 'run-' || created_run.id::text || '-generation-1',
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
    organization_id, actor_type, actor_user_id, action, object_type,
    object_id, correlation_id, outcome, source_service, metadata
  ) values (
    created_run.organization_id, 'user', subject, 'run.created',
    'simulation_run', created_run.id, requested_correlation_id, 'success',
    'api', pg_catalog.jsonb_build_object(
      'execution_contract', 'behavioral_demo_run_v1',
      'idempotency_scope', 'run.create',
      'schema_version', 2,
      'validation_label', 'experimental'
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
    'run-' || created_run.id::text || '-generation-1',
    created_run.version,
    created_run.created_at,
    false;
end
$function$;

create function api.create_behavioral_demo_run(
  requested_project_id uuid,
  requested_stimulus_version_id uuid,
  requested_variant_key text,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid,
  requested_traceparent text
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
  from private.create_behavioral_demo_run_atomic(
    requested_project_id,
    requested_stimulus_version_id,
    requested_variant_key,
    requested_idempotency_key,
    requested_sha256,
    requested_correlation_id,
    requested_traceparent
  )
$function$;

revoke all on function private.create_behavioral_demo_run_atomic(
  uuid, uuid, text, text, text, uuid, text
)
from public, anon, authenticated, simula_worker, simula_worker_owner, postgres;
revoke all on function api.create_behavioral_demo_run(
  uuid, uuid, text, text, text, uuid, text
)
from public, anon, authenticated, simula_worker, simula_worker_owner, postgres;

grant execute on function private.create_behavioral_demo_run_atomic(
  uuid, uuid, text, text, text, uuid, text
)
to simula_api;
grant execute on function api.create_behavioral_demo_run(
  uuid, uuid, text, text, text, uuid, text
)
to simula_api;

set role postgres;
revoke create on schema api, private from simula_command_owner;
reset role;
