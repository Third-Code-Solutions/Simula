-- Native Campaign Simulation Lab bounded context.
-- Aggregate campaign research only: no identifiable voter or respondent rows.

set role postgres;

create table api.campaign_lab_campaigns (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  name text not null,
  objective text not null,
  purpose text not null,
  status text not null default 'draft',
  current_stage text not null default 'campaign_created',
  decision_definition jsonb not null default '{}'::jsonb,
  compliance_status text not null default 'pending',
  version integer not null default 1,
  idempotency_key text not null,
  request_sha256 text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  deleted_at timestamptz,
  constraint campaign_lab_campaigns_organization_id_id_unique unique (organization_id, id),
  constraint campaign_lab_campaigns_project_foreign_key
    foreign key (organization_id, project_id) references api.projects (organization_id, id) on delete cascade,
  constraint campaign_lab_campaigns_idempotency_unique unique (organization_id, idempotency_key),
  constraint campaign_lab_campaigns_name_valid check (name = pg_catalog.btrim(name) and pg_catalog.char_length(name) between 2 and 120),
  constraint campaign_lab_campaigns_objective_valid check (pg_catalog.char_length(objective) between 2 and 2000),
  constraint campaign_lab_campaigns_purpose_valid check (purpose in ('commercial_marketing', 'public_service', 'brand_communication', 'product_launch', 'advocacy', 'aggregate_political_research')),
  constraint campaign_lab_campaigns_status_valid check (status in ('draft', 'active', 'running', 'completed', 'archived', 'blocked')),
  constraint campaign_lab_campaigns_compliance_valid check (compliance_status in ('pending', 'approved_experimental', 'needs_human_review', 'blocked')),
  constraint campaign_lab_campaigns_version_valid check (version > 0),
  constraint campaign_lab_campaigns_idempotency_valid check (idempotency_key ~ '^[ -~]{16,128}$'),
  constraint campaign_lab_campaigns_sha_valid check (request_sha256 ~ '^[0-9a-f]{64}$'),
  constraint campaign_lab_campaigns_decision_valid check (pg_catalog.jsonb_typeof(decision_definition) = 'object' and pg_catalog.octet_length(decision_definition::text) <= 262144)
);

create index campaign_lab_campaigns_organization_created_idx on api.campaign_lab_campaigns (organization_id, created_at desc, id) where deleted_at is null;
create index campaign_lab_campaigns_project_idx on api.campaign_lab_campaigns (organization_id, project_id, created_at desc, id) where deleted_at is null;

create table api.campaign_lab_artifacts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid not null,
  kind text not null,
  status text not null default 'pending',
  title text not null,
  payload jsonb not null,
  provenance jsonb not null default '{}'::jsonb,
  checksum_sha256 text not null,
  idempotency_key text not null,
  request_sha256 text not null,
  retention_until timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint campaign_lab_artifacts_organization_id_id_unique unique (organization_id, id),
  constraint campaign_lab_artifacts_campaign_foreign_key foreign key (organization_id, campaign_id) references api.campaign_lab_campaigns (organization_id, id) on delete cascade,
  constraint campaign_lab_artifacts_kind_valid check (kind in ('research_source', 'cohort', 'variant', 'interview', 'survey_import', 'calibration', 'historical_backtest', 'compliance_review', 'report')),
  constraint campaign_lab_artifacts_status_valid check (status in ('pending', 'completed', 'blocked', 'rejected')),
  constraint campaign_lab_artifacts_title_valid check (title = pg_catalog.btrim(title) and pg_catalog.char_length(title) between 2 and 200),
  constraint campaign_lab_artifacts_payload_valid check (pg_catalog.jsonb_typeof(payload) = 'object' and pg_catalog.octet_length(payload::text) <= 4194304),
  constraint campaign_lab_artifacts_provenance_valid check (pg_catalog.jsonb_typeof(provenance) = 'object' and pg_catalog.octet_length(provenance::text) <= 262144),
  constraint campaign_lab_artifacts_checksum_valid check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  constraint campaign_lab_artifacts_idempotency_valid check (idempotency_key ~ '^[ -~]{16,128}$'),
  constraint campaign_lab_artifacts_sha_valid check (request_sha256 ~ '^[0-9a-f]{64}$')
);

create unique index campaign_lab_artifacts_idempotency_idx on api.campaign_lab_artifacts (organization_id, idempotency_key);
create index campaign_lab_artifacts_campaign_idx on api.campaign_lab_artifacts (organization_id, campaign_id, kind, created_at desc, id);

create table api.campaign_lab_runs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid not null,
  run_type text not null default 'repeated_simulation',
  status text not null default 'queued',
  stage text not null default 'simulation_configured',
  progress smallint not null default 0,
  request jsonb not null,
  result jsonb,
  idempotency_key text not null,
  request_sha256 text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  started_at timestamptz,
  completed_at timestamptz,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default pg_catalog.statement_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error_code text,
  last_error_detail text,
  constraint campaign_lab_runs_organization_id_id_unique unique (organization_id, id),
  constraint campaign_lab_runs_campaign_foreign_key foreign key (organization_id, campaign_id) references api.campaign_lab_campaigns (organization_id, id) on delete cascade,
  constraint campaign_lab_runs_type_valid check (run_type in ('repeated_simulation', 'survey_calibration', 'historical_backtest', 'interview', 'report')),
  constraint campaign_lab_runs_status_valid check (status in ('queued', 'running', 'retrying', 'cancel_requested', 'canceled', 'succeeded', 'failed')),
  constraint campaign_lab_runs_progress_valid check (progress between 0 and 100),
  constraint campaign_lab_runs_request_valid check (pg_catalog.jsonb_typeof(request) = 'object' and pg_catalog.octet_length(request::text) <= 4194304),
  constraint campaign_lab_runs_result_valid check (result is null or (pg_catalog.jsonb_typeof(result) = 'object' and pg_catalog.octet_length(result::text) <= 4194304)),
  constraint campaign_lab_runs_attempt_valid check (attempt_count between 0 and 10),
  constraint campaign_lab_runs_idempotency_valid check (idempotency_key ~ '^[ -~]{16,128}$'),
  constraint campaign_lab_runs_sha_valid check (request_sha256 ~ '^[0-9a-f]{64}$'),
  constraint campaign_lab_runs_error_valid check ((last_error_code is null and last_error_detail is null) or (last_error_code ~ '^[a-z][a-z0-9_.-]{1,63}$' and last_error_detail is not null and pg_catalog.char_length(last_error_detail) between 1 and 240))
);

