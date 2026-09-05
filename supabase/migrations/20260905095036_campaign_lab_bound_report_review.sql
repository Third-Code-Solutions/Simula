-- Append-only decisions for immutable Campaign Lab reports. Legacy reports remain quarantined.
set role postgres;

-- Evidence-version RI locks the referenced source as its table owner. The
-- historical owner ACL revoked UPDATE; only this key column is needed for
-- FOR KEY SHARE. Runtime roles gain no write authority.
grant update (id) on table api.evidence_sources to postgres;
grant create on schema api, private to simula_command_owner;

create table api.campaign_lab_report_reviews (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid not null,
  run_id uuid not null,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('approved_experimental', 'rejected', 'revoked')),
  rationale text not null check (pg_catalog.char_length(pg_catalog.btrim(rationale)) between 20 and 2000),
  report_sha256 text not null check (report_sha256 ~ '^[0-9a-f]{64}$'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  foreign key (organization_id, run_id) references api.campaign_lab_runs(organization_id, id) on delete cascade,
  foreign key (organization_id, campaign_id) references api.campaign_lab_campaigns(organization_id, id) on delete cascade
);
create unique index campaign_lab_report_reviews_initial_idx on api.campaign_lab_report_reviews(run_id) where decision <> 'revoked';
create unique index campaign_lab_report_reviews_revocation_idx on api.campaign_lab_report_reviews(run_id) where decision = 'revoked';
create index campaign_lab_report_reviews_campaign_idx on api.campaign_lab_report_reviews(organization_id, campaign_id, created_at desc);
create index campaign_lab_report_reviews_reviewer_idx on api.campaign_lab_report_reviews(reviewer_id);
alter table api.campaign_lab_report_reviews enable row level security;
alter table api.campaign_lab_report_reviews force row level security;
create policy campaign_lab_report_reviews_read on api.campaign_lab_report_reviews for select to simula_api, simula_command_owner
  using (private.has_org_role(organization_id, private.verified_subject(), array['owner','editor','viewer']::api.organization_role[]));
create policy campaign_lab_report_reviews_insert on api.campaign_lab_report_reviews for insert to simula_command_owner
  with check (reviewer_id = private.verified_subject() and private.has_org_role(organization_id, private.verified_subject(), array['owner']::api.organization_role[]));
revoke all on api.campaign_lab_report_reviews from public, anon, authenticated, simula_api, simula_worker, simula_worker_owner;
grant select on api.campaign_lab_report_reviews to simula_api;
grant select, insert on api.campaign_lab_report_reviews to simula_command_owner;
-- No UPDATE or DELETE capability is exposed. Parent retention/deletion cascades remain authoritative.

-- Extend the consolidated audit policy with one owner-only action; retain every existing branch.
do $policy$
declare prior_check text;
begin
  select with_check into prior_check from pg_catalog.pg_policies
    where schemaname='private' and tablename='audit_events' and policyname='audit_events_command_insert';
  if prior_check is null then raise exception 'audit policy missing'; end if;
  execute pg_catalog.format(
    'alter policy audit_events_command_insert on private.audit_events with check ((%s) or (actor_type = ''user'' and actor_user_id = private.verified_subject() and private.is_verified_api_subject(actor_user_id) and source_service = ''api'' and outcome = ''success'' and action = ''campaign_lab.report_reviewed'' and object_type = ''campaign_lab_run'' and object_id is not null and private.has_org_role(organization_id, private.verified_subject(), array[''owner'']::api.organization_role[])))',
    prior_check);
end
$policy$;

