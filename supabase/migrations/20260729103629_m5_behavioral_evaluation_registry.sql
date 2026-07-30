-- Prespecified, versioned benchmark registry. These records can measure a
-- frozen corpus; they cannot relabel experimental output as scientific truth.

set role postgres;

create table api.behavioral_evaluation_protocols (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid references api.organizations (id) on delete cascade,
  protocol_key text not null,
  name text not null,
  created_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint behavioral_evaluation_protocols_organization_id_id_unique
    unique nulls not distinct (organization_id, id),
  constraint behavioral_evaluation_protocols_organization_key_unique
    unique nulls not distinct (organization_id, protocol_key),
  constraint behavioral_evaluation_protocols_key_valid
    check (protocol_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  constraint behavioral_evaluation_protocols_name_valid check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 2 and 160
  ),
  constraint behavioral_evaluation_protocols_scope_valid check (
    (organization_id is null and created_by is null)
    or (organization_id is not null and created_by is not null)
  )
);

create index behavioral_evaluation_protocols_organization_created_idx
  on api.behavioral_evaluation_protocols (
    organization_id, created_at desc, id
  );

create table api.behavioral_evaluation_protocol_versions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid,
  protocol_id uuid not null
    references api.behavioral_evaluation_protocols (id) on delete cascade,
  version integer not null,
  methodology_version text not null,
  registered_at timestamptz not null,
  development_campaign_ids uuid[] not null,
  holdout_campaign_ids uuid[] not null,
  minimum_subgroup_size integer not null,
  score_minimum numeric(12, 6) not null,
  score_maximum numeric(12, 6) not null,
  primary_metric text not null,
  secondary_metric text not null,
  validation_label text not null,
  manifest jsonb not null,
  checksum_sha256 text not null,
  limitations text[] not null,
  created_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint behavioral_evaluation_protocol_versions_organization_id_id_unique
    unique nulls not distinct (organization_id, id),
  constraint behavioral_evaluation_protocol_versions_protocol_version_unique
    unique (protocol_id, version),
  constraint behavioral_evaluation_protocol_versions_version_valid
    check (version between 1 and 1000000),
  constraint behavioral_evaluation_protocol_versions_method_valid
    check (methodology_version ~ '^[a-z][a-z0-9_]{0,63}$'),
  constraint behavioral_evaluation_protocol_versions_split_size_valid check (
    pg_catalog.cardinality(development_campaign_ids) between 1 and 100000
    and pg_catalog.cardinality(holdout_campaign_ids) between 2 and 100000
    and pg_catalog.array_position(development_campaign_ids, null) is null
    and pg_catalog.array_position(holdout_campaign_ids, null) is null
  ),
  constraint behavioral_evaluation_protocol_versions_subgroup_valid
    check (minimum_subgroup_size between 2 and 10000),
  constraint behavioral_evaluation_protocol_versions_bounds_valid check (
    score_minimum >= -1000000
    and score_maximum <= 1000000
    and score_maximum > score_minimum
  ),
  constraint behavioral_evaluation_protocol_versions_metrics_valid check (
    primary_metric = 'mean_absolute_error'
    and secondary_metric = 'pearson_correlation'
  ),
  constraint behavioral_evaluation_protocol_versions_label_valid
    check (validation_label = 'benchmark_only'),
  constraint behavioral_evaluation_protocol_versions_manifest_valid check (
    pg_catalog.jsonb_typeof(manifest) = 'object'
    and pg_catalog.octet_length(manifest::text) <= 1048576
  ),
  constraint behavioral_evaluation_protocol_versions_checksum_valid
    check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  constraint behavioral_evaluation_protocol_versions_limitations_valid
    check (pg_catalog.cardinality(limitations) between 1 and 20),
  constraint behavioral_evaluation_protocol_versions_scope_valid check (
    (organization_id is null and created_by is null)
    or (organization_id is not null and created_by is not null)
  )
);

create index behavioral_evaluation_protocol_versions_organization_created_idx
  on api.behavioral_evaluation_protocol_versions (
    organization_id, created_at desc, id
  );
create index behavioral_evaluation_protocol_versions_protocol_id_idx
  on api.behavioral_evaluation_protocol_versions (protocol_id, version desc);

create table api.behavioral_evaluation_runs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  protocol_version_id uuid not null
    references api.behavioral_evaluation_protocol_versions (id)
    on delete restrict,
  outcome_set_id uuid not null,
  status text not null,
  validation_label text not null,
  observation_sha256 text,
  report jsonb,
  limitations text[] not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint behavioral_evaluation_runs_organization_id_id_unique
    unique (organization_id, id),
  constraint behavioral_evaluation_runs_outcome_set_foreign_key
    foreign key (organization_id, outcome_set_id)
    references api.observed_outcome_sets (organization_id, id)
    on delete restrict,
  constraint behavioral_evaluation_runs_status_valid
    check (status in ('completed', 'failed', 'superseded')),
  constraint behavioral_evaluation_runs_label_valid
    check (validation_label = 'benchmark_only'),
  constraint behavioral_evaluation_runs_report_state_valid check (
    (
      status in ('completed', 'superseded')
      and observation_sha256 ~ '^[0-9a-f]{64}$'
      and pg_catalog.jsonb_typeof(report) = 'object'
      and report ->> 'validation_label' = 'benchmark_only'
      and pg_catalog.octet_length(report::text) <= 1048576
    )
    or (
      status = 'failed'
      and observation_sha256 is null
      and report is null
    )
  ),
  constraint behavioral_evaluation_runs_limitations_valid
    check (pg_catalog.cardinality(limitations) between 1 and 20)
);

