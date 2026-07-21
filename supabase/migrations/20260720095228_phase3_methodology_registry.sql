-- Phase 3 methodology registry. Global rows are authored engineering fixtures,
-- never measured population data. Runtime roles remain read-only here.

set role postgres;

alter type api.audience_kind add value if not exists 'synthetic_cohort';
alter type api.audience_admission_status add value if not exists 'approved_experimental';

create type api.validation_status as enum (
  'experimental',
  'benchmarked',
  'calibrated',
  'retired'
);

create type api.provider_admission_status as enum (
  'approved_demo',
  'approved_external',
  'disabled',
  'retired'
);

create type api.evaluation_status as enum (
  'completed',
  'failed',
  'superseded'
);

create table api.population_frames (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid references api.organizations (id) on delete cascade,
  name text not null,
  geography text not null,
  target_population text not null,
  validation_status api.validation_status not null default 'experimental',
  created_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint population_frames_organization_id_id_unique
    unique nulls not distinct (organization_id, id),
  constraint population_frames_name_valid check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 2 and 120
  ),
  constraint population_frames_geography_valid check (
    geography = pg_catalog.btrim(geography)
    and pg_catalog.char_length(geography) between 1 and 120
  ),
  constraint population_frames_target_valid check (
    pg_catalog.char_length(target_population) between 1 and 500
  ),
  constraint population_frames_scope_valid check (
    (organization_id is null and created_by is null)
    or (organization_id is not null and created_by is not null)
  )
);

create index population_frames_organization_created_idx
  on api.population_frames (organization_id, created_at, id);

create table api.population_frame_versions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid,
  population_frame_id uuid not null references api.population_frames (id) on delete cascade,
  version integer not null,
  manifest jsonb not null,
  checksum_sha256 text not null,
  validation_status api.validation_status not null default 'experimental',
  limitations text[] not null,
  created_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint population_frame_versions_organization_id_id_unique
    unique nulls not distinct (organization_id, id),
  constraint population_frame_versions_frame_version_unique
    unique (population_frame_id, version),
  constraint population_frame_versions_version_valid check (version > 0),
  constraint population_frame_versions_manifest_valid check (
    pg_catalog.jsonb_typeof(manifest) = 'object'
    and pg_catalog.octet_length(manifest::text) <= 524288
  ),
  constraint population_frame_versions_checksum_valid check (
    checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint population_frame_versions_limitations_valid check (
    pg_catalog.cardinality(limitations) between 1 and 20
  ),
  constraint population_frame_versions_scope_valid check (
    (organization_id is null and created_by is null)
    or (organization_id is not null and created_by is not null)
  )
);

create index population_frame_versions_organization_created_idx
  on api.population_frame_versions (organization_id, created_at, id);
create index population_frame_versions_frame_id_idx
  on api.population_frame_versions (population_frame_id, version desc);

