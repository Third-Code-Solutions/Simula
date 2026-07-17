-- Freeze the method-relevant release and execution limits with every new run.
-- The public API exposes a closed, authorized projection rather than raw manifest JSON.

grant create on schema private to simula_command_owner;
set role simula_command_owner;

do $migration$
declare
  original_definition text;
  replacement_definition text;
  old_fragment text := $old$
    'disclosure_version', 'phase2_demo_v1',
    'method_version', 'phase2_demo_v1',
    'mock_provider_version', 1,
    'schema_version', 1,
    'stimulus', pg_catalog.jsonb_build_object(
      'content', selected_stimulus.content,
      'content_sha256', selected_stimulus.content_sha256,
      'version_id', selected_stimulus.id
    )
  )$old$;
  new_fragment text := $new$
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
  )$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'private.create_simulation_run_atomic(uuid, uuid, text, text, uuid)'::pg_catalog.regprocedure
  ) into original_definition;
  replacement_definition := pg_catalog.replace(original_definition, old_fragment, new_fragment);
  if replacement_definition = original_definition then
    raise exception 'expected frozen manifest fragment was absent';
  end if;
  execute replacement_definition;
end
$migration$;

reset role;
revoke create on schema private from simula_command_owner;
