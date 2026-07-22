begin;

set local lock_timeout = '2s';
set local statement_timeout = '8s';

set role postgres;

create table private.platform_administrators (
  user_id uuid primary key references auth.users (id) on delete restrict,
  role text not null default 'superadmin'
    constraint platform_administrators_role_check check (role = 'superadmin'),
  active boolean not null default true,
  granted_by uuid not null references auth.users (id) on delete restrict,
  grant_reason text not null
    constraint platform_administrators_grant_reason_check
      check (pg_catalog.length(pg_catalog.btrim(grant_reason)) between 8 and 280),
  granted_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  revoked_at timestamptz,
  constraint platform_administrators_active_revocation_check check (
    (active and revoked_at is null) or (not active and revoked_at is not null)
  )
);

comment on table private.platform_administrators is
  'Private, database-authoritative platform administrator assignments.';
comment on column private.platform_administrators.user_id is
  'Immutable Supabase Auth user identifier. Email is never an authorization predicate.';

alter table private.platform_administrators enable row level security;
alter table private.platform_administrators force row level security;

revoke all on table private.platform_administrators
from public, anon, authenticated, simula_api, simula_command_owner,
  simula_worker, simula_worker_owner;

grant select on table private.platform_administrators to simula_command_owner;

create policy platform_administrators_command_self_select
on private.platform_administrators
for select
to simula_command_owner
using (
  user_id = private.verified_subject()
  and active
  and revoked_at is null
);

grant create on schema private to simula_command_owner;

create function private.is_platform_superadmin(requested_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $function$
  select private.is_verified_api_subject(requested_user_id)
    and exists (
      select 1
      from private.platform_administrators as administrators
      where administrators.user_id = requested_user_id
        and administrators.role = 'superadmin'
        and administrators.active
        and administrators.revoked_at is null
    )
$function$;

revoke all on function private.is_platform_superadmin(uuid)
from public, anon, authenticated, simula_api, simula_command_owner,
  simula_worker, simula_worker_owner;
grant execute on function private.is_platform_superadmin(uuid)
to postgres, simula_api, simula_command_owner;

alter function private.is_platform_superadmin(uuid) owner to simula_command_owner;

set role simula_command_owner;
grant execute on function private.is_platform_superadmin(uuid)
to postgres, simula_api;
reset role;
set role postgres;

create function private.platform_user_count(requested_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $function$
  select case
    when private.is_platform_superadmin(requested_user_id)
      then (select pg_catalog.count(*) from auth.users where deleted_at is null)
    else 0::bigint
  end
$function$;

alter function private.platform_user_count(uuid) owner to postgres;

revoke all on function private.platform_user_count(uuid)
from public, anon, authenticated, simula_api, simula_command_owner,
  simula_worker, simula_worker_owner;
grant execute on function private.platform_user_count(uuid) to simula_api;

set role simula_command_owner;

create or replace function private.is_org_member(
  requested_organization_id uuid,
  requested_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $function$
  select private.is_verified_api_subject(requested_user_id)
    and (
      private.is_platform_superadmin(requested_user_id)
      or exists (
        select 1
        from api.organization_memberships as memberships
        where memberships.organization_id = requested_organization_id
          and memberships.user_id = requested_user_id
      )
    )
$function$;

alter function private.is_org_member(uuid, uuid) owner to simula_command_owner;

create or replace function private.has_org_role(
  requested_organization_id uuid,
  requested_user_id uuid,
  allowed_roles api.organization_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $function$
  select private.is_verified_api_subject(requested_user_id)
    and allowed_roles is not null
    and (
      private.is_platform_superadmin(requested_user_id)
      or exists (
        select 1
        from api.organization_memberships as memberships
        where memberships.organization_id = requested_organization_id
          and memberships.user_id = requested_user_id
          and memberships.role = any(allowed_roles)
      )
    )
$function$;

alter function private.has_org_role(uuid, uuid, api.organization_role[])
  owner to simula_command_owner;

reset role;
set role postgres;

alter policy organization_memberships_api_or_command_select
on api.organization_memberships
using (
  private.is_verified_api_subject(user_id)
  or private.is_platform_superadmin(private.verified_subject())
);

alter policy organizations_command_select
on api.organizations
using (
  private.is_platform_superadmin(private.verified_subject())
  or private.is_verified_api_subject(created_by)
  or exists (
    select 1
    from api.organization_memberships as memberships
    where memberships.organization_id = organizations.id
      and private.is_verified_api_subject(memberships.user_id)
  )
);

revoke create on schema private from simula_command_owner;

-- Resolve the requested production account once. Runtime authorization remains UUID-based.
insert into private.platform_administrators (
  user_id,
  role,
  active,
  granted_by,
  grant_reason
)
select
  users.id,
  'superadmin',
  true,
  users.id,
  'Initial SIMULA platform superadministrator requested by the product owner'
from auth.users as users
where pg_catalog.lower(users.email) = 'admin@simula.com'
on conflict (user_id) do update
set role = excluded.role,
    active = true,
    granted_by = excluded.granted_by,
    grant_reason = excluded.grant_reason,
    updated_at = pg_catalog.statement_timestamp(),
    revoked_at = null;

update auth.users as users
set raw_app_meta_data = coalesce(users.raw_app_meta_data, '{}'::jsonb)
      || '{"platform_role":"superadmin"}'::jsonb,
    updated_at = pg_catalog.statement_timestamp()
where pg_catalog.lower(users.email) = 'admin@simula.com';

commit;
