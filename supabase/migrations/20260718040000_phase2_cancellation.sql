-- P2-06 cancellation is a durable compare-and-set transition.  The API may
-- request cancellation, but only the worker terminalizes it and never deletes
-- or relabels an existing immutable result.

grant update on table api.simulation_runs to simula_command_owner;

create policy simulation_runs_command_cancel_update
on api.simulation_runs
for update
to simula_command_owner
using (
  state in ('queued', 'running', 'retrying', 'cancel_requested')
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
)
with check (
  state = 'cancel_requested'
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);

create policy run_events_command_cancel_insert
on private.run_events
for insert
to simula_command_owner
with check (
  actor_type = 'user'
  and actor_user_id = private.verified_subject()
  and private.is_verified_api_subject(actor_user_id)
  and previous_state in ('queued', 'running', 'retrying')
  and new_state = 'cancel_requested'
  and safe_reason = 'cancel_requested'
  and exists (
    select 1
    from api.simulation_runs as runs
    where runs.id = run_events.run_id
      and runs.organization_id = run_events.organization_id
      and runs.state = 'cancel_requested'
      and private.has_org_role(
        runs.organization_id,
        private.verified_subject(),
        array['owner', 'editor']::api.organization_role[]
      )
  )
);

create policy audit_events_command_cancel_insert
on private.audit_events
for insert
to simula_command_owner
with check (
  actor_type = 'user'
  and actor_user_id = private.verified_subject()
  and private.is_verified_api_subject(actor_user_id)
  and source_service = 'api'
  and outcome = 'success'
  and action = 'run.cancel_requested'
  and object_type = 'simulation_run'
  and object_id is not null
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);

grant create on schema private to simula_command_owner;
set role simula_command_owner;

