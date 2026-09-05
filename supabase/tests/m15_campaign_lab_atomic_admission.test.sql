\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(14);
-- Synthetic identities and reports are authored solely for transactional authorization tests.
insert into auth.users(id) values
('f0000000-0000-4000-8000-000000000001'),('f0000000-0000-4000-8000-000000000002'),
('f0000000-0000-4000-8000-000000000003'),('f0000000-0000-4000-8000-000000000004'),
('f0000000-0000-4000-8000-000000000005');
set session authorization simula_api;
set local request.jwt.claims='{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated","iss":"local-test","aud":"authenticated","exp":4102444800}';
create temporary table report_state(label text primary key,id uuid) on commit drop;
insert into report_state select 'org',organization_id from api.create_organization('Report fixture','admission-fixture-org',repeat('a',64),gen_random_uuid());
insert into report_state select 'project',project_id from api.create_project((select id from report_state where label='org'),'Report fixture','Synthetic authorization test only.','philippines','en','campaign_message','admission-fixture-project',repeat('b',64),gen_random_uuid());
insert into report_state select 'campaign',(api.create_campaign_lab_campaign((select id from report_state where label='org'),(select id from report_state where label='project'),'Report fixture','Synthetic report review test','commercial_marketing','{}','admission-fixture-campaign',repeat('c',64),gen_random_uuid())->>'campaign_id')::uuid;
insert into report_state select 'run',(api.create_campaign_lab_run_v4((select id from report_state where label='org'),(select id from report_state where label='campaign'),'report','{}',null,'admission-fixture-run',repeat('d',64),gen_random_uuid())->>'run_id')::uuid;

