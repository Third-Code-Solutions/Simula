-- Privileged global-role bootstrap for disposable local/CI Supabase.
-- Hosted environments require the equivalent one-time privileged bootstrap.
-- No password is stored here; runtime credentials are injected per environment.

do $roles$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'simula_api') then
    create role simula_api login noinherit;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'simula_worker') then
    create role simula_worker login noinherit;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'simula_operator') then
    create role simula_operator login noinherit;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'simula_command_owner'
  ) then
    create role simula_command_owner nologin noinherit;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'simula_worker_owner'
  ) then
    create role simula_worker_owner nologin noinherit;
  end if;
end
$roles$;

alter role simula_api
  login nocreatedb nocreaterole noinherit;
alter role simula_worker
  login nocreatedb nocreaterole noinherit;
alter role simula_operator
  login nocreatedb nocreaterole noinherit;
alter role simula_command_owner
  nologin nocreatedb nocreaterole noinherit;
alter role simula_worker_owner
  nologin nocreatedb nocreaterole noinherit;

-- PostgreSQL reserves changing SUPERUSER, REPLICATION, and BYPASSRLS for a
-- superuser. Their secure CREATE ROLE defaults are false. Refuse drift rather
-- than pretending a restricted bootstrap role can remediate it.
do $attributes$
declare
  invalid_roles text;
begin
  select pg_catalog.string_agg(rolname, ', ' order by rolname)
    into invalid_roles
    from pg_catalog.pg_roles
   where rolname in (
     'simula_api',
     'simula_operator',
     'simula_worker',
     'simula_command_owner',
     'simula_worker_owner'
   )
     and (
       rolsuper
       or rolcreatedb
       or rolcreaterole
       or rolinherit
       or rolreplication
       or rolbypassrls
     );

  if invalid_roles is not null then
    raise exception 'unsafe attributes on Simula roles: %', invalid_roles;
  end if;

  if not (
    (select rolcanlogin from pg_catalog.pg_roles where rolname = 'simula_api')
    and (select rolcanlogin from pg_catalog.pg_roles where rolname = 'simula_operator')
    and (select rolcanlogin from pg_catalog.pg_roles where rolname = 'simula_worker')
    and not (
      select rolcanlogin
        from pg_catalog.pg_roles
       where rolname = 'simula_command_owner'
    )
    and not (
      select rolcanlogin
        from pg_catalog.pg_roles
       where rolname = 'simula_worker_owner'
    )
  ) then
    raise exception 'unsafe LOGIN attributes on Simula roles';
  end if;
end
$attributes$;

-- CREATEROLE grants the creator ADMIN TRUE but SET FALSE on new roles in
-- PostgreSQL 17. Enable only SET so migrations may transfer object ownership;
-- omitting ADMIN retains its existing secure bootstrap value.
grant simula_command_owner, simula_worker_owner to postgres with set true;
grant simula_command_owner, simula_worker_owner to postgres with inherit false;

do $bootstrap_membership$
declare
  missing_roles text;
begin
  select pg_catalog.string_agg(expected.role_name, ', ' order by expected.role_name)
    into missing_roles
    from (
      values ('simula_command_owner'), ('simula_worker_owner')
    ) as expected(role_name)
   where not exists (
     select 1
       from pg_catalog.pg_auth_members as membership
       join pg_catalog.pg_roles as granted_role
         on granted_role.oid = membership.roleid
       join pg_catalog.pg_roles as member_role
         on member_role.oid = membership.member
      where granted_role.rolname = expected.role_name
        and member_role.rolname = 'postgres'
        and membership.set_option
        and not membership.inherit_option
   );

  if missing_roles is not null then
    raise exception 'postgres lacks SET-only authority for Simula owner roles: %',
      missing_roles;
  end if;
end
$bootstrap_membership$;

do $memberships$
begin
  if pg_catalog.pg_has_role('simula_api', 'simula_command_owner', 'member') then
    revoke simula_command_owner from simula_api;
  end if;
  if pg_catalog.pg_has_role('simula_api', 'simula_worker_owner', 'member') then
    revoke simula_worker_owner from simula_api;
  end if;
  if pg_catalog.pg_has_role('simula_worker', 'simula_command_owner', 'member') then
    revoke simula_command_owner from simula_worker;
  end if;
  if pg_catalog.pg_has_role('simula_worker', 'simula_worker_owner', 'member') then
    revoke simula_worker_owner from simula_worker;
  end if;
  if pg_catalog.pg_has_role('simula_operator', 'simula_command_owner', 'member') then
    revoke simula_command_owner from simula_operator;
  end if;
  if pg_catalog.pg_has_role('simula_operator', 'simula_worker_owner', 'member') then
    revoke simula_worker_owner from simula_operator;
  end if;
end
$memberships$;