create unique index campaign_lab_runs_idempotency_idx on api.campaign_lab_runs (organization_id, idempotency_key);
create index campaign_lab_runs_campaign_created_idx on api.campaign_lab_runs (organization_id, campaign_id, created_at desc, id);
create index campaign_lab_runs_queue_idx on api.campaign_lab_runs (status, next_attempt_at, created_at, id) where status in ('queued', 'retrying', 'running');

create table api.campaign_lab_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid not null,
  run_id uuid,
  artifact_id uuid,
  stage text not null,
  progress smallint not null default 0,
  event_kind text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint campaign_lab_events_organization_id_id_unique unique (organization_id, id),
  constraint campaign_lab_events_campaign_foreign_key foreign key (organization_id, campaign_id) references api.campaign_lab_campaigns (organization_id, id) on delete cascade,
  constraint campaign_lab_events_run_foreign_key foreign key (organization_id, run_id) references api.campaign_lab_runs (organization_id, id) on delete cascade,
  constraint campaign_lab_events_artifact_foreign_key foreign key (organization_id, artifact_id) references api.campaign_lab_artifacts (organization_id, id) on delete cascade,
  constraint campaign_lab_events_progress_valid check (progress between 0 and 100),
  constraint campaign_lab_events_kind_valid check (event_kind in ('created', 'queued', 'started', 'progress', 'completed', 'retrying', 'failed', 'canceled', 'blocked')),
  constraint campaign_lab_events_message_valid check (message is null or pg_catalog.char_length(message) between 1 and 240),
  constraint campaign_lab_events_metadata_valid check (pg_catalog.jsonb_typeof(metadata) = 'object' and pg_catalog.octet_length(metadata::text) <= 262144)
);

create index campaign_lab_events_campaign_created_idx on api.campaign_lab_events (organization_id, campaign_id, created_at desc, id);
create index campaign_lab_events_run_created_idx on api.campaign_lab_events (organization_id, run_id, created_at desc, id);

create table private.campaign_lab_secrets (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  artifact_id uuid,
  run_id uuid,
  payload jsonb not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint campaign_lab_secrets_one_parent check ((artifact_id is not null and run_id is null) or (artifact_id is null and run_id is not null)),
  constraint campaign_lab_secrets_artifact_foreign_key foreign key (organization_id, artifact_id) references api.campaign_lab_artifacts (organization_id, id) on delete cascade,
  constraint campaign_lab_secrets_run_foreign_key foreign key (organization_id, run_id) references api.campaign_lab_runs (organization_id, id) on delete cascade,
  constraint campaign_lab_secrets_payload_valid check (pg_catalog.jsonb_typeof(payload) = 'object' and pg_catalog.octet_length(payload::text) <= 4194304)
);

alter table api.campaign_lab_campaigns enable row level security;
alter table api.campaign_lab_campaigns force row level security;
alter table api.campaign_lab_artifacts enable row level security;
alter table api.campaign_lab_artifacts force row level security;
alter table api.campaign_lab_runs enable row level security;
alter table api.campaign_lab_runs force row level security;
alter table api.campaign_lab_events enable row level security;
alter table api.campaign_lab_events force row level security;
alter table private.campaign_lab_secrets enable row level security;
alter table private.campaign_lab_secrets force row level security;

create policy campaign_lab_campaigns_api_select on api.campaign_lab_campaigns for select to simula_api using (private.is_org_member(organization_id, private.verified_subject()));
create policy campaign_lab_campaigns_command_select on api.campaign_lab_campaigns for select to simula_command_owner using (private.is_org_member(organization_id, private.verified_subject()));
create policy campaign_lab_campaigns_command_insert on api.campaign_lab_campaigns for insert to simula_command_owner with check (private.is_verified_api_subject(created_by) and private.has_org_role(organization_id, private.verified_subject(), array['owner', 'editor']::api.organization_role[]));
create policy campaign_lab_campaigns_command_update on api.campaign_lab_campaigns for update to simula_command_owner using (private.is_org_member(organization_id, private.verified_subject())) with check (private.is_org_member(organization_id, private.verified_subject()));

create policy campaign_lab_artifacts_api_select on api.campaign_lab_artifacts for select to simula_api using (private.is_org_member(organization_id, private.verified_subject()));
create policy campaign_lab_artifacts_command_select on api.campaign_lab_artifacts for select to simula_command_owner using (private.is_org_member(organization_id, private.verified_subject()));
create policy campaign_lab_artifacts_command_insert on api.campaign_lab_artifacts for insert to simula_command_owner with check (private.is_verified_api_subject(created_by) and private.has_org_role(organization_id, private.verified_subject(), array['owner', 'editor']::api.organization_role[]));

