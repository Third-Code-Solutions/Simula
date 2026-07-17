\set ON_ERROR_STOP on

-- SEC-CLAIMS-001: a valid transaction-local claim is visible only inside its
-- transaction. SET SESSION AUTHORIZATION gives the helper a real
-- session_user=simula_api; SET ROLE would not exercise the production guard.
begin;
set session authorization simula_api;
set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1","aud":"authenticated","exp":4102444800}';
do $test$
begin
  if private.verified_subject()
    is distinct from '00000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'valid allowlisted claims were rejected';
  end if;
end
$test$;
reset session authorization;
commit;

begin;
set session authorization simula_api;
do $test$
begin
  if private.verified_subject() is not null then
    raise exception 'transaction-local claims leaked into a reused session';
  end if;

  begin
    perform *
    from api.create_organization(
      'No Claims Organization',
      'm1-no-claims-key-0001',
      '1111111111111111111111111111111111111111111111111111111111111111',
      '10000000-0000-4000-8000-000000000001'::uuid
    );
    raise exception 'claimless organization command unexpectedly succeeded';
  exception
    when sqlstate '42501' then
      if sqlerrm <> 'unauthorized' then
        raise exception 'claimless command returned unsafe error: %', sqlerrm;
      end if;
  end;
end
$test$;
reset session authorization;
rollback;

-- Strict allowlist, expiry, subject parsing, and runtime-role binding.
begin;
set session authorization simula_api;
set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1","aud":"authenticated","exp":4102444800,"email":"owner-a@simula.local"}';
do $test$
begin
  if private.verified_subject() is not null then
    raise exception 'extra claims bypassed the claim allowlist';
  end if;
end
$test$;

set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1","aud":"authenticated","exp":1}';
do $test$
begin
  if private.verified_subject() is not null then
    raise exception 'expired claims were accepted';
  end if;
end
$test$;

set local request.jwt.claims =
  '{"sub":"not-a-uuid","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1","aud":"authenticated","exp":4102444800}';
do $test$
begin
  if private.verified_subject() is not null then
    raise exception 'malformed subject was accepted';
  end if;
end
$test$;

set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"service_role","iss":"http://127.0.0.1:54321/auth/v1","aud":"authenticated","exp":4102444800}';
do $test$
begin
  if private.verified_subject() is not null then
    raise exception 'non-authenticated role claim was accepted';
  end if;
end
$test$;
reset session authorization;
rollback;

-- DB-ORG-001 / SEC-RLS-001 / SEC-ROLE-001. Everything below is rolled back.
begin;
create function pg_temp.reject_test_audit()
returns trigger
language plpgsql
set search_path = ''
as $test_trigger$
begin
  if new.correlation_id = '10000000-0000-4000-8000-00000000000e'::uuid then
    raise exception 'm1_injected_audit_failure';
  end if;
  return new;
end
$test_trigger$;

create trigger m1_reject_test_audit
before insert on private.audit_events
for each row execute function pg_temp.reject_test_audit();

set session authorization simula_api;
create temporary table runtime_test_state (
  label text primary key,
  organization_id uuid not null
) on commit drop;

set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1","aud":"authenticated","exp":4102444800}';

insert into pg_temp.runtime_test_state (label, organization_id)
select 'organization_a', created.organization_id
from api.create_organization(
  'Organization A',
  'm1-organization-a-key-0001',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '10000000-0000-4000-8000-00000000000a'::uuid
) as created
where not created.replayed;

do $test$
declare
  original_organization_id uuid;
  replay record;
