-- Govern evidence rights, aggregate observed outcomes, and private stimulus
-- asset metadata. Browser clients never receive direct storage authority.

set role postgres;

create table api.evidence_sources (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid references api.organizations (id) on delete cascade,
  source_key text not null,
  name text not null,
  created_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint evidence_sources_organization_id_id_unique
    unique nulls not distinct (organization_id, id),
  constraint evidence_sources_organization_key_unique
    unique nulls not distinct (organization_id, source_key),
  constraint evidence_sources_key_valid
    check (source_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  constraint evidence_sources_name_valid check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 2 and 160
  ),
  constraint evidence_sources_scope_valid check (
    (organization_id is null and created_by is null)
    or (organization_id is not null and created_by is not null)
  )
);

create index evidence_sources_organization_created_idx
  on api.evidence_sources (organization_id, created_at desc, id);

create table api.evidence_source_versions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid,
  evidence_source_id uuid not null
    references api.evidence_sources (id) on delete cascade,
  version integer not null,
  source_version text not null,
  owner_name text not null,
  license_name text not null,
  consent_basis text not null,
  allowed_uses text[] not null,
  prohibited_uses text[] not null,
  rights_status text not null,
  collection_started_on date,
  collection_ended_on date,
  rights_expires_at timestamptz,
  provenance jsonb not null,
  checksum_sha256 text not null,
  created_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint evidence_source_versions_organization_id_id_unique
    unique nulls not distinct (organization_id, id),
  constraint evidence_source_versions_source_version_unique
    unique (evidence_source_id, version),
  constraint evidence_source_versions_version_valid
    check (version between 1 and 1000000),
  constraint evidence_source_versions_labels_valid check (
    source_version = pg_catalog.btrim(source_version)
    and owner_name = pg_catalog.btrim(owner_name)
    and license_name = pg_catalog.btrim(license_name)
    and consent_basis = pg_catalog.btrim(consent_basis)
    and pg_catalog.char_length(source_version) between 1 and 120
    and pg_catalog.char_length(owner_name) between 1 and 160
    and pg_catalog.char_length(license_name) between 1 and 160
    and pg_catalog.char_length(consent_basis) between 1 and 500
  ),
  constraint evidence_source_versions_uses_valid check (
    pg_catalog.cardinality(allowed_uses) between 1 and 20
    and pg_catalog.cardinality(prohibited_uses) between 0 and 20
    and pg_catalog.array_position(allowed_uses, null) is null
    and pg_catalog.array_position(prohibited_uses, null) is null
  ),
  constraint evidence_source_versions_rights_valid check (
    rights_status in ('approved', 'restricted', 'expired', 'revoked')
  ),
  constraint evidence_source_versions_collection_valid check (
    (collection_started_on is null) = (collection_ended_on is null)
    and (
      collection_started_on is null
      or collection_ended_on >= collection_started_on
    )
  ),
  constraint evidence_source_versions_expiry_valid check (
    rights_expires_at is null or rights_expires_at > created_at
  ),
  constraint evidence_source_versions_provenance_valid check (
    pg_catalog.jsonb_typeof(provenance) = 'object'
    and pg_catalog.octet_length(provenance::text) <= 131072
  ),
  constraint evidence_source_versions_checksum_valid
    check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  constraint evidence_source_versions_scope_valid check (
    (organization_id is null and created_by is null)
    or (organization_id is not null and created_by is not null)
  )
);

create index evidence_source_versions_organization_created_idx
  on api.evidence_source_versions (organization_id, created_at desc, id);
create index evidence_source_versions_source_id_idx
  on api.evidence_source_versions (evidence_source_id, version desc);
create index evidence_source_versions_approved_expiry_idx
  on api.evidence_source_versions (rights_expires_at, id)
  where rights_status = 'approved';