set role simula_command_owner;
create function private.review_campaign_lab_bound_report_atomic(
  requested_run_id uuid, requested_decision text, requested_rationale text,
  requested_result jsonb, requested_report_sha256 text, requested_manifest_sha256 text,
  requested_correlation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' set row_security = 'on'
as $function$
declare
  subject uuid;
  selected_run api.campaign_lab_runs%rowtype;
  existing api.campaign_lab_report_reviews%rowtype;
  created api.campaign_lab_report_reviews%rowtype;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode='42501', message='unauthorized';
  end if;
  select * into selected_run from api.campaign_lab_runs where id=requested_run_id for update;
  if not found or not private.has_org_role(selected_run.organization_id, subject, array['owner']::api.organization_role[]) then
    raise exception using errcode='42501', message='forbidden';
  end if;
  if requested_decision <> 'revoked' and (selected_run.created_by = subject
    or coalesce(selected_run.request->'evidence_binding'->'input_authors', '[]'::jsonb) ? subject::text) then
    raise exception using errcode='42501', message='independent_report_reviewer_required';
  end if;
  if selected_run.run_type <> 'report' or selected_run.status <> 'succeeded'
    or selected_run.result->'evidence_binding'->>'version' is distinct from 'campaign_lab_report_binding_v1'
    or selected_run.request->'evidence_binding' is distinct from selected_run.result->'evidence_binding'
    or selected_run.result is distinct from requested_result
    or (selected_run.retention_until is not null and selected_run.retention_until <= pg_catalog.statement_timestamp()) then
    raise exception using errcode='55000', message='bound_report_unavailable';
  end if;
  if requested_decision not in ('approved_experimental','rejected','revoked')
    or requested_decision is null or requested_rationale is null
    or pg_catalog.char_length(pg_catalog.btrim(requested_rationale)) not between 20 and 2000
    or requested_report_sha256 is null or requested_report_sha256 !~ '^[0-9a-f]{64}$'
    or requested_manifest_sha256 is null or requested_manifest_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023', message='invalid_report_review';
  end if;
  select * into existing from api.campaign_lab_report_reviews where run_id=requested_run_id order by (decision='revoked') desc, created_at desc limit 1;
  if found and not (requested_decision='revoked' and existing.decision='approved_experimental') then
    if existing.reviewer_id <> subject or existing.decision <> requested_decision
      or existing.rationale <> requested_rationale or existing.report_sha256 <> requested_report_sha256
      or existing.manifest_sha256 <> requested_manifest_sha256 then
      raise exception using errcode='23505', message='report_review_already_final';
    end if;
    return pg_catalog.to_jsonb(existing) || pg_catalog.jsonb_build_object('replayed',true);
  end if;
  if requested_decision='revoked' and existing.id is null then
    raise exception using errcode='55000', message='approved_report_required_for_revocation';
  end if;
  insert into api.campaign_lab_report_reviews(organization_id,campaign_id,run_id,reviewer_id,decision,rationale,report_sha256,manifest_sha256)
  values(selected_run.organization_id,selected_run.campaign_id,requested_run_id,subject,requested_decision,requested_rationale,requested_report_sha256,requested_manifest_sha256)
  returning * into created;
  insert into private.audit_events(organization_id,actor_type,actor_user_id,action,object_type,object_id,correlation_id,outcome,source_service,metadata)
  values(selected_run.organization_id,'user',subject,'campaign_lab.report_reviewed','campaign_lab_run',requested_run_id,requested_correlation_id,'success','api',pg_catalog.jsonb_build_object('decision',requested_decision,'manifest_sha256',requested_manifest_sha256));
  return pg_catalog.to_jsonb(created) || pg_catalog.jsonb_build_object('replayed',false);
end
$function$;

create function api.review_campaign_lab_bound_report(
  requested_run_id uuid, requested_decision text, requested_rationale text,
  requested_result jsonb, requested_report_sha256 text, requested_manifest_sha256 text,
  requested_correlation_id uuid
) returns jsonb language sql security invoker set search_path = ''
as $function$
  select private.review_campaign_lab_bound_report_atomic(requested_run_id,requested_decision,requested_rationale,requested_result,requested_report_sha256,requested_manifest_sha256,requested_correlation_id);
$function$;
revoke all on function private.review_campaign_lab_bound_report_atomic(uuid,text,text,jsonb,text,text,uuid) from public,anon,authenticated,simula_worker,simula_api;
revoke all on function api.review_campaign_lab_bound_report(uuid,text,text,jsonb,text,text,uuid) from public,anon,authenticated,simula_worker,simula_api;
grant execute on function private.review_campaign_lab_bound_report_atomic(uuid,text,text,jsonb,text,text,uuid) to simula_api;
grant execute on function api.review_campaign_lab_bound_report(uuid,text,text,jsonb,text,text,uuid) to simula_api;
reset role;
set role postgres;
revoke create on schema api, private from simula_command_owner;
-- Hosted migration history is written by postgres after this script returns.
