-- Phase 4 MVP resources. All tenant writes use named command-owner helpers;
-- browser roles retain zero application-schema access.

set role postgres;
create type api.feedback_kind as enum (
  'human_panel',
  'survey',
  'focus_group',
  'campaign_outcome',
  'user_correction',
  'post_launch_sentiment'
);

create type api.export_format as enum ('json', 'csv');
create type api.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

create table api.variant_groups (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  name text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint variant_groups_organization_id_id_unique unique (organization_id, id),
  constraint variant_groups_project_foreign_key
    foreign key (organization_id, project_id)
    references api.projects (organization_id, id) on delete cascade,
  constraint variant_groups_name_valid check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 2 and 120
  )
);

create index variant_groups_project_created_idx
  on api.variant_groups (organization_id, project_id, created_at, id);

create table api.variant_members (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  variant_group_id uuid not null,
  stimulus_version_id uuid not null,
  variant_key text not null,
  label text not null,
  sort_order smallint not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint variant_members_group_foreign_key
    foreign key (organization_id, variant_group_id)
    references api.variant_groups (organization_id, id) on delete cascade,
  constraint variant_members_stimulus_version_foreign_key
    foreign key (organization_id, stimulus_version_id)
    references api.stimulus_versions (organization_id, id) on delete restrict,
  constraint variant_members_group_key_unique unique (variant_group_id, variant_key),
  constraint variant_members_group_stimulus_unique
    unique (variant_group_id, stimulus_version_id),
  constraint variant_members_group_order_unique unique (variant_group_id, sort_order),
  constraint variant_members_key_valid check (
    variant_key ~ '^[a-z][a-z0-9_]{0,31}$'
  ),
  constraint variant_members_label_valid check (
    label = pg_catalog.btrim(label)
    and pg_catalog.char_length(label) between 1 and 80
  ),
  constraint variant_members_order_valid check (sort_order between 1 and 10)
);

create index variant_members_group_id_idx
  on api.variant_members (variant_group_id, sort_order);
create index variant_members_stimulus_version_id_idx
  on api.variant_members (stimulus_version_id);

create table api.report_artifacts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  run_id uuid not null,
  schema_version text not null,
  artifact jsonb not null,
  content_sha256 text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint report_artifacts_organization_id_id_unique unique (organization_id, id),
  constraint report_artifacts_run_foreign_key
    foreign key (organization_id, run_id)
    references api.simulation_runs (organization_id, id) on delete cascade,
  constraint report_artifacts_run_schema_unique unique (run_id, schema_version),
  constraint report_artifacts_schema_valid check (
    schema_version ~ '^[1-9][0-9]*\.[0-9]+\.[0-9]+$'
  ),
  constraint report_artifacts_artifact_valid check (
    pg_catalog.jsonb_typeof(artifact) = 'object'
    and pg_catalog.octet_length(artifact::text) <= 1048576
  ),
  constraint report_artifacts_checksum_valid check (
    content_sha256 ~ '^[0-9a-f]{64}$'
  )
);

create index report_artifacts_organization_created_idx
  on api.report_artifacts (organization_id, created_at desc, id);