create table api.observed_outcome_sets (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  evidence_source_version_id uuid not null
    references api.evidence_source_versions (id) on delete restrict,
  name text not null,
  outcome_kind text not null,
  status text not null,
  observed_started_at timestamptz not null,
  observed_ended_at timestamptz not null,
  manifest jsonb not null,
  checksum_sha256 text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint observed_outcome_sets_organization_id_id_unique
    unique (organization_id, id),
  constraint observed_outcome_sets_project_foreign_key
    foreign key (organization_id, project_id)
    references api.projects (organization_id, id) on delete cascade,
  constraint observed_outcome_sets_name_valid check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 2 and 160
  ),
  constraint observed_outcome_sets_kind_valid check (
    outcome_kind in (
      'campaign_performance',
      'human_aggregate',
      'historical_backtest'
    )
  ),
  constraint observed_outcome_sets_status_valid
    check (status in ('draft', 'admitted', 'retired')),
  constraint observed_outcome_sets_window_valid
    check (observed_ended_at >= observed_started_at),
  constraint observed_outcome_sets_manifest_valid check (
    pg_catalog.jsonb_typeof(manifest) = 'object'
    and pg_catalog.octet_length(manifest::text) <= 524288
  ),
  constraint observed_outcome_sets_checksum_valid
    check (checksum_sha256 ~ '^[0-9a-f]{64}$')
);

create index observed_outcome_sets_organization_created_idx
  on api.observed_outcome_sets (organization_id, created_at desc, id);
create index observed_outcome_sets_project_created_idx
  on api.observed_outcome_sets (
    organization_id, project_id, created_at desc, id
  );
create index observed_outcome_sets_source_version_idx
  on api.observed_outcome_sets (evidence_source_version_id);

create table api.observed_outcome_values (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  outcome_set_id uuid not null,
  campaign_key text not null,
  variant_key text not null,
  metric_key text not null,
  metric_value numeric(20, 6) not null,
  metric_unit text not null,
  subgroup_key text,
  observation_count integer not null,
  checksum_sha256 text not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint observed_outcome_values_organization_id_id_unique
    unique (organization_id, id),
  constraint observed_outcome_values_set_metric_unique
    unique nulls not distinct (
      outcome_set_id, campaign_key, variant_key, metric_key, subgroup_key
    ),
  constraint observed_outcome_values_set_foreign_key
    foreign key (organization_id, outcome_set_id)
    references api.observed_outcome_sets (organization_id, id)
    on delete cascade,
  constraint observed_outcome_values_keys_valid check (
    campaign_key ~ '^[a-z][a-z0-9_]{0,63}$'
    and variant_key ~ '^[a-z][a-z0-9_]{0,63}$'
    and metric_key ~ '^[a-z][a-z0-9_]{0,63}$'
    and (
      subgroup_key is null
      or subgroup_key ~ '^[a-z][a-z0-9_]{0,63}$'
    )
  ),
  constraint observed_outcome_values_value_valid
    check (metric_value between -1000000000000 and 1000000000000),
  constraint observed_outcome_values_unit_valid check (
    metric_unit = pg_catalog.btrim(metric_unit)
    and pg_catalog.char_length(metric_unit) between 1 and 80
  ),
  constraint observed_outcome_values_sparse_cell_valid check (
    observation_count between 1 and 2147483647
    and (subgroup_key is null or observation_count >= 50)
  ),
  constraint observed_outcome_values_checksum_valid
    check (checksum_sha256 ~ '^[0-9a-f]{64}$')
);

create index observed_outcome_values_set_id_idx
  on api.observed_outcome_values (outcome_set_id, id);
create index observed_outcome_values_metric_idx
  on api.observed_outcome_values (
    organization_id, metric_key, campaign_key, variant_key
  );

create table api.stimulus_assets (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  stimulus_id uuid not null,
  storage_bucket_id text not null default 'simula-private-assets',
  storage_object_name text not null,
  filename text not null,
  media_type text not null,
  byte_size integer,
  content_sha256 text,
  status text not null default 'pending_upload',
  retention_until timestamptz not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  constraint stimulus_assets_organization_id_id_unique
    unique (organization_id, id),
  constraint stimulus_assets_stimulus_foreign_key
    foreign key (organization_id, stimulus_id)
    references api.stimuli (organization_id, id) on delete cascade,
  constraint stimulus_assets_storage_object_unique
    unique (storage_bucket_id, storage_object_name),
  constraint stimulus_assets_bucket_valid
    check (storage_bucket_id = 'simula-private-assets'),
  constraint stimulus_assets_object_name_valid check (
    pg_catalog.char_length(storage_object_name) between 75 and 512
    and storage_object_name like
      organization_id::text || '/' || stimulus_id::text || '/%'
    and storage_object_name !~ '(^|/)\.\.?(/|$)'
  ),
  constraint stimulus_assets_filename_valid check (
    filename ~ '^[A-Za-z0-9][A-Za-z0-9_. -]{0,119}$'
    and filename !~ '\.\.'
  ),
  constraint stimulus_assets_media_type_valid check (
    media_type in (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4'
    )
  ),
  constraint stimulus_assets_content_valid check (
    (
      status = 'pending_upload'
      and byte_size is null
      and content_sha256 is null
    )
    or (
      status in ('available', 'deletion_requested', 'deleted')
      and byte_size between 1 and 16777216
      and content_sha256 ~ '^[0-9a-f]{64}$'
    )
  ),
  constraint stimulus_assets_status_valid check (
    status in (
      'pending_upload', 'available', 'deletion_requested', 'deleted'
    )
  ),
  constraint stimulus_assets_retention_valid
    check (retention_until >= created_at),
  constraint stimulus_assets_deletion_valid check (
    (
      status in ('pending_upload', 'available')
      and deletion_requested_at is null
      and deleted_at is null
    )
    or (
      status = 'deletion_requested'
      and deletion_requested_at is not null
      and deleted_at is null
    )
    or (
      status = 'deleted'
      and deletion_requested_at is not null
      and deleted_at is not null
      and deleted_at >= deletion_requested_at
    )
  )
);

