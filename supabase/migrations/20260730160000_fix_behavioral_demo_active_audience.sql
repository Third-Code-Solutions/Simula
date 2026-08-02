-- Behavioral demo admission and completion must survive a clean migration
-- replay. The original M4 functions targeted retired audience version 1,
-- emitted a non-admitted creation event, and compared the demo input keys
-- against a non-lexicographic order even though the query sorts those keys.

set role postgres;

grant create on schema private to simula_command_owner;

set role simula_command_owner;

do $patch_behavioral_audience$
declare
  original_definition text;
  replacement_definition text;
  old_fragment constant text := E'  select * into selected_audience\n  from api.audience_versions as versions\n  where versions.id = ''00000000-0000-4000-8000-0000000000d1''::uuid\n    and versions.organization_id is null\n    and versions.kind = ''authored_demo''\n    and versions.admission_status = ''approved_demo''\n    and versions.is_non_representative;';
  new_fragment constant text := E'  select * into selected_audience\n  from api.audience_versions as versions\n  where versions.audience_id = ''00000000-0000-4000-8000-0000000000d0''::uuid\n    and versions.organization_id is null\n    and versions.kind = ''authored_demo''\n    and versions.admission_status = ''approved_demo''\n    and versions.is_non_representative\n  order by versions.version desc, versions.id desc\n  limit 1;';
  old_event_fragment constant text :=
    E'    ''behavioral_demo_created'', ''user'', subject, requested_correlation_id';
  new_event_fragment constant text :=
    E'    ''created'', ''user'', subject, requested_correlation_id';
begin
  select pg_catalog.pg_get_functiondef(
    'private.create_behavioral_demo_run_atomic(uuid,uuid,text,text,text,uuid,text)'
      ::pg_catalog.regprocedure
  ) into original_definition;

  replacement_definition := pg_catalog.replace(
    original_definition,
    old_fragment,
    new_fragment
  );
  if replacement_definition = original_definition then
    raise exception using
      errcode = '55000',
      message = 'behavioral_demo_active_audience_patch_failed';
  end if;

  original_definition := replacement_definition;
  replacement_definition := pg_catalog.replace(
    original_definition,
    old_event_fragment,
    new_event_fragment
  );
  if replacement_definition = original_definition then
    raise exception using
      errcode = '55000',
      message = 'behavioral_demo_run_event_policy_patch_failed';
  end if;

  execute replacement_definition;
end
$patch_behavioral_audience$;

set role postgres;

revoke create on schema private from simula_command_owner;
grant create on schema private to simula_worker_owner;

set role simula_worker_owner;

do $patch_behavioral_artifact_validator$
declare
  original_definition text;
  replacement_definition text;
  old_fragment constant text :=
    E'      ''organization_id'', ''run_id'', ''study_id'', ''stimulus'', ''variant_key''';
  new_fragment constant text :=
    E'      ''organization_id'', ''run_id'', ''stimulus'', ''study_id'', ''variant_key''';
begin
  select pg_catalog.pg_get_functiondef(
    'private.behavioral_result_artifact_is_valid(bytea,uuid,uuid,jsonb,bigint)'
      ::pg_catalog.regprocedure
  ) into original_definition;

  replacement_definition := pg_catalog.replace(
    original_definition,
    old_fragment,
    new_fragment
  );
  if replacement_definition = original_definition then
    raise exception using
      errcode = '55000',
      message = 'behavioral_result_key_order_patch_failed';
  end if;

  execute replacement_definition;
end
$patch_behavioral_artifact_validator$;

grant select, insert on table api.behavioral_run_results
to simula_worker_owner;
grant update (run_id) on table api.behavioral_run_results
to simula_worker_owner;
grant execute on function private.normalize_behavioral_result_payload(
  uuid, uuid, bytea
)
to simula_worker_owner;
grant execute on function private.normalize_behavioral_public_summaries(
  uuid, uuid, bytea
)
to simula_worker_owner;

set role postgres;

revoke create on schema private from simula_worker_owner;

grant update (event_id) on table private.behavioral_action_events
to simula_worker_owner;

-- Supabase records migration history in the same session after this script.
set role postgres;
