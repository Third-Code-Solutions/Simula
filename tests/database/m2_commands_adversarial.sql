\set ON_ERROR_STOP on

-- P2-03 DB-VERSION-001 / API-PROJ-001 / SEC-API-001 foundations.
-- The entire authored graph is disposable and rolls back.
begin;
set session authorization simula_api;
create temporary table m2_state (
  label text primary key,
  resource_id uuid not null
) on commit drop;

set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1","aud":"authenticated","exp":4102444800}';

insert into pg_temp.m2_state (label, resource_id)
select 'organization_a', created.organization_id
from api.create_organization(
  'M2 Organization A',
  'm2-org-a-key-00000001',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '20000000-0000-4000-8000-000000000001'::uuid
) as created;

insert into pg_temp.m2_state (label, resource_id)
select 'project_a', created.project_id
from api.create_project(
  (select resource_id from pg_temp.m2_state where label = 'organization_a'),
  'Fictional Launch',
  'Pressure-test one fictional campaign message before human research.',
  'philippines',
  'en',
  'campaign_message',
  'm2-project-key-0000001',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  '20000000-0000-4000-8000-000000000002'::uuid
) as created;

do $test$
declare
  project_id uuid := (
    select resource_id from pg_temp.m2_state where label = 'project_a'
  );
  organization_id uuid := (
    select resource_id from pg_temp.m2_state where label = 'organization_a'
  );
  replay record;
begin
  select * into replay
  from private.create_project_atomic(
    organization_id,
    'Fictional Launch',
    'Pressure-test one fictional campaign message before human research.',
    'philippines',
    'en',
    'campaign_message',
    'm2-project-key-0000001',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    '20000000-0000-4000-8000-000000000003'::uuid
  );
  if replay.project_id <> project_id or not replay.replayed then
    raise exception 'project direct-helper replay diverged from wrapper';
  end if;

  begin
    perform api.create_project(
      organization_id,
      'Changed Request',
      'Different request body.',
      'philippines',
      'en',
      'campaign_message',
      'm2-project-key-0000001',
      'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      '20000000-0000-4000-8000-000000000004'::uuid
    );
    raise exception 'project idempotency hash conflict unexpectedly succeeded';
  exception
    when sqlstate '22000' then
      if sqlerrm <> 'idempotency_key_reused' then
        raise exception 'unsafe project idempotency error: %', sqlerrm;
      end if;
  end;

  begin
    insert into api.projects (
      organization_id, name, objective, market, language, category,
      created_by, updated_by
    ) values (
      organization_id, 'Direct DML', 'Forbidden', 'philippines', 'en',
      'campaign_message',
      '00000000-0000-4000-8000-000000000001'::uuid,
      '00000000-0000-4000-8000-000000000001'::uuid
    );
    raise exception 'simula_api direct project INSERT unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end
$test$;

insert into pg_temp.m2_state (label, resource_id)
select 'stimulus_a', created.stimulus_id
from api.create_stimulus(
  (select resource_id from pg_temp.m2_state where label = 'project_a'),
  'Fictional Message',
  'Try the fictional Northstar service today.',
  pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to('Try the fictional Northstar service today.', 'UTF8')
    ),
    'hex'
  ),
  'm2-stimulus-key-000001',
  'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  '20000000-0000-4000-8000-000000000005'::uuid
) as created;

insert into pg_temp.m2_state (label, resource_id)
select 'stimulus_v2', appended.version_id
from api.append_stimulus_version(
  (select resource_id from pg_temp.m2_state where label = 'stimulus_a'),
  'Try the fictional Northstar service when it suits your team.',
  pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        'Try the fictional Northstar service when it suits your team.',
        'UTF8'
      )
    ),
    'hex'
  ),
  'm2-version-key-0000001',
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  '20000000-0000-4000-8000-000000000006'::uuid
) as appended;

