\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(18);

-- Synthetic rows remain in this transaction, including all terminal writes.
insert into auth.users (id) values
  ('f1000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000002');
set session authorization simula_api;
set local request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated","iss":"local-test","aud":"authenticated","exp":4102444800}';
create temporary table terminal_parents (label text primary key, id uuid) on commit drop;
insert into terminal_parents select 'org', organization_id from api.create_organization('Terminal fixture', 'terminal-fixture-org', repeat('a',64), gen_random_uuid());
insert into terminal_parents select 'project', project_id from api.create_project((select id from terminal_parents where label='org'), 'Terminal fixture', 'Synthetic lifecycle test.', 'philippines', 'en', 'campaign_message', 'terminal-fixture-project', repeat('b',64), gen_random_uuid());
set local request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated","iss":"local-test","aud":"authenticated","exp":4102444800}';
insert into terminal_parents select 'other_org', organization_id from api.create_organization('Other terminal fixture', 'terminal-other-org', repeat('a',64), gen_random_uuid());
insert into terminal_parents select 'other_project', project_id from api.create_project((select id from terminal_parents where label='other_org'), 'Other terminal fixture', 'Synthetic isolation test.', 'philippines', 'en', 'campaign_message', 'terminal-other-project', repeat('b',64), gen_random_uuid());
reset session authorization;

create temporary table terminal_runs (
  label text primary key, organization_id uuid, project_id uuid, created_by uuid,
  campaign_id uuid default gen_random_uuid(), run_id uuid default gen_random_uuid(),
  lease_token uuid default gen_random_uuid()
) on commit drop;
insert into terminal_runs (label, organization_id, project_id, created_by)
select label, (select id from terminal_parents where label='org'),
  (select id from terminal_parents where label='project'),
  'f1000000-0000-4000-8000-000000000001'::uuid
from unnest(array['failed','succeeded','canceled']) label;
insert into terminal_runs (label, organization_id, project_id, created_by)
values ('other', (select id from terminal_parents where label='other_org'),
  (select id from terminal_parents where label='other_project'),
  'f1000000-0000-4000-8000-000000000002');
grant select on terminal_runs to simula_worker, simula_api;
insert into api.campaign_lab_campaigns (
  id, organization_id, project_id, name, objective, purpose, status,
  current_stage, idempotency_key, request_sha256, created_by
)
select campaign_id, organization_id, project_id, 'Terminal ' || label,
  'Synthetic lifecycle test.', 'commercial_marketing', 'running',
  'simulation_configured', 'terminal-campaign-' || label, repeat('c',64), created_by
from terminal_runs;
insert into api.campaign_lab_runs (
  id, organization_id, campaign_id, run_type, status, stage, progress,
  request, idempotency_key, request_sha256, created_by, attempt_count,
  lease_token, lease_expires_at
)
select run_id, organization_id, campaign_id, 'repeated_simulation',
  case label when 'canceled' then 'cancel_requested' else 'running' end,
  'evaluating', 45, '{}', 'terminal-run-' || label, repeat('d',64), created_by, 1,
  lease_token, statement_timestamp() + interval '5 minutes'
from terminal_runs;
insert into private.campaign_lab_secrets (organization_id, run_id, payload)
select organization_id, run_id, '{"synthetic_test_input":true}' from terminal_runs;

select extensions.ok(
  has_column_privilege('simula_worker_owner','api.campaign_lab_campaigns','id','SELECT')
  and has_column_privilege('simula_worker_owner','api.campaign_lab_campaigns','status','UPDATE')
  and has_column_privilege('simula_worker_owner','api.campaign_lab_campaigns','current_stage','UPDATE')
  and has_column_privilege('simula_worker_owner','api.campaign_lab_campaigns','updated_at','UPDATE')
  and not has_column_privilege('simula_worker_owner','api.campaign_lab_campaigns','organization_id','UPDATE')
  and not has_column_privilege('simula_worker_owner','api.campaign_lab_campaigns','name','SELECT')
  and not has_table_privilege('simula_worker_owner','api.campaign_lab_campaigns','INSERT,DELETE'),
  'function owner has only the campaign columns required by terminal transitions');
select extensions.ok(
  not exists (select 1 from unnest(array['simula_worker','anon','authenticated']) role_name
    where has_any_column_privilege(role_name,'api.campaign_lab_campaigns','SELECT,INSERT,UPDATE')
      or has_table_privilege(role_name,'api.campaign_lab_campaigns','DELETE'))
  and not pg_has_role('simula_worker','simula_worker_owner','MEMBER'),
  'worker and client roles gain no direct campaign privileges or owner membership');

savepoint direct_access;
set session authorization simula_worker;
\set ON_ERROR_STOP off
select id from api.campaign_lab_campaigns;
\set denied_state :SQLSTATE
\set ON_ERROR_STOP on
rollback to direct_access;
reset session authorization;
select extensions.is(:'denied_state'::text, '42501', 'worker cannot directly read campaigns');
release direct_access;
savepoint direct_access;
set session authorization simula_worker;
\set ON_ERROR_STOP off
update api.campaign_lab_campaigns set status='active';
\set denied_state :SQLSTATE
\set ON_ERROR_STOP on
rollback to direct_access;
reset session authorization;
select extensions.is(:'denied_state'::text, '42501', 'worker cannot directly update campaigns');
release direct_access;

