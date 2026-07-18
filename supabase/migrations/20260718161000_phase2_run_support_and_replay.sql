-- Expose only bounded failed-run support context and let durable idempotency
-- replays bypass new-work admission.  Private execution rows remain private.

grant select on table private.run_events to simula_command_owner;

create policy run_events_command_select
on private.run_events
for select
to simula_command_owner
using (private.is_org_member(organization_id, private.verified_subject()));

grant create on schema private to simula_command_owner;
set role simula_command_owner;

create function private.get_run_failure_context(requested_run_id uuid)
returns table (
  correlation_id uuid,
  terminal_error_code text
)
language plpgsql
security definer
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

  select * into selected_run
  from api.simulation_runs as runs
  where runs.id = requested_run_id;
  if not found then
    return;
  end if;
  if selected_run.state <> 'failed' then
    return;
  end if;

  return query
  select selected_run.correlation_id, events.safe_reason
  from private.run_events as events
  where events.run_id = selected_run.id
    and events.organization_id = selected_run.organization_id
    and events.new_state = 'failed'
    and events.safe_reason ~ '^[a-z][a-z0-9_]{0,63}$'
  order by events.created_at desc, events.id desc
  limit 1;
end
$function$;

create function private.get_simulation_run_replay(
  requested_project_id uuid,
  requested_idempotency_key text,
  requested_sha256 text
)
returns table (
  run_id uuid,
  organization_id uuid,
  project_id uuid,
  stimulus_version_id uuid,
  audience_version_id uuid,
  run_state api.run_state,
  schema_version integer,
  dispatch_generation smallint,
  job_id text,
  run_version integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  subject uuid;
  selected_project api.projects%rowtype;
  existing_sha256 text;
  existing_response jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_project_id is null then
    raise exception using errcode = '22023', message = 'invalid_run_reference';
  end if;
  if requested_idempotency_key is null
    or requested_idempotency_key !~ '^[ -~]{16,128}$' then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;
  if requested_sha256 is null or requested_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_request_hash';
  end if;

  select * into selected_project
  from api.projects as projects
  where projects.id = requested_project_id
    and projects.status = 'active';
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

  select keys.request_sha256, keys.response
    into existing_sha256, existing_response
  from private.idempotency_keys as keys
  where keys.actor_user_id = subject
    and keys.scope_organization_id = selected_project.organization_id
    and keys.scope_resource_id = selected_project.id
    and keys.scope = 'run.create'
    and keys.idempotency_key = requested_idempotency_key;
  if not found then
    return;
  end if;
  if existing_response is null then
    raise exception using errcode = '55000', message = 'idempotency_state_incomplete';
  end if;
  if existing_sha256 <> requested_sha256 then
    raise exception using errcode = '22000', message = 'idempotency_key_reused';
  end if;

  return query
  select
    (existing_response ->> 'run_id')::uuid,
    (existing_response ->> 'organization_id')::uuid,
    (existing_response ->> 'project_id')::uuid,
    (existing_response ->> 'stimulus_version_id')::uuid,
    (existing_response ->> 'audience_version_id')::uuid,
    (existing_response ->> 'state')::api.run_state,
    (existing_response ->> 'schema_version')::integer,
    (existing_response ->> 'dispatch_generation')::smallint,
    existing_response ->> 'job_id',
    (existing_response ->> 'version')::integer,
    (existing_response ->> 'created_at')::timestamptz;
end
$function$;

revoke all on function private.get_run_failure_context(uuid)
  from public, anon, authenticated, simula_worker;
grant execute on function private.get_run_failure_context(uuid) to simula_api;

revoke all on function private.get_simulation_run_replay(uuid, text, text)
  from public, anon, authenticated, simula_worker;
grant execute on function private.get_simulation_run_replay(uuid, text, text) to simula_api;

set role postgres;
revoke create on schema private from simula_command_owner;

create function api.get_run_failure_context(requested_run_id uuid)
returns table (
  correlation_id uuid,
  terminal_error_code text
)
language sql
security invoker
set search_path = ''
as $function$
  select * from private.get_run_failure_context(requested_run_id)
$function$;

create function api.get_simulation_run_replay(
  requested_project_id uuid,
  requested_idempotency_key text,
  requested_sha256 text
)
returns table (
  run_id uuid,
  organization_id uuid,
  project_id uuid,
  stimulus_version_id uuid,
  audience_version_id uuid,
  run_state api.run_state,
  schema_version integer,
  dispatch_generation smallint,
  job_id text,
  run_version integer,
  created_at timestamptz
)
language sql
security invoker
set search_path = ''
as $function$
  select *
  from private.get_simulation_run_replay(
    requested_project_id,
    requested_idempotency_key,
    requested_sha256
  )
$function$;

revoke all on function api.get_run_failure_context(uuid)
  from public, anon, authenticated, simula_worker;
grant execute on function api.get_run_failure_context(uuid) to simula_api;

revoke all on function api.get_simulation_run_replay(uuid, text, text)
  from public, anon, authenticated, simula_worker;
grant execute on function api.get_simulation_run_replay(uuid, text, text) to simula_api;