create index stimulus_assets_stimulus_created_idx
  on api.stimulus_assets (organization_id, stimulus_id, created_at desc, id);
create index stimulus_assets_retention_idx
  on api.stimulus_assets (retention_until, id)
  where status <> 'deleted';

create function private.enforce_evidence_source_version_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  parent_organization_id uuid;
begin
  select sources.organization_id into parent_organization_id
  from api.evidence_sources as sources
  where sources.id = new.evidence_source_id;
  if not found
    or parent_organization_id is distinct from new.organization_id
  then
    raise exception using
      errcode = '23514',
      message = 'evidence_source_scope_mismatch';
  end if;
  return new;
end
$function$;

create trigger evidence_source_versions_scope_guard
before insert or update of organization_id, evidence_source_id
on api.evidence_source_versions
for each row
execute function private.enforce_evidence_source_version_scope();

create function private.enforce_observed_outcome_rights()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  source_organization_id uuid;
  source_rights_status text;
  source_rights_expires_at timestamptz;
begin
  select
    versions.organization_id,
    versions.rights_status,
    versions.rights_expires_at
  into
    source_organization_id,
    source_rights_status,
    source_rights_expires_at
  from api.evidence_source_versions as versions
  where versions.id = new.evidence_source_version_id;

  if not found
    or (
      source_organization_id is not null
      and source_organization_id <> new.organization_id
    )
    or (
      new.status = 'admitted'
      and (
        source_rights_status <> 'approved'
        or (
          source_rights_expires_at is not null
          and source_rights_expires_at <= pg_catalog.statement_timestamp()
        )
      )
    )
  then
    raise exception using
      errcode = '23514',
      message = 'observed_outcome_rights_not_admitted';
  end if;
  return new;
end
$function$;

create trigger observed_outcome_sets_rights_guard
before insert or update of organization_id, evidence_source_version_id, status
on api.observed_outcome_sets
for each row
execute function private.enforce_observed_outcome_rights();

alter table api.evidence_sources enable row level security;
alter table api.evidence_sources force row level security;
alter table api.evidence_source_versions enable row level security;
alter table api.evidence_source_versions force row level security;
alter table api.observed_outcome_sets enable row level security;
alter table api.observed_outcome_sets force row level security;
alter table api.observed_outcome_values enable row level security;
alter table api.observed_outcome_values force row level security;
alter table api.stimulus_assets enable row level security;
alter table api.stimulus_assets force row level security;

create policy evidence_sources_api_select
on api.evidence_sources
for select
to simula_api
using (
  organization_id is null
  or private.is_org_member(organization_id, private.verified_subject())
);

create policy evidence_source_versions_api_select
on api.evidence_source_versions
for select
to simula_api
using (
  (
    organization_id is null
    and rights_status = 'approved'
    and (
      rights_expires_at is null
      or rights_expires_at > pg_catalog.statement_timestamp()
    )
  )
  or private.is_org_member(organization_id, private.verified_subject())
);

create policy observed_outcome_sets_api_select
on api.observed_outcome_sets
for select
to simula_api
using (
  private.is_org_member(organization_id, private.verified_subject())
);

create policy observed_outcome_values_api_select
on api.observed_outcome_values
for select
to simula_api
using (
  private.is_org_member(organization_id, private.verified_subject())
);

