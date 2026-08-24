-- Report artifacts are privileged scientific outputs. Viewers may read tenant
-- reports but must never mint or relabel one through the database command.

set role postgres;
grant create on schema api, private to simula_command_owner;
set role simula_command_owner;

create or replace function private.create_report_artifact_atomic(
  requested_run_id uuid,
  requested_artifact jsonb,
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
  selected_run api.simulation_runs%rowtype;
  command_record record;
  created_report api.report_artifacts%rowtype;
  artifact_report_id uuid;
  artifact_hash text;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  select * into selected_run from api.simulation_runs
  where id = requested_run_id;
  if not found
    or not private.has_org_role(
      selected_run.organization_id,
      subject,
      array['owner', 'editor']::api.organization_role[]
    ) then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if selected_run.state <> 'succeeded'
    or not exists (
      select 1 from api.simulation_results as results
      where results.run_id = selected_run.id
    ) then
    raise exception using errcode = '55000', message = 'run_result_unavailable';
  end if;
  if requested_artifact is null
    or pg_catalog.jsonb_typeof(requested_artifact) <> 'object'
    or pg_catalog.octet_length(requested_artifact::text) > 1048576
    or requested_artifact ->> 'schema_version' <> '2.0.0'
    or requested_artifact #>> '{identity,run_id}' <> requested_run_id::text
    or requested_artifact #>> '{transparency,validation_label}'
      not in ('experimental', 'benchmarked', 'calibrated')
    or pg_catalog.jsonb_typeof(requested_artifact -> 'overall') <> 'object'
    or pg_catalog.jsonb_typeof(requested_artifact -> 'segments') <> 'array'
    or pg_catalog.jsonb_typeof(requested_artifact -> 'limitations') <> 'array'
    or requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_report_artifact';
  end if;
  begin
    artifact_report_id := (requested_artifact #>> '{identity,report_id}')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'invalid_report_artifact';
  end;
  select * into command_record from private.begin_phase4_command(
    'report.create', selected_run.organization_id,
    requested_idempotency_key, requested_sha256
  );
  if command_record.replayed then
    return command_record.existing_response;
  end if;
  artifact_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(requested_artifact::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  insert into api.report_artifacts (
    id, organization_id, run_id, schema_version, artifact,
    content_sha256, created_by
  ) values (
    artifact_report_id, selected_run.organization_id, selected_run.id, '2.0.0',
    requested_artifact, artifact_hash, subject
  ) returning * into created_report;
  response_payload := pg_catalog.jsonb_build_object(
    'report_id', created_report.id,
    'run_id', created_report.run_id,
    'schema_version', created_report.schema_version,
    'content_sha256', created_report.content_sha256,
    'created_at', created_report.created_at,
    'replayed', false
  );
  perform private.finish_phase4_command(
    command_record.receipt_id, created_report.id, response_payload
  );
  insert into private.audit_events (
    organization_id, actor_type, actor_user_id, action, object_type,
    object_id, correlation_id, outcome, source_service, metadata
  ) values (
    selected_run.organization_id, 'user', subject, 'report.created',
    'report_artifact', created_report.id, requested_correlation_id,
    'success', 'api', pg_catalog.jsonb_build_object(
      'run_id', selected_run.id,
      'content_sha256', created_report.content_sha256
    )
  );
  return response_payload;
end
$function$;

comment on function private.create_report_artifact_atomic(uuid, jsonb, text, text, uuid)
is 'Persists a server-validated report for a succeeded run; only organization owners/editors may invoke it through simula_api.';

reset role;
set role postgres;
revoke create on schema private from simula_command_owner;

-- Report runs created before immutable evidence binding may contain a
-- caller-asserted reviewer or unrelated same-campaign evidence. Preserve the
-- original row privately for recovery/audit, then scrub the member-visible
-- request/result and make the public status explicitly unusable.
create table private.legacy_campaign_lab_report_quarantine (
  run_id uuid primary key references api.campaign_lab_runs (id) on delete cascade,
  organization_id uuid not null,
  campaign_id uuid not null,
  previous_campaign_status text not null,
  previous_campaign_stage text not null,
  previous_campaign_compliance_status text not null,
  previous_status text not null,
  previous_stage text not null,
  previous_progress smallint not null,
  previous_request jsonb not null,
  previous_request_sha256 text not null,
  previous_result jsonb,
  previous_last_error_code text,
  previous_last_error_detail text,
  source_retention_until timestamptz not null,
  quarantined_at timestamptz not null default pg_catalog.statement_timestamp()
);

create index legacy_campaign_lab_report_quarantine_retention_idx
  on private.legacy_campaign_lab_report_quarantine (source_retention_until, run_id);

alter table private.legacy_campaign_lab_report_quarantine enable row level security;
alter table private.legacy_campaign_lab_report_quarantine force row level security;
revoke all on table private.legacy_campaign_lab_report_quarantine
  from public, anon, authenticated, simula_api, simula_worker,
    simula_command_owner, simula_worker_owner;

create function private.quarantine_legacy_campaign_lab_reports()
returns bigint
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  quarantined_count bigint;
begin
  with quarantined as (
    insert into private.legacy_campaign_lab_report_quarantine (
      run_id, organization_id, campaign_id,
      previous_campaign_status, previous_campaign_stage,
      previous_campaign_compliance_status,
      previous_status, previous_stage, previous_progress,
      previous_request, previous_request_sha256, previous_result,
      previous_last_error_code, previous_last_error_detail,
      source_retention_until
    )
    select
      runs.id, runs.organization_id, runs.campaign_id,
      campaigns.status, campaigns.current_stage, campaigns.compliance_status,
      runs.status, runs.stage, runs.progress,
      runs.request, runs.request_sha256, runs.result,
      runs.last_error_code, runs.last_error_detail,
      runs.retention_until
    from api.campaign_lab_runs as runs
    join api.campaign_lab_campaigns as campaigns on campaigns.id = runs.campaign_id
    where runs.run_type = 'report'
    on conflict (run_id) do nothing
    returning run_id, campaign_id
  ), scrubbed as (
    update api.campaign_lab_runs as runs
    set status = 'failed',
        stage = 'failed',
        progress = least(runs.progress, 99),
        request = pg_catalog.jsonb_build_object(
          'quarantined', true,
          'reason', 'legacy_unbound_report'
        ),
        request_sha256 = pg_catalog.encode(
          extensions.digest(
            pg_catalog.convert_to(
              pg_catalog.jsonb_build_object(
                'quarantined', true,
                'reason', 'legacy_unbound_report'
              )::text,
              'UTF8'
            ),
            'sha256'
          ),
          'hex'
        ),
        result = null,
        completed_at = coalesce(runs.completed_at, pg_catalog.statement_timestamp()),
        lease_token = null,
        lease_expires_at = null,
        last_error_code = 'legacy_unbound_report',
        last_error_detail = 'Legacy report lacks immutable evidence binding.'
    where runs.id in (select quarantined.run_id from quarantined)
    returning runs.id
  ), campaigns_reset as (
    update api.campaign_lab_campaigns as campaigns
    set status = 'blocked',
        current_stage = 'compliance_reviewed',
        compliance_status = 'needs_human_review',
        updated_at = pg_catalog.statement_timestamp()
    where campaigns.id in (select quarantined.campaign_id from quarantined)
    returning campaigns.id
  )
  select pg_catalog.count(*) into quarantined_count from scrubbed;
  return quarantined_count;
end
$function$;

revoke all on function private.quarantine_legacy_campaign_lab_reports()
  from public, anon, authenticated, simula_api, simula_worker;

select private.quarantine_legacy_campaign_lab_reports();

-- The HTTP layer admits a six-mebibyte JSON request envelope. JSONB text
-- rendering can add whitespace to dense arrays, so the durable queue keeps
-- two MiB of bounded headroom while HTTP remains the external size boundary.
alter table api.campaign_evidence_runs
  drop constraint campaign_evidence_runs_request_valid,
  add constraint campaign_evidence_runs_request_valid check (
    pg_catalog.jsonb_typeof(request) = 'object'
    and pg_catalog.octet_length(request::text) <= 8388608
  );
alter table private.campaign_evidence_secrets
  drop constraint campaign_evidence_secrets_payload_valid,
  add constraint campaign_evidence_secrets_payload_valid check (
    pg_catalog.jsonb_typeof(payload) = 'object'
    and pg_catalog.octet_length(payload::text) <= 8388608
  );
alter table api.campaign_lab_runs
  drop constraint campaign_lab_runs_request_valid,
  add constraint campaign_lab_runs_request_valid check (
    pg_catalog.jsonb_typeof(request) = 'object'
    and pg_catalog.octet_length(request::text) <= 8388608
  );
alter table private.campaign_lab_secrets
  drop constraint campaign_lab_secrets_payload_valid,
  add constraint campaign_lab_secrets_payload_valid check (
    pg_catalog.jsonb_typeof(payload) = 'object'
    and pg_catalog.octet_length(payload::text) <= 8388608
  );

-- V2 evidence creation cannot prove that caller-supplied survey/outcome bytes
-- are the immutable admitted registry artifact. Retain reads/cancellation but
-- fail closed at the database command even if an API layer is bypassed.
grant create on schema private to simula_command_owner;
set role simula_command_owner;

create or replace function private.create_campaign_evidence_run_atomic(
  requested_organization_id uuid,
  requested_project_id uuid,
  requested_kind text,
  requested_request jsonb,
  requested_secret jsonb,
  requested_source_version_id uuid,
  requested_outcome_set_id uuid,
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
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  raise exception using
    errcode = '55000',
    message = 'campaign_evidence_binding_unavailable';
end
$function$;

-- Version the routed Campaign Lab command instead of rewriting a historical
-- function whose owner differs between local and hosted migration histories.
-- V4 preserves V3 semantics and raises only the request/secret durable bound.
create function private.create_campaign_lab_run_atomic_v4(
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
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  subject uuid;
  existing api.campaign_lab_runs%rowtype;
  created api.campaign_lab_runs%rowtype;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if not exists (
    select 1 from api.campaign_lab_campaigns
    where id = requested_campaign_id
      and organization_id = requested_organization_id
      and status not in ('archived', 'blocked')
  ) then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if not private.has_org_role(
    requested_organization_id, subject,
    array['owner', 'editor']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if requested_run_type not in (
      'repeated_simulation', 'survey_import', 'survey_calibration',
      'historical_backtest', 'aggregate_forecast', 'research_ingestion',
      'interview', 'compliance_review', 'report'
    )
    or requested_request is null
    or pg_catalog.jsonb_typeof(requested_request) <> 'object'
    or pg_catalog.octet_length(requested_request::text) > 8388608
    or requested_idempotency_key is null
    or requested_idempotency_key !~ '^[ -~]{16,128}$'
    or requested_sha256 is null
    or requested_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'invalid_campaign_lab_run';
  end if;
  if requested_run_type = 'repeated_simulation' then
    if not (requested_request ? 'variants')
      or pg_catalog.jsonb_typeof(requested_request -> 'variants') <> 'array'
      or pg_catalog.jsonb_array_length(requested_request -> 'variants') < 2
      or not (requested_request ? 'configuration')
      or pg_catalog.jsonb_typeof(requested_request -> 'configuration') <> 'object'
      or nullif(requested_request -> 'configuration' ->> 'repetitions', '') is null
      or (
        case when (requested_request -> 'configuration' ->> 'repetitions') ~ '^[0-9]+$'
          then (requested_request -> 'configuration' ->> 'repetitions')::integer
          else 0 end
      ) < 3
    then
      raise exception using errcode = '22023', message =
        'campaign_lab_run_requires_variants_and_repetitions';
    end if;
  end if;
  if requested_run_type = 'aggregate_forecast' then
    if requested_secret is null
      or pg_catalog.jsonb_typeof(requested_secret -> 'source') <> 'object'
      or pg_catalog.jsonb_typeof(requested_secret -> 'observations') <> 'array'
      or pg_catalog.jsonb_array_length(requested_secret -> 'observations') < 10
      or pg_catalog.jsonb_typeof(requested_request -> 'targets') <> 'array'
      or pg_catalog.jsonb_array_length(requested_request -> 'targets') < 2
      or requested_request ->> 'model_version' <> 'aggregate_trend_v1'
    then
      raise exception using errcode = '22023', message =
        'aggregate_forecast_requires_admitted_history_and_targets';
    end if;
  end if;
  select * into existing
  from api.campaign_lab_runs
  where organization_id = requested_organization_id
    and idempotency_key = requested_idempotency_key;
  if found then
    if existing.request_sha256 <> requested_sha256 then
      raise exception using errcode = '23505', message = 'idempotency_key_reused';
    end if;
    return pg_catalog.jsonb_build_object(
      'run_id', existing.id, 'campaign_id', existing.campaign_id,
      'status', existing.status, 'stage', existing.stage,
      'progress', existing.progress, 'created_at', existing.created_at,
      'replayed', true
    );
  end if;
  insert into api.campaign_lab_runs (
    organization_id, campaign_id, run_type, request, idempotency_key,
    request_sha256, created_by
  ) values (
    requested_organization_id, requested_campaign_id, requested_run_type,
    requested_request, requested_idempotency_key, requested_sha256, subject
  ) returning * into created;
  if requested_secret is not null then
    if pg_catalog.jsonb_typeof(requested_secret) <> 'object'
      or pg_catalog.octet_length(requested_secret::text) > 8388608
    then
      raise exception using errcode = '22023', message = 'invalid_campaign_lab_secret';
    end if;
    insert into private.campaign_lab_secrets (organization_id, run_id, payload)
    values (created.organization_id, created.id, requested_secret);
  end if;
  update api.campaign_lab_campaigns
  set status = 'running', current_stage = 'simulation_configured',
      updated_at = pg_catalog.statement_timestamp()
  where id = created.campaign_id;
  insert into api.campaign_lab_events (
    organization_id, campaign_id, run_id, stage, progress, event_kind, message
  ) values (
    created.organization_id, created.campaign_id, created.id, created.stage, 0,
    'queued', 'Campaign Lab durable workflow queued for worker execution.'
  );
  insert into private.audit_events (
    organization_id, actor_type, actor_user_id, action, object_type, object_id,
    correlation_id, outcome, source_service, metadata
  ) values (
    created.organization_id, 'user', subject, 'campaign_lab.run_created',
    'campaign_lab_run', created.id, requested_correlation_id, 'success', 'api',
    pg_catalog.jsonb_build_object(
      'campaign_id', created.campaign_id, 'run_type', created.run_type
    )
  );
  return pg_catalog.jsonb_build_object(
    'run_id', created.id, 'campaign_id', created.campaign_id,
    'status', created.status, 'stage', created.stage,
    'progress', created.progress, 'created_at', created.created_at,
    'replayed', false
  );
end
$function$;

create function api.create_campaign_lab_run_v4(
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
  select private.create_campaign_lab_run_atomic_v4(
    requested_organization_id, requested_campaign_id, requested_run_type,
    requested_request, requested_secret, requested_idempotency_key,
    requested_sha256, requested_correlation_id
  );
$function$;

revoke all on function api.create_campaign_lab_run_v4(
  uuid, uuid, text, jsonb, jsonb, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
revoke all on function private.create_campaign_lab_run_atomic_v4(
  uuid, uuid, text, jsonb, jsonb, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function api.create_campaign_lab_run_v4(
  uuid, uuid, text, jsonb, jsonb, text, text, uuid
) to simula_api;
grant execute on function private.create_campaign_lab_run_atomic_v4(
  uuid, uuid, text, jsonb, jsonb, text, text, uuid
) to simula_api;

reset role;

set role postgres;
revoke create on schema api, private from simula_command_owner;

-- Runtime admission compares the deployed schema to the exact repository
-- migration head. Preserve each function's established owner while replacing
-- only the previous immutable head literal.
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
    if original_definition like '%20260824010000::bigint%' then
      continue;
    end if;
    replacement_definition := pg_catalog.replace(
      original_definition,
      '20260815100000::bigint',
      '20260824010000::bigint'
    );
    if replacement_definition = original_definition then
      raise exception using errcode = '55000',
        message = 'simula_runtime_migration_head_patch_failed';
    end if;
    execute replacement_definition;
  end loop;
end
$patch_legacy_simula_migration_head$;

reset role;
set role postgres;
revoke create on schema private from simula_worker_owner;

-- Keep the hosted migration-history writer on its expected role for subsequent
-- additive migrations.
set role postgres;