create index behavioral_evaluation_runs_organization_created_idx
  on api.behavioral_evaluation_runs (organization_id, created_at desc, id);
create index behavioral_evaluation_runs_protocol_version_idx
  on api.behavioral_evaluation_runs (protocol_version_id, created_at desc);
create index behavioral_evaluation_runs_outcome_set_idx
  on api.behavioral_evaluation_runs (outcome_set_id, created_at desc);

create table api.behavioral_evaluation_members (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  evaluation_run_id uuid not null,
  campaign_id uuid not null,
  behavioral_run_id uuid not null,
  observed_outcome_value_id uuid not null,
  split text not null,
  predicted_score numeric(12, 6) not null,
  observed_score numeric(12, 6) not null,
  baseline_score numeric(12, 6),
  subgroup_keys text[] not null,
  outcome_provenance_sha256 text not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint behavioral_evaluation_members_organization_id_id_unique
    unique (organization_id, id),
  constraint behavioral_evaluation_members_run_campaign_unique
    unique (evaluation_run_id, campaign_id),
  constraint behavioral_evaluation_members_evaluation_foreign_key
    foreign key (organization_id, evaluation_run_id)
    references api.behavioral_evaluation_runs (organization_id, id)
    on delete cascade,
  constraint behavioral_evaluation_members_behavioral_run_foreign_key
    foreign key (organization_id, behavioral_run_id)
    references api.behavioral_run_results (organization_id, run_id)
    on delete restrict,
  constraint behavioral_evaluation_members_outcome_foreign_key
    foreign key (organization_id, observed_outcome_value_id)
    references api.observed_outcome_values (organization_id, id)
    on delete restrict,
  constraint behavioral_evaluation_members_split_valid
    check (split in ('development', 'holdout')),
  constraint behavioral_evaluation_members_scores_valid check (
    predicted_score between -1000000 and 1000000
    and observed_score between -1000000 and 1000000
    and (
      baseline_score is null
      or baseline_score between -1000000 and 1000000
    )
  ),
  constraint behavioral_evaluation_members_subgroups_valid check (
    pg_catalog.cardinality(subgroup_keys) between 0 and 100
    and pg_catalog.array_position(subgroup_keys, null) is null
  ),
  constraint behavioral_evaluation_members_provenance_valid
    check (outcome_provenance_sha256 ~ '^[0-9a-f]{64}$')
);

create index behavioral_evaluation_members_evaluation_idx
  on api.behavioral_evaluation_members (
    organization_id, evaluation_run_id, campaign_id
  );
create index behavioral_evaluation_members_behavioral_run_idx
  on api.behavioral_evaluation_members (behavioral_run_id);
create index behavioral_evaluation_members_outcome_idx
  on api.behavioral_evaluation_members (observed_outcome_value_id);

create function private.enforce_behavioral_evaluation_protocol()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  parent_organization_id uuid;
  parent_found boolean;
  distinct_development integer;
  distinct_holdout integer;
begin
  select protocols.organization_id into parent_organization_id
  from api.behavioral_evaluation_protocols as protocols
  where protocols.id = new.protocol_id;
  parent_found := found;

  select pg_catalog.count(distinct campaign_id)::integer
  into distinct_development
  from pg_catalog.unnest(new.development_campaign_ids) as campaign_id;

  select pg_catalog.count(distinct campaign_id)::integer
  into distinct_holdout
  from pg_catalog.unnest(new.holdout_campaign_ids) as campaign_id;

  if not parent_found
    or parent_organization_id is distinct from new.organization_id
    or distinct_development
      <> pg_catalog.cardinality(new.development_campaign_ids)
    or distinct_holdout <> pg_catalog.cardinality(new.holdout_campaign_ids)
    or new.development_campaign_ids && new.holdout_campaign_ids
  then
    raise exception using
      errcode = '23514',
      message = 'behavioral_evaluation_protocol_invalid';
  end if;
  return new;
end
$function$;

create trigger behavioral_evaluation_protocol_versions_guard
before insert or update of
  organization_id,
  protocol_id,
  development_campaign_ids,
  holdout_campaign_ids
on api.behavioral_evaluation_protocol_versions
for each row
execute function private.enforce_behavioral_evaluation_protocol();

create function private.enforce_behavioral_evaluation_run_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  protocol_organization_id uuid;
  protocol_validation_label text;
  outcome_organization_id uuid;
  outcome_status text;