create policy campaign_lab_runs_api_select on api.campaign_lab_runs for select to simula_api using (private.is_org_member(organization_id, private.verified_subject()));
create policy campaign_lab_runs_command_select on api.campaign_lab_runs for select to simula_command_owner using (private.is_org_member(organization_id, private.verified_subject()));
create policy campaign_lab_runs_command_insert on api.campaign_lab_runs for insert to simula_command_owner with check (private.is_verified_api_subject(created_by) and private.has_org_role(organization_id, private.verified_subject(), array['owner', 'editor']::api.organization_role[]));
create policy campaign_lab_runs_worker_select on api.campaign_lab_runs for select to simula_worker_owner using (true);
create policy campaign_lab_runs_worker_update on api.campaign_lab_runs for update to simula_worker_owner using (true) with check (true);

create policy campaign_lab_events_api_select on api.campaign_lab_events for select to simula_api using (private.is_org_member(organization_id, private.verified_subject()));
create policy campaign_lab_events_command_select on api.campaign_lab_events for select to simula_command_owner using (private.is_org_member(organization_id, private.verified_subject()));
create policy campaign_lab_events_command_insert on api.campaign_lab_events for insert to simula_command_owner with check (private.is_org_member(organization_id, private.verified_subject()));
create policy campaign_lab_events_worker_insert on api.campaign_lab_events for insert to simula_worker_owner with check (true);

create policy campaign_lab_secrets_command_insert on private.campaign_lab_secrets for insert to simula_command_owner with check (private.is_org_member(organization_id, private.verified_subject()));
create policy campaign_lab_secrets_worker_select on private.campaign_lab_secrets for select to simula_worker_owner using (true);
create policy campaign_lab_secrets_worker_delete on private.campaign_lab_secrets for delete to simula_worker_owner using (true);

create policy audit_events_campaign_lab_command_insert on private.audit_events for insert to simula_command_owner with check (actor_type = 'user' and private.is_verified_api_subject(actor_user_id) and source_service = 'api' and outcome = 'success' and action in ('campaign_lab.campaign_created', 'campaign_lab.campaign_updated', 'campaign_lab.artifact_created', 'campaign_lab.run_created', 'campaign_lab.run_canceled') and private.is_org_member(organization_id, private.verified_subject()));
create policy audit_events_campaign_lab_worker_insert on private.audit_events for insert to simula_worker_owner with check (actor_type = 'worker' and actor_user_id is null and source_service = 'worker' and outcome in ('success', 'failure') and action in ('campaign_lab.run_started', 'campaign_lab.run_completed', 'campaign_lab.run_failed', 'campaign_lab.run_canceled'));

revoke all on table api.campaign_lab_campaigns, api.campaign_lab_artifacts, api.campaign_lab_runs, api.campaign_lab_events from public, anon, authenticated, simula_api, simula_worker, simula_command_owner, simula_worker_owner;
revoke all on table private.campaign_lab_secrets from public, anon, authenticated, simula_api, simula_worker, simula_command_owner, simula_worker_owner;
grant select on table api.campaign_lab_campaigns, api.campaign_lab_artifacts, api.campaign_lab_runs, api.campaign_lab_events to simula_api;
grant select, insert, update on table api.campaign_lab_campaigns, api.campaign_lab_artifacts, api.campaign_lab_runs to simula_command_owner;
grant select, insert on table api.campaign_lab_events to simula_command_owner;
grant select, update on table api.campaign_lab_runs to simula_worker_owner;
grant insert on table api.campaign_lab_events to simula_worker_owner;
grant insert on table private.campaign_lab_secrets to simula_command_owner;
grant select, delete on table private.campaign_lab_secrets to simula_worker_owner;
grant select on table private.audit_events to simula_command_owner;
grant insert on table private.audit_events to simula_command_owner, simula_worker_owner;

set role postgres;
grant create on schema api, private to simula_command_owner;
set role simula_command_owner;

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
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  subject uuid;
  existing api.campaign_lab_campaigns%rowtype;
  created api.campaign_lab_campaigns%rowtype;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if not private.has_org_role(requested_organization_id, subject, array['owner', 'editor']::api.organization_role[]) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if not exists (
    select 1 from api.projects
    where id = requested_project_id and organization_id = requested_organization_id and status = 'active'
  ) then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if requested_name is null or pg_catalog.char_length(pg_catalog.btrim(requested_name)) not between 2 and 120
    or requested_objective is null or pg_catalog.char_length(requested_objective) not between 2 and 2000
    or requested_purpose not in ('commercial_marketing', 'public_service', 'brand_communication', 'product_launch', 'advocacy', 'aggregate_political_research')
    or requested_decision is null or pg_catalog.jsonb_typeof(requested_decision) <> 'object'
    or requested_idempotency_key is null or requested_idempotency_key !~ '^[ -~]{16,128}$'
    or requested_sha256 is null or requested_sha256 !~ '^[0-9a-f]{64}$'
    or requested_correlation_id is null
  then
    raise exception using errcode = '22023', message = 'invalid_campaign_lab_campaign';
  end if;
  select * into existing from api.campaign_lab_campaigns
  where organization_id = requested_organization_id and idempotency_key = requested_idempotency_key;
  if found then
    if existing.request_sha256 <> requested_sha256 then
      raise exception using errcode = '23505', message = 'idempotency_key_reused';
    end if;
    return pg_catalog.jsonb_build_object(
      'campaign_id', existing.id, 'organization_id', existing.organization_id,
      'project_id', existing.project_id, 'name', existing.name, 'objective', existing.objective,
      'purpose', existing.purpose, 'status', existing.status, 'current_stage', existing.current_stage,
      'compliance_status', existing.compliance_status, 'version', existing.version,
      'created_at', existing.created_at, 'updated_at', existing.updated_at, 'replayed', true
    );
  end if;
  insert into api.campaign_lab_campaigns (
    organization_id, project_id, name, objective, purpose, decision_definition,
    idempotency_key, request_sha256, created_by
  ) values (
    requested_organization_id, requested_project_id, pg_catalog.btrim(requested_name),
    requested_objective, requested_purpose, requested_decision,
    requested_idempotency_key, requested_sha256, subject
  ) returning * into created;
  insert into api.campaign_lab_events (organization_id, campaign_id, stage, progress, event_kind, message)
  values (created.organization_id, created.id, created.current_stage, 0, 'created', 'Campaign lab workspace created.');
  insert into private.audit_events (
    organization_id, actor_type, actor_user_id, action, object_type, object_id,
    correlation_id, outcome, source_service, metadata
  ) values (
    created.organization_id, 'user', subject, 'campaign_lab.campaign_created',
    'campaign_lab_campaign', created.id, requested_correlation_id, 'success', 'api',
    pg_catalog.jsonb_build_object('project_id', created.project_id, 'purpose', created.purpose)
  );
  return pg_catalog.jsonb_build_object(
    'campaign_id', created.id, 'organization_id', created.organization_id,
    'project_id', created.project_id, 'name', created.name, 'objective', created.objective,
    'purpose', created.purpose, 'status', created.status, 'current_stage', created.current_stage,
    'compliance_status', created.compliance_status, 'version', created.version,
    'created_at', created.created_at, 'updated_at', created.updated_at, 'replayed', false
  );
