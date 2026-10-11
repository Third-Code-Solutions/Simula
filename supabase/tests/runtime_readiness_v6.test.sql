\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(8);

select extensions.ok(
  (select bool_and(
    not p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
    and p.proconfig @> array['search_path=""']::text[]
    and has_function_privilege('simula_api', p.oid, 'EXECUTE')
    and has_function_privilege('simula_worker', p.oid, 'EXECUTE')
    and not has_function_privilege('anon', p.oid, 'EXECUTE')
    and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) from pg_proc p where p.oid in (
    'private.runtime_schema_readiness_v6()'::regprocedure,
    'private.runtime_observability_snapshot_v6()'::regprocedure
  )),
  'V6 wrappers preserve invoker security and API/worker-only grants');
select extensions.ok(
  not has_schema_privilege('simula_worker', 'api', 'USAGE'),
  'V6 requires no worker access to the API schema');

set session authorization simula_api;
select r.migration_version::text || ':' || r.rls_force_enabled::text || ':' ||
  s.migration_version::text || ':' || s.rls_force_enabled::text as runtime_probe
from private.runtime_schema_readiness_v6() r
cross join private.runtime_observability_snapshot_v6() s \gset
reset session authorization;
select extensions.is(:'runtime_probe'::text,
  '20261010155547:true:20261010155547:true', 'API V6 readiness and snapshot use the new head');
set session authorization simula_worker;
select r.migration_version::text || ':' || r.rls_force_enabled::text || ':' ||
  s.migration_version::text || ':' || s.rls_force_enabled::text as runtime_probe
from private.runtime_schema_readiness_v6() r
cross join private.runtime_observability_snapshot_v6() s \gset
reset session authorization;
select extensions.is(:'runtime_probe'::text,
  '20261010155547:true:20261010155547:true', 'worker V6 readiness and snapshot use the new head');

-- SET ROLE alone must not impersonate a runtime login.
savepoint denied_call;
set role simula_worker;
\set ON_ERROR_STOP off
select * from private.runtime_schema_readiness_v6();
\set denied_state :SQLSTATE
\set ON_ERROR_STOP on
rollback to savepoint denied_call;
reset role;
release savepoint denied_call;
select extensions.is(:'denied_state'::text, '42501', 'V6 retains the runtime session identity check');

alter table api.campaign_lab_runs disable trigger campaign_lab_runs_atomic_admission;
set session authorization simula_api;
select rls_force_enabled::text as runtime_probe from private.runtime_schema_readiness_v6() \gset
reset session authorization;
select extensions.is(:'runtime_probe'::text, 'false', 'API V6 retains admission integrity checks');
set session authorization simula_worker;
select rls_force_enabled::text as runtime_probe from private.runtime_observability_snapshot_v6() \gset
reset session authorization;
select extensions.is(:'runtime_probe'::text, 'false', 'worker V6 snapshot retains admission integrity checks');
alter table api.campaign_lab_runs enable trigger campaign_lab_runs_atomic_admission;
set session authorization simula_worker;
select rls_force_enabled::text as runtime_probe from private.runtime_schema_readiness_v6() \gset
reset session authorization;
select extensions.is(:'runtime_probe'::text, 'true', 'V6 readiness recovers after restoring admission');

select * from extensions.finish();
rollback;
