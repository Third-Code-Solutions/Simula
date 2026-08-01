-- Durable Campaign Simulation Lab evidence jobs.
-- Survey calibration is aggregate-only. Historical outcomes are held in a
-- worker-only secret row until the blind prediction job has completed.

set role postgres;

grant references (organization_id, id)
on table api.evidence_source_versions, api.observed_outcome_sets
to postgres;

create table api.campaign_evidence_runs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  kind text not null,
  status text not null default 'queued',
  stage text not null default 'admitted',
  progress smallint not null default 0,
  request jsonb not null,
  result jsonb,
  source_version_id uuid,
  outcome_set_id uuid,
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
  constraint campaign_evidence_runs_organization_id_id_unique
    unique (organization_id, id),
  constraint campaign_evidence_runs_project_foreign_key
    foreign key (organization_id, project_id)
    references api.projects (organization_id, id) on delete cascade,
  constraint campaign_evidence_runs_source_foreign_key
    foreign key (organization_id, source_version_id)
    references api.evidence_source_versions (organization_id, id)
    on delete restrict,
  constraint campaign_evidence_runs_outcome_foreign_key
    foreign key (organization_id, outcome_set_id)
    references api.observed_outcome_sets (organization_id, id)
    on delete restrict,
  constraint campaign_evidence_runs_kind_valid
    check (kind in ('survey_calibration', 'historical_backtest')),
  constraint campaign_evidence_runs_status_valid
    check (status in ('queued', 'running', 'retrying', 'completed', 'failed', 'cancel_requested', 'canceled')),
  constraint campaign_evidence_runs_stage_valid
    check (stage = pg_catalog.btrim(stage) and pg_catalog.char_length(stage) between 2 and 80),
  constraint campaign_evidence_runs_progress_valid
    check (progress between 0 and 100),
  constraint campaign_evidence_runs_request_valid
    check (pg_catalog.jsonb_typeof(request) = 'object' and pg_catalog.octet_length(request::text) <= 4194304),
  constraint campaign_evidence_runs_result_valid
    check (result is null or (pg_catalog.jsonb_typeof(result) = 'object' and pg_catalog.octet_length(result::text) <= 4194304)),
  constraint campaign_evidence_runs_attempt_valid
    check (attempt_count between 0 and 10),
  constraint campaign_evidence_runs_error_valid
    check (
      (last_error_code is null and last_error_detail is null)
      or (
        last_error_code ~ '^[a-z][a-z0-9_.-]{1,63}$'
        and last_error_detail is not null
        and pg_catalog.char_length(last_error_detail) between 1 and 240
      )
    )
);

create index campaign_evidence_runs_organization_created_idx
  on api.campaign_evidence_runs (organization_id, created_at desc, id);
create index campaign_evidence_runs_project_created_idx
  on api.campaign_evidence_runs (organization_id, project_id, created_at desc, id);
create index campaign_evidence_runs_queue_idx
  on api.campaign_evidence_runs (status, next_attempt_at, created_at, id)
  where status in ('queued', 'retrying', 'running');

create table private.campaign_evidence_secrets (
  run_id uuid primary key,
  organization_id uuid not null,
  payload jsonb not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint campaign_evidence_secrets_run_foreign_key
    foreign key (organization_id, run_id)
    references api.campaign_evidence_runs (organization_id, id)
    on delete cascade,
  constraint campaign_evidence_secrets_payload_valid
    check (pg_catalog.jsonb_typeof(payload) = 'object' and pg_catalog.octet_length(payload::text) <= 4194304)
);

create table api.campaign_evidence_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  run_id uuid not null,
  stage text not null,
  progress smallint not null,
  event_kind text not null,
  message text,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint campaign_evidence_events_organization_id_id_unique
    unique (organization_id, id),
  constraint campaign_evidence_events_run_foreign_key
    foreign key (organization_id, run_id)
    references api.campaign_evidence_runs (organization_id, id)
    on delete cascade,
  constraint campaign_evidence_events_stage_valid
    check (stage = pg_catalog.btrim(stage) and pg_catalog.char_length(stage) between 2 and 80),
  constraint campaign_evidence_events_progress_valid
    check (progress between 0 and 100),
  constraint campaign_evidence_events_kind_valid
    check (event_kind in ('queued', 'started', 'progress', 'completed', 'retrying', 'failed', 'canceled')),
  constraint campaign_evidence_events_message_valid
    check (message is null or pg_catalog.char_length(message) between 1 and 240)
);