create table api.report_exports (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  report_artifact_id uuid not null,
  format api.export_format not null,
  filename text not null,
  content bytea not null,
  content_sha256 text not null,
  expires_at timestamptz not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  deleted_at timestamptz,
  constraint report_exports_report_foreign_key
    foreign key (organization_id, report_artifact_id)
    references api.report_artifacts (organization_id, id) on delete cascade,
  constraint report_exports_filename_valid check (
    filename ~ '^[a-z0-9][a-z0-9_.-]{0,119}$'
  ),
  constraint report_exports_content_valid check (
    pg_catalog.octet_length(content) between 1 and 2097152
  ),
  constraint report_exports_checksum_valid check (
    content_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint report_exports_expiry_valid check (expires_at > created_at),
  constraint report_exports_deleted_at_valid check (
    deleted_at is null or deleted_at >= created_at
  )
);

create index report_exports_report_created_idx
  on api.report_exports (report_artifact_id, created_at desc, id);
create index report_exports_expiry_idx
  on api.report_exports (expires_at) where deleted_at is null;

create table api.feedback_records (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null references api.organizations (id) on delete cascade,
  run_id uuid,
  kind api.feedback_kind not null,
  observed_at timestamptz not null,
  payload jsonb not null,
  provenance jsonb not null,
  rights_basis text not null,
  checksum_sha256 text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint feedback_records_run_foreign_key
    foreign key (organization_id, run_id)
    references api.simulation_runs (organization_id, id) on delete cascade,
  constraint feedback_records_payload_valid check (
    pg_catalog.jsonb_typeof(payload) = 'object'
    and pg_catalog.octet_length(payload::text) <= 524288
  ),
  constraint feedback_records_provenance_valid check (
    pg_catalog.jsonb_typeof(provenance) = 'object'
    and pg_catalog.octet_length(provenance::text) <= 131072
  ),
  constraint feedback_records_rights_valid check (
    rights_basis = pg_catalog.btrim(rights_basis)
    and pg_catalog.char_length(rights_basis) between 1 and 500
  ),
  constraint feedback_records_checksum_valid check (
    checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint feedback_records_observed_valid check (
    observed_at <= created_at + interval '5 minutes'
  )
);

create index feedback_records_organization_created_idx
  on api.feedback_records (organization_id, created_at desc, id);
create index feedback_records_run_id_idx
  on api.feedback_records (run_id) where run_id is not null;

create table api.organization_invitations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null references api.organizations (id) on delete cascade,
  email text not null,
  role api.organization_role not null,
  token_sha256 text not null unique,
  status api.invitation_status not null default 'pending',
  expires_at timestamptz not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  accepted_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  constraint organization_invitations_email_valid check (
    email = pg_catalog.lower(pg_catalog.btrim(email))
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and pg_catalog.char_length(email) between 3 and 254
  ),
  constraint organization_invitations_role_valid check (role in ('editor', 'viewer')),
  constraint organization_invitations_token_valid check (
    token_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint organization_invitations_expiry_valid check (
    expires_at > created_at and expires_at <= created_at + interval '30 days'
  ),
  constraint organization_invitations_lifecycle_valid check (
    (status = 'pending' and accepted_by is null and accepted_at is null and revoked_at is null)
    or (status = 'accepted' and accepted_by is not null and accepted_at is not null
      and revoked_at is null)
    or (status = 'revoked' and accepted_by is null and accepted_at is null
      and revoked_at is not null)
    or (status = 'expired' and accepted_by is null and accepted_at is null)
  )
);

create unique index organization_invitations_pending_email_unique
  on api.organization_invitations (organization_id, email)
  where status = 'pending';
create index organization_invitations_organization_created_idx
  on api.organization_invitations (organization_id, created_at desc, id);

create table api.feature_flags (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null references api.organizations (id) on delete cascade,
  flag_key text not null,
  enabled boolean not null,
  reason text not null,
  version integer not null default 1,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint feature_flags_organization_key_unique unique (organization_id, flag_key),
  constraint feature_flags_key_valid check (
    flag_key ~ '^[a-z][a-z0-9_.]{0,63}$'
  ),
  constraint feature_flags_reason_valid check (
    reason = pg_catalog.btrim(reason)
    and pg_catalog.char_length(reason) between 1 and 500
  ),
  constraint feature_flags_version_valid check (version > 0)
);

create index feature_flags_organization_id_idx
  on api.feature_flags (organization_id, flag_key);

create table private.phase4_command_receipts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  organization_id uuid not null references api.organizations (id) on delete cascade,
  scope text not null,
  idempotency_key text not null,
  request_sha256 text not null,
  resource_id uuid,
  response jsonb,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint phase4_command_receipts_actor_scope_key_unique
    unique (actor_user_id, organization_id, scope, idempotency_key),
  constraint phase4_command_receipts_scope_valid check (
    scope in (
      'audience.create',
      'simulation_configuration.create',
      'variant_group.create',
      'report.create',
      'export.create',
      'feedback.create',
      'invitation.create',
      'feature_flag.set'
    )
  ),
  constraint phase4_command_receipts_key_valid check (
    idempotency_key ~ '^[ -~]{16,128}$'
  ),
  constraint phase4_command_receipts_hash_valid check (
    request_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint phase4_command_receipts_response_valid check (
    (resource_id is null and response is null)
    or (
      resource_id is not null
      and pg_catalog.jsonb_typeof(response) = 'object'
      and pg_catalog.octet_length(response::text) <= 65536
    )
  )
);

alter table api.variant_groups enable row level security;
alter table api.variant_groups force row level security;
alter table api.variant_members enable row level security;
alter table api.variant_members force row level security;
alter table api.report_artifacts enable row level security;
alter table api.report_artifacts force row level security;
alter table api.report_exports enable row level security;
alter table api.report_exports force row level security;
alter table api.feedback_records enable row level security;
alter table api.feedback_records force row level security;
alter table api.organization_invitations enable row level security;
alter table api.organization_invitations force row level security;
alter table api.feature_flags enable row level security;
alter table api.feature_flags force row level security;
alter table private.phase4_command_receipts enable row level security;
alter table private.phase4_command_receipts force row level security;

create policy variant_groups_api_select on api.variant_groups
for select to simula_api
using (private.is_org_member(organization_id, private.verified_subject()));
create policy variant_members_api_select on api.variant_members
for select to simula_api
using (private.is_org_member(organization_id, private.verified_subject()));
create policy report_artifacts_api_select on api.report_artifacts
for select to simula_api
using (private.is_org_member(organization_id, private.verified_subject()));
create policy report_exports_api_select on api.report_exports
for select to simula_api
using (private.is_org_member(organization_id, private.verified_subject()));
create policy feedback_records_api_select on api.feedback_records
for select to simula_api
using (private.is_org_member(organization_id, private.verified_subject()));
create policy organization_invitations_api_select on api.organization_invitations
for select to simula_api
using (
  private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner']::api.organization_role[]
  )
);
create policy feature_flags_api_select on api.feature_flags
for select to simula_api
using (private.is_org_member(organization_id, private.verified_subject()));

create policy audiences_command_phase4_insert on api.audiences
for insert to simula_command_owner
with check (
  not is_public_demo
  and organization_id is not null
  and private.is_verified_api_subject(created_by)
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);
create policy audience_versions_command_phase4_insert on api.audience_versions
for insert to simula_command_owner
with check (
  organization_id is not null
  and kind = 'synthetic_cohort'
  and admission_status = 'approved_experimental'
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);

create policy simulation_configurations_command_select
on api.simulation_configurations for select to simula_command_owner
using (
  private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);
create policy simulation_configurations_command_insert
on api.simulation_configurations for insert to simula_command_owner
with check (
  private.is_verified_api_subject(created_by)
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);
create policy simulation_configuration_versions_command_select
on api.simulation_configuration_versions for select to simula_command_owner
using (
  private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);
create policy simulation_configuration_versions_command_insert
on api.simulation_configuration_versions for insert to simula_command_owner
with check (
  private.is_verified_api_subject(created_by)
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);

create policy population_frame_versions_command_phase4_select
on api.population_frame_versions for select to simula_command_owner
using (
  validation_status <> 'retired'
  and (
    organization_id is null
    or private.is_org_member(organization_id, private.verified_subject())
  )
);

create policy methodology_versions_command_phase4_select
on api.methodology_versions for select to simula_command_owner
using (validation_status <> 'retired');

create policy provider_configuration_versions_command_phase4_select
on api.provider_configuration_versions for select to simula_command_owner
using (admission_status <> 'retired');

create policy evaluation_runs_command_phase4_select
on api.evaluation_runs for select to simula_command_owner
using (private.is_org_member(organization_id, private.verified_subject()));

create policy simulation_results_command_phase4_select
on api.simulation_results for select to simula_command_owner
using (private.is_org_member(organization_id, private.verified_subject()));

create policy audit_events_command_phase4_select
on private.audit_events for select to simula_command_owner
using (
  private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner']::api.organization_role[]
  )
);

create policy variant_groups_command_insert on api.variant_groups
for insert to simula_command_owner
with check (
  private.is_verified_api_subject(created_by)
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);
create policy variant_groups_command_select on api.variant_groups
for select to simula_command_owner
using (private.is_org_member(organization_id, private.verified_subject()));
create policy variant_members_command_insert on api.variant_members
for insert to simula_command_owner
with check (
  private.is_verified_api_subject(created_by)
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);
create policy variant_members_command_select on api.variant_members
for select to simula_command_owner
using (private.is_org_member(organization_id, private.verified_subject()));
create policy report_artifacts_command_insert on api.report_artifacts
for insert to simula_command_owner
with check (
  private.is_verified_api_subject(created_by)
  and private.is_org_member(organization_id, private.verified_subject())
);
create policy report_artifacts_command_select on api.report_artifacts
for select to simula_command_owner
using (private.is_org_member(organization_id, private.verified_subject()));
create policy report_exports_command_insert on api.report_exports
for insert to simula_command_owner
with check (
  private.is_verified_api_subject(created_by)
  and private.is_org_member(organization_id, private.verified_subject())
);
create policy report_exports_command_select on api.report_exports
for select to simula_command_owner
using (private.is_org_member(organization_id, private.verified_subject()));
create policy feedback_records_command_insert on api.feedback_records
for insert to simula_command_owner
with check (
  private.is_verified_api_subject(created_by)
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);
create policy feedback_records_command_select on api.feedback_records
for select to simula_command_owner
using (private.is_org_member(organization_id, private.verified_subject()));
create policy organization_invitations_command_insert on api.organization_invitations
for insert to simula_command_owner
with check (
  private.is_verified_api_subject(created_by)
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner']::api.organization_role[]
  )
);
create policy organization_invitations_command_select on api.organization_invitations
for select to simula_command_owner
using (
  private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner']::api.organization_role[]
  )
);
create policy feature_flags_command_select on api.feature_flags
for select to simula_command_owner
using (
  private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner']::api.organization_role[]
  )
);
create policy feature_flags_command_insert on api.feature_flags
for insert to simula_command_owner
with check (
  private.is_verified_api_subject(created_by)
  and private.is_verified_api_subject(updated_by)
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner']::api.organization_role[]
  )
);
create policy feature_flags_command_update on api.feature_flags
for update to simula_command_owner
using (
  private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner']::api.organization_role[]
  )
)
with check (
  private.is_verified_api_subject(updated_by)
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner']::api.organization_role[]
  )
);
create policy phase4_command_receipts_command_select
on private.phase4_command_receipts for select to simula_command_owner
using (
  private.is_verified_api_subject(actor_user_id)
  and private.is_org_member(organization_id, private.verified_subject())
);
create policy phase4_command_receipts_command_insert
on private.phase4_command_receipts for insert to simula_command_owner
with check (
  private.is_verified_api_subject(actor_user_id)
  and private.is_org_member(organization_id, private.verified_subject())
);
create policy phase4_command_receipts_command_update
on private.phase4_command_receipts for update to simula_command_owner
using (
  private.is_verified_api_subject(actor_user_id)
  and private.is_org_member(organization_id, private.verified_subject())
)
with check (
  private.is_verified_api_subject(actor_user_id)
  and resource_id is not null
  and response is not null
  and private.is_org_member(organization_id, private.verified_subject())
);