create table api.methodology_versions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  methodology_key text not null,
  version integer not null,
  manifest jsonb not null,
  checksum_sha256 text not null,
  validation_status api.validation_status not null default 'experimental',
  limitations text[] not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint methodology_versions_key_version_unique unique (methodology_key, version),
  constraint methodology_versions_key_valid check (
    methodology_key ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint methodology_versions_version_valid check (version > 0),
  constraint methodology_versions_manifest_valid check (
    pg_catalog.jsonb_typeof(manifest) = 'object'
    and pg_catalog.octet_length(manifest::text) <= 262144
  ),
  constraint methodology_versions_checksum_valid check (
    checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint methodology_versions_limitations_valid check (
    pg_catalog.cardinality(limitations) between 1 and 20
  )
);

create table api.provider_configuration_versions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  provider_id text not null,
  provider_version text not null,
  model_id text not null,
  template_id text not null,
  version integer not null,
  admission_status api.provider_admission_status not null,
  external_provider boolean not null,
  pricing jsonb not null,
  limits jsonb not null,
  data_handling jsonb not null,
  checksum_sha256 text not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint provider_configuration_versions_identity_unique
    unique (provider_id, provider_version, model_id, template_id, version),
  constraint provider_configuration_versions_provider_id_valid check (
    provider_id ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint provider_configuration_versions_template_id_valid check (
    template_id ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint provider_configuration_versions_labels_valid check (
    provider_version = pg_catalog.btrim(provider_version)
    and model_id = pg_catalog.btrim(model_id)
    and pg_catalog.char_length(provider_version) between 1 and 120
    and pg_catalog.char_length(model_id) between 1 and 120
  ),
  constraint provider_configuration_versions_version_valid check (version > 0),
  constraint provider_configuration_versions_objects_valid check (
    pg_catalog.jsonb_typeof(pricing) = 'object'
    and pg_catalog.jsonb_typeof(limits) = 'object'
    and pg_catalog.jsonb_typeof(data_handling) = 'object'
  ),
  constraint provider_configuration_versions_checksum_valid check (
    checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint provider_configuration_versions_admission_valid check (
    (not external_provider and admission_status = 'approved_demo')
    or (external_provider and admission_status <> 'approved_demo')
  )
);

create table api.simulation_configurations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  name text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint simulation_configurations_organization_id_id_unique
    unique (organization_id, id),
  constraint simulation_configurations_project_foreign_key
    foreign key (organization_id, project_id)
    references api.projects (organization_id, id) on delete cascade,
  constraint simulation_configurations_name_valid check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 2 and 120
  )
);

create index simulation_configurations_project_created_idx
  on api.simulation_configurations (organization_id, project_id, created_at, id);

create table api.simulation_configuration_versions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  simulation_configuration_id uuid not null,
  version integer not null,
  audience_version_id uuid not null references api.audience_versions (id) on delete restrict,
  population_frame_version_id uuid not null
    references api.population_frame_versions (id) on delete restrict,
  methodology_version_id uuid not null references api.methodology_versions (id) on delete restrict,
  provider_configuration_version_id uuid not null
    references api.provider_configuration_versions (id) on delete restrict,
  sampling_configuration jsonb not null,
  cost_ceiling_microusd bigint not null,
  checksum_sha256 text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint simulation_configuration_versions_organization_id_id_unique
    unique (organization_id, id),
  constraint simulation_configuration_versions_config_version_unique
    unique (simulation_configuration_id, version),
  constraint simulation_configuration_versions_config_foreign_key
    foreign key (organization_id, simulation_configuration_id)
    references api.simulation_configurations (organization_id, id) on delete cascade,
  constraint simulation_configuration_versions_version_valid check (version > 0),
  constraint simulation_configuration_versions_sampling_valid check (
    pg_catalog.jsonb_typeof(sampling_configuration) = 'object'
    and pg_catalog.octet_length(sampling_configuration::text) <= 8192
  ),
  constraint simulation_configuration_versions_cost_valid check (
    cost_ceiling_microusd between 0 and 100000000
  ),
  constraint simulation_configuration_versions_checksum_valid check (
    checksum_sha256 ~ '^[0-9a-f]{64}$'
  )
);

create index simulation_configuration_versions_config_id_idx
  on api.simulation_configuration_versions (simulation_configuration_id, version desc);
create index simulation_configuration_versions_audience_id_idx
  on api.simulation_configuration_versions (audience_version_id);
create index simulation_configuration_versions_population_id_idx
  on api.simulation_configuration_versions (population_frame_version_id);
create index simulation_configuration_versions_methodology_id_idx
  on api.simulation_configuration_versions (methodology_version_id);
create index simulation_configuration_versions_provider_id_idx
  on api.simulation_configuration_versions (provider_configuration_version_id);

create table api.evaluation_runs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null references api.organizations (id) on delete cascade,
  simulation_configuration_version_id uuid not null,
  methodology_version_id uuid not null references api.methodology_versions (id) on delete restrict,
  benchmark_checksum_sha256 text not null,
  status api.evaluation_status not null,
  metrics jsonb not null,
  slice_metrics jsonb not null,
  limitations text[] not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint evaluation_runs_configuration_foreign_key
    foreign key (organization_id, simulation_configuration_version_id)
    references api.simulation_configuration_versions (organization_id, id) on delete cascade,
  constraint evaluation_runs_benchmark_checksum_valid check (
    benchmark_checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint evaluation_runs_metrics_valid check (
    pg_catalog.jsonb_typeof(metrics) = 'object'
    and pg_catalog.jsonb_typeof(slice_metrics) = 'array'
    and pg_catalog.octet_length(metrics::text) <= 65536
    and pg_catalog.octet_length(slice_metrics::text) <= 262144
  ),
  constraint evaluation_runs_limitations_valid check (
    pg_catalog.cardinality(limitations) between 1 and 20
  )
);

create index evaluation_runs_organization_created_idx
  on api.evaluation_runs (organization_id, created_at desc, id);
create index evaluation_runs_configuration_id_idx
  on api.evaluation_runs (simulation_configuration_version_id);
create index evaluation_runs_methodology_id_idx
  on api.evaluation_runs (methodology_version_id);