create index campaign_evidence_events_run_created_idx
  on api.campaign_evidence_events (organization_id, run_id, created_at desc, id);

create function private.enforce_campaign_evidence_run_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  project_organization_id uuid;
  source_organization_id uuid;
  outcome_organization_id uuid;
begin
  select projects.organization_id into project_organization_id
  from api.projects as projects where projects.id = new.project_id;
  if project_organization_id is null or project_organization_id <> new.organization_id then
    raise exception using errcode = '23514', message = 'campaign_evidence_project_scope_invalid';
  end if;
  if new.source_version_id is not null then
    select versions.organization_id into source_organization_id
    from api.evidence_source_versions as versions where versions.id = new.source_version_id;
    if source_organization_id is distinct from new.organization_id then
      raise exception using errcode = '23514', message = 'campaign_evidence_source_scope_invalid';
    end if;
  end if;
  if new.outcome_set_id is not null then
    select outcomes.organization_id into outcome_organization_id
    from api.observed_outcome_sets as outcomes where outcomes.id = new.outcome_set_id;
    if outcome_organization_id is distinct from new.organization_id then
      raise exception using errcode = '23514', message = 'campaign_evidence_outcome_scope_invalid';
    end if;
  end if;
  return new;
end
$function$;

create trigger campaign_evidence_runs_scope_guard
before insert or update of organization_id, project_id, source_version_id, outcome_set_id
on api.campaign_evidence_runs
for each row execute function private.enforce_campaign_evidence_run_scope();

alter table api.campaign_evidence_runs enable row level security;
alter table api.campaign_evidence_runs force row level security;
alter table private.campaign_evidence_secrets enable row level security;
alter table private.campaign_evidence_secrets force row level security;
alter table api.campaign_evidence_events enable row level security;
alter table api.campaign_evidence_events force row level security;

create policy campaign_evidence_runs_api_select
on api.campaign_evidence_runs for select to simula_api
using (private.is_org_member(organization_id, private.verified_subject()));
create policy campaign_evidence_events_api_select
on api.campaign_evidence_events for select to simula_api
using (private.is_org_member(organization_id, private.verified_subject()));

create policy campaign_evidence_runs_command_select
on api.campaign_evidence_runs for select to simula_command_owner
using (private.is_org_member(organization_id, private.verified_subject()));
create policy campaign_evidence_runs_command_insert
on api.campaign_evidence_runs for insert to simula_command_owner
with check (
  private.is_verified_api_subject(created_by)
  and private.has_org_role(organization_id, private.verified_subject(), array['owner', 'editor']::api.organization_role[])
);
create policy campaign_evidence_runs_command_update
on api.campaign_evidence_runs for update to simula_command_owner
using (private.is_org_member(organization_id, private.verified_subject()))
with check (private.is_org_member(organization_id, private.verified_subject()));

create policy campaign_evidence_secrets_command_insert
on private.campaign_evidence_secrets for insert to simula_command_owner
with check (private.is_org_member(organization_id, private.verified_subject()));
create policy campaign_evidence_secrets_worker_select
on private.campaign_evidence_secrets for select to simula_worker_owner
using (true);
create policy campaign_evidence_secrets_worker_delete
on private.campaign_evidence_secrets for delete to simula_worker_owner
using (true);
create policy campaign_evidence_runs_worker_select
on api.campaign_evidence_runs for select to simula_worker_owner
using (true);
create policy campaign_evidence_runs_worker_update
on api.campaign_evidence_runs for update to simula_worker_owner
using (true) with check (true);
create policy campaign_evidence_events_worker_insert
on api.campaign_evidence_events for insert to simula_worker_owner
with check (true);

create policy audit_events_campaign_evidence_insert
on private.audit_events for insert to simula_command_owner
with check (
  actor_type = 'user'
  and private.is_verified_api_subject(actor_user_id)
  and source_service = 'api'
  and outcome = 'success'
  and action in ('campaign_evidence.created', 'campaign_evidence.canceled')
  and private.is_org_member(organization_id, private.verified_subject())
);
create policy audit_events_campaign_evidence_worker_insert
on private.audit_events for insert to simula_worker_owner
with check (
  actor_type = 'worker'
  and actor_user_id is null
  and source_service = 'worker'
  and outcome in ('success', 'failure')
  and action in ('campaign_evidence.started', 'campaign_evidence.completed', 'campaign_evidence.failed')
);