create policy audit_events_command_phase4_insert
on private.audit_events for insert to simula_command_owner
with check (
  actor_type = 'user'
  and private.is_verified_api_subject(actor_user_id)
  and source_service = 'api'
  and outcome = 'success'
  and action in (
    'audience.created',
    'simulation_configuration.created',
    'variant_group.created',
    'report.created',
    'export.created',
    'feedback.created',
    'invitation.created',
    'feature_flag.updated'
  )
  and private.is_org_member(organization_id, private.verified_subject())
);

revoke all on table
  api.variant_groups,
  api.variant_members,
  api.report_artifacts,
  api.report_exports,
  api.feedback_records,
  api.organization_invitations,
  api.feature_flags,
  private.phase4_command_receipts
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner;

grant select on table
  api.variant_groups,
  api.variant_members,
  api.report_artifacts,
  api.report_exports,
  api.feedback_records,
  api.organization_invitations,
  api.feature_flags
to simula_api;

grant select, insert on table api.audiences, api.audience_versions
to simula_command_owner;
grant select, insert on table
  api.simulation_configurations,
  api.simulation_configuration_versions,
  api.variant_groups,
  api.variant_members,
  api.report_artifacts,
  api.report_exports,
  api.feedback_records,
  api.organization_invitations,
  api.feature_flags
to simula_command_owner;
grant update on table api.feature_flags to simula_command_owner;
grant select on table
  api.projects,
  api.stimulus_versions,
  api.population_frame_versions,
  api.methodology_versions,
  api.provider_configuration_versions,
  api.evaluation_runs,
  api.simulation_runs,
  api.simulation_results
to simula_command_owner;
grant select, insert, update on table private.phase4_command_receipts
to simula_command_owner;
grant select on table private.audit_events to simula_command_owner;

revoke all on all sequences in schema api, private
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner;

grant create on schema api, private to simula_command_owner;
set role simula_command_owner;

create function private.begin_phase4_command(
  requested_scope text,
  requested_organization_id uuid,
  requested_idempotency_key text,
  requested_sha256 text
)
returns table (receipt_id uuid, existing_response jsonb, replayed boolean)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  subject uuid;
  created_id uuid;
  existing_hash text;
  stored_response jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_scope is null
    or requested_organization_id is null
    or requested_idempotency_key is null
    or requested_idempotency_key !~ '^[ -~]{16,128}$'
    or requested_sha256 is null
    or requested_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_command_identity';
  end if;
  insert into private.phase4_command_receipts (
    actor_user_id, organization_id, scope, idempotency_key, request_sha256
  ) values (
    subject, requested_organization_id, requested_scope,
    requested_idempotency_key, requested_sha256
  )
  on conflict do nothing
  returning id into created_id;
  if created_id is not null then
    return query select created_id, null::jsonb, false;
    return;
  end if;
  select receipts.request_sha256, receipts.response
    into existing_hash, stored_response
  from private.phase4_command_receipts as receipts
  where receipts.actor_user_id = subject
    and receipts.organization_id = requested_organization_id
    and receipts.scope = requested_scope
    and receipts.idempotency_key = requested_idempotency_key
  for update;
  if not found or stored_response is null then
    raise exception using errcode = '55000', message = 'idempotency_state_incomplete';
  end if;
  if existing_hash <> requested_sha256 then
    raise exception using errcode = '22000', message = 'idempotency_key_reused';
  end if;
  return query select null::uuid, stored_response || '{"replayed": true}'::jsonb, true;
end
$function$;

