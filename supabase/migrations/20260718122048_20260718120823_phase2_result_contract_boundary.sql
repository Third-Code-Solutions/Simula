-- The worker model validates artifacts before calling Postgres, but the
-- database is the durable authority. Reject unknown fields, malformed nested
-- values, and provenance that does not match the leased run.
grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create function private.phase2_result_artifact_is_valid(
  requested_artifact jsonb,
  requested_run_id uuid,
  requested_frozen_manifest_sha256 text,
  requested_deterministic_seed bigint
)
returns boolean
language plpgsql
stable
strict
set search_path = ''
as $function$
declare
  actual_keys text[];
  output jsonb;
  uncertainty jsonb;
  distribution jsonb;
  categories jsonb;
  category jsonb;
  category_value numeric;
  category_total numeric := 0;
  qualitative jsonb;
  recommendation jsonb;
  provenance jsonb;
  limitation text := 'Estimates nobody and is not representative of any population.';
  expected_category_keys text[] := array['clear', 'unclear', 'needs_human_review'];
begin
  if pg_catalog.jsonb_typeof(requested_artifact) <> 'object' then
    return false;
  end if;
  select pg_catalog.array_agg(keys.key order by keys.key)
  into actual_keys
  from pg_catalog.jsonb_object_keys(requested_artifact) as keys(key);
  if actual_keys is distinct from array[
    'limitations', 'outputs', 'provenance', 'qualitative',
    'recommendations', 'run_id', 'schema_version', 'validation_label'
  ]::text[] then
    return false;
  end if;
  if requested_artifact ->> 'schema_version' is distinct from '1.0.0'
    or requested_artifact ->> 'run_id' is distinct from requested_run_id::text
    or requested_artifact ->> 'validation_label' is distinct from 'experimental'
    or requested_artifact -> 'limitations'
      is distinct from pg_catalog.jsonb_build_array(limitation) then
    return false;
  end if;

  if pg_catalog.jsonb_typeof(requested_artifact -> 'outputs') <> 'array'
    or pg_catalog.jsonb_array_length(requested_artifact -> 'outputs') <> 1 then
    return false;
  end if;
  output := requested_artifact #> '{outputs,0}';
  if pg_catalog.jsonb_typeof(output) <> 'object'
    or output ->> 'output_id' is distinct from 'reaction_fixture'
    or output ->> 'label' is distinct from 'Pipeline demo values'
    or output -> 'limitations'
      is distinct from pg_catalog.jsonb_build_array(limitation) then
    return false;
  end if;

  if output ->> 'kind' = 'demo_fixture_distribution' then
    select pg_catalog.array_agg(keys.key order by keys.key)
    into actual_keys
    from pg_catalog.jsonb_object_keys(output) as keys(key);
    if actual_keys is distinct from array[
      'kind', 'label', 'limitations', 'output_id', 'uncertainty', 'value'
    ]::text[] then
      return false;
    end if;

    uncertainty := output -> 'uncertainty';
    if pg_catalog.jsonb_typeof(uncertainty) <> 'object' then
      return false;
    end if;
    select pg_catalog.array_agg(keys.key order by keys.key)
    into actual_keys
    from pg_catalog.jsonb_object_keys(uncertainty) as keys(key);
    if actual_keys is distinct from array['reason', 'status']::text[]
      or uncertainty ->> 'status' is distinct from 'not_applicable'
      or uncertainty ->> 'reason' is distinct from 'authored deterministic fixture' then
      return false;
    end if;

    distribution := output -> 'value';
    if pg_catalog.jsonb_typeof(distribution) <> 'object' then
      return false;
    end if;
    select pg_catalog.array_agg(keys.key order by keys.key)
    into actual_keys
    from pg_catalog.jsonb_object_keys(distribution) as keys(key);
    if actual_keys is distinct from array['categories', 'unit']::text[]
      or distribution ->> 'unit' is distinct from 'share'
      or pg_catalog.jsonb_typeof(distribution -> 'categories') <> 'array'
      or pg_catalog.jsonb_array_length(distribution -> 'categories') <> 3 then
      return false;
    end if;

    categories := distribution -> 'categories';
    for category_index in 0..2 loop
      category := categories -> category_index;
      if pg_catalog.jsonb_typeof(category) <> 'object' then
        return false;
      end if;
      select pg_catalog.array_agg(keys.key order by keys.key)
      into actual_keys
      from pg_catalog.jsonb_object_keys(category) as keys(key);
      if actual_keys is distinct from array['key', 'value']::text[]
        or category ->> 'key'
          is distinct from expected_category_keys[category_index + 1]
        or pg_catalog.jsonb_typeof(category -> 'value') <> 'number' then
        return false;
      end if;
      category_value := (category ->> 'value')::numeric;
      if category_value < 0 or category_value > 1 then
        return false;
      end if;
      category_total := category_total + category_value;
    end loop;
    if category_total <> 1 then
      return false;
    end if;
  elsif output ->> 'kind' = 'unavailable' then
    select pg_catalog.array_agg(keys.key order by keys.key)
    into actual_keys
    from pg_catalog.jsonb_object_keys(output) as keys(key);
    if actual_keys is distinct from array[
      'availability', 'kind', 'label', 'limitations', 'output_id', 'reason'
    ]::text[]
      or output ->> 'availability' not in ('unsupported', 'suppressed')
      or output ->> 'reason'
        is distinct from 'This output is unavailable. SIMULA will not substitute a value.' then
      return false;
    end if;
  else
    return false;
  end if;

  if pg_catalog.jsonb_typeof(requested_artifact -> 'qualitative') <> 'array'
    or pg_catalog.jsonb_array_length(requested_artifact -> 'qualitative') <> 1 then
    return false;
  end if;
  qualitative := requested_artifact #> '{qualitative,0}';
  if pg_catalog.jsonb_typeof(qualitative) <> 'object' then
    return false;
  end if;
  select pg_catalog.array_agg(keys.key order by keys.key)
  into actual_keys
  from pg_catalog.jsonb_object_keys(qualitative) as keys(key);
  if actual_keys is distinct from array[
    'kind', 'source_output_ids', 'synthetic', 'text'
  ]::text[]
    or qualitative ->> 'kind' is distinct from 'generated_qualitative'
    or qualitative -> 'synthetic' is distinct from 'true'::jsonb
    or qualitative ->> 'text'
      is distinct from 'A deterministic mock observation used only to test rendering.'
    or qualitative -> 'source_output_ids'
      is distinct from pg_catalog.jsonb_build_array('reaction_fixture') then
    return false;
  end if;

  if pg_catalog.jsonb_typeof(requested_artifact -> 'recommendations') <> 'array'
    or pg_catalog.jsonb_array_length(requested_artifact -> 'recommendations') <> 1 then
    return false;
  end if;
  recommendation := requested_artifact #> '{recommendations,0}';
  if pg_catalog.jsonb_typeof(recommendation) <> 'object' then
    return false;
  end if;
  select pg_catalog.array_agg(keys.key order by keys.key)
  into actual_keys
  from pg_catalog.jsonb_object_keys(recommendation) as keys(key);
  if actual_keys is distinct from array['kind', 'source_output_ids', 'text']::text[]
    or recommendation ->> 'kind' is distinct from 'recommendation'
    or recommendation ->> 'text'
      is distinct from 'Verify wording with appropriately recruited human participants before acting.'
    or recommendation -> 'source_output_ids'
      is distinct from pg_catalog.jsonb_build_array('reaction_fixture') then
    return false;
  end if;

  provenance := requested_artifact -> 'provenance';
  if pg_catalog.jsonb_typeof(provenance) <> 'object' then
    return false;
  end if;
  select pg_catalog.array_agg(keys.key order by keys.key)
  into actual_keys
  from pg_catalog.jsonb_object_keys(provenance) as keys(key);
  if actual_keys is distinct from array[
    'deterministic_seed', 'frozen_manifest_sha256', 'method_version',
    'output_schema_version', 'provider_id', 'provider_version'
  ]::text[]
    or provenance ->> 'method_version' is distinct from 'phase2_demo_v1'
    or provenance ->> 'provider_id' is distinct from 'deterministic_mock'
    or provenance -> 'provider_version' is distinct from '1'::jsonb
    or provenance -> 'output_schema_version' is distinct from '1'::jsonb
    or provenance ->> 'frozen_manifest_sha256'
      is distinct from requested_frozen_manifest_sha256
    or provenance ->> 'deterministic_seed'
      is distinct from requested_deterministic_seed::text then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end
$function$;

revoke all on function private.phase2_result_artifact_is_valid(jsonb, uuid, text, bigint)
from public, simula_api, simula_worker;

create or replace function private.complete_run_execution(
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

reset role;
revoke create on schema private from simula_worker_owner;