end
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
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  subject uuid;
  existing api.campaign_lab_artifacts%rowtype;
  created api.campaign_lab_artifacts%rowtype;
  next_stage text;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then raise exception using errcode = '42501', message = 'unauthorized'; end if;
  if not exists (select 1 from api.campaign_lab_campaigns where id = requested_campaign_id and organization_id = requested_organization_id and deleted_at is null) then raise exception using errcode = 'P0002', message = 'not_found'; end if;
  if not private.has_org_role(requested_organization_id, subject, array['owner', 'editor']::api.organization_role[]) then raise exception using errcode = '42501', message = 'forbidden'; end if;
  if requested_kind not in ('research_source', 'cohort', 'variant', 'interview', 'survey_import', 'calibration', 'historical_backtest', 'compliance_review', 'report')
    or requested_title is null or pg_catalog.char_length(pg_catalog.btrim(requested_title)) not between 2 and 200
    or requested_payload is null or pg_catalog.jsonb_typeof(requested_payload) <> 'object'
    or pg_catalog.octet_length(requested_payload::text) > 4194304
    or requested_provenance is null or pg_catalog.jsonb_typeof(requested_provenance) <> 'object'
    or requested_checksum is null or requested_checksum !~ '^[0-9a-f]{64}$'
    or requested_idempotency_key is null or requested_idempotency_key !~ '^[ -~]{16,128}$'
    or requested_sha256 is null or requested_sha256 !~ '^[0-9a-f]{64}$'
  then raise exception using errcode = '22023', message = 'invalid_campaign_lab_artifact'; end if;
  select * into existing from api.campaign_lab_artifacts where organization_id = requested_organization_id and idempotency_key = requested_idempotency_key;
  if found then
    if existing.request_sha256 <> requested_sha256 then raise exception using errcode = '23505', message = 'idempotency_key_reused'; end if;
    return pg_catalog.jsonb_build_object('artifact_id', existing.id, 'campaign_id', existing.campaign_id, 'kind', existing.kind, 'status', existing.status, 'created_at', existing.created_at, 'replayed', true);
  end if;
  insert into api.campaign_lab_artifacts (organization_id, campaign_id, kind, title, payload, provenance, checksum_sha256, idempotency_key, request_sha256, created_by)
  values (requested_organization_id, requested_campaign_id, requested_kind, pg_catalog.btrim(requested_title), requested_payload, requested_provenance, requested_checksum, requested_idempotency_key, requested_sha256, subject)
  returning * into created;
  if requested_secret is not null then
    if pg_catalog.jsonb_typeof(requested_secret) <> 'object' or pg_catalog.octet_length(requested_secret::text) > 4194304 then raise exception using errcode = '22023', message = 'invalid_campaign_lab_secret'; end if;
    insert into private.campaign_lab_secrets (organization_id, artifact_id, payload) values (created.organization_id, created.id, requested_secret);
  end if;
  next_stage := case requested_kind
    when 'research_source' then 'research_validated'
    when 'cohort' then 'cohort_defined'
    when 'variant' then 'variants_added'
    when 'survey_import' then 'survey_imported'
    when 'calibration' then 'calibrated'
    when 'historical_backtest' then 'backtested'
    when 'compliance_review' then 'compliance_reviewed'
    when 'report' then 'reported'
    else 'interviewed'
  end;
  update api.campaign_lab_campaigns set current_stage = next_stage, updated_at = pg_catalog.statement_timestamp() where id = created.campaign_id;
  insert into api.campaign_lab_events (organization_id, campaign_id, artifact_id, stage, progress, event_kind, message)
  values (created.organization_id, created.campaign_id, created.id, next_stage, 0, 'created', 'Campaign lab artifact created.');
  insert into private.audit_events (organization_id, actor_type, actor_user_id, action, object_type, object_id, correlation_id, outcome, source_service, metadata)
  values (created.organization_id, 'user', subject, 'campaign_lab.artifact_created', 'campaign_lab_artifact', created.id, requested_correlation_id, 'success', 'api', pg_catalog.jsonb_build_object('campaign_id', created.campaign_id, 'kind', created.kind));
  return pg_catalog.jsonb_build_object('artifact_id', created.id, 'campaign_id', created.campaign_id, 'kind', created.kind, 'status', created.status, 'created_at', created.created_at, 'replayed', false);
