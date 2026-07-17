-- P2-02 database foundation. Runtime roles receive no passwords in source.
-- `supabase/roles.sql` is the required privileged role bootstrap.

do $role_precondition$
begin
  if exists (
    select 1
    from (values
      ('simula_api'),
      ('simula_worker'),
      ('simula_command_owner'),
      ('simula_worker_owner')
    ) as required_roles (role_name)
    where not exists (
      select 1
      from pg_catalog.pg_roles
      where pg_roles.rolname = required_roles.role_name
    )
  ) then
    raise exception using
      errcode = '55000',
      message = 'simula_role_bootstrap_missing';
  end if;
end
$role_precondition$;

create schema api authorization postgres;
create schema private authorization postgres;

comment on schema api is 'SIMULA application schema; never exposed through browser Data API';
comment on schema private is 'SIMULA internal command, queue, idempotency, and audit schema';

revoke all on schema public from public, anon, authenticated;
revoke all on schema api from public, anon, authenticated, simula_worker;
revoke all on schema private from public, anon, authenticated;

grant usage on schema api, private to simula_api;
grant usage on schema api, private to simula_command_owner;
grant usage on schema private to simula_worker, simula_worker_owner;

alter default privileges for role postgres in schema api
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema private
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres
  revoke execute on functions from public;
set role simula_command_owner;
alter default privileges
  revoke execute on functions from public;
reset role;
set role simula_worker_owner;
alter default privileges
  revoke execute on functions from public;
reset role;

create type api.organization_status as enum ('active', 'disabled', 'deleted');
create type api.organization_role as enum ('owner', 'editor', 'viewer');
create type api.project_status as enum ('active', 'archived', 'deleted');
create type api.stimulus_status as enum ('active', 'retired', 'deleted');
create type api.audience_kind as enum ('authored_demo');
create type api.audience_admission_status as enum ('approved_demo', 'revoked');
create type api.run_state as enum (
  'queued',
  'running',
  'retrying',
  'cancel_requested',
  'canceled',
  'succeeded',
  'failed'
);
create type private.audit_actor_type as enum ('user', 'worker', 'system');
create type private.outbox_status as enum (
  'pending',
  'claimed',
  'dispatched',
  'terminal'
);
create type private.attempt_status as enum (
  'running',
  'succeeded',
  'retrying',
  'failed',
  'canceled',
  'superseded'
);

create table api.organizations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  name text not null,
  status api.organization_status not null default 'active',
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint organizations_name_valid check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 2 and 80
  )
);

create table api.organization_memberships (
  organization_id uuid not null references api.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete restrict,
  role api.organization_role not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  primary key (organization_id, user_id)
);

create index organization_memberships_user_id_idx
  on api.organization_memberships (user_id, organization_id);

create table api.projects (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null references api.organizations (id) on delete cascade,
  name text not null,
  objective text not null,
  market text not null,
  language text not null,
  category text not null,
  status api.project_status not null default 'active',
  version integer not null default 1,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint projects_organization_id_id_unique unique (organization_id, id),
  constraint projects_name_valid check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 2 and 80
  ),
  constraint projects_objective_valid check (
    pg_catalog.char_length(objective) between 1 and 1000
  ),
  constraint projects_market_valid check (
    market = pg_catalog.btrim(market)
    and pg_catalog.char_length(market) between 1 and 80
  ),
  constraint projects_language_valid check (
    language = pg_catalog.btrim(language)
    and pg_catalog.char_length(language) between 1 and 35
  ),
  constraint projects_category_valid check (
    category = pg_catalog.btrim(category)
    and pg_catalog.char_length(category) between 1 and 80
  ),
  constraint projects_version_positive check (version > 0)
);

create index projects_organization_id_idx on api.projects (organization_id, created_at, id);

create table api.stimuli (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  name text not null,
  status api.stimulus_status not null default 'active',
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint stimuli_organization_id_id_unique unique (organization_id, id),
  constraint stimuli_project_foreign_key foreign key (organization_id, project_id)
    references api.projects (organization_id, id) on delete cascade,
  constraint stimuli_name_valid check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 2 and 80
  )
);

