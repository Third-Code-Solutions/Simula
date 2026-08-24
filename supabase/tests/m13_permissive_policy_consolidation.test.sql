begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(11);

select extensions.is(
  (
    select pg_catalog.array_agg(policyname::text order by policyname::text)
    from pg_catalog.pg_policies
    where schemaname = 'api' and tablename = 'organization_invitations'
      and cmd = 'SELECT' and roles::text[] = array['simula_command_owner']::text[]
  ),
  array['organization_invitations_command_select']::text[],
  'organization invitation command reads use one equivalent permissive policy'
);

select extensions.is(
  (
    select pg_catalog.array_agg(policyname::text order by policyname::text)
    from pg_catalog.pg_policies
    where schemaname = 'api' and tablename = 'organization_memberships'
      and cmd = 'INSERT' and roles::text[] = array['simula_command_owner']::text[]
  ),
  array['organization_memberships_command_insert']::text[],
  'organization membership command inserts use one equivalent permissive policy'
);

select extensions.is(
  (
    select pg_catalog.array_agg(policyname::text order by policyname::text)
    from pg_catalog.pg_policies
    where schemaname = 'api' and tablename = 'organizations'
      and cmd = 'DELETE' and roles::text[] = array['simula_command_owner']::text[]
  ),
  array['organizations_command_delete_after_cleanup']::text[],
  'organization command deletion uses one equivalent permissive policy'
);

select extensions.is(
  (
    select pg_catalog.array_agg(policyname::text order by policyname::text)
    from pg_catalog.pg_policies
    where schemaname = 'api' and tablename = 'organizations'
      and cmd = 'SELECT' and roles::text[] = array['simula_command_owner']::text[]
  ),
  array['organizations_command_select']::text[],
  'organization command reads use one equivalent permissive policy'
);

select extensions.is(
  (
    select pg_catalog.array_agg(policyname::text order by policyname::text)
    from pg_catalog.pg_policies
    where schemaname = 'api' and tablename = 'simulation_runs'
      and cmd = 'SELECT' and roles::text[] = array['simula_command_owner']::text[]
  ),
  array['simulation_runs_command_select']::text[],
  'simulation-run command reads use one equivalent permissive policy'
);

select extensions.is(
  (
    select pg_catalog.array_agg(policyname::text order by policyname::text)
    from pg_catalog.pg_policies
    where schemaname = 'api' and tablename = 'simulation_runs'
      and cmd = 'UPDATE' and roles::text[] = array['simula_command_owner']::text[]
  ),
  array['simulation_runs_command_cancel_update']::text[],
  'simulation-run command updates use one equivalent permissive policy'
);

select extensions.is(
  (
    select pg_catalog.array_agg(policyname::text order by policyname::text)
    from pg_catalog.pg_policies
    where schemaname = 'private' and tablename = 'audit_events'
      and cmd = 'INSERT' and roles::text[] = array['simula_command_owner']::text[]
  ),
  array['audit_events_command_insert']::text[],
  'command audit inserts use one equivalent permissive policy'
);

select extensions.is(
  (
    select pg_catalog.array_agg(policyname::text order by policyname::text)
    from pg_catalog.pg_policies
    where schemaname = 'private' and tablename = 'audit_events'
      and cmd = 'INSERT' and roles::text[] = array['simula_worker_owner']::text[]
  ),
  array['audit_events_worker_owner_insert']::text[],
  'worker audit inserts use one equivalent permissive policy'
);

select extensions.is(
  (
    select pg_catalog.array_agg(policyname::text order by policyname::text)
    from pg_catalog.pg_policies
    where schemaname = 'private' and tablename = 'organization_deletion_requests'
      and cmd = 'SELECT' and roles::text[] = array['simula_command_owner']::text[]
  ),
  array['organization_deletion_requests_command_select']::text[],
  'deletion-request command reads use one equivalent permissive policy'
);

select extensions.is(
  (
    select pg_catalog.array_agg(policyname::text order by policyname::text)
    from pg_catalog.pg_policies
    where schemaname = 'private' and tablename = 'organization_deletion_requests'
      and cmd = 'UPDATE' and roles::text[] = array['simula_command_owner']::text[]
  ),
  array['organization_deletion_requests_command_update']::text[],
  'deletion-request command updates use one equivalent permissive policy'
);

select extensions.is(
  (
    select pg_catalog.array_agg(policyname::text order by policyname::text)
    from pg_catalog.pg_policies
    where schemaname = 'private' and tablename = 'run_events'
      and cmd = 'INSERT' and roles::text[] = array['simula_command_owner']::text[]
  ),
  array['run_events_command_insert']::text[],
  'run-event command inserts use one equivalent permissive policy'
);

select * from extensions.finish();

rollback;