end
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
  if subject is null or session_user <> 'simula_api' then raise exception using errcode = '42501', message = 'unauthorized'; end if;
  if not exists (select 1 from api.campaign_lab_campaigns where id = requested_campaign_id and organization_id = requested_organization_id and status not in ('archived', 'blocked')) then raise exception using errcode = 'P0002', message = 'not_found'; end if;
  if not private.has_org_role(requested_organization_id, subject, array['owner', 'editor']::api.organization_role[]) then raise exception using errcode = '42501', message = 'forbidden'; end if;
  if requested_run_type not in ('repeated_simulation', 'survey_calibration', 'historical_backtest', 'interview', 'report')
    or requested_request is null or pg_catalog.jsonb_typeof(requested_request) <> 'object'
    or pg_catalog.octet_length(requested_request::text) > 4194304
    or requested_idempotency_key is null or requested_idempotency_key !~ '^[ -~]{16,128}$'
    or requested_sha256 is null or requested_sha256 !~ '^[0-9a-f]{64}$'
  then raise exception using errcode = '22023', message = 'invalid_campaign_lab_run'; end if;
  if requested_run_type = 'repeated_simulation' then
    if not (requested_request ? 'variants')
      or pg_catalog.jsonb_typeof(requested_request -> 'variants') <> 'array'
      or pg_catalog.jsonb_array_length(requested_request -> 'variants') < 2
      or not (requested_request ? 'configuration')
      or pg_catalog.jsonb_typeof(requested_request -> 'configuration') <> 'object'
      or nullif(requested_request -> 'configuration' ->> 'repetitions', '') is null
      or (case when (requested_request -> 'configuration' ->> 'repetitions') ~ '^[0-9]+$'
              then (requested_request -> 'configuration' ->> 'repetitions')::integer
              else 0 end) < 3
    then raise exception using errcode = '22023', message = 'campaign_lab_run_requires_variants_and_repetitions'; end if;
  end if;
  select * into existing from api.campaign_lab_runs where organization_id = requested_organization_id and idempotency_key = requested_idempotency_key;
  if found then
    if existing.request_sha256 <> requested_sha256 then raise exception using errcode = '23505', message = 'idempotency_key_reused'; end if;
    return pg_catalog.jsonb_build_object('run_id', existing.id, 'campaign_id', existing.campaign_id, 'status', existing.status, 'stage', existing.stage, 'progress', existing.progress, 'created_at', existing.created_at, 'replayed', true);
  end if;
  insert into api.campaign_lab_runs (organization_id, campaign_id, run_type, request, idempotency_key, request_sha256, created_by)
  values (requested_organization_id, requested_campaign_id, requested_run_type, requested_request, requested_idempotency_key, requested_sha256, subject)
  returning * into created;
  if requested_secret is not null then
    if pg_catalog.jsonb_typeof(requested_secret) <> 'object' or pg_catalog.octet_length(requested_secret::text) > 4194304 then raise exception using errcode = '22023', message = 'invalid_campaign_lab_secret'; end if;
    insert into private.campaign_lab_secrets (organization_id, run_id, payload) values (created.organization_id, created.id, requested_secret);
  end if;
  update api.campaign_lab_campaigns set status = 'running', current_stage = 'simulation_configured', updated_at = pg_catalog.statement_timestamp() where id = created.campaign_id;
  insert into api.campaign_lab_events (organization_id, campaign_id, run_id, stage, progress, event_kind, message)
  values (created.organization_id, created.campaign_id, created.id, created.stage, 0, 'queued', 'Campaign lab simulation queued for durable worker execution.');
  insert into private.audit_events (organization_id, actor_type, actor_user_id, action, object_type, object_id, correlation_id, outcome, source_service, metadata)
  values (created.organization_id, 'user', subject, 'campaign_lab.run_created', 'campaign_lab_run', created.id, requested_correlation_id, 'success', 'api', pg_catalog.jsonb_build_object('campaign_id', created.campaign_id, 'run_type', created.run_type));
  return pg_catalog.jsonb_build_object('run_id', created.id, 'campaign_id', created.campaign_id, 'status', created.status, 'stage', created.stage, 'progress', created.progress, 'created_at', created.created_at, 'replayed', false);
end
$function$;