create index stimuli_project_id_idx
  on api.stimuli (organization_id, project_id, created_at, id);

create table api.stimulus_versions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  stimulus_id uuid not null,
  version integer not null,
  content text not null,
  content_sha256 text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint stimulus_versions_organization_id_id_unique unique (organization_id, id),
  constraint stimulus_versions_stimulus_version_unique unique (stimulus_id, version),
  constraint stimulus_versions_stimulus_foreign_key
    foreign key (organization_id, stimulus_id)
    references api.stimuli (organization_id, id) on delete cascade,
  constraint stimulus_versions_version_positive check (version > 0),
  constraint stimulus_versions_content_valid check (
    pg_catalog.char_length(content) between 1 and 5000
    and pg_catalog.octet_length(content) <= 16384
  ),
  constraint stimulus_versions_hash_valid check (
    content_sha256 ~ '^[0-9a-f]{64}$'
  )
);

create table api.audiences (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid references api.organizations (id) on delete cascade,
  name text not null,
  is_public_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint audiences_organization_id_id_unique unique nulls not distinct (
    organization_id,
    id
  ),
  constraint audiences_name_valid check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 2 and 80
  ),
  constraint audiences_scope_valid check (
    (is_public_demo and organization_id is null and created_by is null)
    or (not is_public_demo and organization_id is not null and created_by is not null)
  )
);

create table api.audience_versions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid,
  audience_id uuid not null references api.audiences (id) on delete cascade,
  version integer not null,
  kind api.audience_kind not null,
  admission_status api.audience_admission_status not null,
  manifest jsonb not null,
  checksum_sha256 text not null,
  is_non_representative boolean not null,
  limitations text not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint audience_versions_organization_id_id_unique unique nulls not distinct (
    organization_id,
    id
  ),
  constraint audience_versions_audience_version_unique unique (audience_id, version),
  constraint audience_versions_version_positive check (version > 0),
  constraint audience_versions_manifest_object check (
    pg_catalog.jsonb_typeof(manifest) = 'object'
  ),
  constraint audience_versions_checksum_valid check (
    checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint audience_versions_demo_disclosure check (
    kind <> 'authored_demo'
    or (
      admission_status = 'approved_demo'
      and is_non_representative
      and pg_catalog.char_length(limitations) between 1 and 1000
    )
  )
);

create table api.simulation_runs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  stimulus_version_id uuid not null,
  audience_version_id uuid not null references api.audience_versions (id) on delete restrict,
  state api.run_state not null default 'queued',
  frozen_manifest jsonb not null,
  frozen_manifest_sha256 text not null,
  schema_version integer not null,
  deterministic_seed bigint not null,
  dispatch_generation smallint not null default 1,
  attempt_count smallint not null default 0,
  worker_lease_token uuid,
  worker_lease_expires_at timestamptz,
  last_progress_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  correlation_id uuid not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  terminal_at timestamptz,
  constraint simulation_runs_organization_id_id_unique unique (organization_id, id),
  constraint simulation_runs_project_foreign_key foreign key (organization_id, project_id)
    references api.projects (organization_id, id) on delete restrict,
  constraint simulation_runs_stimulus_version_foreign_key
    foreign key (organization_id, stimulus_version_id)
    references api.stimulus_versions (organization_id, id) on delete restrict,
  constraint simulation_runs_manifest_object check (
    pg_catalog.jsonb_typeof(frozen_manifest) = 'object'
  ),
  constraint simulation_runs_manifest_hash_valid check (
    frozen_manifest_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint simulation_runs_schema_version_positive check (schema_version > 0),
  constraint simulation_runs_dispatch_generation_valid check (
    dispatch_generation between 1 and 3
  ),
  constraint simulation_runs_attempt_count_valid check (attempt_count between 0 and 3),
  constraint simulation_runs_lease_pair check (
    (worker_lease_token is null) = (worker_lease_expires_at is null)
  ),
  constraint simulation_runs_terminal_at_valid check (
    (state in ('canceled', 'succeeded', 'failed')) = (terminal_at is not null)
  )
);

create index simulation_runs_organization_state_idx
  on api.simulation_runs (organization_id, state, created_at, id);