create function private.request_run_cancel_atomic(
  requested_run_id uuid,
  requested_correlation_id uuid
)
returns table (
  run_id uuid,
  organization_id uuid,
  project_id uuid,
  stimulus_version_id uuid,
  audience_version_id uuid,
  run_state api.run_state,
  schema_version integer,
  dispatch_generation smallint,
  job_id text,
  run_version integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  subject uuid;
  selected_run api.simulation_runs%rowtype;
  previous_state api.run_state;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_run_id is null or requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_run_cancel_request';
  end if;

  select * into selected_run
  from api.simulation_runs as runs
  where runs.id = requested_run_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if not private.has_org_role(
    selected_run.organization_id,
    subject,
    array['owner', 'editor']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if selected_run.state not in ('succeeded', 'failed', 'canceled') then
    select * into selected_run
    from api.simulation_runs as runs
    where runs.id = requested_run_id
    for update;
    if not found then
      select * into selected_run
      from api.simulation_runs as runs
      where runs.id = requested_run_id;
      if not found then
        raise exception using errcode = '42501', message = 'forbidden';
      end if;
    end if;
  end if;

  if selected_run.state in ('queued', 'running', 'retrying') then
    previous_state := selected_run.state;
    update api.simulation_runs
    set state = 'cancel_requested',
        updated_at = pg_catalog.statement_timestamp(),
        version = version + 1
    where id = selected_run.id
    returning * into selected_run;

    insert into private.run_events (
      organization_id, run_id, previous_state, new_state, attempt_number,
      safe_reason, actor_type, actor_user_id, correlation_id
    ) values (
      selected_run.organization_id, selected_run.id, previous_state,
      'cancel_requested', nullif(selected_run.attempt_count, 0),
      'cancel_requested', 'user', subject, requested_correlation_id
    );
    insert into private.audit_events (
      organization_id, actor_type, actor_user_id, action, object_type,
      object_id, correlation_id, outcome, source_service, metadata
    ) values (
      selected_run.organization_id, 'user', subject, 'run.cancel_requested',
      'simulation_run', selected_run.id, requested_correlation_id, 'success',
      'api', pg_catalog.jsonb_build_object('previous_state', previous_state)
    );
  end if;

  return query
  select
    selected_run.id,
    selected_run.organization_id,
    selected_run.project_id,
    selected_run.stimulus_version_id,
    selected_run.audience_version_id,
    selected_run.state,
    selected_run.schema_version,
    selected_run.dispatch_generation,
    'run:' || selected_run.id::text || ':dispatch:' || selected_run.dispatch_generation::text,
    selected_run.version,
    selected_run.created_at;
end
$function$;

alter function private.request_run_cancel_atomic(uuid, uuid) owner to simula_command_owner;
revoke create on schema private from simula_command_owner;
reset role;

create function api.request_run_cancel(
  requested_run_id uuid,
  requested_correlation_id uuid
)
returns table (
  run_id uuid,
  organization_id uuid,
  project_id uuid,
  stimulus_version_id uuid,
  audience_version_id uuid,
  run_state api.run_state,
  schema_version integer,
  dispatch_generation smallint,
  job_id text,
  run_version integer,
  created_at timestamptz
)
language sql
security invoker
set search_path = ''
as $function$
  select * from private.request_run_cancel_atomic(
    requested_run_id,
    requested_correlation_id
  )
$function$;

revoke all on function api.request_run_cancel(uuid, uuid)
  from public, anon, authenticated, simula_worker;
grant execute on function api.request_run_cancel(uuid, uuid) to simula_api;

set role simula_command_owner;
revoke all on function private.request_run_cancel_atomic(uuid, uuid)
  from public, anon, authenticated, simula_worker;
grant execute on function private.request_run_cancel_atomic(uuid, uuid) to simula_api;
reset role;

grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create function private.finalize_requested_cancellations(requested_batch_size integer)
returns integer
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  selected_run api.simulation_runs%rowtype;
  finalized_count integer := 0;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_batch_size is null or requested_batch_size not between 1 and 20 then
    raise exception using errcode = '22023', message = 'invalid_cancel_batch_size';
  end if;

  for selected_run in
    select *
    from api.simulation_runs as runs
    where runs.state = 'cancel_requested'
      and (
        runs.worker_lease_expires_at is null
        or runs.worker_lease_expires_at <= pg_catalog.statement_timestamp()
      )
    order by runs.updated_at, runs.id
    for update skip locked
    limit requested_batch_size
  loop
    update private.run_outbox
    set status = 'terminal',
        claim_token = null,
        claim_expires_at = null,
        confirmed_at = null,
        terminal_error_code = 'canceled',
        updated_at = pg_catalog.statement_timestamp()
    where run_id = selected_run.id
      and status <> 'terminal';
    update api.simulation_runs
    set state = 'canceled',
        worker_lease_token = null,
        worker_lease_expires_at = null,
        terminal_at = pg_catalog.statement_timestamp(),
        updated_at = pg_catalog.statement_timestamp(),
        version = version + 1
    where id = selected_run.id;
    insert into private.run_events (
      organization_id, run_id, previous_state, new_state, attempt_number,
      safe_reason, actor_type, correlation_id
    ) values (
      selected_run.organization_id, selected_run.id, 'cancel_requested',
      'canceled', nullif(selected_run.attempt_count, 0),
      'canceled_before_execution', 'worker', selected_run.correlation_id
    );
    insert into private.audit_events (
      organization_id, actor_type, action, object_type, object_id,
      correlation_id, outcome, source_service, metadata
    ) values (
      selected_run.organization_id, 'worker', 'run.canceled', 'simulation_run',
      selected_run.id, selected_run.correlation_id, 'success', 'worker',
      pg_catalog.jsonb_build_object('reason', 'canceled_before_execution')
    );
    finalized_count := finalized_count + 1;
  end loop;
  return finalized_count;
end
$function$;

create or replace function private.claim_due_run_outbox(requested_batch_size integer)
returns table (
  outbox_id uuid,
  run_id uuid,
  generation smallint,
  job_id text,
  claim_token uuid,
  claim_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_batch_size is null or requested_batch_size not between 1 and 20 then
    raise exception using errcode = '22023', message = 'invalid_dispatch_batch_size';
  end if;

  return query
  with due as (
    select outbox.id
    from private.run_outbox as outbox
    where (
      (outbox.status = 'pending' and outbox.next_attempt_at <= pg_catalog.statement_timestamp())
      or (
        outbox.status = 'claimed'
        and outbox.claim_expires_at <= pg_catalog.statement_timestamp()
      )
    )
      and outbox.dispatch_attempt_count < 10
      and exists (
        select 1
        from api.simulation_runs as runs
        where runs.id = outbox.run_id
          and runs.state in ('queued', 'retrying')
      )
    order by outbox.next_attempt_at, outbox.created_at, outbox.id
    for update skip locked
    limit requested_batch_size
  ), claimed as (
    update private.run_outbox as outbox
    set status = 'claimed',
        claim_token = pg_catalog.gen_random_uuid(),
        claim_expires_at = pg_catalog.statement_timestamp() + interval '15 seconds',
        dispatch_attempt_count = outbox.dispatch_attempt_count + 1,
        updated_at = pg_catalog.statement_timestamp()
    from due
    where outbox.id = due.id
    returning
      outbox.id,
      outbox.run_id,
      outbox.generation,
      outbox.job_id,
      outbox.claim_token,
      outbox.claim_expires_at
  )
  select * from claimed;
end
$function$;

create or replace function private.complete_run_execution(
  requested_run_id uuid,
  requested_attempt_id uuid,
  requested_lease_token uuid,
  requested_artifact jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  selected_run api.simulation_runs%rowtype;
  selected_attempt private.run_attempts%rowtype;
  artifact_sha256 text;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  select * into selected_run from api.simulation_runs
  where id = requested_run_id for update;
  if not found
    or selected_run.worker_lease_token <> requested_lease_token
    or selected_run.worker_lease_expires_at <= pg_catalog.statement_timestamp() then
    return false;
  end if;
  select * into selected_attempt from private.run_attempts
  where id = requested_attempt_id and run_id = requested_run_id for update;
  if not found or selected_attempt.status <> 'running'
    or selected_attempt.lease_token <> requested_lease_token then
    return false;
  end if;

  if selected_run.state = 'cancel_requested' then
    update private.run_attempts
    set status = 'canceled',
        finished_at = pg_catalog.statement_timestamp(),
        safe_error_code = 'canceled_by_user'
    where id = selected_attempt.id;
    update private.run_outbox
    set status = 'terminal',
        claim_token = null,
        claim_expires_at = null,
        confirmed_at = null,
        terminal_error_code = 'canceled',
        updated_at = pg_catalog.statement_timestamp()
    where run_id = selected_run.id
      and status <> 'terminal';
    update api.simulation_runs
    set state = 'canceled',
        worker_lease_token = null,
        worker_lease_expires_at = null,
        terminal_at = pg_catalog.statement_timestamp(),
        updated_at = pg_catalog.statement_timestamp(),
        version = version + 1
    where id = selected_run.id;
    insert into private.run_events (
      organization_id, run_id, previous_state, new_state, attempt_number,
      safe_reason, actor_type, correlation_id
    ) values (
      selected_run.organization_id, selected_run.id, 'cancel_requested',
      'canceled', selected_attempt.attempt_number, 'canceled_by_user',
      'worker', selected_run.correlation_id
    );
    insert into private.audit_events (
      organization_id, actor_type, action, object_type, object_id,
      correlation_id, outcome, source_service, metadata
    ) values (
      selected_run.organization_id, 'worker', 'run.canceled', 'simulation_run',
      selected_run.id, selected_run.correlation_id, 'success', 'worker',
      pg_catalog.jsonb_build_object('reason', 'canceled_by_user')
    );
    return true;
  end if;

  if selected_run.state <> 'running'
    or requested_artifact is null
    or pg_catalog.jsonb_typeof(requested_artifact) <> 'object'
    or pg_catalog.octet_length(requested_artifact::text) > 131072
    or requested_artifact ->> 'schema_version' <> '1.0.0'
    or requested_artifact ->> 'run_id' <> requested_run_id::text then
    raise exception using errcode = '22023', message = 'invalid_result_contract';
  end if;
  perform 1 from api.simulation_results where run_id = requested_run_id;
  if found then
    return false;
  end if;
  artifact_sha256 := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(requested_artifact::text, 'UTF8'), 'sha256'),
    'hex'
  );
  insert into api.simulation_results (
    organization_id, run_id, schema_version, artifact, artifact_sha256
  ) values (
    selected_run.organization_id, selected_run.id, 1, requested_artifact, artifact_sha256
  );
  update private.run_attempts
  set status = 'succeeded', finished_at = pg_catalog.statement_timestamp()
  where id = selected_attempt.id;
  update api.simulation_runs
  set state = 'succeeded', worker_lease_token = null, worker_lease_expires_at = null,
      terminal_at = pg_catalog.statement_timestamp(),
      updated_at = pg_catalog.statement_timestamp(), version = version + 1
  where id = selected_run.id;
  insert into private.run_events (
    organization_id, run_id, previous_state, new_state, attempt_number,
    safe_reason, actor_type, correlation_id
  ) values (
    selected_run.organization_id, selected_run.id, 'running', 'succeeded',
    selected_attempt.attempt_number, 'completed', 'worker', selected_run.correlation_id
  );
  insert into private.audit_events (
    organization_id, actor_type, action, object_type, object_id,
    correlation_id, outcome, source_service, metadata
  ) values (
    selected_run.organization_id, 'worker', 'run.completed', 'simulation_run',
    selected_run.id, selected_run.correlation_id, 'success', 'worker',
    pg_catalog.jsonb_build_object('artifact_sha256', artifact_sha256)
  );
  return true;
end
$function$;

create or replace function private.fail_run_execution(
  requested_run_id uuid,
  requested_attempt_id uuid,
  requested_lease_token uuid,
  requested_safe_error_code text,
  requested_retryable boolean
)
returns text
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  selected_run api.simulation_runs%rowtype;
  selected_attempt private.run_attempts%rowtype;
  next_state api.run_state;
  recorded_safe_error_code text;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_safe_error_code is null
    or requested_safe_error_code !~ '^[a-z][a-z0-9_]{0,63}$'
    or requested_retryable is null then
    raise exception using errcode = '22023', message = 'invalid_run_failure';
  end if;
  select * into selected_run from api.simulation_runs
  where id = requested_run_id for update;
  if not found then
    return 'no_work';
  end if;
  select * into selected_attempt from private.run_attempts
  where id = requested_attempt_id and run_id = requested_run_id for update;
  if not found or selected_attempt.status <> 'running'
    or selected_attempt.lease_token <> requested_lease_token
    or selected_run.worker_lease_token <> requested_lease_token then
    return 'no_work';
  end if;

  if selected_run.state = 'cancel_requested' then
    next_state := 'canceled';
    recorded_safe_error_code := 'canceled_by_user';
  elsif selected_run.state = 'running'
    and requested_retryable
    and selected_run.attempt_count < 3 then
    next_state := 'retrying';
    recorded_safe_error_code := requested_safe_error_code;
  elsif selected_run.state in ('running', 'retrying') then
    next_state := 'failed';
    recorded_safe_error_code := requested_safe_error_code;
  else
    return 'no_work';
  end if;

  update private.run_attempts
  set status = case
        when next_state = 'retrying' then 'retrying'::private.attempt_status
        when next_state = 'canceled' then 'canceled'::private.attempt_status
        else 'failed'::private.attempt_status
      end,
      finished_at = pg_catalog.statement_timestamp(),
      safe_error_code = recorded_safe_error_code
  where id = selected_attempt.id;
  update api.simulation_runs
  set state = next_state,
      worker_lease_token = null,
      worker_lease_expires_at = null,
      terminal_at = case when next_state in ('canceled', 'failed')
        then pg_catalog.statement_timestamp() else null end,
      updated_at = pg_catalog.statement_timestamp(),
      version = version + 1
  where id = selected_run.id;
  if next_state = 'canceled' then
    update private.run_outbox
    set status = 'terminal',
        claim_token = null,
        claim_expires_at = null,
        confirmed_at = null,
        terminal_error_code = 'canceled',
        updated_at = pg_catalog.statement_timestamp()
    where run_id = selected_run.id
      and status <> 'terminal';
  end if;
  insert into private.run_events (
    organization_id, run_id, previous_state, new_state, attempt_number,
    safe_reason, actor_type, correlation_id
  ) values (
    selected_run.organization_id, selected_run.id, selected_run.state, next_state,
    selected_attempt.attempt_number, recorded_safe_error_code, 'worker',
    selected_run.correlation_id
  );
  insert into private.audit_events (
    organization_id, actor_type, action, object_type, object_id,
    correlation_id, outcome, source_service, metadata
  ) values (
    selected_run.organization_id, 'worker',
    case when next_state = 'canceled' then 'run.canceled' else 'run.failed' end,
    'simulation_run', selected_run.id, selected_run.correlation_id, 'success', 'worker',
    pg_catalog.jsonb_build_object(
      'safe_error_code', recorded_safe_error_code,
      'next_state', next_state
    )
  );
  return next_state::text;
end
$function$;

alter function private.finalize_requested_cancellations(integer) owner to simula_worker_owner;
alter function private.claim_due_run_outbox(integer) owner to simula_worker_owner;
alter function private.complete_run_execution(uuid, uuid, uuid, jsonb) owner to simula_worker_owner;
alter function private.fail_run_execution(uuid, uuid, uuid, text, boolean)
  owner to simula_worker_owner;
revoke create on schema private from simula_worker_owner;

revoke all on function private.finalize_requested_cancellations(integer)
  from public, anon, authenticated, simula_api, simula_command_owner;
grant execute on function private.finalize_requested_cancellations(integer)
  to simula_worker;
revoke all on function private.claim_due_run_outbox(integer)
  from public, anon, authenticated, simula_api, simula_command_owner;
grant execute on function private.claim_due_run_outbox(integer) to simula_worker;
revoke all on function private.complete_run_execution(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, simula_api, simula_command_owner;
grant execute on function private.complete_run_execution(uuid, uuid, uuid, jsonb)
  to simula_worker;
revoke all on function private.fail_run_execution(uuid, uuid, uuid, text, boolean)
  from public, anon, authenticated, simula_api, simula_command_owner;
grant execute on function private.fail_run_execution(uuid, uuid, uuid, text, boolean)
  to simula_worker;
reset role;