create function api.cancel_campaign_lab_run(requested_run_id uuid, requested_correlation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  subject uuid;
  current_run api.campaign_lab_runs%rowtype;
  next_status text;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then raise exception using errcode = '42501', message = 'unauthorized'; end if;
  select * into current_run from api.campaign_lab_runs where id = requested_run_id and private.is_org_member(organization_id, subject) for update;
  if not found then raise exception using errcode = 'P0002', message = 'not_found'; end if;
  if not private.has_org_role(current_run.organization_id, subject, array['owner', 'editor']::api.organization_role[]) then raise exception using errcode = '42501', message = 'forbidden'; end if;
  if current_run.status in ('succeeded', 'failed', 'canceled') then
    return pg_catalog.jsonb_build_object('run_id', current_run.id, 'campaign_id', current_run.campaign_id, 'status', current_run.status, 'stage', current_run.stage, 'progress', current_run.progress, 'replayed', true);
  end if;
  next_status := case when current_run.status = 'running' then 'cancel_requested' else 'canceled' end;
  update api.campaign_lab_runs set status = next_status, stage = next_status, completed_at = case when next_status = 'canceled' then pg_catalog.statement_timestamp() else null end where id = current_run.id;
  insert into api.campaign_lab_events (organization_id, campaign_id, run_id, stage, progress, event_kind, message)
  values (current_run.organization_id, current_run.campaign_id, current_run.id, next_status, current_run.progress, 'canceled', 'Campaign lab run cancellation requested.');
  insert into private.audit_events (organization_id, actor_type, actor_user_id, action, object_type, object_id, correlation_id, outcome, source_service, metadata)
  values (current_run.organization_id, 'user', subject, 'campaign_lab.run_canceled', 'campaign_lab_run', current_run.id, requested_correlation_id, 'success', 'api', pg_catalog.jsonb_build_object('previous_status', current_run.status));
  return pg_catalog.jsonb_build_object('run_id', current_run.id, 'campaign_id', current_run.campaign_id, 'status', next_status, 'stage', next_status, 'progress', current_run.progress, 'replayed', false);
end
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
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  subject uuid;
  current_campaign api.campaign_lab_campaigns%rowtype;
  updated_campaign api.campaign_lab_campaigns%rowtype;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  select * into current_campaign from api.campaign_lab_campaigns
  where id = requested_campaign_id and private.is_org_member(organization_id, subject) for update;
  if not found then raise exception using errcode = 'P0002', message = 'not_found'; end if;
  if not private.has_org_role(current_campaign.organization_id, subject, array['owner', 'editor']::api.organization_role[]) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if current_campaign.version <> requested_expected_version then
    raise exception using errcode = '40001', message = 'version_conflict';
  end if;
  if current_campaign.status in ('running', 'completed', 'archived') then
    raise exception using errcode = '55000', message = 'campaign_lab_campaign_immutable';
  end if;
  if requested_name is null or pg_catalog.char_length(pg_catalog.btrim(requested_name)) not between 2 and 120
    or requested_objective is null or pg_catalog.char_length(requested_objective) not between 2 and 2000
    or requested_decision is null or pg_catalog.jsonb_typeof(requested_decision) <> 'object'
  then raise exception using errcode = '22023', message = 'invalid_campaign_lab_campaign_patch'; end if;
  update api.campaign_lab_campaigns set
    name = pg_catalog.btrim(requested_name), objective = requested_objective,
    decision_definition = requested_decision, version = version + 1,
    status = case when status = 'draft' then 'active' else status end,
    updated_at = pg_catalog.statement_timestamp()
  where id = current_campaign.id returning * into updated_campaign;
  insert into api.campaign_lab_events (organization_id, campaign_id, stage, progress, event_kind, message)
  values (updated_campaign.organization_id, updated_campaign.id, updated_campaign.current_stage, 0, 'progress', 'Campaign lab workspace updated.');
  insert into private.audit_events (
    organization_id, actor_type, actor_user_id, action, object_type, object_id,
    correlation_id, outcome, source_service, metadata
  ) values (
    updated_campaign.organization_id, 'user', subject, 'campaign_lab.campaign_updated',
    'campaign_lab_campaign', updated_campaign.id, requested_correlation_id, 'success', 'api',
    pg_catalog.jsonb_build_object('version', updated_campaign.version)
  );
  return pg_catalog.jsonb_build_object(
    'campaign_id', updated_campaign.id, 'organization_id', updated_campaign.organization_id,
    'project_id', updated_campaign.project_id, 'name', updated_campaign.name,
    'objective', updated_campaign.objective, 'purpose', updated_campaign.purpose,
    'status', updated_campaign.status, 'current_stage', updated_campaign.current_stage,
    'compliance_status', updated_campaign.compliance_status, 'version', updated_campaign.version,
    'created_at', updated_campaign.created_at, 'updated_at', updated_campaign.updated_at,
    'replayed', false
  );
end
$function$;

reset role;

set role postgres;
grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create function private.claim_campaign_lab_runs(requested_batch_size integer)
returns table (run_id uuid, run_type text, request jsonb, secret_payload jsonb, lease_token uuid, attempt_count integer)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  claimed record;
begin
  if session_user <> 'simula_worker' then raise exception using errcode = '42501', message = 'unauthorized'; end if;
  if requested_batch_size is null or requested_batch_size not between 1 and 10 then raise exception using errcode = '22023', message = 'invalid_campaign_lab_batch_size'; end if;
  for claimed in
    with due as (
      select runs.id from api.campaign_lab_runs as runs
      where ((runs.status in ('queued', 'retrying') and runs.next_attempt_at <= pg_catalog.statement_timestamp())
        or (runs.status = 'running' and runs.lease_expires_at <= pg_catalog.statement_timestamp()))
        and runs.attempt_count < 10
      order by runs.next_attempt_at, runs.created_at, runs.id
      for update skip locked limit requested_batch_size
    )
    update api.campaign_lab_runs as runs
    set status = 'running', stage = 'executing', progress = greatest(runs.progress, 5),
      started_at = coalesce(runs.started_at, pg_catalog.statement_timestamp()), attempt_count = runs.attempt_count + 1,
      lease_token = pg_catalog.gen_random_uuid(), lease_expires_at = pg_catalog.statement_timestamp() + interval '5 minutes',
      last_error_code = null, last_error_detail = null
    from due where runs.id = due.id returning runs.*
  loop
    insert into api.campaign_lab_events (organization_id, campaign_id, run_id, stage, progress, event_kind, message)
    values (claimed.organization_id, claimed.campaign_id, claimed.id, 'executing', claimed.progress, 'started', 'Campaign lab worker started a durable run.');
    insert into private.audit_events (organization_id, actor_type, actor_user_id, action, object_type, object_id, correlation_id, outcome, source_service, metadata)
    values (claimed.organization_id, 'worker', null, 'campaign_lab.run_started', 'campaign_lab_run', claimed.id, claimed.id, 'success', 'worker', pg_catalog.jsonb_build_object('run_type', claimed.run_type, 'attempt_count', claimed.attempt_count));
    return query
      select claimed.id, claimed.run_type, claimed.request, secrets.payload, claimed.lease_token, claimed.attempt_count
      from private.campaign_lab_secrets as secrets where secrets.run_id = claimed.id
      union all
      select claimed.id, claimed.run_type, claimed.request, null::jsonb, claimed.lease_token, claimed.attempt_count
      where not exists (select 1 from private.campaign_lab_secrets as secrets where secrets.run_id = claimed.id);
  end loop;
end
$function$;

create function private.update_campaign_lab_run_progress(requested_run_id uuid, requested_lease_token uuid, requested_stage text, requested_progress smallint, requested_message text)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  if session_user <> 'simula_worker' then raise exception using errcode = '42501', message = 'unauthorized'; end if;
  update api.campaign_lab_runs set stage = requested_stage, progress = requested_progress, lease_expires_at = pg_catalog.statement_timestamp() + interval '5 minutes'
  where id = requested_run_id and lease_token = requested_lease_token and status = 'running';
  if not found then return false; end if;
  insert into api.campaign_lab_events (organization_id, campaign_id, run_id, stage, progress, event_kind, message)
  select organization_id, campaign_id, id, requested_stage, requested_progress, 'progress', requested_message from api.campaign_lab_runs where id = requested_run_id;
  return true;
end
$function$;

create function private.finalize_canceled_campaign_lab_run(requested_run_id uuid, requested_lease_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  canceled api.campaign_lab_runs%rowtype;
begin
  if session_user <> 'simula_worker' then raise exception using errcode = '42501', message = 'unauthorized'; end if;
  update api.campaign_lab_runs
  set status = 'canceled', stage = 'canceled', progress = least(progress, 99),
      completed_at = pg_catalog.statement_timestamp(), lease_token = null, lease_expires_at = null
  where id = requested_run_id and lease_token = requested_lease_token and status = 'cancel_requested'
  returning * into canceled;
  if not found then return false; end if;
  update api.campaign_lab_campaigns set status = 'active', updated_at = pg_catalog.statement_timestamp() where id = canceled.campaign_id;
  delete from private.campaign_lab_secrets where run_id = canceled.id;
  insert into api.campaign_lab_events (organization_id, campaign_id, run_id, stage, progress, event_kind, message)
  values (canceled.organization_id, canceled.campaign_id, canceled.id, 'canceled', canceled.progress, 'canceled', 'Campaign Lab run canceled before completion.');
  insert into private.audit_events (organization_id, actor_type, actor_user_id, action, object_type, object_id, correlation_id, outcome, source_service, metadata)
  values (canceled.organization_id, 'worker', null, 'campaign_lab.run_canceled', 'campaign_lab_run', canceled.id, canceled.id, 'failure', 'worker', pg_catalog.jsonb_build_object('status', 'canceled'));
  return true;
end
$function$;

create function private.complete_campaign_lab_run(requested_run_id uuid, requested_lease_token uuid, requested_result jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  completed api.campaign_lab_runs%rowtype;
begin
  if session_user <> 'simula_worker' then raise exception using errcode = '42501', message = 'unauthorized'; end if;
  if requested_result is null or pg_catalog.jsonb_typeof(requested_result) <> 'object' or pg_catalog.octet_length(requested_result::text) > 4194304 then raise exception using errcode = '22023', message = 'invalid_campaign_lab_result'; end if;
  update api.campaign_lab_runs set status = 'succeeded', stage = case run_type when 'repeated_simulation' then 'simulated' when 'survey_calibration' then 'calibrated' when 'historical_backtest' then 'backtested' else 'reported' end, progress = 100, result = requested_result, completed_at = pg_catalog.statement_timestamp(), lease_token = null, lease_expires_at = null where id = requested_run_id and lease_token = requested_lease_token and status = 'running' returning * into completed;
  if not found then return false; end if;
  update api.campaign_lab_campaigns set status = case when completed.run_type = 'report' then 'completed' else 'active' end, current_stage = case completed.run_type when 'repeated_simulation' then 'simulated' when 'survey_calibration' then 'calibrated' when 'historical_backtest' then 'backtested' else 'reported' end, updated_at = pg_catalog.statement_timestamp() where id = completed.campaign_id;
  delete from private.campaign_lab_secrets where run_id = requested_run_id;
  insert into api.campaign_lab_events (organization_id, campaign_id, run_id, stage, progress, event_kind, message)
  values (completed.organization_id, completed.campaign_id, completed.id, completed.stage, 100, 'completed', 'Campaign Lab durable run completed with a reproducible aggregate output.');
  insert into private.audit_events (organization_id, actor_type, actor_user_id, action, object_type, object_id, correlation_id, outcome, source_service, metadata)
  values (completed.organization_id, 'worker', null, 'campaign_lab.run_completed', 'campaign_lab_run', completed.id, completed.id, 'success', 'worker', pg_catalog.jsonb_build_object('attempt_count', completed.attempt_count));
  return true;
end
$function$;

create function private.fail_campaign_lab_run(requested_run_id uuid, requested_lease_token uuid, requested_error_code text, requested_error_detail text, requested_retryable boolean)
returns text
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  current_run api.campaign_lab_runs%rowtype;
  final_status text;
  delay_seconds integer;
begin
  if session_user <> 'simula_worker' then raise exception using errcode = '42501', message = 'unauthorized'; end if;
  select * into current_run from api.campaign_lab_runs where id = requested_run_id and lease_token = requested_lease_token and status = 'running' for update;
  if not found then return 'stale'; end if;
  if requested_retryable and current_run.attempt_count < 5 then
    delay_seconds := least(300, 2 ^ greatest(0, current_run.attempt_count - 1));
    update api.campaign_lab_runs set status = 'retrying', stage = 'retrying', next_attempt_at = pg_catalog.statement_timestamp() + make_interval(secs => delay_seconds), lease_token = null, lease_expires_at = null, last_error_code = requested_error_code, last_error_detail = requested_error_detail where id = current_run.id;
    final_status := 'retrying';
  else
    update api.campaign_lab_runs set status = 'failed', stage = 'failed', progress = least(progress, 99), completed_at = pg_catalog.statement_timestamp(), lease_token = null, lease_expires_at = null, last_error_code = requested_error_code, last_error_detail = requested_error_detail where id = current_run.id;
    update api.campaign_lab_campaigns set status = 'active', updated_at = pg_catalog.statement_timestamp() where id = current_run.campaign_id;
    delete from private.campaign_lab_secrets where run_id = current_run.id;
    final_status := 'failed';
  end if;
  insert into api.campaign_lab_events (organization_id, campaign_id, run_id, stage, progress, event_kind, message)
  values (current_run.organization_id, current_run.campaign_id, current_run.id, final_status, current_run.progress, case when final_status = 'retrying' then 'retrying' else 'failed' end, requested_error_detail);
  insert into private.audit_events (organization_id, actor_type, actor_user_id, action, object_type, object_id, correlation_id, outcome, source_service, metadata)
  values (current_run.organization_id, 'worker', null, 'campaign_lab.run_failed', 'campaign_lab_run', current_run.id, current_run.id, 'failure', 'worker', pg_catalog.jsonb_build_object('error_code', requested_error_code, 'retryable', requested_retryable, 'status', final_status));
  return final_status;
end
$function$;

reset role;

set role simula_command_owner;
revoke all on function api.create_campaign_lab_campaign(uuid, uuid, text, text, text, jsonb, text, text, uuid) from public, anon, authenticated, simula_api, simula_worker, postgres;
grant execute on function api.create_campaign_lab_campaign(uuid, uuid, text, text, text, jsonb, text, text, uuid) to simula_api;
revoke all on function api.update_campaign_lab_campaign(uuid, integer, text, text, jsonb, uuid) from public, anon, authenticated, simula_api, simula_worker, postgres;
grant execute on function api.update_campaign_lab_campaign(uuid, integer, text, text, jsonb, uuid) to simula_api;
revoke all on function api.create_campaign_lab_artifact(uuid, uuid, text, text, jsonb, jsonb, text, jsonb, text, text, uuid) from public, anon, authenticated, simula_api, simula_worker, postgres;
grant execute on function api.create_campaign_lab_artifact(uuid, uuid, text, text, jsonb, jsonb, text, jsonb, text, text, uuid) to simula_api;
revoke all on function api.create_campaign_lab_run(uuid, uuid, text, jsonb, jsonb, text, text, uuid) from public, anon, authenticated, simula_api, simula_worker, postgres;
grant execute on function api.create_campaign_lab_run(uuid, uuid, text, jsonb, jsonb, text, text, uuid) to simula_api;
revoke all on function api.cancel_campaign_lab_run(uuid, uuid) from public, anon, authenticated, simula_api, simula_worker, postgres;
grant execute on function api.cancel_campaign_lab_run(uuid, uuid) to simula_api;

reset role;
set role simula_worker_owner;
revoke all on function private.claim_campaign_lab_runs(integer) from public, anon, authenticated, simula_api, simula_worker_owner, postgres;
grant execute on function private.claim_campaign_lab_runs(integer) to simula_worker;
revoke all on function private.update_campaign_lab_run_progress(uuid, uuid, text, smallint, text) from public, anon, authenticated, simula_api, simula_worker_owner, postgres;
grant execute on function private.update_campaign_lab_run_progress(uuid, uuid, text, smallint, text) to simula_worker;
revoke all on function private.finalize_canceled_campaign_lab_run(uuid, uuid) from public, anon, authenticated, simula_api, simula_worker_owner, postgres;
grant execute on function private.finalize_canceled_campaign_lab_run(uuid, uuid) to simula_worker;
revoke all on function private.complete_campaign_lab_run(uuid, uuid, jsonb) from public, anon, authenticated, simula_api, simula_worker_owner, postgres;
grant execute on function private.complete_campaign_lab_run(uuid, uuid, jsonb) to simula_worker;
revoke all on function private.fail_campaign_lab_run(uuid, uuid, text, text, boolean) from public, anon, authenticated, simula_api, simula_worker_owner, postgres;
grant execute on function private.fail_campaign_lab_run(uuid, uuid, text, text, boolean) to simula_worker;

do $patch_campaign_lab_runtime_head$
declare
  original_definition text;
  replacement_definition text;
begin
  select pg_catalog.pg_get_functiondef('private.runtime_schema_readiness()'::pg_catalog.regprocedure) into original_definition;
  replacement_definition := pg_catalog.replace(original_definition, '20260801150001::bigint', '20260802060315::bigint');
  if replacement_definition = original_definition then raise exception using errcode = '55000', message = 'campaign_lab_runtime_schema_head_patch_failed'; end if;
  execute replacement_definition;
  select pg_catalog.pg_get_functiondef('private.runtime_observability_snapshot()'::pg_catalog.regprocedure) into original_definition;
  replacement_definition := pg_catalog.replace(original_definition, '20260801150001::bigint', '20260802060315::bigint');
  if replacement_definition = original_definition then raise exception using errcode = '55000', message = 'campaign_lab_runtime_observability_head_patch_failed'; end if;
  execute replacement_definition;
end
$patch_campaign_lab_runtime_head$;

reset role;
set role postgres;
revoke create on schema api, private from simula_command_owner;
revoke create on schema private from simula_worker_owner;
