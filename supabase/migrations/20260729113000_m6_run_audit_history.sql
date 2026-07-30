-- M6: expose a bounded, tenant-scoped run state history without actor identity,
-- free-form audit metadata, payloads, prompts, agent memory, or rationale.

grant create on schema private to simula_command_owner;
set role simula_command_owner;

create function private.get_run_audit_history(
  requested_run_id uuid,
  requested_limit integer default 50
)
returns table (
  event_id uuid,
  previous_state api.run_state,
  new_state api.run_state,
  attempt_number smallint,
  safe_reason text,
  actor_type private.audit_actor_type,
  correlation_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
set row_security = 'on'
as $function$
declare
  subject uuid;
  selected_run api.simulation_runs%rowtype;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_run_id is null then
    raise exception using errcode = '22023', message = 'invalid_run_reference';
  end if;
  if requested_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_limit';
  end if;

  select runs.* into selected_run
  from api.simulation_runs as runs
  where runs.id = requested_run_id;

  if not found or not private.is_org_member(
    selected_run.organization_id,
    subject
  ) then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;

  return query
  select
    events.id,
    events.previous_state,
    events.new_state,
    events.attempt_number,
    events.safe_reason,
    events.actor_type,
    events.correlation_id,
    events.created_at
  from private.run_events as events
  where events.organization_id = selected_run.organization_id
    and events.run_id = selected_run.id
  order by events.created_at desc, events.id desc
  limit requested_limit;
end
$function$;

revoke all on function private.get_run_audit_history(uuid, integer)
  from public, anon, authenticated, simula_worker;
grant execute on function private.get_run_audit_history(uuid, integer)
  to simula_api;

set role postgres;
revoke create on schema private from simula_command_owner;

create function api.get_run_audit_history(
  requested_run_id uuid,
  requested_limit integer default 50
)
returns table (
  event_id uuid,
  previous_state api.run_state,
  new_state api.run_state,
  attempt_number smallint,
  safe_reason text,
  actor_type private.audit_actor_type,
  correlation_id uuid,
  created_at timestamptz
)
language sql
security invoker
stable
set search_path = ''
as $function$
  select *
  from private.get_run_audit_history(requested_run_id, requested_limit)
$function$;

revoke all on function api.get_run_audit_history(uuid, integer)
  from public, anon, authenticated, simula_worker;
grant execute on function api.get_run_audit_history(uuid, integer)
  to simula_api;

comment on function api.get_run_audit_history(uuid, integer) is
  'Bounded member-visible run state history without identity or payload fields';
