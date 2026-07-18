-- Bind every new run and terminal artifact to the exact API/worker git release
-- and the canonical Phase 2 execution configuration. Existing artifacts stay
-- readable as explicit legacy provenance; no historical row is rewritten.

set role postgres;
grant create on schema private to simula_command_owner;
set role simula_command_owner;

do $migration$
declare
  original_definition text;
  replacement_definition text;
  old_declarations text := $old$
  seed bigint;
  response_payload jsonb;
begin$old$;
  new_declarations text := $new$
  seed bigint;
  response_payload jsonb;
  code_release_sha text;
  configuration jsonb;
  configuration_sha256 text;
begin$new$;
  old_validation text := $old$
  if requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_correlation_id';
  end if;
$old$;
  new_validation text := $new$
  if requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_correlation_id';
  end if;
  code_release_sha := pg_catalog.current_setting('simula.release_sha', true);
  if code_release_sha is null or code_release_sha !~ '^[0-9a-f]{40}$' then
    raise exception using errcode = '22023', message = 'invalid_code_release_sha';
  end if;
$new$;
  old_manifest text := $old$
  frozen := pg_catalog.jsonb_build_object(
    'audience', pg_catalog.jsonb_build_object(
      'checksum_sha256', selected_audience.checksum_sha256,
      'kind', selected_audience.kind,
      'manifest', selected_audience.manifest,
      'non_representative', selected_audience.is_non_representative,
      'version_id', selected_audience.id
    ),
    'code', pg_catalog.jsonb_build_object(
      'pipeline_release_id', 'phase2_deterministic_mock_v1'
    ),
    'disclosure_version', 'phase2_demo_v1',
    'execution', pg_catalog.jsonb_build_object(
      'language', 'en',
      'output_schema_version', 1,
      'provider_id', 'deterministic_mock',
      'provider_version', 1
    ),
    'limits', pg_catalog.jsonb_build_object(
      'arq_job_timeout_seconds', 30,
      'max_database_attempts', 3,
      'max_dispatch_generations', 3,
      'max_result_bytes', 131072,
      'provider_cost_ceiling', 0,
      'version', 'phase2_2026_07_17'
    ),
    'method_version', 'phase2_demo_v1',
    'mock_provider_version', 1,
    'schema_version', 1,
    'stimulus', pg_catalog.jsonb_build_object(
      'content', selected_stimulus.content,
      'content_sha256', selected_stimulus.content_sha256,
      'version_id', selected_stimulus.id
    )
  );$old$;
  new_manifest text := $new$
  configuration := pg_catalog.jsonb_build_object(
    'disclosure_version', 'phase2_demo_v1',
    'execution', pg_catalog.jsonb_build_object(
      'language', 'en',
      'output_schema_version', 1,
      'provider_id', 'deterministic_mock',
      'provider_version', 1
    ),
    'limits', pg_catalog.jsonb_build_object(
      'arq_job_timeout_seconds', 30,
      'max_database_attempts', 3,
      'max_dispatch_generations', 3,
      'max_result_bytes', 131072,
      'provider_cost_ceiling', 0,
      'version', 'phase2_2026_07_17'
    ),
    'method_version', 'phase2_demo_v1',
    'version', 'phase2_config_v1'
  );
  configuration_sha256 := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(configuration::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  frozen := pg_catalog.jsonb_build_object(
    'audience', pg_catalog.jsonb_build_object(
      'checksum_sha256', selected_audience.checksum_sha256,
      'kind', selected_audience.kind,
      'manifest', selected_audience.manifest,
      'non_representative', selected_audience.is_non_representative,
      'version_id', selected_audience.id
    ),
    'code', pg_catalog.jsonb_build_object(
      'release_sha', code_release_sha
    ),
    'configuration', pg_catalog.jsonb_build_object(
      'sha256', configuration_sha256,
      'version', 'phase2_config_v1'
    ),
    'disclosure_version', 'phase2_demo_v1',
    'execution', configuration -> 'execution',
    'limits', configuration -> 'limits',
    'method_version', configuration ->> 'method_version',
    'mock_provider_version', 1,
    'schema_version', 1,
    'stimulus', pg_catalog.jsonb_build_object(
      'content', selected_stimulus.content,
      'content_sha256', selected_stimulus.content_sha256,
      'version_id', selected_stimulus.id
    )
  );$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'private.create_simulation_run_atomic(uuid, uuid, text, text, uuid)'::pg_catalog.regprocedure
  ) into original_definition;
  if pg_catalog.strpos(original_definition, old_declarations) = 0
    or pg_catalog.strpos(original_definition, old_validation) = 0
    or pg_catalog.strpos(original_definition, old_manifest) = 0
  then
    raise exception 'expected run provenance fragments were absent';
  end if;
  replacement_definition := pg_catalog.replace(
    original_definition,
    old_declarations,
    new_declarations
  );
  replacement_definition := pg_catalog.replace(
    replacement_definition,
    old_validation,
    new_validation
  );
  replacement_definition := pg_catalog.replace(
    replacement_definition,
    old_manifest,
    new_manifest
  );
  execute replacement_definition;
end
$migration$;

set role postgres;
revoke create on schema private from simula_command_owner;
grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

do $migration$
declare
  original_definition text;
  replacement_definition text;
  old_fragment text := $old$
  if actual_keys is distinct from array[
    'deterministic_seed', 'frozen_manifest_sha256', 'method_version',
    'output_schema_version', 'provider_id', 'provider_version'
  ]::text[]
    or provenance ->> 'method_version' is distinct from 'phase2_demo_v1'
    or provenance ->> 'provider_id' is distinct from 'deterministic_mock'
    or provenance -> 'provider_version' is distinct from '1'::jsonb
    or provenance -> 'output_schema_version' is distinct from '1'::jsonb
    or provenance ->> 'frozen_manifest_sha256'
      is distinct from requested_frozen_manifest_sha256
    or provenance ->> 'deterministic_seed'
      is distinct from requested_deterministic_seed::text then$old$;
  new_fragment text := $new$
  if actual_keys is distinct from array[
    'code_release_sha', 'configuration_sha256', 'deterministic_seed',
    'frozen_manifest_sha256', 'method_version', 'output_schema_version',
    'provider_id', 'provider_version'
  ]::text[]
    or provenance ->> 'method_version' is distinct from 'phase2_demo_v1'
    or provenance ->> 'provider_id' is distinct from 'deterministic_mock'
    or provenance -> 'provider_version' is distinct from '1'::jsonb
    or provenance -> 'output_schema_version' is distinct from '1'::jsonb
    or provenance ->> 'frozen_manifest_sha256'
      is distinct from requested_frozen_manifest_sha256
    or provenance ->> 'deterministic_seed'
      is distinct from requested_deterministic_seed::text
    or provenance ->> 'code_release_sha' is distinct from (
      select runs.frozen_manifest #>> '{code,release_sha}'
      from api.simulation_runs as runs
      where runs.id = requested_run_id
    )
    or provenance ->> 'configuration_sha256' is distinct from (
      select runs.frozen_manifest #>> '{configuration,sha256}'
      from api.simulation_runs as runs
      where runs.id = requested_run_id
    ) then$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'private.phase2_result_artifact_is_valid(jsonb, uuid, text, bigint)'::pg_catalog.regprocedure
  ) into original_definition;
  replacement_definition := pg_catalog.replace(
    original_definition,
    old_fragment,
    new_fragment
  );
  if replacement_definition = original_definition then
    raise exception 'expected result provenance fragment was absent';
  end if;
  execute replacement_definition;
end
$migration$;

set role postgres;
revoke create on schema private from simula_worker_owner;