create table api.simulation_results (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  run_id uuid not null,
  schema_version integer not null,
  artifact jsonb not null,
  artifact_sha256 text not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint simulation_results_run_unique unique (run_id),
  constraint simulation_results_run_foreign_key foreign key (organization_id, run_id)
    references api.simulation_runs (organization_id, id) on delete cascade,
  constraint simulation_results_schema_version_positive check (schema_version > 0),
  constraint simulation_results_artifact_object check (
    pg_catalog.jsonb_typeof(artifact) = 'object'
  ),
  constraint simulation_results_artifact_hash_valid check (
    artifact_sha256 ~ '^[0-9a-f]{64}$'
  )
);

create table private.run_attempts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  run_id uuid not null,
  attempt_number smallint not null,
  status private.attempt_status not null,
  lease_token uuid not null,
  lease_expires_at timestamptz not null,
  started_at timestamptz not null default pg_catalog.statement_timestamp(),
  finished_at timestamptz,
  safe_error_code text,
  constraint run_attempts_run_attempt_unique unique (run_id, attempt_number),
  constraint run_attempts_run_foreign_key foreign key (organization_id, run_id)
    references api.simulation_runs (organization_id, id) on delete cascade,
  constraint run_attempts_attempt_number_valid check (attempt_number between 1 and 3),
  constraint run_attempts_error_code_valid check (
    safe_error_code is null or safe_error_code ~ '^[a-z][a-z0-9_]{0,63}$'
  )
);

create table private.run_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  run_id uuid not null,
  previous_state api.run_state,
  new_state api.run_state not null,
  attempt_number smallint,
  safe_reason text,
  actor_type private.audit_actor_type not null,
  actor_user_id uuid,
  correlation_id uuid not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint run_events_run_foreign_key foreign key (organization_id, run_id)
    references api.simulation_runs (organization_id, id) on delete cascade,
  constraint run_events_attempt_number_valid check (
    attempt_number is null or attempt_number between 1 and 3
  ),
  constraint run_events_safe_reason_valid check (
    safe_reason is null or safe_reason ~ '^[a-z][a-z0-9_]{0,63}$'
  )
);

create index run_events_run_created_idx
  on private.run_events (run_id, created_at, id);

create table private.run_outbox (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  run_id uuid not null,
  generation smallint not null,
  job_id text not null,
  status private.outbox_status not null default 'pending',
  dispatch_attempt_count smallint not null default 0,
  next_attempt_at timestamptz not null default pg_catalog.statement_timestamp(),
  claim_token uuid,
  claim_expires_at timestamptz,
  confirmed_at timestamptz,
  terminal_error_code text,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint run_outbox_run_generation_unique unique (run_id, generation),
  constraint run_outbox_job_id_unique unique (job_id),
  constraint run_outbox_run_foreign_key foreign key (organization_id, run_id)
    references api.simulation_runs (organization_id, id) on delete cascade,
  constraint run_outbox_generation_valid check (generation between 1 and 3),
  constraint run_outbox_job_id_valid check (
    job_id = 'run:' || run_id::text || ':dispatch:' || generation::text
  ),
  constraint run_outbox_dispatch_attempt_count_valid check (
    dispatch_attempt_count between 0 and 10
  ),
  constraint run_outbox_claim_pair check (
    (claim_token is null) = (claim_expires_at is null)
  ),
  constraint run_outbox_terminal_error_valid check (
    terminal_error_code is null or terminal_error_code ~ '^[a-z][a-z0-9_]{0,63}$'
  )
);

create index run_outbox_due_idx
  on private.run_outbox (status, next_attempt_at, created_at, id);