create function private.enforce_population_frame_version_scope()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  parent_organization_id uuid;
begin
  select frames.organization_id into parent_organization_id
  from api.population_frames as frames
  where frames.id = new.population_frame_id;
  if not found or parent_organization_id is distinct from new.organization_id then
    raise exception using errcode = '23514', message = 'population_frame_scope_mismatch';
  end if;
  return new;
end
$function$;

create trigger population_frame_versions_scope_guard
before insert or update of organization_id, population_frame_id
on api.population_frame_versions
for each row execute function private.enforce_population_frame_version_scope();

grant create on schema private to simula_command_owner;
alter function private.enforce_population_frame_version_scope()
  owner to simula_command_owner;
revoke create on schema private from simula_command_owner;

alter table api.population_frames enable row level security;
alter table api.population_frames force row level security;
alter table api.population_frame_versions enable row level security;
alter table api.population_frame_versions force row level security;
alter table api.methodology_versions enable row level security;
alter table api.methodology_versions force row level security;
alter table api.provider_configuration_versions enable row level security;
alter table api.provider_configuration_versions force row level security;
alter table api.simulation_configurations enable row level security;
alter table api.simulation_configurations force row level security;
alter table api.simulation_configuration_versions enable row level security;
alter table api.simulation_configuration_versions force row level security;
alter table api.evaluation_runs enable row level security;
alter table api.evaluation_runs force row level security;

create policy population_frames_api_select
on api.population_frames for select to simula_api
using (
  (organization_id is null and validation_status <> 'retired')
  or private.is_org_member(organization_id, private.verified_subject())
);

create policy population_frame_versions_api_select
on api.population_frame_versions for select to simula_api
using (
  (organization_id is null and validation_status <> 'retired')
  or private.is_org_member(organization_id, private.verified_subject())
);

create policy methodology_versions_api_select
on api.methodology_versions for select to simula_api
using (
  validation_status <> 'retired'
  and private.verified_subject() is not null
);

create policy provider_configuration_versions_api_select
on api.provider_configuration_versions for select to simula_api
using (
  admission_status in ('approved_demo', 'approved_external')
  and private.verified_subject() is not null
);

create policy simulation_configurations_api_select
on api.simulation_configurations for select to simula_api
using (private.is_org_member(organization_id, private.verified_subject()));

create policy simulation_configuration_versions_api_select
on api.simulation_configuration_versions for select to simula_api
using (private.is_org_member(organization_id, private.verified_subject()));

create policy evaluation_runs_api_select
on api.evaluation_runs for select to simula_api
using (private.is_org_member(organization_id, private.verified_subject()));

revoke all on table
  api.population_frames,
  api.population_frame_versions,
  api.methodology_versions,
  api.provider_configuration_versions,
  api.simulation_configurations,
  api.simulation_configuration_versions,
  api.evaluation_runs
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner;

grant select on table
  api.population_frames,
  api.population_frame_versions,
  api.methodology_versions,
  api.provider_configuration_versions,
  api.simulation_configurations,
  api.simulation_configuration_versions,
  api.evaluation_runs
to simula_api;