begin
  select state.organization_id
    into strict original_organization_id
    from pg_temp.runtime_test_state as state
    where state.label = 'organization_a';

  select *
    into strict replay
    from private.create_organization_atomic(
      'Organization A',
      'm1-organization-a-key-0001',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '10000000-0000-4000-8000-00000000000b'::uuid
    );

  if replay.organization_id <> original_organization_id or not replay.replayed then
    raise exception 'direct-helper replay did not match wrapper result';
  end if;

  if (
    select pg_catalog.count(*)
    from api.organizations as organizations
    where organizations.id = original_organization_id
  ) <> 1 then
    raise exception 'organization command did not expose exactly one organization';
  end if;

  if (
    select pg_catalog.count(*)
    from api.organization_memberships as memberships
    where memberships.organization_id = original_organization_id
      and memberships.user_id = '00000000-0000-4000-8000-000000000001'::uuid
      and memberships.role = 'owner'
  ) <> 1 then
    raise exception 'organization command did not expose one sole-owner membership';
  end if;

  begin
    perform *
    from api.create_organization(
      'Organization A',
      'm1-organization-a-key-0001',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      '10000000-0000-4000-8000-00000000000c'::uuid
    );
    raise exception 'idempotency key reuse with a new hash unexpectedly succeeded';
  exception
    when sqlstate '22000' then
      if sqlerrm <> 'idempotency_key_reused' then
        raise exception 'idempotency conflict returned unsafe error: %', sqlerrm;
      end if;
  end;

  begin
    insert into api.organizations (name, created_by)
    values ('Direct DML', '00000000-0000-4000-8000-000000000001'::uuid);
    raise exception 'direct organization INSERT unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into api.organization_memberships (
      organization_id,
      user_id,
      role,
      created_by
    )
    values (
      original_organization_id,
      '00000000-0000-4000-8000-000000000002'::uuid,
      'viewer',
      '00000000-0000-4000-8000-000000000001'::uuid
    );
    raise exception 'direct membership INSERT unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update api.organization_memberships
      set role = 'viewer'
      where organization_id = original_organization_id;
    raise exception 'direct membership UPDATE unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from api.organization_memberships
      where organization_id = original_organization_id;
    raise exception 'direct membership DELETE unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    truncate table api.organization_memberships;
    raise exception 'direct membership TRUNCATE unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform *
    from api.create_organization(
      'Must Roll Back',
      'm1-atomic-rollback-key-0001',
      'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      '10000000-0000-4000-8000-00000000000e'::uuid
    );
    raise exception 'late audit failure injection unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'm1_injected_audit_failure' then
        raise exception 'late failure injection returned unexpected error: %', sqlerrm;
      end if;
  end;
end
$test$;

-- Switch only the transaction-local verified subject; database role stays the
-- same least-privilege API runtime role.
set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1","aud":"authenticated","exp":4102444800}';

insert into pg_temp.runtime_test_state (label, organization_id)
select 'organization_b', created.organization_id
from api.create_organization(
  'Organization B',
  'm1-organization-b-key-0001',
  'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  '10000000-0000-4000-8000-00000000000d'::uuid
) as created
where not created.replayed;

do $test$
declare
  organization_a_id uuid;
  organization_b_id uuid;
begin
  select state.organization_id into strict organization_a_id
    from pg_temp.runtime_test_state as state where state.label = 'organization_a';
  select state.organization_id into strict organization_b_id
    from pg_temp.runtime_test_state as state where state.label = 'organization_b';

  if exists (
    select 1 from api.list_organizations() as organizations
    where organizations.organization_id = organization_a_id
  ) or not exists (
    select 1 from api.list_organizations() as organizations
    where organizations.organization_id = organization_b_id
      and organizations.membership_role = 'owner'
  ) then
    raise exception 'user B organization listing crossed tenant boundary';
  end if;

  if exists (
    select 1 from api.organization_memberships as memberships
    where memberships.user_id = '00000000-0000-4000-8000-000000000001'::uuid
  ) or not exists (
    select 1 from api.organization_memberships as memberships
    where memberships.user_id = '00000000-0000-4000-8000-000000000003'::uuid
      and memberships.organization_id = organization_b_id
  ) then
    raise exception 'membership policy exposed a foreign user row to user B';
  end if;
end
$test$;

set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1","aud":"authenticated","exp":4102444800}';

do $test$
declare
  organization_a_id uuid;
  organization_b_id uuid;
