-- Dedicated least-privilege operator path for the durable run-admission latch.
-- Password provisioning remains external; no credential is stored in Git.

set role postgres;

do $role$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'simula_operator'
  ) then
    create role simula_operator login noinherit;
  end if;
end
$role$;

alter role simula_operator
  login nocreatedb nocreaterole noinherit;

do $attributes$
begin
  if exists (
    select 1
    from pg_catalog.pg_roles as roles
    where roles.rolname = 'simula_operator'
      and (
        roles.rolsuper
        or roles.rolcreatedb
        or roles.rolcreaterole
        or roles.rolinherit
        or roles.rolreplication
        or roles.rolbypassrls
      )
  ) then
    raise exception 'unsafe attributes on simula_operator';
  end if;
end
$attributes$;

revoke all on schema api, private from simula_operator;
grant usage on schema private to simula_operator;

create or replace function private.set_run_creation_control(
  requested_enabled boolean,
  requested_reason text,
  requested_correlation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  prior_enabled boolean;
begin
  if session_user not in ('postgres', 'supabase_admin', 'simula_operator') then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  if requested_enabled is null
    or requested_correlation_id is null
    or (
      requested_enabled
      and requested_reason <> 'operator_recovery_verified'
    )
    or (
      not requested_enabled
      and requested_reason <> 'operator_manual'
    )
  then
    raise exception using errcode = '22023', message = 'invalid_operator_control';
  end if;

  select controls.enabled into strict prior_enabled
  from private.runtime_controls as controls
  where controls.control_name = 'run_creation'
  for update;

  if prior_enabled = requested_enabled then
    return false;
  end if;

  update private.runtime_controls as controls
  set enabled = requested_enabled,
      reason = case when requested_enabled then null else 'operator_manual' end,
      correlation_id = requested_correlation_id,
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
    case
      when requested_enabled then 'operator.run_creation_enabled'
      else 'operator.run_creation_disabled'
    end,
    'runtime_control',
    null,
    requested_correlation_id,
    'success',
    'operator',
    pg_catalog.jsonb_build_object('reason', requested_reason)
  );

  return true;
end
$function$;

create function private.get_run_creation_control()
returns table (
  control_name text,
  enabled boolean,
  reason text,
  correlation_id uuid,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  if session_user not in ('postgres', 'supabase_admin', 'simula_operator') then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  return query
  select
    controls.control_name,
    controls.enabled,
    controls.reason,
    controls.correlation_id,
    controls.updated_at
  from private.runtime_controls as controls
  where controls.control_name = 'run_creation';
end
$function$;

revoke all on function private.set_run_creation_control(boolean, text, uuid)
  from public, anon, authenticated, simula_api, simula_worker,
    simula_operator, simula_command_owner, simula_worker_owner;
revoke all on function private.get_run_creation_control()
  from public, anon, authenticated, simula_api, simula_worker,
    simula_operator, simula_command_owner, simula_worker_owner;

grant execute on function private.set_run_creation_control(boolean, text, uuid)
  to simula_operator;
grant execute on function private.get_run_creation_control()
  to simula_operator;

do $least_privilege$
begin
  if pg_catalog.has_schema_privilege('simula_operator', 'api', 'USAGE')
    or pg_catalog.has_schema_privilege('simula_operator', 'api', 'CREATE')
    or not pg_catalog.has_schema_privilege('simula_operator', 'private', 'USAGE')
    or pg_catalog.has_schema_privilege('simula_operator', 'private', 'CREATE')
    or exists (
      select 1
      from pg_catalog.pg_class as relations
      join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
      where namespaces.nspname in ('api', 'private')
        and relations.relkind in ('r', 'p', 'v', 'm', 'S')
        and pg_catalog.has_table_privilege(
          'simula_operator',
          relations.oid,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
        )
    )
    or exists (
      select 1
      from pg_catalog.pg_proc as functions
      join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
      where namespaces.nspname in ('api', 'private')
        and pg_catalog.has_function_privilege('simula_operator', functions.oid, 'EXECUTE')
        and functions.oid not in (
          'private.get_run_creation_control()'::pg_catalog.regprocedure,
          'private.set_run_creation_control(boolean,text,uuid)'::pg_catalog.regprocedure
        )
    )
    or exists (
      select 1
      from pg_catalog.pg_auth_members as memberships
      join pg_catalog.pg_roles as members on members.oid = memberships.member
      where members.rolname = 'simula_operator'
    )
  then
    raise exception 'simula_operator has privilege outside the exact run-control allowlist';
  end if;
end
$least_privilege$;
