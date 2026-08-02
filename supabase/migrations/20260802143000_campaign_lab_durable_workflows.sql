-- Durable Campaign Lab workflows: document ingestion, interviews, compliance,
-- and report generation all run through the leased worker queue.

alter table api.campaign_lab_runs
  drop constraint campaign_lab_runs_type_valid;
alter table api.campaign_lab_runs
  add constraint campaign_lab_runs_type_valid check (
    run_type in (
      'repeated_simulation',
      'survey_calibration',
      'historical_backtest',
      'research_ingestion',
      'interview',
      'compliance_review',
      'report'
    )
  );

create function private.create_campaign_lab_run_atomic_v2(
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
    requested_organization_id, subject, array['owner', 'editor']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if requested_run_type not in (
      'repeated_simulation', 'survey_calibration', 'historical_backtest',
      'research_ingestion', 'interview', 'compliance_review', 'report'
    )
    or requested_request is null
    or pg_catalog.jsonb_typeof(requested_request) <> 'object'
    or pg_catalog.octet_length(requested_request::text) > 4194304
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
  select * into existing
  from api.campaign_lab_runs
  where organization_id = requested_organization_id
    and idempotency_key = requested_idempotency_key;
  if found then
    if existing.request_sha256 <> requested_sha256 then
      raise exception using errcode = '23505', message = 'idempotency_key_reused';
    end if;
    return pg_catalog.jsonb_build_object(
      'run_id', existing.id,
      'campaign_id', existing.campaign_id,
      'status', existing.status,
      'stage', existing.stage,
      'progress', existing.progress,
      'created_at', existing.created_at,
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
      or pg_catalog.octet_length(requested_secret::text) > 4194304
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
    'run_id', created.id,
    'campaign_id', created.campaign_id,
    'status', created.status,
    'stage', created.stage,
    'progress', created.progress,
    'created_at', created.created_at,
    'replayed', false
  );
end
$function$;

create function api.create_campaign_lab_run_v2(
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
  select private.create_campaign_lab_run_atomic_v2(
    requested_organization_id, requested_campaign_id, requested_run_type,
    requested_request, requested_secret, requested_idempotency_key,
    requested_sha256, requested_correlation_id
  );
$function$;

revoke all on function api.create_campaign_lab_run_v2(uuid, uuid, text, jsonb, jsonb, text, text, uuid)
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function api.create_campaign_lab_run_v2(uuid, uuid, text, jsonb, jsonb, text, text, uuid)
  to simula_api;
revoke all on function private.create_campaign_lab_run_atomic_v2(uuid, uuid, text, jsonb, jsonb, text, text, uuid)
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function private.create_campaign_lab_run_atomic_v2(uuid, uuid, text, jsonb, jsonb, text, text, uuid)
  to simula_api;

create function private.complete_campaign_lab_run_v2(
  requested_run_id uuid,
  requested_lease_token uuid,
  requested_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  completed api.campaign_lab_runs%rowtype;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_result is null
    or pg_catalog.jsonb_typeof(requested_result) <> 'object'
    or pg_catalog.octet_length(requested_result::text) > 4194304
  then
    raise exception using errcode = '22023', message = 'invalid_campaign_lab_result';
  end if;
  update api.campaign_lab_runs
  set status = 'succeeded',
      stage = case run_type
        when 'repeated_simulation' then 'simulated'
        when 'survey_calibration' then 'calibrated'
        when 'historical_backtest' then 'backtested'
        when 'research_ingestion' then 'research_validated'
        when 'interview' then 'interviewed'
        when 'compliance_review' then 'compliance_reviewed'
        else 'reported'
      end,
      progress = 100,
      result = requested_result,
      completed_at = pg_catalog.statement_timestamp(),
      lease_token = null,
      lease_expires_at = null
  where id = requested_run_id
    and lease_token = requested_lease_token
    and status = 'running'
  returning * into completed;
  if not found then return false; end if;
  update api.campaign_lab_campaigns
  set status = case when completed.run_type = 'report' then 'completed' else 'active' end,
      current_stage = case completed.run_type
        when 'repeated_simulation' then 'simulated'
        when 'survey_calibration' then 'calibrated'
        when 'historical_backtest' then 'backtested'
        when 'research_ingestion' then 'research_validated'
        when 'interview' then 'interviewed'
        when 'compliance_review' then 'compliance_reviewed'
        else 'reported'
      end,
      updated_at = pg_catalog.statement_timestamp()
  where id = completed.campaign_id;
  delete from private.campaign_lab_secrets where run_id = requested_run_id;
  insert into api.campaign_lab_events (
    organization_id, campaign_id, run_id, stage, progress, event_kind, message
  ) values (
    completed.organization_id, completed.campaign_id, completed.id, completed.stage,
    100, 'completed', 'Campaign Lab durable workflow completed with a bounded aggregate output.'
  );
  insert into private.audit_events (
    organization_id, actor_type, actor_user_id, action, object_type, object_id,
    correlation_id, outcome, source_service, metadata
  ) values (
    completed.organization_id, 'worker', null, 'campaign_lab.run_completed',
    'campaign_lab_run', completed.id, completed.id, 'success', 'worker',
    pg_catalog.jsonb_build_object('attempt_count', completed.attempt_count, 'run_type', completed.run_type)
  );
  return true;
end
$function$;

revoke all on function private.complete_campaign_lab_run_v2(uuid, uuid, jsonb)
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function private.complete_campaign_lab_run_v2(uuid, uuid, jsonb)
  to simula_worker;

create function private.runtime_schema_readiness_v2()
returns table (
  migration_version bigint,
  rls_force_enabled boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  if session_user not in ('simula_api', 'simula_worker') then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  return query
  select
    20260802143000::bigint,
    not exists (
      select 1
      from pg_catalog.pg_class as relations
      join pg_catalog.pg_namespace as schemas
        on schemas.oid = relations.relnamespace
      where schemas.nspname in ('api', 'private')
        and relations.relkind in ('r', 'p')
        and (not relations.relrowsecurity or not relations.relforcerowsecurity)
    );
end
$function$;

revoke all on function private.runtime_schema_readiness_v2()
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function private.runtime_schema_readiness_v2()
  to simula_api, simula_worker;

create function private.runtime_observability_snapshot_v2()
returns table (
  migration_version bigint,
  rls_force_enabled boolean,
  queued_count bigint,
  running_count bigint,
  retrying_count bigint,
  cancel_requested_count bigint,
  succeeded_count bigint,
  failed_count bigint,
  canceled_count bigint,
  stuck_lease_count bigint,
  oldest_cancel_requested_age_seconds numeric
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  if session_user not in ('simula_api', 'simula_worker') then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  return query
  select
    20260802143000::bigint,
    not exists (
      select 1
      from pg_catalog.pg_class as relations
      join pg_catalog.pg_namespace as schemas
        on schemas.oid = relations.relnamespace
      where schemas.nspname in ('api', 'private')
        and relations.relkind in ('r', 'p')
        and (not relations.relrowsecurity or not relations.relforcerowsecurity)
    ),
    pg_catalog.count(*) filter (where runs.state = 'queued'),
    pg_catalog.count(*) filter (where runs.state = 'running'),
    pg_catalog.count(*) filter (where runs.state = 'retrying'),
    pg_catalog.count(*) filter (where runs.state = 'cancel_requested'),
    pg_catalog.count(*) filter (where runs.state = 'succeeded'),
    pg_catalog.count(*) filter (where runs.state = 'failed'),
    pg_catalog.count(*) filter (where runs.state = 'canceled'),
    pg_catalog.count(*) filter (
      where runs.state in ('running', 'retrying')
        and runs.worker_lease_expires_at < pg_catalog.statement_timestamp()
    ),
    coalesce(
      extract(
        epoch from pg_catalog.statement_timestamp()
          - pg_catalog.min(
            case when runs.state = 'cancel_requested' then runs.updated_at end
          )
      ),
      0::numeric
    )
  from api.simulation_runs as runs;
end
$function$;

revoke all on function private.runtime_observability_snapshot_v2()
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function private.runtime_observability_snapshot_v2()
  to simula_api, simula_worker;