create table private.idempotency_keys (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  scope text not null,
  idempotency_key text not null,
  request_sha256 text not null,
  organization_id uuid references api.organizations (id) on delete cascade,
  resource_id uuid,
  response jsonb,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint idempotency_keys_actor_scope_key_unique unique (
    actor_user_id,
    scope,
    idempotency_key
  ),
  constraint idempotency_keys_scope_valid check (
    scope ~ '^[a-z][a-z0-9_.]{0,63}$'
  ),
  constraint idempotency_keys_key_valid check (
    idempotency_key ~ '^[ -~]{16,128}$'
  ),
  constraint idempotency_keys_request_hash_valid check (
    request_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint idempotency_keys_response_object check (
    response is null or pg_catalog.jsonb_typeof(response) = 'object'
  ),
  constraint idempotency_keys_response_complete check (
    (organization_id is null and resource_id is null and response is null)
    or (organization_id is not null and resource_id is not null and response is not null)
  )
);

create table private.audit_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid references api.organizations (id) on delete cascade,
  actor_type private.audit_actor_type not null,
  actor_user_id uuid,
  action text not null,
  object_type text not null,
  object_id uuid,
  correlation_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint audit_events_action_valid check (
    action ~ '^[a-z][a-z0-9_.]{0,79}$'
  ),
  constraint audit_events_object_type_valid check (
    object_type ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint audit_events_actor_valid check (
    (actor_type = 'user' and actor_user_id is not null)
    or (actor_type <> 'user' and actor_user_id is null)
  ),
  constraint audit_events_metadata_object check (
    pg_catalog.jsonb_typeof(metadata) = 'object'
  )
);

create index audit_events_organization_created_idx
  on private.audit_events (organization_id, created_at, id);

create function private.enforce_audience_version_organization()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  parent_organization_id uuid;
begin
  select audiences.organization_id
    into parent_organization_id
    from api.audiences as audiences
    where audiences.id = new.audience_id;

  if not found or parent_organization_id is distinct from new.organization_id then
    raise exception using
      errcode = '23514',
      message = 'audience_version_organization_mismatch';
  end if;
  return new;
end
$function$;

create trigger audience_versions_organization_guard
before insert or update on api.audience_versions
for each row execute function private.enforce_audience_version_organization();

create function private.enforce_run_audience_organization()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  audience_organization_id uuid;
  audience_admission api.audience_admission_status;
begin
  select versions.organization_id, versions.admission_status
    into audience_organization_id, audience_admission
    from api.audience_versions as versions
    where versions.id = new.audience_version_id;

  if not found
    or audience_admission <> 'approved_demo'
    or (
      audience_organization_id is not null
      and audience_organization_id <> new.organization_id
    ) then
    raise exception using
      errcode = '23514',
      message = 'run_audience_organization_or_admission_mismatch';
  end if;
  return new;
end
$function$;

create trigger simulation_runs_audience_guard
before insert or update of organization_id, audience_version_id on api.simulation_runs
for each row execute function private.enforce_run_audience_organization();

alter table api.organizations enable row level security;
alter table api.organizations force row level security;
alter table api.organization_memberships enable row level security;
alter table api.organization_memberships force row level security;
alter table api.projects enable row level security;
alter table api.projects force row level security;
alter table api.stimuli enable row level security;
alter table api.stimuli force row level security;
alter table api.stimulus_versions enable row level security;
alter table api.stimulus_versions force row level security;
alter table api.audiences enable row level security;
alter table api.audiences force row level security;
alter table api.audience_versions enable row level security;
alter table api.audience_versions force row level security;
alter table api.simulation_runs enable row level security;
alter table api.simulation_runs force row level security;
alter table api.simulation_results enable row level security;
alter table api.simulation_results force row level security;
alter table private.run_attempts enable row level security;
alter table private.run_attempts force row level security;
alter table private.run_events enable row level security;
alter table private.run_events force row level security;
alter table private.run_outbox enable row level security;
alter table private.run_outbox force row level security;
alter table private.idempotency_keys enable row level security;
alter table private.idempotency_keys force row level security;
alter table private.audit_events enable row level security;
alter table private.audit_events force row level security;

-- PostgreSQL requires the destination owner to hold CREATE on the containing
-- schema during ownership transfer. This capability is migration-scoped.
grant create on schema private to simula_command_owner;

create function private.verified_subject()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  raw_claims text;
  claims jsonb;
  subject uuid;
  expires_at bigint;
begin
  if session_user <> 'simula_api' then
    return null;
  end if;

  raw_claims := nullif(
    pg_catalog.current_setting('request.jwt.claims', true),
    ''
  );
  if raw_claims is null then
    return null;
  end if;

  claims := raw_claims::jsonb;
  if pg_catalog.jsonb_typeof(claims) <> 'object'
    or not (claims ?& array['sub', 'role', 'iss', 'aud', 'exp'])
    or claims - array['sub', 'role', 'iss', 'aud', 'exp'] <> '{}'::jsonb
    or pg_catalog.jsonb_typeof(claims -> 'sub') <> 'string'
    or pg_catalog.jsonb_typeof(claims -> 'role') <> 'string'
    or pg_catalog.jsonb_typeof(claims -> 'iss') <> 'string'
    or pg_catalog.jsonb_typeof(claims -> 'aud') <> 'string'
    or pg_catalog.jsonb_typeof(claims -> 'exp') <> 'number'
    or claims ->> 'role' <> 'authenticated'
    or claims ->> 'aud' <> 'authenticated'
    or pg_catalog.char_length(claims ->> 'iss') not between 1 and 512 then
    return null;
  end if;

  subject := (claims ->> 'sub')::uuid;
  expires_at := (claims ->> 'exp')::bigint;
  if subject::text <> claims ->> 'sub'
    or expires_at <= extract(epoch from pg_catalog.statement_timestamp())::bigint then
    return null;
  end if;
  return subject;
exception
  when others then
    return null;
end
$function$;

alter function private.verified_subject() owner to simula_command_owner;

create function private.is_verified_api_subject(expected_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select expected_user_id is not null
    and expected_user_id = private.verified_subject()
$function$;

alter function private.is_verified_api_subject(uuid) owner to simula_command_owner;

create policy organization_memberships_api_or_command_select
on api.organization_memberships
for select
to simula_api, simula_command_owner
using (private.is_verified_api_subject(user_id));

create policy organizations_command_select
on api.organizations
for select
to simula_command_owner
using (
  private.is_verified_api_subject(created_by)
  or exists (
    select 1
    from api.organization_memberships as memberships
    where memberships.organization_id = organizations.id
      and private.is_verified_api_subject(memberships.user_id)
  )
);

create function private.is_org_member(requested_organization_id uuid, requested_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $function$
  select private.is_verified_api_subject(requested_user_id)
    and exists (
      select 1
      from api.organization_memberships as memberships
      where memberships.organization_id = requested_organization_id
        and memberships.user_id = requested_user_id
    )
$function$;

alter function private.is_org_member(uuid, uuid) owner to simula_command_owner;

create function private.has_org_role(
  requested_organization_id uuid,
  requested_user_id uuid,
  allowed_roles api.organization_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $function$
  select private.is_verified_api_subject(requested_user_id)
    and allowed_roles is not null
    and exists (
      select 1
      from api.organization_memberships as memberships
      where memberships.organization_id = requested_organization_id
        and memberships.user_id = requested_user_id
        and memberships.role = any(allowed_roles)
    )
$function$;

alter function private.has_org_role(uuid, uuid, api.organization_role[])
  owner to simula_command_owner;

create policy organizations_api_select
on api.organizations
for select
to simula_api
using (private.is_org_member(id, private.verified_subject()));

create policy projects_api_select
on api.projects
for select
to simula_api
using (private.is_org_member(organization_id, private.verified_subject()));

create policy stimuli_api_select
on api.stimuli
for select
to simula_api
using (private.is_org_member(organization_id, private.verified_subject()));

create policy stimulus_versions_api_select
on api.stimulus_versions
for select
to simula_api
using (private.is_org_member(organization_id, private.verified_subject()));

create policy audiences_api_select
on api.audiences
for select
to simula_api
using (
  (is_public_demo and organization_id is null)
  or private.is_org_member(organization_id, private.verified_subject())
);

create policy audience_versions_api_select
on api.audience_versions
for select
to simula_api
using (
  (
    organization_id is null
    and kind = 'authored_demo'
    and admission_status = 'approved_demo'
    and is_non_representative
  )
  or private.is_org_member(organization_id, private.verified_subject())
);

create policy simulation_runs_api_select
on api.simulation_runs
for select
to simula_api
using (private.is_org_member(organization_id, private.verified_subject()));

create policy simulation_results_api_select
on api.simulation_results
for select
to simula_api
using (private.is_org_member(organization_id, private.verified_subject()));

create policy organizations_command_insert
on api.organizations
for insert
to simula_command_owner
with check (private.is_verified_api_subject(created_by));

create policy organization_memberships_command_insert
on api.organization_memberships
for insert
to simula_command_owner
with check (
  role = 'owner'
  and private.is_verified_api_subject(user_id)
  and private.is_verified_api_subject(created_by)
  and exists (
    select 1
    from api.organizations as parent
    where parent.id = organization_id
      and private.is_verified_api_subject(parent.created_by)
  )
  and not exists (
    select 1
    from api.organization_memberships as existing
    where existing.organization_id = organization_memberships.organization_id
  )
);

create policy idempotency_keys_command_select
on private.idempotency_keys
for select
to simula_command_owner
using (private.is_verified_api_subject(actor_user_id));

create policy idempotency_keys_command_insert
on private.idempotency_keys
for insert
to simula_command_owner
with check (
  private.is_verified_api_subject(actor_user_id)
  and scope = 'organization.create'
);

create policy idempotency_keys_command_update
on private.idempotency_keys
for update
to simula_command_owner
using (private.is_verified_api_subject(actor_user_id))
with check (
  private.is_verified_api_subject(actor_user_id)
  and scope = 'organization.create'
);

create policy audit_events_command_insert
on private.audit_events
for insert
to simula_command_owner
with check (
  actor_type = 'user'
  and private.is_verified_api_subject(actor_user_id)
  and action = 'organization.created'
  and object_type = 'organization'
  and organization_id = object_id
);

revoke all on all tables in schema api
  from public, anon, authenticated, simula_api, simula_worker,
    simula_command_owner, simula_worker_owner;
revoke all on all tables in schema private
  from public, anon, authenticated, simula_api, simula_worker,
    simula_command_owner, simula_worker_owner;

grant select on table
  api.organizations,
  api.organization_memberships,
  api.projects,
  api.stimuli,
  api.stimulus_versions,
  api.audiences,
  api.audience_versions,
  api.simulation_runs,
  api.simulation_results
to simula_api;

grant select, insert on table api.organizations to simula_command_owner;
grant select, insert on table api.organization_memberships to simula_command_owner;
grant select, insert, update on table private.idempotency_keys to simula_command_owner;
grant insert on table private.audit_events to simula_command_owner;

set role simula_command_owner;
revoke all on function private.verified_subject()
  from public, anon, authenticated, simula_worker, simula_worker_owner;
revoke all on function private.is_verified_api_subject(uuid)
  from public, anon, authenticated, simula_worker, simula_worker_owner;
revoke all on function private.is_org_member(uuid, uuid)
  from public, anon, authenticated, simula_worker, simula_worker_owner;
revoke all on function private.has_org_role(uuid, uuid, api.organization_role[])
  from public, anon, authenticated, simula_worker, simula_worker_owner;
grant execute on function private.verified_subject()
  to simula_api, simula_command_owner;
grant execute on function private.is_verified_api_subject(uuid)
  to simula_api, simula_command_owner;
grant execute on function private.is_org_member(uuid, uuid)
  to simula_api, simula_command_owner;
grant execute on function private.has_org_role(uuid, uuid, api.organization_role[])
  to simula_api, simula_command_owner;
reset role;

create function private.create_organization_atomic(
  requested_name text,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns table (
  organization_id uuid,
  organization_name text,
  membership_role api.organization_role,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  subject uuid;
  normalized_name text;
  idempotency_id uuid;
  existing_sha256 text;
  existing_response jsonb;
  created_organization_id uuid;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  normalized_name := pg_catalog.btrim(requested_name);
  if normalized_name is null
    or pg_catalog.char_length(normalized_name) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'invalid_organization_name';
  end if;
  if requested_idempotency_key is null
    or requested_idempotency_key !~ '^[ -~]{16,128}$' then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;
  if requested_sha256 is null or requested_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_request_hash';
  end if;
  if requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_correlation_id';
  end if;

  insert into private.idempotency_keys (
    actor_user_id,
    scope,
    idempotency_key,
    request_sha256
  )
  values (
    subject,
    'organization.create',
    requested_idempotency_key,
    requested_sha256
  )
  on conflict (actor_user_id, scope, idempotency_key) do nothing
  returning id into idempotency_id;

  if idempotency_id is null then
    select keys.request_sha256, keys.response
      into existing_sha256, existing_response
      from private.idempotency_keys as keys
      where keys.actor_user_id = subject
        and keys.scope = 'organization.create'
        and keys.idempotency_key = requested_idempotency_key
      for update;

    if not found or existing_response is null then
      raise exception using errcode = '55000', message = 'idempotency_state_incomplete';
    end if;
    if existing_sha256 <> requested_sha256 then
      raise exception using errcode = '22000', message = 'idempotency_key_reused';
    end if;

    return query
    select
      (existing_response ->> 'organization_id')::uuid,
      existing_response ->> 'name',
      (existing_response ->> 'role')::api.organization_role,
      true;
    return;
  end if;

  created_organization_id := pg_catalog.gen_random_uuid();
  insert into api.organizations (id, name, created_by)
  values (created_organization_id, normalized_name, subject);

  insert into api.organization_memberships (
    organization_id,
    user_id,
    role,
    created_by
  )
  values (created_organization_id, subject, 'owner', subject);

  response_payload := pg_catalog.jsonb_build_object(
    'name', normalized_name,
    'organization_id', created_organization_id,
    'role', 'owner'
  );

  update private.idempotency_keys
    set organization_id = created_organization_id,
        resource_id = created_organization_id,
        response = response_payload
    where id = idempotency_id;

  insert into private.audit_events (
    organization_id,
    actor_type,
    actor_user_id,
    action,
    object_type,
    object_id,
    correlation_id,
    metadata
  )
  values (
    created_organization_id,
    'user',
    subject,
    'organization.created',
    'organization',
    created_organization_id,
    requested_correlation_id,
    pg_catalog.jsonb_build_object('idempotency_scope', 'organization.create')
  );

  return query
  select created_organization_id, normalized_name, 'owner'::api.organization_role, false;
end
$function$;

alter function private.create_organization_atomic(text, text, text, uuid)
  owner to simula_command_owner;

revoke create on schema private from simula_command_owner;

create function api.create_organization(
  requested_name text,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns table (
  organization_id uuid,
  organization_name text,
  membership_role api.organization_role,
  replayed boolean
)
language sql
security invoker
set search_path = ''
as $function$
  select *
  from private.create_organization_atomic(
    requested_name,
    requested_idempotency_key,
    requested_sha256,
    requested_correlation_id
  )
$function$;

create function api.list_organizations()
returns table (
  organization_id uuid,
  organization_name text,
  membership_role api.organization_role,
  organization_status api.organization_status,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    organizations.id,
    organizations.name,
    memberships.role,
    organizations.status,
    organizations.created_at
  from api.organizations as organizations
  join api.organization_memberships as memberships
    on memberships.organization_id = organizations.id
  where memberships.user_id = private.verified_subject()
  order by organizations.created_at, organizations.id
$function$;

set role simula_command_owner;
revoke all on function private.create_organization_atomic(text, text, text, uuid)
  from public, anon, authenticated, simula_worker;
grant execute on function private.create_organization_atomic(text, text, text, uuid)
  to simula_api;
comment on function private.create_organization_atomic(text, text, text, uuid)
  is 'Complete idempotent organization + sole-owner membership + audit transaction';
reset role;

revoke all on function api.create_organization(text, text, text, uuid)
  from public, anon, authenticated, simula_worker;
revoke all on function api.list_organizations()
  from public, anon, authenticated, simula_worker;

grant execute on function api.create_organization(text, text, text, uuid)
  to simula_api;
grant execute on function api.list_organizations() to simula_api;

revoke all on function private.enforce_audience_version_organization()
  from public, anon, authenticated, simula_api, simula_worker;
revoke all on function private.enforce_run_audience_organization()
  from public, anon, authenticated, simula_api, simula_worker;

revoke all on all sequences in schema api, private
  from public, anon, authenticated, simula_api, simula_worker;

comment on function api.create_organization(text, text, text, uuid)
  is 'Conventional simula_api wrapper; private helper remains the enforcement boundary';
