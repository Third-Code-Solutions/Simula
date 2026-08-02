-- Finish a running evidence lease after an authorized cancellation request.
-- The worker never reveals or retains held-out outcomes after this transition.

set role postgres;

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
    'campaign_evidence.canceled'
  )
);

grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create function private.finalize_canceled_campaign_evidence_run(
  requested_run_id uuid,
  requested_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  canceled_run api.campaign_evidence_runs%rowtype;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  update api.campaign_evidence_runs
  set status = 'canceled', stage = 'canceled', progress = least(progress, 99),
      completed_at = pg_catalog.statement_timestamp(),
      lease_token = null, lease_expires_at = null
  where id = requested_run_id
    and lease_token = requested_lease_token
    and status = 'cancel_requested'
  returning * into canceled_run;
  if not found then return false; end if;
  delete from private.campaign_evidence_secrets where run_id = canceled_run.id;
  insert into api.campaign_evidence_events (
    organization_id, run_id, stage, progress, event_kind, message
  ) values (
    canceled_run.organization_id, canceled_run.id, 'canceled', canceled_run.progress,
    'canceled', 'Evidence job canceled before evaluation completed.'
  );
  insert into private.audit_events (
    organization_id, actor_type, actor_user_id, action, object_type, object_id,
    correlation_id, outcome, source_service, metadata
  ) values (
    canceled_run.organization_id, 'worker', null, 'campaign_evidence.canceled',
    'campaign_evidence_run', canceled_run.id, canceled_run.id, 'success', 'worker',
    pg_catalog.jsonb_build_object('kind', canceled_run.kind)
  );
  return true;
end
$function$;

set role simula_worker_owner;
revoke create on schema private from simula_worker_owner;
revoke all on function private.finalize_canceled_campaign_evidence_run(uuid, uuid)
from public, anon, authenticated, simula_api, simula_worker_owner, postgres;
grant execute on function private.finalize_canceled_campaign_evidence_run(uuid, uuid)
to simula_worker;
set role postgres;