reset session authorization;
select extensions.ok(exists(select 1 from pg_trigger where tgrelid='api.campaign_lab_runs'::regclass and tgname='campaign_lab_runs_atomic_admission' and tgenabled='O'),'every Campaign Lab insertion has enabled admission guard');
select extensions.ok((select prosecdef and proowner='simula_worker_owner'::regrole and proconfig @> array['search_path=""','row_security=on'] from pg_proc where oid='private.enforce_campaign_lab_run_admission()'::regprocedure),'guard uses existing least-privilege worker owner');
select extensions.ok(not has_function_privilege('simula_api','private.enforce_campaign_lab_run_admission()','EXECUTE') and not has_function_privilege('simula_worker','private.enforce_campaign_lab_run_admission()','EXECUTE'),'runtime callers gain no direct privileged function');
select extensions.ok((select id is not null from report_state where label='run'),'enabled admission accepts original report');
select private.set_run_creation_control(false,'operator_manual',gen_random_uuid());
set session authorization simula_api;
select api.create_campaign_lab_run_v4((select id from report_state where label='org'),(select id from report_state where label='campaign'),'report','{}',null,'admission-fixture-run',repeat('d',64),gen_random_uuid()) as result \gset
reset session authorization;
select extensions.ok((:'result'::jsonb->>'replayed')::boolean,'paused same-payload replay remains available');
savepoint admission_probe;
set session authorization simula_api;
\set ON_ERROR_STOP off
select api.create_campaign_lab_run_v4((select id from report_state where label='org'),(select id from report_state where label='campaign'),'report','{}',null,'paused-new-report',repeat('d',64),gen_random_uuid());
\set failure_state :SQLSTATE
\set failure_message :LAST_ERROR_MESSAGE
\set ON_ERROR_STOP on
rollback to admission_probe;
reset session authorization;
release admission_probe;
select extensions.ok(:'failure_state' = 'P0001' and :'failure_message' = 'queue_backpressure','operator pause blocks new report');
savepoint admission_probe;
set session authorization simula_api;
\set ON_ERROR_STOP off
select api.create_campaign_lab_run_v4((select id from report_state where label='org'),(select id from report_state where label='campaign'),'historical_backtest','{}',null,'paused-new-backtest',repeat('d',64),gen_random_uuid());
\set failure_state :SQLSTATE
\set failure_message :LAST_ERROR_MESSAGE
\set ON_ERROR_STOP on
rollback to admission_probe;
reset session authorization;
release admission_probe;
select extensions.ok(:'failure_state' = 'P0001' and :'failure_message' = 'queue_backpressure','operator pause blocks new backtest');
savepoint admission_probe;
set session authorization simula_api;
\set ON_ERROR_STOP off
select api.create_campaign_lab_run_v4((select id from report_state where label='org'),(select id from report_state where label='campaign'),'report','{}',null,'admission-fixture-run',repeat('e',64),gen_random_uuid());
\set failure_state :SQLSTATE
\set failure_message :LAST_ERROR_MESSAGE
\set ON_ERROR_STOP on
rollback to admission_probe;
reset session authorization;
release admission_probe;
select extensions.ok(:'failure_state' = '23505' and :'failure_message' = 'idempotency_key_reused','paused conflicting replay preserves idempotency rejection');
select private.set_run_creation_control(true,'operator_recovery_verified',gen_random_uuid());
set session authorization simula_api;
select api.create_campaign_lab_run_v4((select id from report_state where label='org'),(select id from report_state where label='campaign'),'report','{}',null,'resumed-new-report',repeat('d',64),gen_random_uuid()) as result \gset
reset session authorization;
select extensions.ok(not (:'result'::jsonb->>'replayed')::boolean,'operator recovery resumes admission');
update private.runtime_controls set bullmq_pressure_reason='redis_memory_high' where control_name='run_creation';
savepoint admission_probe;
set session authorization simula_api;
\set ON_ERROR_STOP off
select api.create_campaign_lab_run_v4((select id from report_state where label='org'),(select id from report_state where label='campaign'),'report','{}',null,'pressure-new-report',repeat('d',64),gen_random_uuid());
\set failure_state :SQLSTATE
\set failure_message :LAST_ERROR_MESSAGE
\set ON_ERROR_STOP on
rollback to admission_probe;
reset session authorization;
release admission_probe;
select extensions.ok(:'failure_state' = 'P0001' and :'failure_message' = 'queue_backpressure','shared pressure denies new Campaign Lab work');
update private.runtime_controls set bullmq_pressure_reason=null where control_name='run_creation';
savepoint missing_control;
delete from private.runtime_controls where control_name='run_creation';
savepoint admission_probe;
set session authorization simula_api;
\set ON_ERROR_STOP off
select api.create_campaign_lab_run_v4((select id from report_state where label='org'),(select id from report_state where label='campaign'),'report','{}',null,'missing-control-report',repeat('d',64),gen_random_uuid());
\set failure_state :SQLSTATE
\set failure_message :LAST_ERROR_MESSAGE
\set ON_ERROR_STOP on
rollback to admission_probe;
reset session authorization;
release admission_probe;
select extensions.ok(:'failure_state' = 'P0001' and :'failure_message' = 'queue_backpressure','missing durable latch fails closed');
rollback to missing_control;
release missing_control;
set session authorization simula_api;
insert into report_state select 'otherorg',organization_id from api.create_organization('Other fixture','admission-other-org',repeat('a',64),gen_random_uuid());
insert into report_state select 'otherproject',project_id from api.create_project((select id from report_state where label='otherorg'),'Other fixture','Synthetic capacity only.','philippines','en','campaign_message','admission-other-project',repeat('b',64),gen_random_uuid());
insert into report_state select 'othercampaign',(api.create_campaign_lab_campaign((select id from report_state where label='otherorg'),(select id from report_state where label='otherproject'),'Other fixture','Synthetic capacity only','commercial_marketing','{}','admission-other-campaign',repeat('c',64),gen_random_uuid())->>'campaign_id')::uuid;
reset session authorization;
insert into api.campaign_lab_runs(organization_id,campaign_id,run_type,status,request,idempotency_key,request_sha256,created_by)
select (select id from report_state where label='otherorg'),(select id from report_state where label='othercampaign'),'report',
(array['queued','running','retrying','cancel_requested'])[1+(n%4)],'{}','admission-capacity-'||n,repeat('a',64),'f0000000-0000-4000-8000-000000000001'::uuid
from generate_series(1,98) n;
savepoint admission_probe;
set session authorization simula_api;
\set ON_ERROR_STOP off
select api.create_campaign_lab_run_v4((select id from report_state where label='org'),(select id from report_state where label='campaign'),'report','{}',null,'capacity-new-report',repeat('d',64),gen_random_uuid());
\set failure_state :SQLSTATE
\set failure_message :LAST_ERROR_MESSAGE
\set ON_ERROR_STOP on
rollback to admission_probe;
reset session authorization;
release admission_probe;
select extensions.ok(:'failure_state' = 'P0001' and :'failure_message' = 'queue_backpressure','100 nonterminal runs across tenants block new work');
set session authorization simula_api;
select api.create_campaign_lab_run_v4((select id from report_state where label='org'),(select id from report_state where label='campaign'),'report','{}',null,'admission-fixture-run',repeat('d',64),gen_random_uuid()) as result \gset
reset session authorization;
select extensions.ok((:'result'::jsonb->>'replayed')::boolean,'idempotent replay remains available at capacity');
update api.campaign_lab_runs set status='succeeded' where id=(select id from report_state where label='run');
set session authorization simula_api;
select api.create_campaign_lab_run_v4((select id from report_state where label='org'),(select id from report_state where label='campaign'),'report','{}',null,'capacity-released-report',repeat('d',64),gen_random_uuid()) as result \gset
reset session authorization;
select extensions.ok(not (:'result'::jsonb->>'replayed')::boolean,'terminal completion releases one admission slot');
select * from extensions.finish();
rollback;