set session authorization simula_worker;
select private.fail_campaign_lab_run(run_id, gen_random_uuid(), 'invalid_campaign_lab_input', 'Synthetic terminal failure.', false) as stale_failure from terminal_runs where label='failed' \gset
select private.complete_campaign_lab_run_v3(run_id, gen_random_uuid(), '{}') as stale_completion from terminal_runs where label='succeeded' \gset
select private.finalize_canceled_campaign_lab_run(run_id, gen_random_uuid()) as stale_cancellation from terminal_runs where label='canceled' \gset
select private.fail_campaign_lab_run(run_id, (select lease_token from terminal_runs where label='failed'), 'invalid_campaign_lab_input', 'Synthetic crossed lease.', false) as crossed_lease from terminal_runs where label='other' \gset
reset session authorization;
select extensions.ok(:'stale_failure'='stale' and not :'stale_completion'::boolean and not :'stale_cancellation'::boolean and :'crossed_lease'='stale', 'stale and cross-tenant leases cannot terminate runs');
select extensions.is((select count(*)::integer from api.campaign_lab_runs r join terminal_runs t on t.run_id=r.id where r.lease_token=t.lease_token and r.completed_at is null), 4, 'rejected leases preserve every run and lease');

set session authorization simula_worker;
select private.fail_campaign_lab_run(run_id, lease_token, 'invalid_campaign_lab_input', 'Synthetic terminal failure.', false) as failure_result from terminal_runs where label='failed' \gset
select private.complete_campaign_lab_run_v3(run_id, lease_token, '{"synthetic_test_result":true}') as completion_result from terminal_runs where label='succeeded' \gset
select private.finalize_canceled_campaign_lab_run(run_id, lease_token) as cancellation_result from terminal_runs where label='canceled' \gset
reset session authorization;
select extensions.ok(:'failure_result'='failed' and :'completion_result'::boolean and :'cancellation_result'::boolean, 'all terminal functions succeed under the worker session');
select extensions.ok((select r.status='failed' and r.stage='failed' and r.last_error_code='invalid_campaign_lab_input' and c.status='active' from terminal_runs t join api.campaign_lab_runs r on r.id=t.run_id join api.campaign_lab_campaigns c on c.id=t.campaign_id where t.label='failed'), 'failure persists run error and restores campaign status');
select extensions.ok((select r.status='succeeded' and r.stage='simulated' and r.progress=100 and r.result='{"synthetic_test_result":true}'::jsonb and c.status='active' and c.current_stage='simulated' from terminal_runs t join api.campaign_lab_runs r on r.id=t.run_id join api.campaign_lab_campaigns c on c.id=t.campaign_id where t.label='succeeded'), 'completion persists result and campaign stage');
select extensions.ok((select r.status='canceled' and r.stage='canceled' and c.status='active' from terminal_runs t join api.campaign_lab_runs r on r.id=t.run_id join api.campaign_lab_campaigns c on c.id=t.campaign_id where t.label='canceled'), 'cancellation persists terminal run and restores campaign status');
select extensions.is((select count(*)::integer from api.campaign_lab_runs r join terminal_runs t on t.run_id=r.id where t.label<>'other' and r.lease_token is null and r.lease_expires_at is null and r.completed_at is not null), 3, 'terminal transitions clear leases and record completion times');
select extensions.is((select count(*)::integer from private.campaign_lab_secrets s join terminal_runs t on t.run_id=s.run_id where t.label<>'other'), 0, 'terminal transitions delete their secret input rows');
select extensions.is((select count(*)::integer from api.campaign_lab_events e join terminal_runs t on t.run_id=e.run_id where e.organization_id=t.organization_id and e.campaign_id=t.campaign_id and e.event_kind=case t.label when 'succeeded' then 'completed' else t.label end), 3, 'one matching event is persisted for each terminal transition');
select extensions.is((select count(*)::integer from private.audit_events a join terminal_runs t on t.run_id=a.object_id where a.organization_id=t.organization_id and a.actor_type='worker' and a.source_service='worker' and a.action='campaign_lab.run_' || case t.label when 'succeeded' then 'completed' else t.label end and a.outcome=case t.label when 'succeeded' then 'success' else 'failure' end), 3, 'terminal audit rows preserve organization and success or failure outcome');
select extensions.ok((select r.status='running' and r.lease_token=t.lease_token and c.status='running' and exists(select 1 from private.campaign_lab_secrets s where s.run_id=t.run_id) from terminal_runs t join api.campaign_lab_runs r on r.id=t.run_id join api.campaign_lab_campaigns c on c.id=t.campaign_id where t.label='other'), 'other tenant campaign, run, lease, and secret remain untouched');
set session authorization simula_worker;
select private.fail_campaign_lab_run(run_id, lease_token, 'invalid_campaign_lab_input', 'Synthetic replay.', false) as replay_failure from terminal_runs where label='failed' \gset
select private.complete_campaign_lab_run_v3(run_id, lease_token, '{}') as replay_completion from terminal_runs where label='succeeded' \gset
select private.finalize_canceled_campaign_lab_run(run_id, lease_token) as replay_cancellation from terminal_runs where label='canceled' \gset
reset session authorization;
select extensions.ok(:'replay_failure'='stale' and not :'replay_completion'::boolean and not :'replay_cancellation'::boolean, 'completed leases cannot replay terminal mutations');
select extensions.is((select count(*)::integer from api.campaign_lab_events e join terminal_runs t on t.run_id=e.run_id), 3, 'stale calls and replays emit no extra events');
set session authorization simula_api;
set local request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated","iss":"local-test","aud":"authenticated","exp":4102444800}';
select count(*) as visible_other from api.campaign_lab_campaigns where id=(select campaign_id from terminal_runs where label='other') \gset
reset session authorization;
select extensions.is(:'visible_other'::integer, 0, 'worker policies preserve client tenant isolation');

select * from extensions.finish();
rollback;