create policy stimulus_assets_api_select
on api.stimulus_assets
for select
to simula_api
using (
  private.is_org_member(organization_id, private.verified_subject())
);

create policy evidence_sources_command_select
on api.evidence_sources
for select
to simula_command_owner
using (
  organization_id is null
  or private.is_org_member(organization_id, private.verified_subject())
);

create policy evidence_sources_command_insert
on api.evidence_sources
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

create policy evidence_source_versions_command_select
on api.evidence_source_versions
for select
to simula_command_owner
using (
  organization_id is null
  or private.is_org_member(organization_id, private.verified_subject())
);

create policy evidence_source_versions_command_insert
on api.evidence_source_versions
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

create policy observed_outcome_sets_command_select
on api.observed_outcome_sets
for select
to simula_command_owner
using (
  private.is_org_member(organization_id, private.verified_subject())
);

create policy observed_outcome_sets_command_insert
on api.observed_outcome_sets
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

create policy observed_outcome_values_command_select
on api.observed_outcome_values
for select
to simula_command_owner
using (
  private.is_org_member(organization_id, private.verified_subject())
);

create policy observed_outcome_values_command_insert
on api.observed_outcome_values
for insert
to simula_command_owner
with check (
  private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);

create policy stimulus_assets_command_select
on api.stimulus_assets
for select
to simula_command_owner
using (
  private.is_org_member(organization_id, private.verified_subject())
);

create policy stimulus_assets_command_insert
on api.stimulus_assets
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

create policy stimulus_assets_command_update
on api.stimulus_assets
for update
to simula_command_owner
using (
  private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
)
with check (
  private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);

revoke all on table
  api.evidence_sources,
  api.evidence_source_versions,
  api.observed_outcome_sets,
  api.observed_outcome_values,
  api.stimulus_assets
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner, postgres;

grant select on table
  api.evidence_sources,
  api.evidence_source_versions,
  api.observed_outcome_sets,
  api.observed_outcome_values,
  api.stimulus_assets
to simula_api;

grant select, insert on table
  api.evidence_sources,
  api.evidence_source_versions,
  api.observed_outcome_sets,
  api.observed_outcome_values
to simula_command_owner;

grant select, insert on table api.stimulus_assets
to simula_command_owner;

grant update (
  byte_size,
  content_sha256,
  status,
  deletion_requested_at,
  deleted_at
) on api.stimulus_assets
to simula_command_owner;

with fixture as (
  select pg_catalog.jsonb_build_object(
    'source_key', 'authored_fixture',
    'source_version', '1',
    'owner', 'SIMULA repository',
    'license', 'Repository fixture',
    'consent_basis', 'No people or personal data; authored engineering fixture.',
    'allowed_uses', pg_catalog.jsonb_build_array(
      'Local deterministic engineering rehearsal.'
    ),
    'prohibited_uses', pg_catalog.jsonb_build_array(
      'Population inference.',
      'Claims about real people.'
    ),
    'collection_period', 'Not collected.',
    'validation_status', 'experimental'
  ) as provenance
), source as (
  insert into api.evidence_sources (
    id, organization_id, source_key, name, created_by
  ) values (
    '00000000-0000-4000-8000-0000000005e0'::uuid,
    null,
    'authored_fixture',
    'Authored behavioral engineering fixture',
    null
  )
  on conflict (id) do update set name = excluded.name
  returning id
)
insert into api.evidence_source_versions (
  id, organization_id, evidence_source_id, version, source_version,
  owner_name, license_name, consent_basis, allowed_uses, prohibited_uses,
  rights_status, provenance, checksum_sha256, created_by
)
select
  '00000000-0000-4000-8000-0000000005e1'::uuid,
  null,
  source.id,
  1,
  '1',
  'SIMULA repository',
  'Repository fixture',
  'No people or personal data; authored engineering fixture.',
  array['Local deterministic engineering rehearsal.']::text[],
  array['Population inference.', 'Claims about real people.']::text[],
  'approved',
  fixture.provenance,
  pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(fixture.provenance::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  null
from source
cross join fixture
on conflict (id) do nothing;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'simula-private-assets',
  'simula-private-assets',
  false,
  16777216,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

revoke all on function private.enforce_evidence_source_version_scope()
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner, postgres;

revoke all on function private.enforce_observed_outcome_rights()
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner, postgres;

revoke all on all sequences in schema api, private
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner;

reset role;
