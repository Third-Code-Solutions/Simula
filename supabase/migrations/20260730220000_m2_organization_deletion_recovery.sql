-- Crash-safe background recovery for pending organization deletions.
--
-- External cleanup is decomposed into durable, independently leased resource
-- rows. The worker can retry storage, BullMQ, and Redis cleanup without user
-- claims. PostgreSQL remains the final authority and cascades only after every
-- resource row is completed.

alter table private.organization_deletion_requests
  drop constraint organization_deletion_requests_manifest_valid;

alter table private.organization_deletion_requests
  add constraint organization_deletion_requests_manifest_valid check (
    pg_catalog.jsonb_typeof(resource_manifest) = 'object'
    and resource_manifest ?& array['run_ids', 'storage_objects']
    and resource_manifest - array['run_ids', 'storage_objects'] = '{}'::jsonb
    and pg_catalog.jsonb_typeof(resource_manifest -> 'run_ids') = 'array'
    and pg_catalog.jsonb_typeof(resource_manifest -> 'storage_objects') = 'array'
    and pg_catalog.jsonb_array_length(resource_manifest -> 'run_ids') <= 10000
    and pg_catalog.jsonb_array_length(
      resource_manifest -> 'storage_objects'
    ) <= 10000
    and (
      pg_catalog.jsonb_array_length(resource_manifest -> 'run_ids')
      + pg_catalog.jsonb_array_length(resource_manifest -> 'storage_objects')
    ) <= 10000
  );

