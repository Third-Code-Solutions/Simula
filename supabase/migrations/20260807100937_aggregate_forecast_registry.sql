-- Official, aggregate-only historical election registry and respondent-free
-- forecast workflow. Browser roles receive no table privileges.

set role postgres;

create table api.aggregate_forecast_datasets (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  source_key text not null,
  source_version text not null,
  owner_name text not null,
  license_name text not null,
  allowed_uses text[] not null,
  geography text not null,
  observation_period text not null,
  status text not null default 'draft',
  authorized_for_forecasting boolean not null default false,
  source_checksum_sha256 text not null,
  normalized_checksum_sha256 text not null,
  manifest jsonb not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  admitted_at timestamptz,
  constraint aggregate_forecast_datasets_source_version_unique
    unique (source_key, source_version),
  constraint aggregate_forecast_datasets_source_key_valid
    check (source_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  constraint aggregate_forecast_datasets_labels_valid check (
    pg_catalog.char_length(source_version) between 1 and 120
    and pg_catalog.char_length(owner_name) between 1 and 120
    and pg_catalog.char_length(license_name) between 1 and 120
    and pg_catalog.char_length(geography) between 1 and 120
    and pg_catalog.char_length(observation_period) between 1 and 500
  ),
  constraint aggregate_forecast_datasets_allowed_uses_valid check (
    pg_catalog.cardinality(allowed_uses) between 1 and 20
    and pg_catalog.array_to_string(allowed_uses, ' ') ~* 'forecast'
  ),
  constraint aggregate_forecast_datasets_status_valid
    check (status in ('draft', 'admitted', 'retired')),
  constraint aggregate_forecast_datasets_checksums_valid check (
    source_checksum_sha256 ~ '^[0-9a-f]{64}$'
    and normalized_checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint aggregate_forecast_datasets_manifest_valid check (
    pg_catalog.jsonb_typeof(manifest) = 'object'
    and pg_catalog.octet_length(manifest::text) <= 1048576
  ),
  constraint aggregate_forecast_datasets_admission_state_valid check (
    (status = 'draft' and admitted_at is null and not authorized_for_forecasting)
    or (status = 'admitted' and admitted_at is not null and authorized_for_forecasting)
    or (status = 'retired' and admitted_at is not null and not authorized_for_forecasting)
  )
);

create table api.aggregate_forecast_observations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  dataset_id uuid not null references api.aggregate_forecast_datasets (id)
    on delete cascade,
  election_key text not null,
  election_date date not null,
  contest_key text not null,
  geography_key text not null,
  option_key text not null,
  option_group_key text not null,
  votes integer not null,
  valid_votes integer not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint aggregate_forecast_observations_cell_unique unique (
    dataset_id, election_key, contest_key, geography_key, option_key
  ),
  constraint aggregate_forecast_observations_keys_valid check (
    election_key ~ '^[a-z][a-z0-9_]{0,63}$'
    and contest_key ~ '^[a-z][a-z0-9_]{0,63}$'
    and geography_key ~ '^[a-z][a-z0-9_]{0,63}$'
    and option_key ~ '^[a-z][a-z0-9_]{0,63}$'
    and option_group_key ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint aggregate_forecast_observations_votes_valid check (
    valid_votes between 1 and 2147483647
    and votes between 0 and valid_votes
  )
);

create index aggregate_forecast_observations_dataset_date_idx
  on api.aggregate_forecast_observations (
    dataset_id, election_date, contest_key, geography_key, option_group_key
  );

alter table api.aggregate_forecast_datasets enable row level security;
alter table api.aggregate_forecast_datasets force row level security;
alter table api.aggregate_forecast_observations enable row level security;
alter table api.aggregate_forecast_observations force row level security;

create policy aggregate_forecast_datasets_api_select
on api.aggregate_forecast_datasets for select to simula_api
using (
  status = 'admitted'
  and authorized_for_forecasting
  and private.verified_subject() is not null
);

create policy aggregate_forecast_observations_api_select
on api.aggregate_forecast_observations for select to simula_api
using (
  private.verified_subject() is not null
  and exists (
    select 1
    from api.aggregate_forecast_datasets as datasets
    where datasets.id = aggregate_forecast_observations.dataset_id
      and datasets.status = 'admitted'
      and datasets.authorized_for_forecasting
  )
);

revoke all on table api.aggregate_forecast_datasets
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner;
revoke all on table api.aggregate_forecast_observations
  from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner;
grant select on table api.aggregate_forecast_datasets to simula_api;
grant select on table api.aggregate_forecast_observations to simula_api;

create function private.aggregate_forecast_dataset_checksum(requested_dataset_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $function$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        coalesce(
          pg_catalog.string_agg(
            pg_catalog.concat_ws(
              '|',
              observations.election_key,
              observations.election_date::text,
              observations.contest_key,
              observations.geography_key,
              observations.option_key,
              observations.option_group_key,
              observations.votes::text,
              observations.valid_votes::text
            ),
            E'\n' order by observations.election_date,
              observations.election_key, observations.contest_key,
              observations.geography_key, observations.option_key
          ),
          ''
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  from api.aggregate_forecast_observations as observations
  where observations.dataset_id = requested_dataset_id;
$function$;

revoke all on function private.aggregate_forecast_dataset_checksum(uuid)
  from public, anon, authenticated, simula_api, simula_worker,
    simula_worker_owner, postgres;
grant execute on function private.aggregate_forecast_dataset_checksum(uuid)
  to postgres;

create function private.protect_admitted_aggregate_forecast_dataset()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    if old.status in ('admitted', 'retired') then
      raise exception using
        errcode = '55000',
        message = 'admitted_aggregate_forecast_dataset_is_immutable';
    end if;
    return old;
  end if;
  if old.status = 'retired' then
    raise exception using
      errcode = '55000',
      message = 'admitted_aggregate_forecast_dataset_is_immutable';
  end if;
  if old.status = 'admitted' then
    if new.status = 'retired'
      and not new.authorized_for_forecasting
      and (
        pg_catalog.to_jsonb(new) - array['status', 'authorized_for_forecasting']::text[]
      ) = (
        pg_catalog.to_jsonb(old) - array['status', 'authorized_for_forecasting']::text[]
      )
    then
      return new;
    end if;
    raise exception using
      errcode = '55000',
      message = 'admitted_aggregate_forecast_dataset_is_immutable';
  end if;
  return new;
end
$function$;

revoke all on function private.protect_admitted_aggregate_forecast_dataset()
  from public, anon, authenticated, simula_api, simula_worker,
    simula_worker_owner, postgres;
grant execute on function private.protect_admitted_aggregate_forecast_dataset()
  to postgres;

create trigger aggregate_forecast_dataset_immutability_guard
before update or delete on api.aggregate_forecast_datasets
for each row
execute function private.protect_admitted_aggregate_forecast_dataset();
revoke execute on function private.protect_admitted_aggregate_forecast_dataset()
  from postgres;

create function private.protect_admitted_aggregate_forecast_observation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if (
    tg_op <> 'INSERT'
    and exists (
      select 1 from api.aggregate_forecast_datasets
      where id = old.dataset_id and status in ('admitted', 'retired')
    )
  ) or (
    tg_op <> 'DELETE'
    and exists (
      select 1 from api.aggregate_forecast_datasets
      where id = new.dataset_id and status in ('admitted', 'retired')
    )
  ) then
    raise exception using
      errcode = '55000',
      message = 'admitted_aggregate_forecast_observations_are_immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$function$;

revoke all on function private.protect_admitted_aggregate_forecast_observation()
  from public, anon, authenticated, simula_api, simula_worker,
    simula_worker_owner, postgres;
grant execute on function private.protect_admitted_aggregate_forecast_observation()
  to postgres;

create trigger aggregate_forecast_observation_immutability_guard
before insert or update or delete on api.aggregate_forecast_observations
for each row
execute function private.protect_admitted_aggregate_forecast_observation();
revoke execute on function private.protect_admitted_aggregate_forecast_observation()
  from postgres;

create function private.enforce_aggregate_forecast_dataset_admission()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.status = 'admitted'
    and (tg_op = 'INSERT' or old.status is distinct from 'admitted')
  then
    if not new.authorized_for_forecasting
      or new.admitted_at is null
      or (
        select pg_catalog.count(distinct observations.election_date)
        from api.aggregate_forecast_observations as observations
        where observations.dataset_id = new.id
      ) < 5
      or exists (
        select 1
        from api.aggregate_forecast_observations as observations
        where observations.dataset_id = new.id
        group by observations.election_key, observations.election_date,
          observations.contest_key, observations.geography_key
        having pg_catalog.count(*) < 2
          or pg_catalog.count(distinct observations.valid_votes) <> 1
          or pg_catalog.sum(observations.votes) <> pg_catalog.max(observations.valid_votes)
      )
      or new.normalized_checksum_sha256 <>
        private.aggregate_forecast_dataset_checksum(new.id)
    then
      raise exception using
        errcode = '23514',
        message = 'aggregate_forecast_dataset_admission_failed';
    end if;
  end if;
  return new;
end
$function$;

revoke all on function private.enforce_aggregate_forecast_dataset_admission()
  from public, anon, authenticated, simula_api, simula_worker,
    simula_worker_owner, postgres;
grant execute on function private.enforce_aggregate_forecast_dataset_admission()
  to postgres;

create trigger aggregate_forecast_dataset_admission_guard
before insert or update on api.aggregate_forecast_datasets
for each row
execute function private.enforce_aggregate_forecast_dataset_admission();

alter table api.campaign_lab_runs
  drop constraint campaign_lab_runs_type_valid;
alter table api.campaign_lab_runs
  add constraint campaign_lab_runs_type_valid check (
    run_type in (
      'repeated_simulation',
      'survey_import',
      'survey_calibration',
      'historical_backtest',
      'aggregate_forecast',
      'research_ingestion',
      'interview',
      'compliance_review',
      'report'
    )
  );

grant execute on function private.create_campaign_lab_run_atomic_v3(
  uuid, uuid, text, jsonb, jsonb, text, text, uuid
) to postgres;
grant execute on function private.complete_campaign_lab_run_v3(uuid, uuid, jsonb)
  to postgres;
grant execute on function private.runtime_schema_readiness_v3() to postgres;
grant execute on function private.runtime_observability_snapshot_v3() to postgres;

create or replace function private.create_campaign_lab_run_atomic_v3(
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
    'run_id', created.id, 'campaign_id', created.campaign_id,
    'status', created.status, 'stage', created.stage,
    'progress', created.progress, 'created_at', created.created_at,
    'replayed', false
  );
end
$function$;

create or replace function private.complete_campaign_lab_run_v3(
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
        when 'survey_import' then 'survey_imported'
        when 'survey_calibration' then 'calibrated'
        when 'historical_backtest' then 'backtested'
        when 'aggregate_forecast' then 'forecasted'
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
        when 'survey_import' then 'survey_imported'
        when 'survey_calibration' then 'calibrated'
        when 'historical_backtest' then 'backtested'
        when 'aggregate_forecast' then 'forecasted'
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
    completed.organization_id, completed.campaign_id, completed.id,
    completed.stage, 100, 'completed',
    'Campaign Lab durable workflow completed with a bounded aggregate output.'
  );
  insert into private.audit_events (
    organization_id, actor_type, actor_user_id, action, object_type, object_id,
    correlation_id, outcome, source_service, metadata
  ) values (
    completed.organization_id, 'worker', null, 'campaign_lab.run_completed',
    'campaign_lab_run', completed.id, completed.id, 'success', 'worker',
    pg_catalog.jsonb_build_object(
      'attempt_count', completed.attempt_count, 'run_type', completed.run_type
    )
  );
  return true;
end
$function$;

create or replace function private.runtime_schema_readiness_v3()
returns table (migration_version bigint, rls_force_enabled boolean)
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
    20260807100937::bigint,
    not exists (
      select 1
      from pg_catalog.pg_class as relations
      join pg_catalog.pg_namespace as schemas on schemas.oid = relations.relnamespace
      where schemas.nspname in ('api', 'private')
        and relations.relkind in ('r', 'p')
        and (not relations.relrowsecurity or not relations.relforcerowsecurity)
    );
end
$function$;

create or replace function private.runtime_observability_snapshot_v3()
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
    20260807100937::bigint,
    not exists (
      select 1
      from pg_catalog.pg_class as relations
      join pg_catalog.pg_namespace as schemas on schemas.oid = relations.relnamespace
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

revoke execute on function private.create_campaign_lab_run_atomic_v3(
  uuid, uuid, text, jsonb, jsonb, text, text, uuid
) from postgres;
revoke execute on function private.complete_campaign_lab_run_v3(uuid, uuid, jsonb)
  from postgres;
revoke execute on function private.runtime_schema_readiness_v3() from postgres;
revoke execute on function private.runtime_observability_snapshot_v3() from postgres;

set role postgres;
