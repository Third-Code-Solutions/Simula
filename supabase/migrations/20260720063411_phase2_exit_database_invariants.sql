-- Phase 2 exit invariants: one global authored demo across every audience,
-- poison terminalization atomically latches run admission, and runtime schema
-- telemetry reports this exact compatibility migration.

drop index api.audience_versions_one_active_global_demo_idx;

create unique index audience_versions_one_active_global_demo_idx
on api.audience_versions ((1))
where organization_id is null
  and kind = 'authored_demo'
  and admission_status = 'approved_demo';

set role postgres;
grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create function private.latch_run_creation_for_poison()
returns boolean
language plpgsql
set search_path = ''
set row_security = 'on'
as $function$
declare
  current_enabled boolean;
  event_correlation_id uuid;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  select controls.enabled into strict current_enabled
  from private.runtime_controls as controls
  where controls.control_name = 'run_creation'
  for update;

  if not current_enabled then
    return false;
  end if;

  event_correlation_id := pg_catalog.gen_random_uuid();
  update private.runtime_controls as controls
  set enabled = false,
      reason = 'poison_outbox',
      correlation_id = event_correlation_id,
      updated_at = pg_catalog.statement_timestamp()
  where controls.control_name = 'run_creation';

  insert into private.audit_events (
    organization_id,
    actor_type,
    actor_user_id,
    action,
    object_type,
    object_id,
    correlation_id,
    outcome,
    source_service,
    metadata
  ) values (
    null,
    'system',
    null,
    'operator.run_creation_disabled',
    'runtime_control',
    null,
    event_correlation_id,
    'success',
    'worker',
    '{}'::jsonb
  );

  return true;
end
$function$;

revoke all on function private.latch_run_creation_for_poison()
  from public, anon, authenticated, simula_api, simula_worker,
    simula_command_owner, postgres;

do $patch_functions$
declare
  original_definition text;
  replacement_definition text;
  old_fragment text;
  new_fragment text;
begin
  select pg_catalog.pg_get_functiondef(
    'private.fail_run_dispatch(uuid,uuid,text)'::pg_catalog.regprocedure
  ) into original_definition;
  old_fragment := E'  if selected_outbox.dispatch_attempt_count >= 10 then\n    terminal_reason := ''dispatch_exhausted'';';
  new_fragment := E'  if selected_outbox.dispatch_attempt_count >= 10 then\n    perform private.latch_run_creation_for_poison();\n    terminal_reason := ''dispatch_exhausted'';';
  replacement_definition := pg_catalog.replace(
    original_definition,
    old_fragment,
    new_fragment
  );
  if replacement_definition = original_definition then
    raise exception using
      errcode = '55000',
      message = 'fail_run_dispatch_poison_latch_patch_failed';
  end if;
  execute replacement_definition;

  select pg_catalog.pg_get_functiondef(
    'private.finalize_poisoned_dispatches(integer)'::pg_catalog.regprocedure
  ) into original_definition;
  old_fragment := E'    finalized_count := finalized_count + 1;';
  new_fragment := E'    perform private.latch_run_creation_for_poison();\n    finalized_count := finalized_count + 1;';
  replacement_definition := pg_catalog.replace(
    original_definition,
    old_fragment,
    new_fragment
  );
  if replacement_definition = original_definition then
    raise exception using
      errcode = '55000',
      message = 'finalize_poisoned_dispatches_latch_patch_failed';
  end if;
  execute replacement_definition;

  select pg_catalog.pg_get_functiondef(
    'private.runtime_observability_snapshot()'::pg_catalog.regprocedure
  ) into original_definition;
  replacement_definition := pg_catalog.replace(
    original_definition,
    '20260719040000::bigint',
    '20260720063411::bigint'
  );
  if replacement_definition = original_definition then
    raise exception using
      errcode = '55000',
      message = 'runtime_observability_migration_version_patch_failed';
  end if;
  execute replacement_definition;
end
$patch_functions$;

set role postgres;
revoke create on schema private from simula_worker_owner;
