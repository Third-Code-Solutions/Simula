\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(8);
-- Synthetic identities and reports are authored solely for transactional authorization tests.
insert into auth.users(id) values
('e0000000-0000-4000-8000-000000000001'),('e0000000-0000-4000-8000-000000000002'),
('e0000000-0000-4000-8000-000000000003'),('e0000000-0000-4000-8000-000000000004'),
('e0000000-0000-4000-8000-000000000005');
set session authorization simula_api;
set local request.jwt.claims='{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated","iss":"local-test","aud":"authenticated","exp":4102444800}';
create temporary table report_state(label text primary key,id uuid) on commit drop;
insert into report_state select 'org',organization_id from api.create_organization('Report fixture','source-ri-fixture-org',repeat('a',64),gen_random_uuid());

reset session authorization;
-- Transaction-only helper models the existing verified command-owner boundary; no source-registration API is claimed.
create function private.test_source_ri_probe(org uuid) returns uuid
language plpgsql security definer set search_path='' set row_security=on as $$
declare source_id uuid; version_id uuid;
begin
insert into api.evidence_sources(organization_id,source_key,name,created_by)
values(org,'ri_' || replace(gen_random_uuid()::text,'-',''),'Engineering RI probe',private.verified_subject()) returning id into source_id;
insert into api.evidence_source_versions(organization_id,evidence_source_id,version,source_version,owner_name,license_name,consent_basis,allowed_uses,prohibited_uses,rights_status,provenance,checksum_sha256,created_by)
values(org,source_id,1,'v1','Engineering','Synthetic fixture','No human records',array['calibration'],array[]::text[],'approved','{}',repeat('a',64),private.verified_subject()) returning id into version_id;
return version_id;
end; $$;
alter function private.test_source_ri_probe(uuid) owner to simula_command_owner;
revoke all on function private.test_source_ri_probe(uuid) from public;
grant execute on function private.test_source_ri_probe(uuid) to simula_api;
set session authorization simula_api;
select private.test_source_ri_probe((select id from report_state where label='org'))::text as version_id \gset
reset session authorization;
select extensions.ok(:'version_id'::text <> '', 'verified trusted command inserts source and its immutable version');
select extensions.ok(pg_catalog.has_column_privilege('postgres','api.evidence_sources','id','UPDATE')
  and not pg_catalog.has_table_privilege('postgres','api.evidence_sources','UPDATE'),
  'RI owner receives only key-column UPDATE, not table-wide UPDATE');
select extensions.ok(not pg_catalog.has_table_privilege('simula_api','api.evidence_sources','INSERT')
  and not pg_catalog.has_table_privilege('simula_worker','api.evidence_sources','INSERT'),
  'runtime roles gain no source INSERT authority');
select extensions.ok(not pg_catalog.has_table_privilege('simula_api','api.evidence_source_versions','INSERT')
  and not pg_catalog.has_table_privilege('simula_worker','api.evidence_source_versions','INSERT'),
  'runtime roles gain no version INSERT authority');
select extensions.ok((select bool_and(relrowsecurity and relforcerowsecurity)
  from pg_catalog.pg_class where oid in ('api.evidence_sources'::regclass,'api.evidence_source_versions'::regclass)),
  'source and version forced RLS remain enabled');

-- A second distinct key avoids uniqueness masking the original RI failure.
revoke update(id) on api.evidence_sources from postgres;
savepoint missing_ri_grant;
set session authorization simula_api;
\set ON_ERROR_STOP off
select private.test_source_ri_probe((select id from report_state where label='org'));
\set failure_state :SQLSTATE
\set ON_ERROR_STOP on
rollback to savepoint missing_ri_grant;
reset session authorization;
release savepoint missing_ri_grant;
select extensions.is(:'failure_state'::text,'42501','removing owner key lock privilege reproduces the failure');
grant update(id) on api.evidence_sources to postgres;

savepoint outsider_call;
set session authorization simula_api;
set local request.jwt.claims='{"sub":"e0000000-0000-4000-8000-000000000002","role":"authenticated","iss":"local-test","aud":"authenticated","exp":4102444800}';
\set ON_ERROR_STOP off
select private.test_source_ri_probe((select id from report_state where label='org'));
\set failure_state :SQLSTATE
\set ON_ERROR_STOP on
rollback to savepoint outsider_call;
reset session authorization;
release savepoint outsider_call;
select extensions.is(:'failure_state'::text,'42501','trusted command still denies non-members through RLS');

savepoint direct_write;
set session authorization simula_api;
\set ON_ERROR_STOP off
insert into api.evidence_sources(organization_id,source_key,name,created_by)
values((select id from report_state where label='org'),'direct_probe','Direct probe','e0000000-0000-4000-8000-000000000001');
\set failure_state :SQLSTATE
\set ON_ERROR_STOP on
rollback to savepoint direct_write;
reset session authorization;
release savepoint direct_write;
select extensions.is(:'failure_state'::text,'42501','API cannot bypass the trusted command with a direct source write');
select * from extensions.finish();
rollback;