with frame_manifest as (
  select pg_catalog.jsonb_build_object(
    'schema_version', 1,
    'kind', 'authored_demo',
    'target_population', 'No real population; authored engineering fixture only.',
    'geography', 'Fictional test geography',
    'inclusion', pg_catalog.jsonb_build_array('Four authored synthetic cells.'),
    'exclusion', pg_catalog.jsonb_build_array('Every real person and population.'),
    'provenance', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'source_id', 'phase3_authored_fixture',
        'source_version', '1',
        'owner', 'SIMULA repository',
        'license', 'repository engineering fixture',
        'allowed_uses', pg_catalog.jsonb_build_array('local methodology tests'),
        'collection_period', 'not collected',
        'sampling_frame', 'no human sampling frame',
        'known_biases', pg_catalog.jsonb_build_array('authored and non-representative'),
        'coverage_limitations', pg_catalog.jsonb_build_array('covers no real population')
      )
    ),
    'cells', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'key', 'metro_early', 'weight', 0.40,
        'dimensions', pg_catalog.jsonb_build_object(
          'geography', 'metro', 'life_stage', 'early'
        )
      ),
      pg_catalog.jsonb_build_object(
        'key', 'metro_late', 'weight', 0.30,
        'dimensions', pg_catalog.jsonb_build_object(
          'geography', 'metro', 'life_stage', 'late'
        )
      ),
      pg_catalog.jsonb_build_object(
        'key', 'regional_early', 'weight', 0.20,
        'dimensions', pg_catalog.jsonb_build_object(
          'geography', 'regional', 'life_stage', 'early'
        )
      ),
      pg_catalog.jsonb_build_object(
        'key', 'regional_late', 'weight', 0.10,
        'dimensions', pg_catalog.jsonb_build_object(
          'geography', 'regional', 'life_stage', 'late'
        )
      )
    )
  ) as manifest
), inserted_frame as (
  insert into api.population_frames (
    id, organization_id, name, geography, target_population,
    validation_status, created_by
  ) values (
    '00000000-0000-4000-8000-0000000003f0'::uuid,
    null,
    'Authored Phase 3 methodology fixture',
    'Fictional test geography',
    'No real population; authored engineering fixture only.',
    'experimental',
    null
  )
  on conflict (id) do update set name = excluded.name
  returning id
)
insert into api.population_frame_versions (
  id, organization_id, population_frame_id, version, manifest,
  checksum_sha256, validation_status, limitations, created_by
)
select
  '00000000-0000-4000-8000-0000000003f1'::uuid,
  null,
  inserted_frame.id,
  1,
  frame_manifest.manifest,
  pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(frame_manifest.manifest::text, 'UTF8'), 'sha256'),
    'hex'
  ),
  'experimental',
  array[
    'Authored cells estimate nobody.',
    'No demographic or geographic distribution is claimed.'
  ]::text[],
  null
from inserted_frame cross join frame_manifest
on conflict (id) do nothing;

with method_manifest as (
  select pg_catalog.jsonb_build_object(
    'schema_version', 1,
    'methodology_key', 'phase3_method_v1',
    'sampling', 'deterministic weighted largest-remainder allocation',
    'response_schema_version', 2,
    'aggregation', 'audience-weighted cohort aggregation with sparse suppression',
    'uncertainty_components', pg_catalog.jsonb_build_array(
      'frame_coverage', 'sampling', 'measurement', 'model', 'calibration',
      'run_stability', 'missingness', 'dataset_shift'
    ),
    'validation_label', 'experimental'
  ) as manifest
)
insert into api.methodology_versions (
  id, methodology_key, version, manifest, checksum_sha256,
  validation_status, limitations
)
select
  '00000000-0000-4000-8000-0000000003a1'::uuid,
  'phase3_method_v1',
  1,
  method_manifest.manifest,
  pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(method_manifest.manifest::text, 'UTF8'), 'sha256'),
    'hex'
  ),
  'experimental',
  array[
    'No predictive validity or representativeness threshold is approved.',
    'Synthetic variation is not human sampling uncertainty.'
  ]::text[]
from method_manifest
on conflict (id) do nothing;

with provider_parts as (
  select
    '{}'::jsonb as pricing,
    pg_catalog.jsonb_build_object(
      'maximum_input_tokens', 0,
      'maximum_output_tokens', 0,
      'maximum_cost_microusd', 0,
      'timeout_seconds', 30
    ) as limits,
    pg_catalog.jsonb_build_object(
      'network_egress', false,
      'retention', 'none',
      'training_use', false,
      'credentials_required', false
    ) as data_handling
), provider_manifest as (
  select pg_catalog.jsonb_build_object(
    'provider_id', 'deterministic_cohort',
    'provider_version', '1',
    'model_id', 'deterministic_cohort_fixture_v1',
    'template_id', 'phase3_cohort_v1',
    'pricing', provider_parts.pricing,
    'limits', provider_parts.limits,
    'data_handling', provider_parts.data_handling
  ) as manifest,
  provider_parts.*
  from provider_parts
)
insert into api.provider_configuration_versions (
  id, provider_id, provider_version, model_id, template_id, version,
  admission_status, external_provider, pricing, limits, data_handling,
  checksum_sha256
)
select
  '00000000-0000-4000-8000-0000000003b1'::uuid,
  'deterministic_cohort',
  '1',
  'deterministic_cohort_fixture_v1',
  'phase3_cohort_v1',
  1,
  'approved_demo',
  false,
  provider_manifest.pricing,
  provider_manifest.limits,
  provider_manifest.data_handling,
  pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(provider_manifest.manifest::text, 'UTF8'), 'sha256'),
    'hex'
  )
from provider_manifest
on conflict (id) do nothing;

set role simula_command_owner;
revoke all on function private.enforce_population_frame_version_scope()
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
set role postgres;

revoke all on all sequences in schema api, private
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner;
