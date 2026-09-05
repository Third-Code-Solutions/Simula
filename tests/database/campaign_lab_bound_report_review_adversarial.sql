\set ON_ERROR_STOP on
begin;
-- Synthetic identities and reports are authored solely for transactional authorization tests.
insert into auth.users(id) values
('d0000000-0000-4000-8000-000000000001'),('d0000000-0000-4000-8000-000000000002'),
('d0000000-0000-4000-8000-000000000003'),('d0000000-0000-4000-8000-000000000004'),
('d0000000-0000-4000-8000-000000000005');
set session authorization simula_api;
set local request.jwt.claims='{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated","iss":"local-test","aud":"authenticated","exp":4102444800}';
create temporary table report_state(label text primary key,id uuid) on commit drop;
insert into report_state select 'org',organization_id from api.create_organization('Report fixture','bound-report-fixture-org',repeat('a',64),gen_random_uuid());
insert into report_state select 'project',project_id from api.create_project((select id from report_state where label='org'),'Report fixture','Synthetic authorization test only.','philippines','en','campaign_message','bound-report-fixture-project',repeat('b',64),gen_random_uuid());
insert into report_state select 'campaign',(api.create_campaign_lab_campaign((select id from report_state where label='org'),(select id from report_state where label='project'),'Report fixture','Synthetic report review test','commercial_marketing','{}','bound-report-fixture-campaign',repeat('c',64),gen_random_uuid())->>'campaign_id')::uuid;
insert into report_state select 'run',(api.create_campaign_lab_run_v4((select id from report_state where label='org'),(select id from report_state where label='campaign'),'report','{"evidence_binding":{"version":"campaign_lab_report_binding_v1","input_authors":["d0000000-0000-4000-8000-000000000005"]}}',null,'bound-report-fixture-run',repeat('d',64),gen_random_uuid())->>'run_id')::uuid;
reset session authorization;
insert into api.organization_memberships(organization_id,user_id,role,created_by)
select (select id from report_state where label='org'),id,role::api.organization_role,'d0000000-0000-4000-8000-000000000001'::uuid from (values
('d0000000-0000-4000-8000-000000000002'::uuid,'owner'),
('d0000000-0000-4000-8000-000000000003'::uuid,'viewer'),
('d0000000-0000-4000-8000-000000000005'::uuid,'owner')) t(id,role);
update api.campaign_lab_runs set status='succeeded',progress=100,completed_at=statement_timestamp(),result=request where id=(select id from report_state where label='run');
set session authorization simula_api;
do $test$
begin
  begin
    perform api.review_campaign_lab_bound_report((select id from report_state where label='run'),'approved_experimental','Authored test rationale only.',(select result from api.campaign_lab_runs where id=(select id from report_state where label='run')),repeat('a',64),repeat('b',64),gen_random_uuid());
    raise exception 'author unexpectedly approved own report';
  exception when insufficient_privilege then
    if sqlerrm <> 'independent_report_reviewer_required' then raise; end if;
  end;
end $test$;
set local request.jwt.claims='{"sub":"d0000000-0000-4000-8000-000000000005","role":"authenticated","iss":"local-test","aud":"authenticated","exp":4102444800}';
do $test$ begin
  begin
    perform api.review_campaign_lab_bound_report((select id from report_state where label='run'),'approved_experimental','Authored test rationale only.',(select result from api.campaign_lab_runs where id=(select id from report_state where label='run')),repeat('a',64),repeat('b',64),gen_random_uuid());
    raise exception 'input author unexpectedly approved report';
  exception when insufficient_privilege then
    if sqlerrm <> 'independent_report_reviewer_required' then raise; end if;
  end;
end $test$;
set local request.jwt.claims='{"sub":"d0000000-0000-4000-8000-000000000003","role":"authenticated","iss":"local-test","aud":"authenticated","exp":4102444800}';
do $test$ begin
  begin
    perform api.review_campaign_lab_bound_report((select id from report_state where label='run'),'approved_experimental','Authored test rationale only.','{}',repeat('a',64),repeat('b',64),gen_random_uuid());
    raise exception 'viewer unexpectedly approved report';
  exception when insufficient_privilege then null;
  end;
end $test$;
set local request.jwt.claims='{"sub":"d0000000-0000-4000-8000-000000000002","role":"authenticated","iss":"local-test","aud":"authenticated","exp":4102444800}';
do $test$ declare first_result jsonb; replay_result jsonb; begin
  begin
    perform api.review_campaign_lab_bound_report((select id from report_state where label='run'),'approved_experimental','Authored test rationale only.','{}',repeat('a',64),repeat('b',64),gen_random_uuid());
    raise exception 'changed report snapshot unexpectedly approved';
  exception when object_not_in_prerequisite_state then null;
  end;
  first_result := api.review_campaign_lab_bound_report((select id from report_state where label='run'),'approved_experimental','Authored test rationale only.',(select result from api.campaign_lab_runs where id=(select id from report_state where label='run')),repeat('a',64),repeat('b',64),gen_random_uuid());
  replay_result := api.review_campaign_lab_bound_report((select id from report_state where label='run'),'approved_experimental','Authored test rationale only.',(select result from api.campaign_lab_runs where id=(select id from report_state where label='run')),repeat('a',64),repeat('b',64),gen_random_uuid());
  if first_result->>'id' <> replay_result->>'id' or replay_result->>'replayed' <> 'true' then raise exception 'review retry was not idempotent'; end if;
  begin
    perform api.review_campaign_lab_bound_report((select id from report_state where label='run'),'rejected','Changed decision must fail.',(select result from api.campaign_lab_runs where id=(select id from report_state where label='run')),repeat('a',64),repeat('b',64),gen_random_uuid());
    raise exception 'final decision unexpectedly mutated';
  exception when unique_violation then null;
  end;
  begin
    update api.campaign_lab_report_reviews set rationale='direct mutation must fail';
    raise exception 'direct update unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $test$;
set local request.jwt.claims='{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated","iss":"local-test","aud":"authenticated","exp":4102444800}';
select api.review_campaign_lab_bound_report((select id from report_state where label='run'),'revoked','Authored revocation test only.',(select result from api.campaign_lab_runs where id=(select id from report_state where label='run')),repeat('a',64),repeat('b',64),gen_random_uuid()) is not null as revoked;
do $test$ begin if (select count(*) from api.campaign_lab_report_reviews where run_id=(select id from report_state where label='run')) <> 2 then raise exception 'revocation overwrote historical approval'; end if; end $test$;
set local request.jwt.claims='{"sub":"d0000000-0000-4000-8000-000000000004","role":"authenticated","iss":"local-test","aud":"authenticated","exp":4102444800}';
do $test$ begin if exists(select 1 from api.campaign_lab_report_reviews) then raise exception 'review escaped tenant scope'; end if; end $test$;
reset session authorization;
-- Authorized parent retention/deletion must remove decisions; direct API deletion is forbidden.
set session authorization simula_api;
set local request.jwt.claims='{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated","iss":"local-test","aud":"authenticated","exp":4102444800}';
do $test$ begin
  begin
    delete from api.campaign_lab_report_reviews;
    raise exception 'direct delete unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $test$;
reset session authorization;
delete from api.campaign_lab_runs where id=(select id from report_state where label='run');
do $test$ begin
  if exists(select 1 from api.campaign_lab_report_reviews where campaign_id=(select id from report_state where label='campaign')) then
    raise exception 'parent deletion failed to cascade report reviews';
  end if;
end $test$;
rollback;
select 'bound report review adversarial checks passed' as result;
