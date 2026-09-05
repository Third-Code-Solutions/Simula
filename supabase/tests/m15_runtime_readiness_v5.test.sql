begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(20);

select extensions.ok(
  (select p.prosecdef and r.rolname = 'postgres'
     and p.proconfig @> array['search_path=""', 'row_security=on']::text[]
   from pg_catalog.pg_proc p
   join pg_catalog.pg_roles r on r.oid=p.proowner
   where p.oid='private.bound_report_schema_present_v1()'::pg_catalog.regprocedure),
  'report existence probe elevates only a fixed catalog lookup with a safe search path'
);
select extensions.ok(
  (select pg_catalog.bool_and(
    pg_catalog.has_function_privilege('simula_api', signature, 'EXECUTE')
    and pg_catalog.has_function_privilege('simula_worker', signature, 'EXECUTE')
    and not pg_catalog.has_function_privilege('anon', signature, 'EXECUTE')
    and not pg_catalog.has_function_privilege('authenticated', signature, 'EXECUTE')
  ) from (values ('private.bound_report_schema_present_v1()'),
                 ('private.runtime_schema_readiness_v5()'),
                 ('private.runtime_observability_snapshot_v5()')) f(signature)),
  'V5 functions retain the exact API/worker-only caller grants'
);
select extensions.ok(
  pg_catalog.has_schema_privilege('simula_worker','private','USAGE')
    and not pg_catalog.has_schema_privilege('simula_worker','api','USAGE'),
  'worker gains no api schema usage for V5 readiness'
);

-- Capture under the real service identity; run pgTAP only after restoring the test session.
set session authorization simula_api;
select migration_version::text || ':' || rls_force_enabled::text as runtime_probe
  from private.runtime_schema_readiness_v4() \gset
reset session authorization;
select extensions.is(:'runtime_probe'::text, '20260824020000:true', 'API V4 remains rollback compatible');
set session authorization simula_api;
select migration_version::text || ':' || rls_force_enabled::text as runtime_probe
  from private.runtime_schema_readiness_v5() \gset
reset session authorization;
select extensions.is(:'runtime_probe'::text, '20260905095453:true', 'API V5 reports the new ready head');
set session authorization simula_api;
select migration_version::text || ':' || rls_force_enabled::text as runtime_probe
  from private.runtime_observability_snapshot_v5() \gset
reset session authorization;
select extensions.is(:'runtime_probe'::text, '20260905095453:true', 'API V5 snapshot uses V5 readiness');
reset session authorization;

set session authorization simula_worker;
select migration_version::text || ':' || rls_force_enabled::text as runtime_probe
  from private.runtime_schema_readiness_v4() \gset
reset session authorization;
select extensions.is(:'runtime_probe'::text, '20260824020000:true', 'worker V4 remains rollback compatible');
set session authorization simula_worker;
select migration_version::text || ':' || rls_force_enabled::text as runtime_probe
  from private.runtime_schema_readiness_v5() \gset
reset session authorization;
select extensions.is(:'runtime_probe'::text, '20260905095453:true', 'worker V5 reports the new ready head');
set session authorization simula_worker;
select migration_version::text || ':' || rls_force_enabled::text as runtime_probe
  from private.runtime_observability_snapshot_v5() \gset
reset session authorization;
select extensions.is(:'runtime_probe'::text, '20260905095453:true', 'worker V5 snapshot needs no api schema grant');
reset session authorization;

-- Expected denials abort the statement; savepoints retain the surrounding test transaction.
savepoint denied_call;
set session authorization anon;
\set ON_ERROR_STOP off
select * from private.runtime_schema_readiness_v5();
\set denied_state :SQLSTATE
\set ON_ERROR_STOP on
rollback to savepoint denied_call;
reset session authorization;
release savepoint denied_call;
select extensions.is(:'denied_state'::text, '42501', 'anon cannot call V5 readiness');
savepoint denied_call;
set session authorization anon;
\set ON_ERROR_STOP off
select * from private.runtime_observability_snapshot_v5();
\set denied_state :SQLSTATE
\set ON_ERROR_STOP on
rollback to savepoint denied_call;
reset session authorization;
release savepoint denied_call;
select extensions.is(:'denied_state'::text, '42501', 'anon cannot call V5 snapshot');
reset session authorization;
savepoint denied_call;
set session authorization authenticated;
\set ON_ERROR_STOP off
select * from private.runtime_schema_readiness_v5();
\set denied_state :SQLSTATE
\set ON_ERROR_STOP on
rollback to savepoint denied_call;
reset session authorization;
release savepoint denied_call;
select extensions.is(:'denied_state'::text, '42501', 'authenticated cannot call V5 readiness');
savepoint denied_call;
set session authorization authenticated;
\set ON_ERROR_STOP off
select * from private.runtime_observability_snapshot_v5();
\set denied_state :SQLSTATE
\set ON_ERROR_STOP on
rollback to savepoint denied_call;
reset session authorization;
release savepoint denied_call;
select extensions.is(:'denied_state'::text, '42501', 'authenticated cannot call V5 snapshot');
reset session authorization;

-- Transactional rename simulates a missing required relation without dropping data.
alter table api.campaign_lab_report_reviews rename to campaign_lab_report_reviews_probe;
set session authorization simula_api;
select rls_force_enabled::text as runtime_probe from private.runtime_schema_readiness_v5() \gset
reset session authorization;
select extensions.is(:'runtime_probe'::text, 'false', 'API refuses readiness without the report relation');
reset session authorization;
set session authorization simula_worker;
select rls_force_enabled::text as runtime_probe from private.runtime_schema_readiness_v5() \gset
reset session authorization;
select extensions.is(:'runtime_probe'::text, 'false', 'worker refuses readiness without the report relation');
set session authorization simula_worker;
select migration_version::text || ':' || rls_force_enabled::text as runtime_probe
  from private.runtime_schema_readiness_v4() \gset
reset session authorization;
select extensions.is(:'runtime_probe'::text, '20260824020000:true', 'missing new relation does not rewrite the V4 contract');
reset session authorization;
alter table api.campaign_lab_report_reviews_probe rename to campaign_lab_report_reviews;

alter function api.review_campaign_lab_bound_report(uuid,text,text,jsonb,text,text,uuid) rename to review_campaign_lab_bound_report_probe;
set session authorization simula_api;
select rls_force_enabled::text as runtime_probe from private.runtime_schema_readiness_v5() \gset
reset session authorization;
select extensions.is(:'runtime_probe'::text, 'false', 'API refuses readiness without the exact review signature');
reset session authorization;
set session authorization simula_worker;
select rls_force_enabled::text as runtime_probe from private.runtime_schema_readiness_v5() \gset
reset session authorization;
select extensions.is(:'runtime_probe'::text, 'false', 'worker refuses readiness without the exact review signature');
reset session authorization;
alter function api.review_campaign_lab_bound_report_probe(uuid,text,text,jsonb,text,text,uuid) rename to review_campaign_lab_bound_report;

set session authorization simula_api;
select rls_force_enabled::text as runtime_probe from private.runtime_schema_readiness_v5() \gset
reset session authorization;
select extensions.is(:'runtime_probe'::text, 'true', 'API readiness recovers after restoring the contract');
reset session authorization;
set session authorization simula_worker;
select rls_force_enabled::text as runtime_probe from private.runtime_schema_readiness_v5() \gset
reset session authorization;
select extensions.is(:'runtime_probe'::text, 'true', 'worker readiness recovers without extra schema grants');
reset session authorization;

select * from extensions.finish();
rollback;