do $test$
declare
  tested_stimulus_id uuid := (
    select resource_id from pg_temp.m2_state where label = 'stimulus_a'
  );
  version_two_id uuid := (
    select resource_id from pg_temp.m2_state where label = 'stimulus_v2'
  );
  tested_project_id uuid := (
    select resource_id from pg_temp.m2_state where label = 'project_a'
  );
  updated record;
  replay record;
begin
  if (
    select pg_catalog.array_agg(versions.version order by versions.version)
    from api.stimulus_versions as versions
    where versions.stimulus_id = tested_stimulus_id
  ) <> array[1, 2] then
    raise exception 'stimulus versions are not immutable sequential v1/v2';
  end if;

  if (
    select versions.content
    from api.stimulus_versions as versions
    where versions.stimulus_id = tested_stimulus_id and versions.version = 1
  ) <> 'Try the fictional Northstar service today.' then
    raise exception 'append mutated version one';
  end if;

  select * into replay
  from private.append_stimulus_version_atomic(
    tested_stimulus_id,
    'Try the fictional Northstar service when it suits your team.',
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          'Try the fictional Northstar service when it suits your team.',
          'UTF8'
        )
      ),
      'hex'
    ),
    'm2-version-key-0000001',
    'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    '20000000-0000-4000-8000-000000000007'::uuid
  );
  if replay.version_id <> version_two_id
    or replay.stimulus_version <> 2
    or not replay.replayed then
    raise exception 'stimulus-version replay diverged';
  end if;

  select * into updated
  from api.update_project(
    tested_project_id,
    1,
    'Fictional Launch Revised',
    'Pressure-test revised fictional wording before human research.',
    'philippines',
    'en',
    'campaign_message',
    '20000000-0000-4000-8000-000000000008'::uuid
  );
  if updated.project_version <> 2 then
    raise exception 'project optimistic version did not advance';
  end if;

  begin
    perform api.update_project(
      tested_project_id,
      1,
      'Stale Update',
      'Must not commit.',
      'philippines',
      'en',
      'campaign_message',
      '20000000-0000-4000-8000-000000000009'::uuid
    );
    raise exception 'stale project update unexpectedly succeeded';
  exception
    when serialization_failure then
      if sqlerrm <> 'version_conflict' then
        raise exception 'unsafe optimistic concurrency error: %', sqlerrm;
      end if;
  end;

  begin
    update api.projects set name = 'Direct Update' where id = tested_project_id;
    raise exception 'simula_api direct project UPDATE unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
  begin
    insert into api.stimulus_versions (
      organization_id, stimulus_id, version, content, content_sha256, created_by
    )
    select
      stimuli.organization_id,
      stimuli.id,
      99,
      'Direct version',
      pg_catalog.repeat('f', 64),
      '00000000-0000-4000-8000-000000000001'::uuid
    from api.stimuli as stimuli where stimuli.id = tested_stimulus_id;
    raise exception 'simula_api direct version INSERT unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end
$test$;

-- Fixture-only membership setup. No runtime membership command exists.
reset session authorization;
insert into api.organization_memberships (
  organization_id,
  user_id,
  role,
  created_by
)
values (
  (select resource_id from pg_temp.m2_state where label = 'organization_a'),
  '00000000-0000-4000-8000-000000000002'::uuid,
  'viewer',
  '00000000-0000-4000-8000-000000000001'::uuid
);

set session authorization simula_api;
set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1","aud":"authenticated","exp":4102444800}';

do $test$
declare
  tested_organization_id uuid := (
    select resource_id from pg_temp.m2_state where label = 'organization_a'
  );
  project_id uuid := (
    select resource_id from pg_temp.m2_state where label = 'project_a'
  );
begin
  if not exists (select 1 from api.projects where id = project_id) then
    raise exception 'viewer cannot read member project';
  end if;
  begin
    perform api.create_project(
      tested_organization_id,
      'Viewer Write',
      'Must be forbidden.',
      'philippines',
      'en',
      'campaign_message',
      'm2-viewer-key-00000001',
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      '20000000-0000-4000-8000-00000000000a'::uuid
    );
    raise exception 'viewer project create unexpectedly succeeded';
  exception
    when insufficient_privilege then
      if sqlerrm <> 'forbidden' then
        raise exception 'viewer denial was not explicit forbidden: %', sqlerrm;
      end if;
  end;
