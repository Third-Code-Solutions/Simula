-- P2-03 hardening: complete audit event shape and durable denial evidence.
-- Rate counters are private Redis token buckets in the API process; this
-- migration covers the corresponding durable audit boundary.

alter table private.audit_events
  add column outcome text not null default 'success',
  add column source_service text not null default 'api',
  add constraint audit_events_outcome_valid check (outcome in ('success', 'denied')),
  add constraint audit_events_source_service_valid check (
    source_service ~ '^[a-z][a-z0-9_]{0,31}$'
  );

drop policy audit_events_command_insert on private.audit_events;

create policy audit_events_command_insert
on private.audit_events
for insert
to simula_command_owner
with check (
  actor_type = 'user'
  and private.is_verified_api_subject(actor_user_id)
  and source_service = 'api'
  and (
    (
      outcome = 'success'
      and (
        (
          action = 'organization.created'
          and object_type = 'organization'
          and organization_id = object_id
        )
        or (
          action in (
            'project.created',
            'project.updated',
            'stimulus.created',
            'stimulus.version_appended'
          )
          and private.has_org_role(
            organization_id,
            private.verified_subject(),
            array['owner', 'editor']::api.organization_role[]
          )
        )
      )
    )
    or (
      outcome = 'denied'
      and action in (
        'project.create_denied',
        'project.update_denied',
        'stimulus.create_denied',
        'stimulus.version_append_denied'
      )
      and private.is_org_member(organization_id, private.verified_subject())
    )
  )
);

grant create on schema private to simula_command_owner;
set role simula_command_owner;

create function private.record_privileged_denial_atomic(
  requested_organization_id uuid,
  requested_action text,
  requested_object_type text,
  requested_object_id uuid,
  requested_correlation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  subject uuid;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_organization_id is null
    or not private.is_org_member(requested_organization_id, subject) then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_correlation_id';
  end if;
  if (requested_action, requested_object_type) not in (
    ('project.create_denied', 'project'),
    ('project.update_denied', 'project'),
    ('stimulus.create_denied', 'stimulus'),
    ('stimulus.version_append_denied', 'stimulus_version')
  ) then
    raise exception using errcode = '22023', message = 'invalid_audit_action';
  end if;

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
  )
  values (
    requested_organization_id,
    'user',
    subject,
    requested_action,
    requested_object_type,
    requested_object_id,
    requested_correlation_id,
    'denied',
    'api',
    pg_catalog.jsonb_build_object('reason', 'insufficient_organization_role')
  );
end
$function$;

alter function private.record_privileged_denial_atomic(uuid, text, text, uuid, uuid)
  owner to simula_command_owner;

revoke create on schema private from simula_command_owner;
reset role;

create function api.record_privileged_denial(
  requested_organization_id uuid,
  requested_action text,
  requested_object_type text,
  requested_object_id uuid,
  requested_correlation_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.record_privileged_denial_atomic(
    requested_organization_id,
    requested_action,
    requested_object_type,
    requested_object_id,
    requested_correlation_id
  )
$function$;

revoke all on function api.record_privileged_denial(uuid, text, text, uuid, uuid)
  from public, anon, authenticated, simula_worker;
grant execute on function api.record_privileged_denial(uuid, text, text, uuid, uuid)
  to simula_api;

set role simula_command_owner;
revoke all on function private.record_privileged_denial_atomic(uuid, text, text, uuid, uuid)
  from public, anon, authenticated, simula_worker;
grant execute on function private.record_privileged_denial_atomic(uuid, text, text, uuid, uuid)
  to simula_api;
reset role;