begin
  select versions.organization_id, versions.validation_label
  into protocol_organization_id, protocol_validation_label
  from api.behavioral_evaluation_protocol_versions as versions
  where versions.id = new.protocol_version_id;

  select outcomes.organization_id, outcomes.status
  into outcome_organization_id, outcome_status
  from api.observed_outcome_sets as outcomes
  where outcomes.id = new.outcome_set_id;

  if protocol_validation_label is null
    or (
      protocol_organization_id is not null
      and protocol_organization_id <> new.organization_id
    )
    or outcome_organization_id is distinct from new.organization_id
    or outcome_status <> 'admitted'
    or protocol_validation_label <> 'benchmark_only'
  then
    raise exception using
      errcode = '23514',
      message = 'behavioral_evaluation_scope_invalid';
  end if;
  return new;
end
$function$;

create trigger behavioral_evaluation_runs_scope_guard
before insert or update of
  organization_id,
  protocol_version_id,
  outcome_set_id
on api.behavioral_evaluation_runs
for each row
execute function private.enforce_behavioral_evaluation_run_scope();

alter table api.behavioral_evaluation_protocols enable row level security;
alter table api.behavioral_evaluation_protocols force row level security;
alter table api.behavioral_evaluation_protocol_versions
  enable row level security;
alter table api.behavioral_evaluation_protocol_versions
  force row level security;
alter table api.behavioral_evaluation_runs enable row level security;
alter table api.behavioral_evaluation_runs force row level security;
alter table api.behavioral_evaluation_members enable row level security;
alter table api.behavioral_evaluation_members force row level security;

create policy behavioral_evaluation_protocols_api_select
on api.behavioral_evaluation_protocols
for select
to simula_api
using (
  organization_id is null
  or private.is_org_member(organization_id, private.verified_subject())
);

create policy behavioral_evaluation_protocol_versions_api_select
on api.behavioral_evaluation_protocol_versions
for select
to simula_api
using (
  organization_id is null
  or private.is_org_member(organization_id, private.verified_subject())
);

create policy behavioral_evaluation_runs_api_select
on api.behavioral_evaluation_runs
for select
to simula_api
using (
  private.is_org_member(organization_id, private.verified_subject())
);

create policy behavioral_evaluation_members_api_select
on api.behavioral_evaluation_members
for select
to simula_api
using (
  private.is_org_member(organization_id, private.verified_subject())
);

create policy behavioral_evaluation_protocols_command_select
on api.behavioral_evaluation_protocols
for select
to simula_command_owner
using (
  organization_id is null
  or private.is_org_member(organization_id, private.verified_subject())
);

create policy behavioral_evaluation_protocols_command_insert
on api.behavioral_evaluation_protocols
for insert
to simula_command_owner
with check (
  organization_id is not null
  and private.is_verified_api_subject(created_by)
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);

create policy behavioral_evaluation_protocol_versions_command_select
on api.behavioral_evaluation_protocol_versions
for select
to simula_command_owner
using (
  organization_id is null
  or private.is_org_member(organization_id, private.verified_subject())
);

create policy behavioral_evaluation_protocol_versions_command_insert
on api.behavioral_evaluation_protocol_versions
for insert
to simula_command_owner
with check (
  organization_id is not null
  and private.is_verified_api_subject(created_by)
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);

create policy behavioral_evaluation_runs_command_select
on api.behavioral_evaluation_runs
for select
to simula_command_owner
using (
  private.is_org_member(organization_id, private.verified_subject())
);

create policy behavioral_evaluation_runs_command_insert
on api.behavioral_evaluation_runs
for insert
to simula_command_owner
with check (
  private.is_verified_api_subject(created_by)
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);

create policy behavioral_evaluation_members_command_select
on api.behavioral_evaluation_members
for select
to simula_command_owner
using (
  private.is_org_member(organization_id, private.verified_subject())
);

create policy behavioral_evaluation_members_command_insert
on api.behavioral_evaluation_members
for insert
to simula_command_owner
with check (
  private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);

revoke all on table
  api.behavioral_evaluation_protocols,
  api.behavioral_evaluation_protocol_versions,
  api.behavioral_evaluation_runs,
  api.behavioral_evaluation_members
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner, postgres;

grant select on table
  api.behavioral_evaluation_protocols,
  api.behavioral_evaluation_protocol_versions,
  api.behavioral_evaluation_runs,
  api.behavioral_evaluation_members
to simula_api;

grant select, insert on table
  api.behavioral_evaluation_protocols,
  api.behavioral_evaluation_protocol_versions,
  api.behavioral_evaluation_runs,
  api.behavioral_evaluation_members
to simula_command_owner;

revoke all on function private.enforce_behavioral_evaluation_protocol()
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner, postgres;

revoke all on function private.enforce_behavioral_evaluation_run_scope()
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner, postgres;

revoke all on all sequences in schema api, private
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner;

reset role;

-- Supabase records migration history in the same session after this script.
set role postgres;
