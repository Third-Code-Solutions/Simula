-- Enforce project-scoped historical outcomes and durable evidence retention.

set role postgres;

alter table api.campaign_evidence_runs
  add column retention_until timestamptz not null
    default (pg_catalog.statement_timestamp() + interval '90 days');

alter table api.campaign_evidence_runs
  add constraint campaign_evidence_runs_retention_valid
  check (retention_until > created_at);

create index campaign_evidence_runs_retention_idx
  on api.campaign_evidence_runs (retention_until, id)
  where status in ('completed', 'failed', 'canceled');

create function private.enforce_campaign_evidence_outcome_project_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  outcome_project_id uuid;
begin
  if new.outcome_set_id is not null then
    select outcomes.project_id into outcome_project_id
    from api.observed_outcome_sets as outcomes where outcomes.id = new.outcome_set_id;
    if outcome_project_id is distinct from new.project_id then
      raise exception using errcode = '23514', message = 'campaign_evidence_outcome_project_scope_invalid';
    end if;
  end if;
  return new;
end
$function$;

create trigger campaign_evidence_outcome_project_scope_guard
before insert or update of project_id, outcome_set_id
on api.campaign_evidence_runs
for each row execute function private.enforce_campaign_evidence_outcome_project_scope();

grant delete on table api.campaign_evidence_runs to simula_worker_owner;

create policy campaign_evidence_runs_worker_delete
on api.campaign_evidence_runs for delete to simula_worker_owner
using (
  status in ('completed', 'failed', 'canceled')
  and retention_until <= pg_catalog.statement_timestamp()
);

drop policy if exists audit_events_campaign_evidence_worker_insert
on private.audit_events;
create policy audit_events_campaign_evidence_worker_insert
on private.audit_events for insert to simula_worker_owner
with check (
  actor_type = 'worker'
  and actor_user_id is null
  and source_service = 'worker'
  and outcome in ('success', 'failure')
  and action in (
    'campaign_evidence.started',
    'campaign_evidence.completed',
    'campaign_evidence.failed',
    'campaign_evidence.canceled',
    'campaign_evidence.retention_deleted'
  )
);

grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create function private.expire_campaign_evidence_runs(requested_batch_size integer)
returns integer
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  candidate record;
  deleted_count integer := 0;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_batch_size is null or requested_batch_size not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_evidence_retention_batch_size';
  end if;
  for candidate in
    select runs.id, runs.organization_id, runs.kind
    from api.campaign_evidence_runs as runs
    where runs.status in ('completed', 'failed', 'canceled')
      and runs.retention_until <= pg_catalog.statement_timestamp()
    order by runs.retention_until, runs.created_at, runs.id
    for update skip locked
    limit requested_batch_size
  loop
    insert into private.audit_events (
      organization_id, actor_type, actor_user_id, action, object_type, object_id,
      correlation_id, outcome, source_service, metadata
    ) values (
      candidate.organization_id, 'worker', null, 'campaign_evidence.retention_deleted',
      'campaign_evidence_run', candidate.id, candidate.id, 'success', 'worker',
      pg_catalog.jsonb_build_object('kind', candidate.kind)
    );
    delete from private.campaign_evidence_secrets where run_id = candidate.id;
    delete from api.campaign_evidence_runs where id = candidate.id;
    deleted_count := deleted_count + 1;
  end loop;
  return deleted_count;
end
$function$;

set role simula_worker_owner;
revoke all on function private.expire_campaign_evidence_runs(integer)
from public, anon, authenticated, simula_api, simula_worker_owner, postgres;
grant execute on function private.expire_campaign_evidence_runs(integer)
to simula_worker;
set role postgres;
revoke create on schema private from simula_worker_owner;
