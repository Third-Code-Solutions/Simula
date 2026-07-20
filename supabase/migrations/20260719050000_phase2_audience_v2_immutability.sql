-- Supersede the previously edited demo audience with an immutable semantic
-- version. Historical runs retain v1; every new run resolves the one active
-- global version under a database-enforced uniqueness invariant.

alter table api.audience_versions
  drop constraint audience_versions_demo_disclosure;

alter table api.audience_versions
  add constraint audience_versions_demo_disclosure check (
    kind <> 'authored_demo'
    or (
      is_non_representative
      and pg_catalog.char_length(limitations) between 1 and 1000
    )
  );

do $fixture$
declare
  canonical_manifest_text constant text := $json${"kind": "authored_demo", "owner": "SIMULA methodology", "scope": "English campaign-message rehearsal in the Philippines prototype scope.", "source": "Repository-authored synthetic fixture; no participant or customer data.", "purpose": "Exercise the Phase 2 deterministic pipeline with synthetic authored inputs.", "lifecycle": "Migration-managed; retained with repository history and superseded by version.", "stable_id": "00000000-0000-4000-8000-0000000000d2", "source_type": "internal_authored", "dependencies": ["phase2_demo_v1 method", "deterministic_mock provider"], "record_count": 1, "audience_cells": [{"key": "authored_demo", "weight": 1.0}], "authoring_date": "2026-07-19", "category_scope": ["campaign_message_rehearsal"], "language_scope": ["en"], "method_version": "phase2_demo_v1", "schema_version": 1, "transformation": "No measured observations; one authored cell has a fixed weight of 1.0.", "prohibited_uses": ["population inference", "predictive decision making", "replacement for human research"], "retention_state": "retained_with_repository_history", "estimates_nobody": true, "retirement_state": "active", "semantic_version": "2.0.0", "checksum_algorithm": "sha256", "disclosure_version": "phase2_demo_v1", "non_representative": true, "external_dependencies": [], "checksum_canonicalization": "postgres_jsonb_text_utf8_v1", "transformation_code_version": "phase2_authored_fixture_v1"}$json$;
  expected_checksum constant text := 'ec5a2cda8f71f55e15b9c0be31a03c19e39f0c47c911898c1b49b33d3ea14e6e';
  parsed_manifest jsonb := canonical_manifest_text::jsonb;
  calculated_checksum text;
  affected integer;
begin
  if parsed_manifest::text <> canonical_manifest_text then
    raise exception using
      errcode = '22023',
      message = 'demo_audience_v2_canonical_manifest_mismatch';
  end if;

  calculated_checksum := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(parsed_manifest::text, 'UTF8'), 'sha256'),
    'hex'
  );
  if calculated_checksum <> expected_checksum then
    raise exception using
      errcode = '22023',
      message = 'demo_audience_v2_checksum_mismatch';
  end if;

  insert into api.audience_versions (
    id,
    organization_id,
    audience_id,
    version,
    kind,
    admission_status,
    manifest,
    checksum_sha256,
    is_non_representative,
    limitations
  )
  values (
    '00000000-0000-4000-8000-0000000000d2'::uuid,
    null,
    '00000000-0000-4000-8000-0000000000d0'::uuid,
    2,
    'authored_demo',
    'approved_demo',
    parsed_manifest,
    expected_checksum,
    true,
    'Estimates nobody and is not representative of any population.'
  );

  update api.audience_versions
  set admission_status = 'revoked'
  where id = '00000000-0000-4000-8000-0000000000d1'::uuid
    and audience_id = '00000000-0000-4000-8000-0000000000d0'::uuid
    and version = 1
    and organization_id is null
    and kind = 'authored_demo'
    and admission_status = 'approved_demo';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception using
      errcode = '55000',
      message = 'demo_audience_v1_retirement_failed';
  end if;
end
$fixture$;

alter table api.audience_versions
  add constraint audience_versions_manifest_checksum_matches check (
    checksum_sha256 = pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(manifest::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    )
  );

create unique index audience_versions_one_active_global_demo_idx
on api.audience_versions (audience_id)
where organization_id is null
  and kind = 'authored_demo'
  and admission_status = 'approved_demo';

create function private.reject_audience_version_content_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    if old.organization_id is null and old.kind = 'authored_demo' then
      raise exception using
        errcode = '55000',
        message = 'audience_version_content_immutable';
    end if;
    return old;
  end if;

  if new.organization_id is distinct from old.organization_id
    or new.audience_id is distinct from old.audience_id
    or new.version is distinct from old.version
    or new.kind is distinct from old.kind
    or new.manifest is distinct from old.manifest
    or new.checksum_sha256 is distinct from old.checksum_sha256
    or new.is_non_representative is distinct from old.is_non_representative
    or new.limitations is distinct from old.limitations
    or new.created_at is distinct from old.created_at
  then
    raise exception using
      errcode = '55000',
      message = 'audience_version_content_immutable';
  end if;
  return new;
end
$function$;

create trigger audience_versions_content_immutable
before update or delete on api.audience_versions
for each row execute function private.reject_audience_version_content_mutation();

revoke all on function private.reject_audience_version_content_mutation()
from public, anon, authenticated, simula_api, simula_worker;

grant create on schema private to simula_command_owner;
set role simula_command_owner;

do $runtime$
declare
  original_definition text;
  replacement_definition text;
  old_fragment constant text :=
    E'where versions.id = ''00000000-0000-4000-8000-0000000000d1''::uuid';
  new_fragment constant text :=
    E'where versions.audience_id = ''00000000-0000-4000-8000-0000000000d0''::uuid';
begin
  select pg_catalog.pg_get_functiondef(
    'private.create_simulation_run_atomic(uuid, uuid, text, text, uuid)'::pg_catalog.regprocedure
  ) into original_definition;
  replacement_definition := pg_catalog.replace(
    original_definition,
    old_fragment,
    new_fragment
  );
  if replacement_definition = original_definition
    or pg_catalog.strpos(replacement_definition, old_fragment) <> 0
  then
    raise exception using
      errcode = '55000',
      message = 'expected_demo_audience_v1_runtime_fragment_absent';
  end if;
  execute replacement_definition;
end
$runtime$;

reset role;
set role postgres;
revoke create on schema private from simula_command_owner;