create table private.organization_deletion_resources (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  request_id uuid not null
    references private.organization_deletion_requests(id) on delete cascade,
  organization_id uuid not null,
  resource_kind text not null,
  resource_key text not null,
  status text not null default 'pending',
  cleanup_attempt_count integer not null default 0,
  cleanup_claim_token uuid,
  cleanup_claim_expires_at timestamptz,
  next_attempt_at timestamptz not null
    default pg_catalog.statement_timestamp(),
  last_error_code text,
  completed_at timestamptz,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint organization_deletion_resources_identity_unique
    unique (request_id, resource_kind, resource_key),
  constraint organization_deletion_resources_kind_valid check (
    resource_kind in ('storage_object', 'run', 'cache')
  ),
  constraint organization_deletion_resources_key_valid check (
    pg_catalog.length(resource_key) between 1 and 512
    and resource_key !~ '[\x00\r\n]'
    and (
      (
        resource_kind = 'run'
        and resource_key ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
      or (
        resource_kind = 'cache'
        and resource_key = organization_id::text
      )
      or (
        resource_kind = 'storage_object'
        and resource_key like organization_id::text || '/%'
        and resource_key ~ '^[0-9a-f/-]+$'
      )
    )
  ),
  constraint organization_deletion_resources_status_valid check (
    status in ('pending', 'completed')
  ),
  constraint organization_deletion_resources_attempt_valid check (
    cleanup_attempt_count between 0 and 10
  ),
  constraint organization_deletion_resources_error_valid check (
    last_error_code is null
    or last_error_code in (
      'storage_cleanup_failed',
      'queue_cleanup_failed',
      'cache_cleanup_failed'
    )
  ),
  constraint organization_deletion_resources_lifecycle_valid check (
    (
      status = 'pending'
      and completed_at is null
      and (
        (
          cleanup_claim_token is null
          and cleanup_claim_expires_at is null
        )
        or (
          cleanup_claim_token is not null
          and cleanup_claim_expires_at is not null
        )
      )
    )
    or (
      status = 'completed'
      and completed_at is not null
      and cleanup_claim_token is null
      and cleanup_claim_expires_at is null
      and last_error_code is null
    )
  )
);

create index organization_deletion_resources_claim_idx
on private.organization_deletion_resources (
  status,
  next_attempt_at,
  cleanup_claim_expires_at,
  created_at,
  id
);

alter table private.organization_deletion_resources enable row level security;
alter table private.organization_deletion_resources force row level security;

grant select, insert, update, delete
on table private.organization_deletion_resources
to simula_command_owner;

create policy organization_deletion_resources_command_insert
on private.organization_deletion_resources
for insert
to simula_command_owner
with check (
  exists (
    select 1
    from private.organization_deletion_requests as requests
    where requests.id = organization_deletion_resources.request_id
      and requests.organization_id =
        organization_deletion_resources.organization_id
      and requests.status = 'pending'
      and private.is_verified_api_subject(requests.actor_user_id)
  )
);

create policy organization_deletion_resources_command_delete
on private.organization_deletion_resources
for delete
to simula_command_owner
using (
  exists (
    select 1
    from private.organization_deletion_requests as requests
    where requests.id = organization_deletion_resources.request_id
      and (
        private.is_verified_api_subject(requests.actor_user_id)
        or session_user = 'simula_worker'
      )
  )
);

create policy organization_deletion_resources_worker_select
on private.organization_deletion_resources
for select
to simula_command_owner
using (session_user = 'simula_worker');

create policy organization_deletion_resources_worker_update
on private.organization_deletion_resources
for update
to simula_command_owner
using (session_user = 'simula_worker')
with check (session_user = 'simula_worker');

create policy organization_deletion_requests_worker_select
on private.organization_deletion_requests
for select
to simula_command_owner
using (session_user = 'simula_worker');

create policy organization_deletion_requests_worker_update
on private.organization_deletion_requests
for update
to simula_command_owner
using (session_user = 'simula_worker')
with check (session_user = 'simula_worker');

create policy organizations_command_select_for_worker_deletion
on api.organizations
for select
to simula_command_owner
using (
  session_user = 'simula_worker'
  and status = 'disabled'
  and exists (
    select 1
    from private.organization_deletion_requests as requests
    where requests.organization_id = organizations.id
      and requests.status = 'pending'
  )
);

create policy simulation_runs_command_select_for_worker_deletion
on api.simulation_runs
for select
to simula_command_owner
using (
  session_user = 'simula_worker'
  and exists (
    select 1
    from private.organization_deletion_requests as requests
    where requests.organization_id = simulation_runs.organization_id
      and requests.status = 'pending'
  )
);

create policy organizations_command_delete_after_worker_cleanup
on api.organizations
for delete
to simula_command_owner
using (
  status = 'disabled'
  and session_user = 'simula_worker'
  and exists (
    select 1
    from private.organization_deletion_requests as requests
    where requests.organization_id = organizations.id
      and requests.status = 'pending'
      and not exists (
        select 1
        from private.organization_deletion_resources as resources
        where resources.request_id = requests.id
          and resources.status <> 'completed'
      )
  )
);

grant create on schema private to simula_command_owner;
grant trigger on table private.organization_deletion_requests
to simula_command_owner;
set role simula_command_owner;

create function private.seed_organization_deletion_resources()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  if new.status <> 'pending' then
    return new;
  end if;

  insert into private.organization_deletion_resources (
    request_id,
    organization_id,
    resource_kind,
    resource_key
  )
  values (
    new.id,
    new.organization_id,
    'cache',
    new.organization_id::text
  );

  insert into private.organization_deletion_resources (
    request_id,
    organization_id,
    resource_kind,
    resource_key
  )
  select
    new.id,
    new.organization_id,
    'run',
    resources.value
  from pg_catalog.jsonb_array_elements_text(
    new.resource_manifest -> 'run_ids'
  ) as resources(value);

  insert into private.organization_deletion_resources (
    request_id,
    organization_id,
    resource_kind,
    resource_key
  )
  select
    new.id,
    new.organization_id,
    'storage_object',
    resources.value
  from pg_catalog.jsonb_array_elements_text(
    new.resource_manifest -> 'storage_objects'
  ) as resources(value);

  return new;
end
$function$;

create trigger seed_organization_deletion_resources
after insert on private.organization_deletion_requests
for each row
execute function private.seed_organization_deletion_resources();

create function private.purge_completed_organization_deletion_resources()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  if old.status = 'pending' and new.status = 'completed' then
    delete from private.organization_deletion_resources
    where request_id = new.id;
  end if;
  return new;
end
$function$;

create trigger purge_completed_organization_deletion_resources
after update of status on private.organization_deletion_requests
for each row
when (old.status is distinct from new.status)
execute function private.purge_completed_organization_deletion_resources();

create function private.claim_organization_deletion_resources(
  requested_batch_size integer
)
returns table (
  resource_id uuid,
  request_id uuid,
  organization_id uuid,
  resource_kind text,
  resource_key text,
  claim_token uuid,
  claim_expires_at timestamptz,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  if session_user <> 'simula_worker'
    or requested_batch_size is null
    or requested_batch_size < 1
    or requested_batch_size > 50 then
    raise exception using
      errcode = '22023',
      message = 'invalid_organization_deletion_claim';
  end if;

  return query
  with candidates as (
    select resources.id
    from private.organization_deletion_resources as resources
    join private.organization_deletion_requests as requests
      on requests.id = resources.request_id
    join api.organizations as organizations
      on organizations.id = resources.organization_id
    where resources.status = 'pending'
      and resources.cleanup_attempt_count < 10
      and resources.next_attempt_at <= pg_catalog.statement_timestamp()
      and (
        resources.cleanup_claim_expires_at is null
        or resources.cleanup_claim_expires_at
          <= pg_catalog.statement_timestamp()
      )
      and requests.status = 'pending'
      and organizations.status = 'disabled'
    order by resources.next_attempt_at, resources.created_at, resources.id
    for update of resources skip locked
    limit requested_batch_size
  ),
  claimed as (
    update private.organization_deletion_resources as resources
    set cleanup_attempt_count = resources.cleanup_attempt_count + 1,
        cleanup_claim_token = pg_catalog.gen_random_uuid(),
        cleanup_claim_expires_at =
          pg_catalog.statement_timestamp() + interval '15 minutes',
        last_error_code = null
    from candidates
    where resources.id = candidates.id
    returning resources.*
  )
  select
    claimed.id,
    claimed.request_id,
    claimed.organization_id,
    claimed.resource_kind,
    claimed.resource_key,
    claimed.cleanup_claim_token,
    claimed.cleanup_claim_expires_at,
    claimed.cleanup_attempt_count
  from claimed
  order by claimed.created_at, claimed.id;
end
$function$;

create function private.complete_organization_deletion_resource(
  requested_resource_id uuid,
  requested_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  changed boolean;
begin
  if session_user <> 'simula_worker'
    or requested_resource_id is null
    or requested_claim_token is null then
    raise exception using
      errcode = '22023',
      message = 'invalid_organization_deletion_completion';
  end if;

  update private.organization_deletion_resources
  set status = 'completed',
      cleanup_claim_token = null,
      cleanup_claim_expires_at = null,
      last_error_code = null,
      completed_at = pg_catalog.statement_timestamp()
  where id = requested_resource_id
    and status = 'pending'
    and cleanup_claim_token = requested_claim_token
    and cleanup_claim_expires_at > pg_catalog.statement_timestamp();
  changed := found;
  return changed;
end
$function$;

create function private.release_organization_deletion_resource(
  requested_resource_id uuid,
  requested_claim_token uuid,
  requested_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  changed boolean;
begin
  if session_user <> 'simula_worker'
    or requested_resource_id is null
    or requested_claim_token is null
    or requested_error_code not in (
      'storage_cleanup_failed',
      'queue_cleanup_failed',
      'cache_cleanup_failed'
    ) then
    raise exception using
      errcode = '22023',
      message = 'invalid_organization_deletion_release';
  end if;

  update private.organization_deletion_resources
  set cleanup_claim_token = null,
      cleanup_claim_expires_at = null,
      last_error_code = requested_error_code,
      next_attempt_at = pg_catalog.statement_timestamp()
        + pg_catalog.make_interval(
          secs => least(
            300,
            (
              5 * pg_catalog.power(
                2,
                greatest(cleanup_attempt_count - 1, 0)
              )
            )::integer
          )
        )
  where id = requested_resource_id
    and status = 'pending'
    and cleanup_claim_token = requested_claim_token;
  changed := found;
  return changed;
end
$function$;

create function private.finalize_ready_organization_deletions(
  requested_batch_size integer
)
returns integer
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  selected_request private.organization_deletion_requests%rowtype;
  finalized_count integer := 0;
begin
  if session_user <> 'simula_worker'
    or requested_batch_size is null
    or requested_batch_size < 1
    or requested_batch_size > 50 then
    raise exception using
      errcode = '22023',
      message = 'invalid_organization_deletion_finalization';
  end if;

  for selected_request in
    select requests.*
    from private.organization_deletion_requests as requests
    join api.organizations as organizations
      on organizations.id = requests.organization_id
    where requests.status = 'pending'
      and organizations.status = 'disabled'
      and exists (
        select 1
        from private.organization_deletion_resources as resources
        where resources.request_id = requests.id
      )
      and not exists (
        select 1
        from private.organization_deletion_resources as resources
        where resources.request_id = requests.id
          and resources.status <> 'completed'
      )
    order by requests.requested_at, requests.id
    for update of requests skip locked
    limit requested_batch_size
  loop
    if exists (
      select 1
      from api.simulation_runs as runs
      where runs.organization_id = selected_request.organization_id
        and runs.state in (
          'queued',
          'running',
          'retrying',
          'cancel_requested'
        )
    ) then
      continue;
    end if;

    delete from api.organizations
    where id = selected_request.organization_id
      and status = 'disabled';
    if not found then
      continue;
    end if;

    update private.organization_deletion_requests
    set status = 'completed',
        resource_manifest = pg_catalog.jsonb_build_object(
          'run_ids', '[]'::jsonb,
          'storage_objects', '[]'::jsonb
        ),
        completed_at = pg_catalog.statement_timestamp()
    where id = selected_request.id;
    finalized_count := finalized_count + 1;
  end loop;

  return finalized_count;
end
$function$;

reset role;
revoke create on schema private from simula_command_owner;
revoke trigger on table private.organization_deletion_requests
from simula_command_owner;

insert into private.organization_deletion_resources (
  request_id,
  organization_id,
  resource_kind,
  resource_key
)
select
  requests.id,
  requests.organization_id,
  'cache',
  requests.organization_id::text
from private.organization_deletion_requests as requests
where requests.status = 'pending'
on conflict do nothing;

insert into private.organization_deletion_resources (
  request_id,
  organization_id,
  resource_kind,
  resource_key
)
select
  requests.id,
  requests.organization_id,
  'run',
  resources.value
from private.organization_deletion_requests as requests
cross join lateral pg_catalog.jsonb_array_elements_text(
  requests.resource_manifest -> 'run_ids'
) as resources(value)
where requests.status = 'pending'
on conflict do nothing;

insert into private.organization_deletion_resources (
  request_id,
  organization_id,
  resource_kind,
  resource_key
)
select
  requests.id,
  requests.organization_id,
  'storage_object',
  resources.value
from private.organization_deletion_requests as requests
cross join lateral pg_catalog.jsonb_array_elements_text(
  requests.resource_manifest -> 'storage_objects'
) as resources(value)
where requests.status = 'pending'
on conflict do nothing;

revoke all on table private.organization_deletion_resources
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner;

revoke all on function private.seed_organization_deletion_resources()
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function private.purge_completed_organization_deletion_resources()
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function private.claim_organization_deletion_resources(integer)
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function private.complete_organization_deletion_resource(
  uuid, uuid
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function private.release_organization_deletion_resource(
  uuid, uuid, text
) from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;
revoke all on function private.finalize_ready_organization_deletions(integer)
from public, anon, authenticated, simula_api, simula_worker,
  simula_worker_owner, postgres;

grant execute on function private.claim_organization_deletion_resources(integer)
to simula_worker;
grant execute on function private.complete_organization_deletion_resource(
  uuid, uuid
) to simula_worker;
grant execute on function private.release_organization_deletion_resource(
  uuid, uuid, text
) to simula_worker;
grant execute on function private.finalize_ready_organization_deletions(integer)
to simula_worker;

revoke all on all sequences in schema api, private
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner;