end
$test$;

set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1","aud":"authenticated","exp":4102444800}';

insert into pg_temp.m2_state (label, resource_id)
select 'organization_b', created.organization_id
from api.create_organization(
  'M2 Organization B',
  'm2-org-b-key-00000001',
  '1111111111111111111111111111111111111111111111111111111111111111',
  '20000000-0000-4000-8000-00000000000b'::uuid
) as created;

do $test$
declare
  foreign_project_id uuid := (
    select resource_id from pg_temp.m2_state where label = 'project_a'
  );
begin
  if exists (select 1 from api.projects where id = foreign_project_id) then
    raise exception 'foreign project leaked through RLS';
  end if;
  begin
    perform api.create_stimulus(
      foreign_project_id,
      'Foreign Write',
      'Must not enumerate.',
      pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to('Must not enumerate.', 'UTF8')),
        'hex'
      ),
      'm2-foreign-key-0000001',
      '2222222222222222222222222222222222222222222222222222222222222222',
      '20000000-0000-4000-8000-00000000000c'::uuid
    );
    raise exception 'foreign stimulus create unexpectedly succeeded';
  exception
    when no_data_found then
      if sqlerrm <> 'not_found' then
        raise exception 'foreign denial disclosed unsafe detail: %', sqlerrm;
      end if;
  end;
end
$test$;

-- Atomic late-failure proof for stimulus + v1 + idempotency + audit.
reset session authorization;
create function pg_temp.reject_m2_audit()
returns trigger
language plpgsql
set search_path = ''
as $trigger$
begin
  if new.correlation_id = '20000000-0000-4000-8000-00000000000d'::uuid then
    raise exception 'm2_injected_audit_failure';
  end if;
  return new;
end
$trigger$;
create trigger reject_m2_audit
before insert on private.audit_events
for each row execute function pg_temp.reject_m2_audit();

set session authorization simula_api;
set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1","aud":"authenticated","exp":4102444800}';

do $test$
declare
  project_id uuid := (
    select resource_id from pg_temp.m2_state where label = 'project_a'
  );
begin
  begin
    perform api.create_stimulus(
      project_id,
      'Must Roll Back',
      'No partial content may remain.',
      pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to('No partial content may remain.', 'UTF8')
        ),
        'hex'
      ),
      'm2-rollback-key-000001',
      '3333333333333333333333333333333333333333333333333333333333333333',
      '20000000-0000-4000-8000-00000000000d'::uuid
    );
    raise exception 'injected audit failure unexpectedly committed';
  exception
    when others then
      if sqlerrm <> 'm2_injected_audit_failure' then
        raise;
      end if;
  end;

  if exists (select 1 from api.stimuli where name = 'Must Roll Back') then
    raise exception 'audit failure left a partial stimulus';
  end if;
end
$test$;

reset session authorization;
do $test$
declare
  tested_organization_id uuid := (
    select resource_id from pg_temp.m2_state where label = 'organization_a'
  );
begin
  if exists (
    select 1
    from private.idempotency_keys as keys
    where keys.idempotency_key = 'm2-rollback-key-000001'
  ) then
    raise exception 'audit failure left a partial idempotency record';
  end if;

  if (
    select pg_catalog.count(*)
    from private.audit_events as audit
    where audit.organization_id = tested_organization_id
      and audit.action in (
        'project.created',
        'project.updated',
        'stimulus.created',
        'stimulus.version_appended'
      )
  ) <> 4 then
    raise exception 'M2 command audit graph is incomplete';
  end if;

  if exists (
    select 1
    from private.idempotency_keys as keys
    where keys.organization_id = tested_organization_id
      and (keys.resource_id is null or keys.response is null)
  ) then
    raise exception 'M2 left incomplete idempotency state';
  end if;
end
$test$;

rollback;
\echo 'm2 command adversarial database tests: PASS'
