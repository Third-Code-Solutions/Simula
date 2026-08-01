\set ON_ERROR_STOP on

-- Platform role is separate from organization membership and remains UUID-based.
begin;
set session authorization simula_api;
create temporary table platform_admin_state (
  label text primary key,
  organization_id uuid not null
) on commit drop;
set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1","aud":"authenticated","exp":4102444800}';
insert into pg_temp.platform_admin_state (label, organization_id)
select 'organization_a', organization_id
from api.create_organization(
  'Platform Test A',
  'platform-org-a-key-0001',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '40000000-0000-4000-8000-000000000001'::uuid
);
reset session authorization;

set session authorization simula_api;
set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1","aud":"authenticated","exp":4102444800}';
insert into pg_temp.platform_admin_state (label, organization_id)
select 'organization_b', organization_id
from api.create_organization(
  'Platform Test B',
  'platform-org-b-key-0001',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  '40000000-0000-4000-8000-000000000002'::uuid
);
reset session authorization;

set session authorization simula_api;
set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1","aud":"authenticated","exp":4102444800}';
do $test$
declare
  observed_count bigint;
  observed_rows text;
begin
  if private.is_platform_superadmin(private.verified_subject()) then
    raise exception 'ordinary organization owner received platform authority';
  end if;
  if private.platform_user_count(private.verified_subject()) <> 0 then
    raise exception 'ordinary organization owner received platform user count';
  end if;
  select pg_catalog.count(*),
    pg_catalog.string_agg(
      organizations.id::text || ':' || organizations.created_by::text,
      ',' order by organizations.id
    )
    into observed_count, observed_rows
  from api.organizations as organizations;
  if observed_count <> 1 then
    raise exception
      'ordinary owner crossed tenant RLS: session_user=%, current_user=%, subject=%, claims=%, count=%, rows=%',
      session_user, current_user, private.verified_subject(),
      pg_catalog.current_setting('request.jwt.claims', true),
      observed_count, observed_rows;
  end if;
end
$test$;
reset session authorization;

set session authorization simula_api;
set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1","aud":"authenticated","exp":4102444800}';
do $test$
declare
  organization_b uuid := (
    select organization_id from pg_temp.platform_admin_state where label = 'organization_b'
  );
begin
  if not private.is_platform_superadmin(private.verified_subject()) then
    raise exception 'authored platform administrator was not recognized';
  end if;
  if private.platform_user_count(private.verified_subject()) <> 4 then
    raise exception 'platform user count was not bounded to the administrator';
  end if;
  if (select pg_catalog.count(*) from api.organizations) <> 2 then
    raise exception 'platform administrator could not see every organization';
  end if;
  if (select pg_catalog.count(*) from api.organization_memberships) <> 2 then
    raise exception 'platform administrator could not inspect organization membership';
  end if;
  if not private.has_org_role(
    organization_b,
    private.verified_subject(),
    array['owner']::api.organization_role[]
  ) then
    raise exception 'platform administrator did not inherit owner capability';
  end if;
end
$test$;

select project_id
from api.create_project(
  (select organization_id from pg_temp.platform_admin_state where label = 'organization_b'),
  'Cross-tenant review',
  'Verify superadministrator owner capability without membership impersonation.',
  'philippines',
  'en',
  'campaign_message',
  'platform-project-key-01',
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  '40000000-0000-4000-8000-000000000003'::uuid
);

do $test$
begin
  if (
    select pg_catalog.count(*)
    from api.projects
    where name = 'Cross-tenant review'
      and created_by = '00000000-0000-4000-8000-000000000004'::uuid
  ) <> 1 then
    raise exception 'platform administrator could not execute an owner command';
  end if;
end
$test$;
reset session authorization;
rollback;

\echo 'platform superadmin adversarial database tests: PASS'