begin
  select state.organization_id into strict organization_a_id
    from pg_temp.runtime_test_state as state where state.label = 'organization_a';
  select state.organization_id into strict organization_b_id
    from pg_temp.runtime_test_state as state where state.label = 'organization_b';

  if exists (
    select 1 from api.organizations as organizations
    where organizations.id = organization_b_id
  ) or not exists (
    select 1 from api.organizations as organizations
    where organizations.id = organization_a_id
  ) then
    raise exception 'user A organization read crossed tenant boundary';
  end if;

  if exists (
    select 1 from api.organization_memberships as memberships
    where memberships.user_id = '00000000-0000-4000-8000-000000000003'::uuid
  ) then
    raise exception 'membership policy exposed a foreign user row to user A';
  end if;
end
$test$;

-- Inspect private atomic effects only as the disposable test superuser.
reset session authorization;
do $test$
declare
  organization_a_id uuid;
  organization_b_id uuid;
begin
  select state.organization_id into strict organization_a_id
    from pg_temp.runtime_test_state as state where state.label = 'organization_a';
  select state.organization_id into strict organization_b_id
    from pg_temp.runtime_test_state as state where state.label = 'organization_b';

  if (
    select pg_catalog.count(*)
    from api.organizations as organizations
    where organizations.id in (organization_a_id, organization_b_id)
  ) <> 2 then
    raise exception 'atomic commands did not create exactly two test organizations';
  end if;

  if (
    select pg_catalog.count(*)
    from api.organization_memberships as memberships
    where memberships.organization_id in (organization_a_id, organization_b_id)
      and memberships.role = 'owner'
      and memberships.user_id = memberships.created_by
  ) <> 2 then
    raise exception 'atomic commands did not create exactly two sole-owner memberships';
  end if;

  if (
    select pg_catalog.count(*)
    from private.idempotency_keys as keys
    where keys.organization_id in (organization_a_id, organization_b_id)
      and keys.resource_id = keys.organization_id
      and keys.response ->> 'organization_id' = keys.organization_id::text
  ) <> 2 then
    raise exception 'atomic commands did not complete exactly two idempotency records';
  end if;

  if (
    select pg_catalog.count(*)
    from private.audit_events as audit
    where audit.organization_id in (organization_a_id, organization_b_id)
      and audit.action = 'organization.created'
      and audit.object_type = 'organization'
      and audit.object_id = audit.organization_id
      and audit.actor_type = 'user'
      and audit.actor_user_id is not null
  ) <> 2 then
    raise exception 'atomic commands did not append exactly two safe audit events';
  end if;

  if exists (
    select 1 from api.organizations as organizations
    where organizations.name = 'Must Roll Back'
  ) or exists (
    select 1 from private.idempotency_keys as keys
    where keys.idempotency_key = 'm1-atomic-rollback-key-0001'
  ) then
    raise exception 'late failure left partial organization or idempotency state';
  end if;

  -- PRIV-DEL-001 skeleton: only the disposable privileged harness performs
  -- deletion. The user runtime role has no DELETE grant. Later milestones
  -- extend this graph to project/stimulus/run/result and tombstone workflows.
  delete from api.organizations as organizations
    where organizations.id = organization_b_id;

  if exists (
    select 1 from api.organizations as organizations
    where organizations.id = organization_b_id
  ) or exists (
    select 1 from api.organization_memberships as memberships
    where memberships.organization_id = organization_b_id
  ) or exists (
    select 1 from private.idempotency_keys as keys
    where keys.organization_id = organization_b_id
  ) or exists (
    select 1 from private.audit_events as audit
    where audit.organization_id = organization_b_id
  ) then
    raise exception 'organization deletion left M1 graph residue';
  end if;
end
$test$;
rollback;

-- Worker role has private name resolution but no Phase-2-M1 function authority.
begin;
set session authorization simula_worker;
set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1","aud":"authenticated","exp":4102444800}';
do $test$
begin
  begin
    perform private.verified_subject();
    raise exception 'worker unexpectedly executed a user authorization helper';
  exception
    when insufficient_privilege then null;
  end;

  begin
    execute 'set role simula_worker_owner';
    raise exception 'worker unexpectedly assumed its owner role';
  exception
    when insufficient_privilege then null;
  end;
end
$test$;
reset session authorization;
rollback;

\echo 'runtime adversarial database tests: PASS'