revoke all on table api.campaign_evidence_runs, api.campaign_evidence_events
from public, anon, authenticated, simula_api, simula_worker, simula_command_owner, simula_worker_owner;
revoke all on table private.campaign_evidence_secrets
from public, anon, authenticated, simula_api, simula_worker, simula_command_owner, simula_worker_owner;
grant select on table api.campaign_evidence_runs, api.campaign_evidence_events to simula_api;
grant select, insert, update on table api.campaign_evidence_runs to simula_command_owner;
grant select, update on table api.campaign_evidence_runs to simula_worker_owner;
grant select on table api.campaign_evidence_events to simula_command_owner;
grant insert on table api.campaign_evidence_events to simula_command_owner;
grant insert on table api.campaign_evidence_events to simula_worker_owner;
grant insert on table private.campaign_evidence_secrets to simula_command_owner;
grant select, delete on table private.campaign_evidence_secrets to simula_worker_owner;
grant select on table private.audit_events to simula_command_owner;
grant insert on table private.audit_events to simula_command_owner, simula_worker_owner;

grant create on schema private to simula_command_owner, simula_worker_owner;
set role simula_command_owner;

create function private.create_campaign_evidence_run_atomic(
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
  command_record record;
  created_run api.campaign_evidence_runs%rowtype;
  response_payload jsonb;
  source_rights text;
  source_expiry timestamptz;
  outcome_status text;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if not private.has_org_role(requested_organization_id, subject, array['owner', 'editor']::api.organization_role[]) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if requested_kind not in ('survey_calibration', 'historical_backtest')
    or requested_request is null
    or pg_catalog.jsonb_typeof(requested_request) <> 'object'
    or pg_catalog.octet_length(requested_request::text) > 4194304
    or requested_idempotency_key !~ '^[ -~]{16,128}$'
    or requested_sha256 !~ '^[0-9a-f]{64}$'
    or requested_correlation_id is null
  then
    raise exception using errcode = '22023', message = 'invalid_campaign_evidence_request';
  end if;
  if not exists (
    select 1 from api.projects as projects
    where projects.id = requested_project_id
      and projects.organization_id = requested_organization_id
      and projects.status = 'active'
  ) then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if requested_kind = 'survey_calibration' and requested_source_version_id is null then
    raise exception using errcode = '22023', message = 'survey_source_required';
  end if;
  if requested_kind = 'historical_backtest' and requested_outcome_set_id is null then
    raise exception using errcode = '22023', message = 'historical_outcome_required';
  end if;
  if requested_source_version_id is not null then
    select versions.rights_status, versions.rights_expires_at
      into source_rights, source_expiry
    from api.evidence_source_versions as versions
    where versions.id = requested_source_version_id
      and versions.organization_id = requested_organization_id;
    if source_rights is distinct from 'approved'
      or (source_expiry is not null and source_expiry <= pg_catalog.statement_timestamp()) then
      raise exception using errcode = '42501', message = 'evidence_source_not_admitted';
    end if;
  end if;
  if requested_outcome_set_id is not null then
    select outcomes.status into outcome_status
    from api.observed_outcome_sets as outcomes
    where outcomes.id = requested_outcome_set_id
      and outcomes.organization_id = requested_organization_id;
    if outcome_status is distinct from 'admitted' then
      raise exception using errcode = '42501', message = 'historical_outcome_not_admitted';
    end if;
  end if;
  select * into command_record from private.begin_phase4_command(
    'campaign_evidence.create.' || requested_kind,
    requested_organization_id, requested_idempotency_key, requested_sha256
  );
  if command_record.replayed then return command_record.existing_response; end if;
  insert into api.campaign_evidence_runs (
    organization_id, project_id, kind, request, source_version_id,
    outcome_set_id, created_by
  ) values (
    requested_organization_id, requested_project_id, requested_kind,
    requested_request, requested_source_version_id, requested_outcome_set_id, subject
  ) returning * into created_run;
  if requested_secret is not null then
    if pg_catalog.jsonb_typeof(requested_secret) <> 'object'
      or pg_catalog.octet_length(requested_secret::text) > 4194304 then
      raise exception using errcode = '22023', message = 'invalid_campaign_evidence_secret';
    end if;
    insert into private.campaign_evidence_secrets (run_id, organization_id, payload)
    values (created_run.id, created_run.organization_id, requested_secret);
  end if;
  insert into api.campaign_evidence_events (organization_id, run_id, stage, progress, event_kind, message)
  values (created_run.organization_id, created_run.id, 'admitted', 0, 'queued', 'Evidence job admitted.');
  response_payload := pg_catalog.jsonb_build_object(
    'evidence_id', created_run.id,
    'organization_id', created_run.organization_id,
    'project_id', created_run.project_id,
    'kind', created_run.kind,
    'status', created_run.status,
    'stage', created_run.stage,
    'progress', created_run.progress,
    'created_at', created_run.created_at,
    'replayed', false
  );
  perform private.finish_phase4_command(command_record.receipt_id, created_run.id, response_payload);
  insert into private.audit_events (
    organization_id, actor_type, actor_user_id, action, object_type, object_id,
    correlation_id, outcome, source_service, metadata
  ) values (
    created_run.organization_id, 'user', subject, 'campaign_evidence.created',
    'campaign_evidence_run', created_run.id, requested_correlation_id, 'success', 'api',
    pg_catalog.jsonb_build_object('kind', requested_kind, 'source_version_id', requested_source_version_id, 'outcome_set_id', requested_outcome_set_id)
  );
  return response_payload;
end
$function$;

create function private.cancel_campaign_evidence_run_atomic(
  requested_run_id uuid,
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
  current_run api.campaign_evidence_runs%rowtype;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  select * into current_run from api.campaign_evidence_runs
  where id = requested_run_id and private.is_org_member(organization_id, subject)
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'not_found'; end if;
  if not private.has_org_role(current_run.organization_id, subject, array['owner', 'editor']::api.organization_role[]) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if current_run.status in ('completed', 'failed', 'canceled') then
    return pg_catalog.jsonb_build_object('evidence_id', current_run.id, 'status', current_run.status, 'progress', current_run.progress, 'replayed', true);
  end if;
  update api.campaign_evidence_runs
  set status = case when status = 'running' then 'cancel_requested' else 'canceled' end,
      stage = case when status = 'running' then 'cancel_requested' else 'canceled' end,
      completed_at = case when status = 'running' then null else pg_catalog.statement_timestamp() end
  where id = current_run.id;
  insert into api.campaign_evidence_events (organization_id, run_id, stage, progress, event_kind, message)
  values (current_run.organization_id, current_run.id, 'cancel_requested', current_run.progress, 'canceled', 'Cancellation requested by an authorized user.');
  insert into private.audit_events (
    organization_id, actor_type, actor_user_id, action, object_type, object_id,
    correlation_id, outcome, source_service, metadata
  ) values (
    current_run.organization_id, 'user', subject, 'campaign_evidence.canceled',
    'campaign_evidence_run', current_run.id, requested_correlation_id, 'success', 'api',
    pg_catalog.jsonb_build_object('previous_status', current_run.status)
  );
  return pg_catalog.jsonb_build_object('evidence_id', current_run.id, 'status', case when current_run.status = 'running' then 'cancel_requested' else 'canceled' end, 'progress', current_run.progress, 'replayed', false);
end
$function$;

reset role;

set role simula_worker_owner;

create function private.claim_campaign_evidence_runs(requested_batch_size integer)
returns table (
  evidence_id uuid,
  kind text,
  request jsonb,
  secret_payload jsonb,
  lease_token uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  claimed record;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_batch_size is null or requested_batch_size not between 1 and 10 then
    raise exception using errcode = '22023', message = 'invalid_evidence_batch_size';
  end if;
  for claimed in
    with due as (
      select runs.id from api.campaign_evidence_runs as runs
      where (
        (
          runs.status in ('queued', 'retrying') and runs.next_attempt_at <= pg_catalog.statement_timestamp()
        ) or (
          runs.status = 'running' and runs.lease_expires_at <= pg_catalog.statement_timestamp()
        )
      )
        and runs.attempt_count < 10
      order by runs.next_attempt_at, runs.created_at, runs.id
      for update skip locked limit requested_batch_size
    )
    update api.campaign_evidence_runs as runs
    set status = 'running', stage = 'executing', progress = greatest(runs.progress, 5),
        started_at = coalesce(runs.started_at, pg_catalog.statement_timestamp()),
        attempt_count = runs.attempt_count + 1,
        lease_token = pg_catalog.gen_random_uuid(),
        lease_expires_at = pg_catalog.statement_timestamp() + interval '2 minutes',
        last_error_code = null, last_error_detail = null
    from due where runs.id = due.id
    returning runs.*
  loop
    insert into api.campaign_evidence_events (organization_id, run_id, stage, progress, event_kind, message)
    values (claimed.organization_id, claimed.id, 'executing', claimed.progress, 'started', 'Evidence job started.');
    insert into private.audit_events (organization_id, actor_type, actor_user_id, action, object_type, object_id, correlation_id, outcome, source_service, metadata)
    values (claimed.organization_id, 'worker', null, 'campaign_evidence.started', 'campaign_evidence_run', claimed.id, claimed.id, 'success', 'worker', pg_catalog.jsonb_build_object('kind', claimed.kind, 'attempt_count', claimed.attempt_count));
    return query
      select claimed.id, claimed.kind, claimed.request, secrets.payload,
        claimed.lease_token, claimed.attempt_count
      from private.campaign_evidence_secrets as secrets
      where secrets.run_id = claimed.id
      union all
      select claimed.id, claimed.kind, claimed.request, null::jsonb,
        claimed.lease_token, claimed.attempt_count
      where not exists (
        select 1 from private.campaign_evidence_secrets as secrets where secrets.run_id = claimed.id
      );
  end loop;
end
$function$;

create function private.update_campaign_evidence_progress(
  requested_run_id uuid,
  requested_lease_token uuid,
  requested_stage text,
  requested_progress smallint,
  requested_message text
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  if session_user <> 'simula_worker' then raise exception using errcode = '42501', message = 'unauthorized'; end if;
  update api.campaign_evidence_runs
  set stage = requested_stage, progress = requested_progress,
      lease_expires_at = pg_catalog.statement_timestamp() + interval '2 minutes'
  where id = requested_run_id and lease_token = requested_lease_token and status = 'running';
  if not found then return false; end if;
  insert into api.campaign_evidence_events (organization_id, run_id, stage, progress, event_kind, message)
  select runs.organization_id, runs.id, requested_stage, requested_progress, 'progress', requested_message
  from api.campaign_evidence_runs as runs where runs.id = requested_run_id;
  return true;
end
$function$;

create function private.complete_campaign_evidence_run(
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
  completed_run api.campaign_evidence_runs%rowtype;
begin
  if session_user <> 'simula_worker' then raise exception using errcode = '42501', message = 'unauthorized'; end if;
  if requested_result is null or pg_catalog.jsonb_typeof(requested_result) <> 'object' or pg_catalog.octet_length(requested_result::text) > 4194304 then
    raise exception using errcode = '22023', message = 'invalid_evidence_result';
  end if;
  update api.campaign_evidence_runs
  set status = 'completed', stage = 'completed', progress = 100,
      result = requested_result, completed_at = pg_catalog.statement_timestamp(),
      lease_token = null, lease_expires_at = null
  where id = requested_run_id and lease_token = requested_lease_token and status = 'running'
  returning * into completed_run;
  if not found then return false; end if;
  delete from private.campaign_evidence_secrets where run_id = requested_run_id;
  insert into api.campaign_evidence_events (organization_id, run_id, stage, progress, event_kind, message)
  values (completed_run.organization_id, completed_run.id, 'completed', 100, 'completed', 'Evidence evaluation completed.');
  insert into private.audit_events (organization_id, actor_type, actor_user_id, action, object_type, object_id, correlation_id, outcome, source_service, metadata)
  values (completed_run.organization_id, 'worker', null, 'campaign_evidence.completed', 'campaign_evidence_run', completed_run.id, completed_run.id, 'success', 'worker', pg_catalog.jsonb_build_object('kind', completed_run.kind, 'attempt_count', completed_run.attempt_count));
  return true;
end
$function$;

create function private.fail_campaign_evidence_run(
  requested_run_id uuid,
  requested_lease_token uuid,
  requested_error_code text,
  requested_error_detail text,
  requested_retryable boolean
)
returns text
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  current_run api.campaign_evidence_runs%rowtype;
  final_status text;
  delay_seconds integer;
begin
  if session_user <> 'simula_worker' then raise exception using errcode = '42501', message = 'unauthorized'; end if;
  select * into current_run from api.campaign_evidence_runs
  where id = requested_run_id and lease_token = requested_lease_token and status = 'running' for update;
  if not found then return 'stale'; end if;
  if requested_retryable and current_run.attempt_count < 5 then
    delay_seconds := least(300, 2 ^ greatest(0, current_run.attempt_count - 1));
    update api.campaign_evidence_runs set status = 'retrying', stage = 'retrying', next_attempt_at = pg_catalog.statement_timestamp() + make_interval(secs => delay_seconds), lease_token = null, lease_expires_at = null, last_error_code = requested_error_code, last_error_detail = requested_error_detail where id = current_run.id;
    final_status := 'retrying';
  else
    update api.campaign_evidence_runs set status = 'failed', stage = 'failed', progress = least(progress, 99), completed_at = pg_catalog.statement_timestamp(), lease_token = null, lease_expires_at = null, last_error_code = requested_error_code, last_error_detail = requested_error_detail where id = current_run.id;
    delete from private.campaign_evidence_secrets where run_id = current_run.id;
    final_status := 'failed';
  end if;
  insert into api.campaign_evidence_events (organization_id, run_id, stage, progress, event_kind, message)
  values (current_run.organization_id, current_run.id, final_status, current_run.progress, case when final_status = 'retrying' then 'retrying' else 'failed' end, requested_error_detail);
  insert into private.audit_events (organization_id, actor_type, actor_user_id, action, object_type, object_id, correlation_id, outcome, source_service, metadata)
  values (current_run.organization_id, 'worker', null, 'campaign_evidence.failed', 'campaign_evidence_run', current_run.id, current_run.id, 'failure', 'worker', pg_catalog.jsonb_build_object('error_code', requested_error_code, 'retryable', requested_retryable, 'status', final_status));
  return final_status;
end
$function$;

reset role;

set role postgres;

revoke references (organization_id, id)
on table api.evidence_source_versions, api.observed_outcome_sets
from postgres;

create function api.create_campaign_evidence_run(
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
returns jsonb language sql set search_path = '' as $function$
  select private.create_campaign_evidence_run_atomic(
    requested_organization_id, requested_project_id, requested_kind,
    requested_request, requested_secret, requested_source_version_id,
    requested_outcome_set_id, requested_idempotency_key, requested_sha256,
    requested_correlation_id
  );
$function$;

create function api.cancel_campaign_evidence_run(requested_run_id uuid, requested_correlation_id uuid)
returns jsonb language sql set search_path = '' as $function$
  select private.cancel_campaign_evidence_run_atomic(requested_run_id, requested_correlation_id);
$function$;

revoke all on function api.create_campaign_evidence_run(uuid, uuid, text, jsonb, jsonb, uuid, uuid, text, text, uuid)
from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function api.create_campaign_evidence_run(uuid, uuid, text, jsonb, jsonb, uuid, uuid, text, text, uuid) to simula_api;
set role simula_command_owner;
revoke all on function private.create_campaign_evidence_run_atomic(uuid, uuid, text, jsonb, jsonb, uuid, uuid, text, text, uuid)
from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function private.create_campaign_evidence_run_atomic(uuid, uuid, text, jsonb, jsonb, uuid, uuid, text, text, uuid) to simula_api;
set role postgres;
revoke all on function api.cancel_campaign_evidence_run(uuid, uuid)
from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function api.cancel_campaign_evidence_run(uuid, uuid) to simula_api;
set role simula_command_owner;
revoke all on function private.cancel_campaign_evidence_run_atomic(uuid, uuid)
from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;
grant execute on function private.cancel_campaign_evidence_run_atomic(uuid, uuid) to simula_api;
set role simula_worker_owner;
revoke all on function private.claim_campaign_evidence_runs(integer)
from public, anon, authenticated, simula_api, simula_worker_owner, postgres;
grant execute on function private.claim_campaign_evidence_runs(integer) to simula_worker;
revoke all on function private.update_campaign_evidence_progress(uuid, uuid, text, smallint, text)
from public, anon, authenticated, simula_api, simula_worker_owner, postgres;
grant execute on function private.update_campaign_evidence_progress(uuid, uuid, text, smallint, text) to simula_worker;
revoke all on function private.complete_campaign_evidence_run(uuid, uuid, jsonb)
from public, anon, authenticated, simula_api, simula_worker_owner, postgres;
grant execute on function private.complete_campaign_evidence_run(uuid, uuid, jsonb) to simula_worker;
revoke all on function private.fail_campaign_evidence_run(uuid, uuid, text, text, boolean)
from public, anon, authenticated, simula_api, simula_worker_owner, postgres;
grant execute on function private.fail_campaign_evidence_run(uuid, uuid, text, text, boolean) to simula_worker;
set role postgres;
revoke all on function private.enforce_campaign_evidence_run_scope()
from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner, postgres;

set role postgres;
revoke create on schema private from simula_command_owner, simula_worker_owner;