create function private.finish_phase4_command(
  requested_receipt_id uuid,
  requested_resource_id uuid,
  requested_response jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  if requested_receipt_id is null
    or requested_resource_id is null
    or requested_response is null
    or pg_catalog.jsonb_typeof(requested_response) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_command_response';
  end if;
  update private.phase4_command_receipts
  set resource_id = requested_resource_id,
      response = requested_response
  where id = requested_receipt_id
    and resource_id is null
    and response is null;
  if not found then
    raise exception using errcode = '55000', message = 'idempotency_state_incomplete';
  end if;
end
$function$;

create function private.create_audience_definition_atomic(
  requested_organization_id uuid,
  requested_name text,
  requested_manifest jsonb,
  requested_limitations text,
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
  created_audience api.audiences%rowtype;
  created_version api.audience_versions%rowtype;
  manifest_checksum text;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if not private.has_org_role(
    requested_organization_id,
    subject,
    array['owner', 'editor']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if requested_name is null
    or requested_name <> pg_catalog.btrim(requested_name)
    or pg_catalog.char_length(requested_name) not between 2 and 80
    or requested_limitations is null
    or pg_catalog.char_length(requested_limitations) not between 1 and 1000
    or requested_correlation_id is null
    or requested_manifest is null
    or pg_catalog.jsonb_typeof(requested_manifest) <> 'object'
    or pg_catalog.octet_length(requested_manifest::text) > 131072
    or requested_manifest -> 'schema_version' <> '1'::jsonb
    or pg_catalog.jsonb_typeof(requested_manifest -> 'criteria') <> 'array'
    or pg_catalog.jsonb_array_length(requested_manifest -> 'criteria') > 20
    or requested_manifest ->> 'provenance_status' not in ('demo', 'verified')
    or pg_catalog.jsonb_typeof(requested_manifest -> 'non_representative') <> 'boolean'
    or (
      requested_manifest ->> 'provenance_status' = 'demo'
      and requested_manifest -> 'non_representative' <> 'true'::jsonb
    ) then
    raise exception using errcode = '22023', message = 'invalid_audience_definition';
  end if;
  select * into command_record from private.begin_phase4_command(
    'audience.create', requested_organization_id,
    requested_idempotency_key, requested_sha256
  );
  if command_record.replayed then
    return command_record.existing_response;
  end if;
  insert into api.audiences (
    organization_id, name, is_public_demo, created_by
  ) values (
    requested_organization_id, requested_name, false, subject
  ) returning * into created_audience;
  manifest_checksum := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(requested_manifest::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  insert into api.audience_versions (
    organization_id, audience_id, version, kind, admission_status,
    manifest, checksum_sha256, is_non_representative, limitations
  ) values (
    requested_organization_id, created_audience.id, 1,
    'synthetic_cohort', 'approved_experimental', requested_manifest,
    manifest_checksum,
    (requested_manifest ->> 'non_representative')::boolean,
    requested_limitations
  ) returning * into created_version;
  response_payload := pg_catalog.jsonb_build_object(
    'audience_id', created_audience.id,
    'audience_version_id', created_version.id,
    'version', created_version.version,
    'name', created_audience.name,
    'kind', created_version.kind,
    'admission_status', created_version.admission_status,
    'checksum_sha256', created_version.checksum_sha256,
    'created_at', created_version.created_at,
    'replayed', false
  );
  perform private.finish_phase4_command(
    command_record.receipt_id, created_audience.id, response_payload
  );
  insert into private.audit_events (
    organization_id, actor_type, actor_user_id, action, object_type,
    object_id, correlation_id, outcome, source_service, metadata
  ) values (
    requested_organization_id, 'user', subject, 'audience.created',
    'audience', created_audience.id, requested_correlation_id,
    'success', 'api', pg_catalog.jsonb_build_object(
      'audience_version_id', created_version.id,
      'checksum_sha256', created_version.checksum_sha256
    )
  );
  return response_payload;
end
$function$;

create function api.create_audience_definition(
  requested_organization_id uuid,
  requested_name text,
  requested_manifest jsonb,
  requested_limitations text,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.create_audience_definition_atomic(
    requested_organization_id, requested_name, requested_manifest,
    requested_limitations, requested_idempotency_key,
    requested_sha256, requested_correlation_id
  );
$function$;

create function private.create_simulation_configuration_atomic(
  requested_project_id uuid,
  requested_name text,
  requested_audience_version_id uuid,
  requested_population_frame_version_id uuid,
  requested_methodology_version_id uuid,
  requested_provider_configuration_version_id uuid,
  requested_sampling_configuration jsonb,
  requested_cost_ceiling_microusd bigint,
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
  selected_project api.projects%rowtype;
  selected_audience api.audience_versions%rowtype;
  selected_population api.population_frame_versions%rowtype;
  selected_methodology api.methodology_versions%rowtype;
  selected_provider api.provider_configuration_versions%rowtype;
  command_record record;
  created_configuration api.simulation_configurations%rowtype;
  created_version api.simulation_configuration_versions%rowtype;
  frozen_configuration jsonb;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  select * into selected_project from api.projects
  where id = requested_project_id and status = 'active'
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
  if requested_name is null
    or requested_name <> pg_catalog.btrim(requested_name)
    or pg_catalog.char_length(requested_name) not between 2 and 120
    or requested_correlation_id is null
    or requested_cost_ceiling_microusd not between 0 and 100000000
    or requested_sampling_configuration is null
    or pg_catalog.jsonb_typeof(requested_sampling_configuration) <> 'object'
    or not (requested_sampling_configuration ?& array[
      'sample_size', 'minimum_per_cell', 'maximum_cells', 'seed',
      'sparse_cell_threshold'
    ])
    or requested_sampling_configuration - array[
      'sample_size', 'minimum_per_cell', 'maximum_cells', 'seed',
      'sparse_cell_threshold'
    ] <> '{}'::jsonb
    or pg_catalog.jsonb_typeof(
      requested_sampling_configuration -> 'sample_size'
    ) <> 'number'
    or pg_catalog.jsonb_typeof(
      requested_sampling_configuration -> 'minimum_per_cell'
    ) <> 'number'
    or pg_catalog.jsonb_typeof(
      requested_sampling_configuration -> 'maximum_cells'
    ) <> 'number'
    or pg_catalog.jsonb_typeof(
      requested_sampling_configuration -> 'seed'
    ) <> 'number'
    or pg_catalog.jsonb_typeof(
      requested_sampling_configuration -> 'sparse_cell_threshold'
    ) <> 'number'
    or (requested_sampling_configuration ->> 'sample_size')::integer not between 10 and 5000
    or (requested_sampling_configuration ->> 'minimum_per_cell')::integer not between 1 and 100
    or (requested_sampling_configuration ->> 'maximum_cells')::integer not between 1 and 500
    or (requested_sampling_configuration ->> 'sparse_cell_threshold')::integer
      not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_simulation_configuration';
  end if;

  select * into selected_audience from api.audience_versions
  where id = requested_audience_version_id
    and admission_status in ('approved_demo', 'approved_experimental')
    and (organization_id is null or organization_id = selected_project.organization_id);
  if not found then
    raise exception using errcode = 'P0002', message = 'audience_unavailable';
  end if;
  select * into selected_population from api.population_frame_versions
  where id = requested_population_frame_version_id
    and validation_status <> 'retired'
    and (organization_id is null or organization_id = selected_project.organization_id);
  if not found then
    raise exception using errcode = 'P0002', message = 'population_frame_unavailable';
  end if;
  select * into selected_methodology from api.methodology_versions
  where id = requested_methodology_version_id and validation_status <> 'retired';
  if not found then
    raise exception using errcode = 'P0002', message = 'methodology_unavailable';
  end if;
  select * into selected_provider from api.provider_configuration_versions
  where id = requested_provider_configuration_version_id
    and admission_status in ('approved_demo', 'approved_external');
  if not found then
    raise exception using errcode = 'P0002', message = 'provider_unavailable';
  end if;

  select * into command_record from private.begin_phase4_command(
    'simulation_configuration.create', selected_project.organization_id,
    requested_idempotency_key, requested_sha256
  );
  if command_record.replayed then
    return command_record.existing_response;
  end if;

  insert into api.simulation_configurations (
    organization_id, project_id, name, created_by
  ) values (
    selected_project.organization_id, selected_project.id, requested_name, subject
  ) returning * into created_configuration;
  frozen_configuration := pg_catalog.jsonb_build_object(
    'audience_checksum_sha256', selected_audience.checksum_sha256,
    'audience_version_id', selected_audience.id,
    'cost_ceiling_microusd', requested_cost_ceiling_microusd,
    'methodology_checksum_sha256', selected_methodology.checksum_sha256,
    'methodology_version_id', selected_methodology.id,
    'population_checksum_sha256', selected_population.checksum_sha256,
    'population_frame_version_id', selected_population.id,
    'provider_checksum_sha256', selected_provider.checksum_sha256,
    'provider_configuration_version_id', selected_provider.id,
    'sampling_configuration', requested_sampling_configuration,
    'schema_version', 1
  );
  insert into api.simulation_configuration_versions (
    organization_id, simulation_configuration_id, version,
    audience_version_id, population_frame_version_id, methodology_version_id,
    provider_configuration_version_id, sampling_configuration,
    cost_ceiling_microusd, checksum_sha256, created_by
  ) values (
    selected_project.organization_id, created_configuration.id, 1,
    selected_audience.id, selected_population.id, selected_methodology.id,
    selected_provider.id, requested_sampling_configuration,
    requested_cost_ceiling_microusd,
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(frozen_configuration::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    ),
    subject
  ) returning * into created_version;
  response_payload := pg_catalog.jsonb_build_object(
    'configuration_id', created_configuration.id,
    'configuration_version_id', created_version.id,
    'version', created_version.version,
    'name', created_configuration.name,
    'project_id', created_configuration.project_id,
    'audience_version_id', created_version.audience_version_id,
    'population_frame_version_id', created_version.population_frame_version_id,
    'methodology_version_id', created_version.methodology_version_id,
    'provider_configuration_version_id',
      created_version.provider_configuration_version_id,
    'sampling_configuration', created_version.sampling_configuration,
    'cost_ceiling_microusd', created_version.cost_ceiling_microusd,
    'checksum_sha256', created_version.checksum_sha256,
    'created_at', created_version.created_at,
    'replayed', false
  );
  perform private.finish_phase4_command(
    command_record.receipt_id, created_configuration.id, response_payload
  );
  insert into private.audit_events (
    organization_id, actor_type, actor_user_id, action, object_type,
    object_id, correlation_id, outcome, source_service, metadata
  ) values (
    selected_project.organization_id, 'user', subject,
    'simulation_configuration.created', 'simulation_configuration',
    created_configuration.id, requested_correlation_id, 'success', 'api',
    pg_catalog.jsonb_build_object(
      'configuration_version_id', created_version.id,
      'checksum_sha256', created_version.checksum_sha256
    )
  );
  return response_payload;
end
$function$;

create function api.create_simulation_configuration(
  requested_project_id uuid,
  requested_name text,
  requested_audience_version_id uuid,
  requested_population_frame_version_id uuid,
  requested_methodology_version_id uuid,
  requested_provider_configuration_version_id uuid,
  requested_sampling_configuration jsonb,
  requested_cost_ceiling_microusd bigint,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.create_simulation_configuration_atomic(
    requested_project_id, requested_name, requested_audience_version_id,
    requested_population_frame_version_id, requested_methodology_version_id,
    requested_provider_configuration_version_id, requested_sampling_configuration,
    requested_cost_ceiling_microusd, requested_idempotency_key,
    requested_sha256, requested_correlation_id
  );
$function$;

create function private.create_variant_group_atomic(
  requested_project_id uuid,
  requested_name text,
  requested_members jsonb,
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
  selected_project api.projects%rowtype;
  command_record record;
  created_group api.variant_groups%rowtype;
  response_payload jsonb;
  requested_member_count integer;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  select * into selected_project from api.projects
  where id = requested_project_id and status = 'active'
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
  if requested_name is null
    or requested_name <> pg_catalog.btrim(requested_name)
    or pg_catalog.char_length(requested_name) not between 2 and 120
    or requested_correlation_id is null
    or requested_members is null
    or pg_catalog.jsonb_typeof(requested_members) <> 'array'
    or pg_catalog.jsonb_array_length(requested_members) not between 2 and 10
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(requested_members) as members(value)
      where pg_catalog.jsonb_typeof(members.value) <> 'object'
        or not (members.value ?& array[
          'stimulus_version_id', 'variant_key', 'label', 'sort_order'
        ])
        or members.value - array[
          'stimulus_version_id', 'variant_key', 'label', 'sort_order'
        ] <> '{}'::jsonb
        or members.value ->> 'variant_key' !~ '^[a-z][a-z0-9_]{0,31}$'
        or pg_catalog.char_length(members.value ->> 'label') not between 1 and 80
        or pg_catalog.jsonb_typeof(members.value -> 'sort_order') <> 'number'
        or (members.value ->> 'sort_order')::integer not between 1 and 10
    ) then
    raise exception using errcode = '22023', message = 'invalid_variant_group';
  end if;
  requested_member_count := pg_catalog.jsonb_array_length(requested_members);
  if (
    select pg_catalog.count(*)
    from pg_catalog.jsonb_to_recordset(requested_members) as members(
      stimulus_version_id uuid,
      variant_key text,
      label text,
      sort_order smallint
    )
    join api.stimulus_versions as versions on versions.id = members.stimulus_version_id
    join api.stimuli as stimuli on stimuli.id = versions.stimulus_id
    where versions.organization_id = selected_project.organization_id
      and stimuli.project_id = selected_project.id
      and stimuli.status = 'active'
  ) <> requested_member_count
  or (
    select pg_catalog.count(distinct members.variant_key)
      = requested_member_count
      and pg_catalog.count(distinct members.stimulus_version_id)
        = requested_member_count
      and pg_catalog.count(distinct members.sort_order)
        = requested_member_count
    from pg_catalog.jsonb_to_recordset(requested_members) as members(
      stimulus_version_id uuid,
      variant_key text,
      label text,
      sort_order smallint
    )
  ) is not true then
    raise exception using errcode = '22023', message = 'invalid_variant_members';
  end if;

  select * into command_record from private.begin_phase4_command(
    'variant_group.create', selected_project.organization_id,
    requested_idempotency_key, requested_sha256
  );
  if command_record.replayed then
    return command_record.existing_response;
  end if;
  insert into api.variant_groups (
    organization_id, project_id, name, created_by
  ) values (
    selected_project.organization_id, selected_project.id, requested_name, subject
  ) returning * into created_group;
  insert into api.variant_members (
    organization_id, variant_group_id, stimulus_version_id,
    variant_key, label, sort_order, created_by
  )
  select
    selected_project.organization_id,
    created_group.id,
    members.stimulus_version_id,
    members.variant_key,
    members.label,
    members.sort_order,
    subject
  from pg_catalog.jsonb_to_recordset(requested_members) as members(
    stimulus_version_id uuid,
    variant_key text,
    label text,
    sort_order smallint
  )
  order by members.sort_order;
  response_payload := pg_catalog.jsonb_build_object(
    'variant_group_id', created_group.id,
    'project_id', created_group.project_id,
    'name', created_group.name,
    'members', (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', members.id,
          'stimulus_version_id', members.stimulus_version_id,
          'variant_key', members.variant_key,
          'label', members.label,
          'sort_order', members.sort_order
        ) order by members.sort_order
      )
      from api.variant_members as members
      where members.variant_group_id = created_group.id
    ),
    'created_at', created_group.created_at,
    'replayed', false
  );
  perform private.finish_phase4_command(
    command_record.receipt_id, created_group.id, response_payload
  );
  insert into private.audit_events (
    organization_id, actor_type, actor_user_id, action, object_type,
    object_id, correlation_id, outcome, source_service, metadata
  ) values (
    selected_project.organization_id, 'user', subject,
    'variant_group.created', 'variant_group', created_group.id,
    requested_correlation_id, 'success', 'api',
    pg_catalog.jsonb_build_object('member_count', requested_member_count)
  );
  return response_payload;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'invalid_variant_group';
end
$function$;

create function api.create_variant_group(
  requested_project_id uuid,
  requested_name text,
  requested_members jsonb,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.create_variant_group_atomic(
    requested_project_id, requested_name, requested_members,
    requested_idempotency_key, requested_sha256, requested_correlation_id
  );
$function$;

create function private.create_feedback_record_atomic(
  requested_organization_id uuid,
  requested_run_id uuid,
  requested_kind api.feedback_kind,
  requested_observed_at timestamptz,
  requested_payload jsonb,
  requested_provenance jsonb,
  requested_rights_basis text,
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
  created_feedback api.feedback_records%rowtype;
  frozen_payload jsonb;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if not private.has_org_role(
    requested_organization_id,
    subject,
    array['owner', 'editor']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if requested_kind is null
    or requested_observed_at is null
    or requested_observed_at > pg_catalog.statement_timestamp() + interval '5 minutes'
    or requested_payload is null
    or pg_catalog.jsonb_typeof(requested_payload) <> 'object'
    or pg_catalog.octet_length(requested_payload::text) > 524288
    or requested_provenance is null
    or pg_catalog.jsonb_typeof(requested_provenance) <> 'object'
    or pg_catalog.octet_length(requested_provenance::text) > 131072
    or requested_rights_basis is null
    or requested_rights_basis <> pg_catalog.btrim(requested_rights_basis)
    or pg_catalog.char_length(requested_rights_basis) not between 1 and 500
    or requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_feedback_record';
  end if;
  if requested_run_id is not null and not exists (
    select 1 from api.simulation_runs as runs
    where runs.id = requested_run_id
      and runs.organization_id = requested_organization_id
  ) then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  select * into command_record from private.begin_phase4_command(
    'feedback.create', requested_organization_id,
    requested_idempotency_key, requested_sha256
  );
  if command_record.replayed then
    return command_record.existing_response;
  end if;
  frozen_payload := pg_catalog.jsonb_build_object(
    'kind', requested_kind,
    'observed_at', requested_observed_at,
    'payload', requested_payload,
    'provenance', requested_provenance,
    'rights_basis', requested_rights_basis,
    'run_id', requested_run_id,
    'schema_version', 1
  );
  insert into api.feedback_records (
    organization_id, run_id, kind, observed_at, payload,
    provenance, rights_basis, checksum_sha256, created_by
  ) values (
    requested_organization_id, requested_run_id, requested_kind,
    requested_observed_at, requested_payload, requested_provenance,
    requested_rights_basis,
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(frozen_payload::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    ),
    subject
  ) returning * into created_feedback;
  response_payload := pg_catalog.jsonb_build_object(
    'feedback_id', created_feedback.id,
    'organization_id', created_feedback.organization_id,
    'run_id', created_feedback.run_id,
    'kind', created_feedback.kind,
    'observed_at', created_feedback.observed_at,
    'checksum_sha256', created_feedback.checksum_sha256,
    'created_at', created_feedback.created_at,
    'replayed', false
  );
  perform private.finish_phase4_command(
    command_record.receipt_id, created_feedback.id, response_payload
  );
  insert into private.audit_events (
    organization_id, actor_type, actor_user_id, action, object_type,
    object_id, correlation_id, outcome, source_service, metadata
  ) values (
    requested_organization_id, 'user', subject, 'feedback.created',
    'feedback_record', created_feedback.id, requested_correlation_id,
    'success', 'api', pg_catalog.jsonb_build_object(
      'kind', requested_kind,
      'run_id', requested_run_id,
      'checksum_sha256', created_feedback.checksum_sha256
    )
  );
  return response_payload;
end
$function$;

create function api.create_feedback_record(
  requested_organization_id uuid,
  requested_run_id uuid,
  requested_kind api.feedback_kind,
  requested_observed_at timestamptz,
  requested_payload jsonb,
  requested_provenance jsonb,
  requested_rights_basis text,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.create_feedback_record_atomic(
    requested_organization_id, requested_run_id, requested_kind,
    requested_observed_at, requested_payload, requested_provenance,
    requested_rights_basis, requested_idempotency_key,
    requested_sha256, requested_correlation_id
  );
$function$;

create function private.create_report_artifact_atomic(
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
    or not private.is_org_member(selected_run.organization_id, subject) then
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

create function api.create_report_artifact(
  requested_run_id uuid,
  requested_artifact jsonb,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.create_report_artifact_atomic(
    requested_run_id, requested_artifact, requested_idempotency_key,
    requested_sha256, requested_correlation_id
  );
$function$;

create function private.create_report_export_atomic(
  requested_report_id uuid,
  requested_format api.export_format,
  requested_filename text,
  requested_content bytea,
  requested_expires_at timestamptz,
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
  selected_report api.report_artifacts%rowtype;
  command_record record;
  created_export api.report_exports%rowtype;
  content_hash text;
  parsed_json jsonb;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  select * into selected_report from api.report_artifacts
  where id = requested_report_id;
  if not found
    or not private.is_org_member(selected_report.organization_id, subject) then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if requested_format is null
    or requested_filename is null
    or requested_filename !~ '^[a-z0-9][a-z0-9_.-]{0,119}$'
    or requested_content is null
    or pg_catalog.octet_length(requested_content) not between 1 and 2097152
    or requested_expires_at is null
    or requested_expires_at <= pg_catalog.statement_timestamp()
    or requested_expires_at > pg_catalog.statement_timestamp() + interval '7 days'
    or requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_report_export';
  end if;
  if requested_format = 'json' then
    begin
      parsed_json := pg_catalog.convert_from(requested_content, 'UTF8')::jsonb;
    exception when others then
      raise exception using errcode = '22023', message = 'invalid_report_export';
    end;
    if parsed_json #>> '{identity,report_id}' <> selected_report.id::text
      or parsed_json ->> 'schema_version' <> selected_report.schema_version
      or parsed_json ->> 'content_sha256'
        <> selected_report.artifact ->> 'content_sha256' then
      raise exception using errcode = '22023', message = 'report_export_mismatch';
    end if;
  end if;
  select * into command_record from private.begin_phase4_command(
    'export.create', selected_report.organization_id,
    requested_idempotency_key, requested_sha256
  );
  if command_record.replayed then
    return command_record.existing_response;
  end if;
  content_hash := pg_catalog.encode(
    extensions.digest(requested_content, 'sha256'),
    'hex'
  );
  insert into api.report_exports (
    organization_id, report_artifact_id, format, filename,
    content, content_sha256, expires_at, created_by
  ) values (
    selected_report.organization_id, selected_report.id, requested_format,
    requested_filename, requested_content, content_hash,
    requested_expires_at, subject
  ) returning * into created_export;
  response_payload := pg_catalog.jsonb_build_object(
    'export_id', created_export.id,
    'report_id', created_export.report_artifact_id,
    'format', created_export.format,
    'filename', created_export.filename,
    'content_sha256', created_export.content_sha256,
    'expires_at', created_export.expires_at,
    'created_at', created_export.created_at,
    'replayed', false
  );
  perform private.finish_phase4_command(
    command_record.receipt_id, created_export.id, response_payload
  );
  insert into private.audit_events (
    organization_id, actor_type, actor_user_id, action, object_type,
    object_id, correlation_id, outcome, source_service, metadata
  ) values (
    selected_report.organization_id, 'user', subject, 'export.created',
    'report_export', created_export.id, requested_correlation_id,
    'success', 'api', pg_catalog.jsonb_build_object(
      'report_id', selected_report.id,
      'format', requested_format,
      'content_sha256', created_export.content_sha256,
      'expires_at', created_export.expires_at
    )
  );
  return response_payload;
end
$function$;

create function api.create_report_export(
  requested_report_id uuid,
  requested_format api.export_format,
  requested_filename text,
  requested_content bytea,
  requested_expires_at timestamptz,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.create_report_export_atomic(
    requested_report_id, requested_format, requested_filename,
    requested_content, requested_expires_at, requested_idempotency_key,
    requested_sha256, requested_correlation_id
  );
$function$;

create function private.create_organization_invitation_atomic(
  requested_organization_id uuid,
  requested_email text,
  requested_role api.organization_role,
  requested_token_sha256 text,
  requested_expires_at timestamptz,
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
  created_invitation api.organization_invitations%rowtype;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if not private.has_org_role(
    requested_organization_id,
    subject,
    array['owner']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if requested_email is null
    or requested_email <> pg_catalog.lower(pg_catalog.btrim(requested_email))
    or requested_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or pg_catalog.char_length(requested_email) not between 3 and 254
    or requested_role not in ('editor', 'viewer')
    or requested_token_sha256 is null
    or requested_token_sha256 !~ '^[0-9a-f]{64}$'
    or requested_expires_at is null
    or requested_expires_at <= pg_catalog.statement_timestamp()
    or requested_expires_at > pg_catalog.statement_timestamp() + interval '30 days'
    or requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_invitation';
  end if;
  select * into command_record from private.begin_phase4_command(
    'invitation.create', requested_organization_id,
    requested_idempotency_key, requested_sha256
  );
  if command_record.replayed then
    return command_record.existing_response;
  end if;
  insert into api.organization_invitations (
    organization_id, email, role, token_sha256,
    expires_at, created_by
  ) values (
    requested_organization_id, requested_email, requested_role,
    requested_token_sha256, requested_expires_at, subject
  ) returning * into created_invitation;
  response_payload := pg_catalog.jsonb_build_object(
    'invitation_id', created_invitation.id,
    'organization_id', created_invitation.organization_id,
    'email', created_invitation.email,
    'role', created_invitation.role,
    'status', created_invitation.status,
    'expires_at', created_invitation.expires_at,
    'created_at', created_invitation.created_at,
    'replayed', false
  );
  perform private.finish_phase4_command(
    command_record.receipt_id, created_invitation.id, response_payload
  );
  insert into private.audit_events (
    organization_id, actor_type, actor_user_id, action, object_type,
    object_id, correlation_id, outcome, source_service, metadata
  ) values (
    requested_organization_id, 'user', subject, 'invitation.created',
    'organization_invitation', created_invitation.id,
    requested_correlation_id, 'success', 'api',
    pg_catalog.jsonb_build_object(
      'role', requested_role,
      'expires_at', requested_expires_at
    )
  );
  return response_payload;
end
$function$;

create function api.create_organization_invitation(
  requested_organization_id uuid,
  requested_email text,
  requested_role api.organization_role,
  requested_token_sha256 text,
  requested_expires_at timestamptz,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.create_organization_invitation_atomic(
    requested_organization_id, requested_email, requested_role,
    requested_token_sha256, requested_expires_at,
    requested_idempotency_key, requested_sha256,
    requested_correlation_id
  );
$function$;

create function private.organization_audit_feed(
  requested_organization_id uuid,
  requested_limit integer default 50
)
returns jsonb
language plpgsql
security definer
stable
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
  if not private.has_org_role(
    requested_organization_id,
    subject,
    array['owner']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if requested_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_limit';
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', events.id,
        'actor_type', events.actor_type,
        'actor_user_id', events.actor_user_id,
        'action', events.action,
        'object_type', events.object_type,
        'object_id', events.object_id,
        'correlation_id', events.correlation_id,
        'outcome', events.outcome,
        'source_service', events.source_service,
        'metadata', events.metadata,
        'created_at', events.created_at
      ) order by events.created_at desc, events.id desc
    )
    from (
      select * from private.audit_events
      where organization_id = requested_organization_id
      order by created_at desc, id desc
      limit requested_limit
    ) as events
  ), '[]'::jsonb);
end
$function$;

create function api.get_organization_audit_feed(
  requested_organization_id uuid,
  requested_limit integer default 50
)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select private.organization_audit_feed(
    requested_organization_id, requested_limit
  );
$function$;

create function private.organization_admin_summary(
  requested_organization_id uuid
)
returns jsonb
language plpgsql
security definer
stable
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
  if not private.has_org_role(
    requested_organization_id,
    subject,
    array['owner']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  return pg_catalog.jsonb_build_object(
    'organization_id', requested_organization_id,
    'members', (
      select pg_catalog.count(*) from api.organization_memberships
      where organization_id = requested_organization_id
    ),
    'projects', (
      select pg_catalog.count(*) from api.projects
      where organization_id = requested_organization_id and status <> 'deleted'
    ),
    'audiences', (
      select pg_catalog.count(*) from api.audiences
      where organization_id = requested_organization_id
    ),
    'runs', (
      select pg_catalog.count(*) from api.simulation_runs
      where organization_id = requested_organization_id
    ),
    'failed_runs', (
      select pg_catalog.count(*) from api.simulation_runs
      where organization_id = requested_organization_id and state = 'failed'
    ),
    'reports', (
      select pg_catalog.count(*) from api.report_artifacts
      where organization_id = requested_organization_id
    ),
    'active_exports', (
      select pg_catalog.count(*) from api.report_exports
      where organization_id = requested_organization_id
        and deleted_at is null
        and expires_at > pg_catalog.statement_timestamp()
    ),
    'feedback_records', (
      select pg_catalog.count(*) from api.feedback_records
      where organization_id = requested_organization_id
    ),
    'evaluation_runs', (
      select pg_catalog.count(*) from api.evaluation_runs
      where organization_id = requested_organization_id
    ),
    'pending_invitations', (
      select pg_catalog.count(*) from api.organization_invitations
      where organization_id = requested_organization_id
        and status = 'pending'
        and expires_at > pg_catalog.statement_timestamp()
    ),
    'provider_cost_microusd', coalesce((
      select pg_catalog.sum(receipts.cost_microusd)
      from private.provider_success_receipts as receipts
      where receipts.organization_id = requested_organization_id
    ), 0),
    'generated_at', pg_catalog.statement_timestamp()
  );
end
$function$;

create function api.get_organization_admin_summary(
  requested_organization_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select private.organization_admin_summary(requested_organization_id);
$function$;

create function private.set_feature_flag_atomic(
  requested_organization_id uuid,
  requested_flag_key text,
  requested_enabled boolean,
  requested_reason text,
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
  changed_flag api.feature_flags%rowtype;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if not private.has_org_role(
    requested_organization_id,
    subject,
    array['owner']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if requested_flag_key is null
    or requested_flag_key !~ '^[a-z][a-z0-9_.]{0,63}$'
    or requested_enabled is null
    or requested_reason is null
    or requested_reason <> pg_catalog.btrim(requested_reason)
    or pg_catalog.char_length(requested_reason) not between 1 and 500
    or requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_feature_flag';
  end if;
  select * into command_record from private.begin_phase4_command(
    'feature_flag.set', requested_organization_id,
    requested_idempotency_key, requested_sha256
  );
  if command_record.replayed then
    return command_record.existing_response;
  end if;
  insert into api.feature_flags (
    organization_id, flag_key, enabled, reason,
    created_by, updated_by
  ) values (
    requested_organization_id, requested_flag_key, requested_enabled,
    requested_reason, subject, subject
  )
  on conflict (organization_id, flag_key) do update
    set enabled = excluded.enabled,
        reason = excluded.reason,
        version = api.feature_flags.version + 1,
        updated_by = subject,
        updated_at = pg_catalog.statement_timestamp()
  returning * into changed_flag;
  response_payload := pg_catalog.jsonb_build_object(
    'feature_flag_id', changed_flag.id,
    'organization_id', changed_flag.organization_id,
    'flag_key', changed_flag.flag_key,
    'enabled', changed_flag.enabled,
    'reason', changed_flag.reason,
    'version', changed_flag.version,
    'updated_at', changed_flag.updated_at,
    'replayed', false
  );
  perform private.finish_phase4_command(
    command_record.receipt_id, changed_flag.id, response_payload
  );
  insert into private.audit_events (
    organization_id, actor_type, actor_user_id, action, object_type,
    object_id, correlation_id, outcome, source_service, metadata
  ) values (
    requested_organization_id, 'user', subject, 'feature_flag.updated',
    'feature_flag', changed_flag.id, requested_correlation_id,
    'success', 'api', pg_catalog.jsonb_build_object(
      'flag_key', changed_flag.flag_key,
      'enabled', changed_flag.enabled,
      'version', changed_flag.version
    )
  );
  return response_payload;
end
$function$;

create function api.set_feature_flag(
  requested_organization_id uuid,
  requested_flag_key text,
  requested_enabled boolean,
  requested_reason text,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.set_feature_flag_atomic(
    requested_organization_id, requested_flag_key, requested_enabled,
    requested_reason, requested_idempotency_key,
    requested_sha256, requested_correlation_id
  );
$function$;

-- Exact execution surface. API wrappers are invokers; the API role therefore
-- receives the matching private command/read helper and no generic helpers.
revoke all on function private.begin_phase4_command(text, uuid, text, text)
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function private.finish_phase4_command(uuid, uuid, jsonb)
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;

revoke all on function api.create_audience_definition(
  uuid, text, jsonb, text, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function private.create_audience_definition_atomic(
  uuid, text, jsonb, text, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
grant execute on function api.create_audience_definition(
  uuid, text, jsonb, text, text, text, uuid
) to simula_api;
grant execute on function private.create_audience_definition_atomic(
  uuid, text, jsonb, text, text, text, uuid
) to simula_api;

revoke all on function api.create_simulation_configuration(
  uuid, text, uuid, uuid, uuid, uuid, jsonb, bigint, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function private.create_simulation_configuration_atomic(
  uuid, text, uuid, uuid, uuid, uuid, jsonb, bigint, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
grant execute on function api.create_simulation_configuration(
  uuid, text, uuid, uuid, uuid, uuid, jsonb, bigint, text, text, uuid
) to simula_api;
grant execute on function private.create_simulation_configuration_atomic(
  uuid, text, uuid, uuid, uuid, uuid, jsonb, bigint, text, text, uuid
) to simula_api;

revoke all on function api.create_variant_group(uuid, text, jsonb, text, text, uuid)
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function private.create_variant_group_atomic(
  uuid, text, jsonb, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
grant execute on function api.create_variant_group(
  uuid, text, jsonb, text, text, uuid
) to simula_api;
grant execute on function private.create_variant_group_atomic(
  uuid, text, jsonb, text, text, uuid
) to simula_api;

revoke all on function api.create_feedback_record(
  uuid, uuid, api.feedback_kind, timestamptz, jsonb, jsonb, text, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function private.create_feedback_record_atomic(
  uuid, uuid, api.feedback_kind, timestamptz, jsonb, jsonb, text, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
grant execute on function api.create_feedback_record(
  uuid, uuid, api.feedback_kind, timestamptz, jsonb, jsonb, text, text, text, uuid
) to simula_api;
grant execute on function private.create_feedback_record_atomic(
  uuid, uuid, api.feedback_kind, timestamptz, jsonb, jsonb, text, text, text, uuid
) to simula_api;

revoke all on function api.create_report_artifact(uuid, jsonb, text, text, uuid)
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function private.create_report_artifact_atomic(
  uuid, jsonb, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
grant execute on function api.create_report_artifact(
  uuid, jsonb, text, text, uuid
) to simula_api;
grant execute on function private.create_report_artifact_atomic(
  uuid, jsonb, text, text, uuid
) to simula_api;

revoke all on function api.create_report_export(
  uuid, api.export_format, text, bytea, timestamptz, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function private.create_report_export_atomic(
  uuid, api.export_format, text, bytea, timestamptz, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
grant execute on function api.create_report_export(
  uuid, api.export_format, text, bytea, timestamptz, text, text, uuid
) to simula_api;
grant execute on function private.create_report_export_atomic(
  uuid, api.export_format, text, bytea, timestamptz, text, text, uuid
) to simula_api;

revoke all on function api.create_organization_invitation(
  uuid, text, api.organization_role, text, timestamptz, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function private.create_organization_invitation_atomic(
  uuid, text, api.organization_role, text, timestamptz, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
grant execute on function api.create_organization_invitation(
  uuid, text, api.organization_role, text, timestamptz, text, text, uuid
) to simula_api;
grant execute on function private.create_organization_invitation_atomic(
  uuid, text, api.organization_role, text, timestamptz, text, text, uuid
) to simula_api;

revoke all on function api.get_organization_audit_feed(uuid, integer)
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function private.organization_audit_feed(uuid, integer)
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
grant execute on function api.get_organization_audit_feed(uuid, integer) to simula_api;
grant execute on function private.organization_audit_feed(uuid, integer) to simula_api;

revoke all on function api.get_organization_admin_summary(uuid)
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function private.organization_admin_summary(uuid)
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
grant execute on function api.get_organization_admin_summary(uuid) to simula_api;
grant execute on function private.organization_admin_summary(uuid) to simula_api;

revoke all on function api.set_feature_flag(
  uuid, text, boolean, text, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function private.set_feature_flag_atomic(
  uuid, text, boolean, text, text, text, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
grant execute on function api.set_feature_flag(
  uuid, text, boolean, text, text, text, uuid
) to simula_api;
grant execute on function private.set_feature_flag_atomic(
  uuid, text, boolean, text, text, text, uuid
) to simula_api;

set role postgres;
revoke create on schema api, private from simula_command_owner;
