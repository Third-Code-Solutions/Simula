-- P2-03: tenant-scoped project and immutable stimulus commands.
-- Browser roles remain unable to reach application schemas. simula_api keeps
-- SELECT-only table access and may mutate only through these complete helpers.

alter table private.idempotency_keys
  drop constraint idempotency_keys_actor_scope_key_unique,
  drop constraint idempotency_keys_response_complete,
  add column scope_organization_id uuid
    references api.organizations (id) on delete cascade,
  add column scope_resource_id uuid,
  add constraint idempotency_keys_response_complete check (
    (organization_id is null and scope_organization_id is null
      and scope_resource_id is null
      and resource_id is null and response is null)
    or (organization_id is not null
      and resource_id is null and response is null)
    or (organization_id is not null
      and resource_id is not null and response is not null)
  ),
  add constraint idempotency_keys_scope_organization_consistent check (
    (scope = 'organization.create' and scope_organization_id is null)
    or (
      scope <> 'organization.create'
      and scope_organization_id is not null
      and scope_organization_id = organization_id
    )
  );

create unique index idempotency_keys_tenant_scope_key_unique
  on private.idempotency_keys (
    actor_user_id,
    coalesce(
      scope_organization_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    ),
    coalesce(
      scope_resource_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    ),
    scope,
    idempotency_key
  );

drop policy idempotency_keys_command_select on private.idempotency_keys;
drop policy idempotency_keys_command_insert on private.idempotency_keys;
drop policy idempotency_keys_command_update on private.idempotency_keys;
drop policy audit_events_command_insert on private.audit_events;

create policy projects_command_select
on api.projects
for select
to simula_command_owner
using (private.is_org_member(organization_id, private.verified_subject()));

create policy projects_command_insert
on api.projects
for insert
to simula_command_owner
with check (
  private.is_verified_api_subject(created_by)
  and private.is_verified_api_subject(updated_by)
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);

create policy projects_command_update
on api.projects
for update
to simula_command_owner
using (
  private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
)
with check (
  private.is_verified_api_subject(updated_by)
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);

create policy stimuli_command_select
on api.stimuli
for select
to simula_command_owner
using (private.is_org_member(organization_id, private.verified_subject()));

create policy stimuli_command_insert
on api.stimuli
for insert
to simula_command_owner
with check (
  private.is_verified_api_subject(created_by)
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);

create policy stimulus_versions_command_select
on api.stimulus_versions
for select
to simula_command_owner
using (private.is_org_member(organization_id, private.verified_subject()));

create policy stimulus_versions_command_insert
on api.stimulus_versions
for insert
to simula_command_owner
with check (
  private.is_verified_api_subject(created_by)
  and private.has_org_role(
    organization_id,
    private.verified_subject(),
    array['owner', 'editor']::api.organization_role[]
  )
);

create policy idempotency_keys_command_select
on private.idempotency_keys
for select
to simula_command_owner
using (
  private.is_verified_api_subject(actor_user_id)
  and (
    (scope = 'organization.create' and scope_resource_id is null)
    or (
      scope in ('project.create', 'stimulus.create', 'stimulus.version.append')
      and scope_organization_id is not null
      and private.has_org_role(
        scope_organization_id,
        private.verified_subject(),
        array['owner', 'editor']::api.organization_role[]
      )
    )
  )
);

create policy idempotency_keys_command_insert
on private.idempotency_keys
for insert
to simula_command_owner
with check (
  private.is_verified_api_subject(actor_user_id)
  and (
    (
      scope = 'organization.create'
      and scope_organization_id is null
      and scope_resource_id is null
    )
    or (
      scope in ('project.create', 'stimulus.create', 'stimulus.version.append')
      and scope_organization_id is not null
      and organization_id = scope_organization_id
      and private.has_org_role(
        scope_organization_id,
        private.verified_subject(),
        array['owner', 'editor']::api.organization_role[]
      )
    )
  )
);

create policy idempotency_keys_command_update
on private.idempotency_keys
for update
to simula_command_owner
using (
  private.is_verified_api_subject(actor_user_id)
  and (
    scope = 'organization.create'
    or (
      scope in ('project.create', 'stimulus.create', 'stimulus.version.append')
      and scope_organization_id is not null
      and private.has_org_role(
        scope_organization_id,
        private.verified_subject(),
        array['owner', 'editor']::api.organization_role[]
      )
    )
  )
)
with check (
  private.is_verified_api_subject(actor_user_id)
  and organization_id is not null
  and resource_id is not null
  and response is not null
  and (
    scope = 'organization.create'
    or (
      scope in ('project.create', 'stimulus.create', 'stimulus.version.append')
      and scope_organization_id = organization_id
      and private.has_org_role(
        scope_organization_id,
        private.verified_subject(),
        array['owner', 'editor']::api.organization_role[]
      )
    )
  )
);

create policy audit_events_command_insert
on private.audit_events
for insert
to simula_command_owner
with check (
  actor_type = 'user'
  and private.is_verified_api_subject(actor_user_id)
  and (
    (
      action = 'organization.created'
      and object_type = 'organization'
      and organization_id = object_id
    )
    or (
      action in (
        'project.created',
        'project.updated',
        'stimulus.created',
        'stimulus.version_appended'
      )
      and private.has_org_role(
        organization_id,
        private.verified_subject(),
        array['owner', 'editor']::api.organization_role[]
      )
    )
  )
);

grant select, insert, update on table api.projects to simula_command_owner;
grant select, insert on table api.stimuli to simula_command_owner;
grant select, insert on table api.stimulus_versions to simula_command_owner;

-- The M1 helper used a three-column conflict target. P2-03 expands scope to
-- organization and route-resource identity, so replace it with an untargeted
-- conflict guard backed by the exact expression index above.
grant create on schema private to simula_command_owner;
set role simula_command_owner;
create or replace function private.create_organization_atomic(
  requested_name text,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns table (
  organization_id uuid,
  organization_name text,
  membership_role api.organization_role,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  subject uuid;
  normalized_name text;
  idempotency_id uuid;
  existing_sha256 text;
  existing_response jsonb;
  created_organization_id uuid;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  normalized_name := pg_catalog.btrim(requested_name);
  if normalized_name is null
    or pg_catalog.char_length(normalized_name) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'invalid_organization_name';
  end if;
  if requested_idempotency_key is null
    or requested_idempotency_key !~ '^[ -~]{16,128}$' then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;
  if requested_sha256 is null or requested_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_request_hash';
  end if;
  if requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_correlation_id';
  end if;

  insert into private.idempotency_keys (
    actor_user_id,
    scope,
    idempotency_key,
    request_sha256
  )
  values (
    subject,
    'organization.create',
    requested_idempotency_key,
    requested_sha256
  )
  on conflict do nothing
  returning id into idempotency_id;

  if idempotency_id is null then
    select keys.request_sha256, keys.response
      into existing_sha256, existing_response
      from private.idempotency_keys as keys
      where keys.actor_user_id = subject
        and keys.scope_organization_id is null
        and keys.scope_resource_id is null
        and keys.scope = 'organization.create'
        and keys.idempotency_key = requested_idempotency_key
      for update;

    if not found or existing_response is null then
      raise exception using errcode = '55000', message = 'idempotency_state_incomplete';
    end if;
    if existing_sha256 <> requested_sha256 then
      raise exception using errcode = '22000', message = 'idempotency_key_reused';
    end if;

    return query
    select
      (existing_response ->> 'organization_id')::uuid,
      existing_response ->> 'name',
      (existing_response ->> 'role')::api.organization_role,
      true;
    return;
  end if;

  created_organization_id := pg_catalog.gen_random_uuid();
  insert into api.organizations (id, name, created_by)
  values (created_organization_id, normalized_name, subject);

  insert into api.organization_memberships (
    organization_id,
    user_id,
    role,
    created_by
  )
  values (created_organization_id, subject, 'owner', subject);

  response_payload := pg_catalog.jsonb_build_object(
    'name', normalized_name,
    'organization_id', created_organization_id,
    'role', 'owner'
  );

  update private.idempotency_keys
    set organization_id = created_organization_id,
        resource_id = created_organization_id,
        response = response_payload
    where id = idempotency_id;

  insert into private.audit_events (
    organization_id,
    actor_type,
    actor_user_id,
    action,
    object_type,
    object_id,
    correlation_id,
    metadata
  )
  values (
    created_organization_id,
    'user',
    subject,
    'organization.created',
    'organization',
    created_organization_id,
    requested_correlation_id,
    pg_catalog.jsonb_build_object('idempotency_scope', 'organization.create')
  );

  return query
  select created_organization_id, normalized_name, 'owner'::api.organization_role, false;
end
$function$;
reset role;

create function private.create_project_atomic(
  requested_organization_id uuid,
  requested_name text,
  requested_objective text,
  requested_market text,
  requested_language text,
  requested_category text,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns table (
  project_id uuid,
  organization_id uuid,
  project_name text,
  objective text,
  market text,
  language text,
  category text,
  project_status api.project_status,
  project_version integer,
  created_at timestamptz,
  updated_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  subject uuid;
  normalized_name text;
  idempotency_id uuid;
  existing_sha256 text;
  existing_response jsonb;
  created_project api.projects%rowtype;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_organization_id is null
    or not private.is_org_member(requested_organization_id, subject) then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if not private.has_org_role(
    requested_organization_id,
    subject,
    array['owner', 'editor']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  normalized_name := pg_catalog.btrim(requested_name);
  if normalized_name is null
    or pg_catalog.char_length(normalized_name) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'invalid_project_name';
  end if;
  if requested_objective is null
    or pg_catalog.char_length(requested_objective) not between 1 and 1000
    or pg_catalog.btrim(requested_objective) = '' then
    raise exception using errcode = '22023', message = 'invalid_project_objective';
  end if;
  if requested_market <> 'philippines'
    or requested_language <> 'en'
    or requested_category <> 'campaign_message' then
    raise exception using errcode = '22023', message = 'unsupported_scope';
  end if;
  if requested_idempotency_key is null
    or requested_idempotency_key !~ '^[ -~]{16,128}$' then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;
  if requested_sha256 is null or requested_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_request_hash';
  end if;
  if requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_correlation_id';
  end if;

  insert into private.idempotency_keys (
    actor_user_id,
    scope,
    idempotency_key,
    request_sha256,
    organization_id,
    scope_organization_id
  )
  values (
    subject,
    'project.create',
    requested_idempotency_key,
    requested_sha256,
    requested_organization_id,
    requested_organization_id
  )
  on conflict do nothing
  returning id into idempotency_id;

  if idempotency_id is null then
    select keys.request_sha256, keys.response
      into existing_sha256, existing_response
      from private.idempotency_keys as keys
      where keys.actor_user_id = subject
        and keys.scope_organization_id = requested_organization_id
        and keys.scope_resource_id is null
        and keys.scope = 'project.create'
        and keys.idempotency_key = requested_idempotency_key
      for update;
    if not found or existing_response is null then
      raise exception using errcode = '55000', message = 'idempotency_state_incomplete';
    end if;
    if existing_sha256 <> requested_sha256 then
      raise exception using errcode = '22000', message = 'idempotency_key_reused';
    end if;

    return query
    select
      (existing_response ->> 'project_id')::uuid,
      (existing_response ->> 'organization_id')::uuid,
      existing_response ->> 'name',
      existing_response ->> 'objective',
      existing_response ->> 'market',
      existing_response ->> 'language',
      existing_response ->> 'category',
      (existing_response ->> 'status')::api.project_status,
      (existing_response ->> 'version')::integer,
      (existing_response ->> 'created_at')::timestamptz,
      (existing_response ->> 'updated_at')::timestamptz,
      true;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('organization-projects:' || requested_organization_id::text, 0)
  );
  if (
    select pg_catalog.count(*)
    from api.projects as projects
    where projects.organization_id = requested_organization_id
      and projects.status = 'active'
  ) >= 25 then
    raise exception using errcode = '54000', message = 'quota_exceeded';
  end if;

  insert into api.projects (
    organization_id,
    name,
    objective,
    market,
    language,
    category,
    created_by,
    updated_by
  )
  values (
    requested_organization_id,
    normalized_name,
    requested_objective,
    requested_market,
    requested_language,
    requested_category,
    subject,
    subject
  )
  returning * into created_project;

  response_payload := pg_catalog.jsonb_build_object(
    'project_id', created_project.id,
    'organization_id', created_project.organization_id,
    'name', created_project.name,
    'objective', created_project.objective,
    'market', created_project.market,
    'language', created_project.language,
    'category', created_project.category,
    'status', created_project.status,
    'version', created_project.version,
    'created_at', created_project.created_at,
    'updated_at', created_project.updated_at
  );

  update private.idempotency_keys
    set resource_id = created_project.id,
        response = response_payload
    where id = idempotency_id;

  insert into private.audit_events (
    organization_id,
    actor_type,
    actor_user_id,
    action,
    object_type,
    object_id,
    correlation_id,
    metadata
  )
  values (
    created_project.organization_id,
    'user',
    subject,
    'project.created',
    'project',
    created_project.id,
    requested_correlation_id,
    pg_catalog.jsonb_build_object('idempotency_scope', 'project.create')
  );

  return query
  select
    created_project.id,
    created_project.organization_id,
    created_project.name,
    created_project.objective,
    created_project.market,
    created_project.language,
    created_project.category,
    created_project.status,
    created_project.version,
    created_project.created_at,
    created_project.updated_at,
    false;
end
$function$;

create function private.update_project_atomic(
  requested_project_id uuid,
  requested_expected_version integer,
  requested_name text,
  requested_objective text,
  requested_market text,
  requested_language text,
  requested_category text,
  requested_correlation_id uuid
)
returns table (
  project_id uuid,
  organization_id uuid,
  project_name text,
  objective text,
  market text,
  language text,
  category text,
  project_status api.project_status,
  project_version integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  subject uuid;
  normalized_name text;
  current_project api.projects%rowtype;
  updated_project api.projects%rowtype;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  select projects.* into current_project
  from api.projects as projects
  where projects.id = requested_project_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if not private.has_org_role(
    current_project.organization_id,
    subject,
    array['owner', 'editor']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  normalized_name := pg_catalog.btrim(requested_name);
  if normalized_name is null
    or pg_catalog.char_length(normalized_name) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'invalid_project_name';
  end if;
  if requested_objective is null
    or pg_catalog.char_length(requested_objective) not between 1 and 1000
    or pg_catalog.btrim(requested_objective) = '' then
    raise exception using errcode = '22023', message = 'invalid_project_objective';
  end if;
  if requested_market <> 'philippines'
    or requested_language <> 'en'
    or requested_category <> 'campaign_message' then
    raise exception using errcode = '22023', message = 'unsupported_scope';
  end if;
  if requested_expected_version is null or requested_expected_version < 1 then
    raise exception using errcode = '22023', message = 'invalid_project_version';
  end if;
  if requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_correlation_id';
  end if;

  update api.projects as projects
    set name = normalized_name,
        objective = requested_objective,
        market = requested_market,
        language = requested_language,
        category = requested_category,
        version = projects.version + 1,
        updated_by = subject,
        updated_at = pg_catalog.statement_timestamp()
    where projects.id = requested_project_id
      and projects.version = requested_expected_version
    returning projects.* into updated_project;

  if not found then
    raise exception using errcode = '40001', message = 'version_conflict';
  end if;

  insert into private.audit_events (
    organization_id,
    actor_type,
    actor_user_id,
    action,
    object_type,
    object_id,
    correlation_id,
    metadata
  )
  values (
    updated_project.organization_id,
    'user',
    subject,
    'project.updated',
    'project',
    updated_project.id,
    requested_correlation_id,
    pg_catalog.jsonb_build_object(
      'from_version', requested_expected_version,
      'to_version', updated_project.version
    )
  );

  return query
  select
    updated_project.id,
    updated_project.organization_id,
    updated_project.name,
    updated_project.objective,
    updated_project.market,
    updated_project.language,
    updated_project.category,
    updated_project.status,
    updated_project.version,
    updated_project.created_at,
    updated_project.updated_at;
end
$function$;

create function private.create_stimulus_atomic(
  requested_project_id uuid,
  requested_name text,
  requested_content text,
  requested_content_sha256 text,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns table (
  stimulus_id uuid,
  organization_id uuid,
  project_id uuid,
  stimulus_name text,
  stimulus_status api.stimulus_status,
  stimulus_created_at timestamptz,
  stimulus_version_id uuid,
  stimulus_version integer,
  content text,
  content_sha256 text,
  version_created_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  subject uuid;
  normalized_name text;
  parent_project api.projects%rowtype;
  idempotency_id uuid;
  existing_sha256 text;
  existing_response jsonb;
  created_stimulus api.stimuli%rowtype;
  created_version api.stimulus_versions%rowtype;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  select projects.* into parent_project
  from api.projects as projects
  where projects.id = requested_project_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if not private.has_org_role(
    parent_project.organization_id,
    subject,
    array['owner', 'editor']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  normalized_name := pg_catalog.btrim(requested_name);
  if normalized_name is null
    or pg_catalog.char_length(normalized_name) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'invalid_stimulus_name';
  end if;
  if requested_content is null
    or pg_catalog.char_length(requested_content) not between 1 and 5000
    or pg_catalog.octet_length(requested_content) > 16384 then
    raise exception using errcode = '22023', message = 'invalid_stimulus_content';
  end if;
  if requested_content_sha256 is null
    or requested_content_sha256 !~ '^[0-9a-f]{64}$'
    or requested_content_sha256 <> pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(requested_content, 'UTF8')),
      'hex'
    ) then
    raise exception using errcode = '22023', message = 'invalid_content_hash';
  end if;
  if requested_idempotency_key is null
    or requested_idempotency_key !~ '^[ -~]{16,128}$' then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;
  if requested_sha256 is null or requested_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_request_hash';
  end if;
  if requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_correlation_id';
  end if;

  insert into private.idempotency_keys (
    actor_user_id,
    scope,
    idempotency_key,
    request_sha256,
    organization_id,
    scope_organization_id,
    scope_resource_id
  )
  values (
    subject,
    'stimulus.create',
    requested_idempotency_key,
    requested_sha256,
    parent_project.organization_id,
    parent_project.organization_id,
    parent_project.id
  )
  on conflict do nothing
  returning id into idempotency_id;

  if idempotency_id is null then
    select keys.request_sha256, keys.response
      into existing_sha256, existing_response
      from private.idempotency_keys as keys
      where keys.actor_user_id = subject
        and keys.scope_organization_id = parent_project.organization_id
        and keys.scope_resource_id = parent_project.id
        and keys.scope = 'stimulus.create'
        and keys.idempotency_key = requested_idempotency_key
      for update;
    if not found or existing_response is null then
      raise exception using errcode = '55000', message = 'idempotency_state_incomplete';
    end if;
    if existing_sha256 <> requested_sha256 then
      raise exception using errcode = '22000', message = 'idempotency_key_reused';
    end if;

    return query
    select
      (existing_response ->> 'stimulus_id')::uuid,
      (existing_response ->> 'organization_id')::uuid,
      (existing_response ->> 'project_id')::uuid,
      existing_response ->> 'name',
      (existing_response ->> 'status')::api.stimulus_status,
      (existing_response ->> 'stimulus_created_at')::timestamptz,
      (existing_response ->> 'version_id')::uuid,
      (existing_response ->> 'version')::integer,
      existing_response ->> 'content',
      existing_response ->> 'content_sha256',
      (existing_response ->> 'version_created_at')::timestamptz,
      true;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('project-stimuli:' || parent_project.id::text, 0)
  );
  if (
    select pg_catalog.count(*)
    from api.stimuli as stimuli
    where stimuli.organization_id = parent_project.organization_id
      and stimuli.project_id = parent_project.id
      and stimuli.status = 'active'
  ) >= 5 then
    raise exception using errcode = '54000', message = 'quota_exceeded';
  end if;

  insert into api.stimuli (
    organization_id,
    project_id,
    name,
    created_by
  )
  values (
    parent_project.organization_id,
    parent_project.id,
    normalized_name,
    subject
  )
  returning * into created_stimulus;

  insert into api.stimulus_versions (
    organization_id,
    stimulus_id,
    version,
    content,
    content_sha256,
    created_by
  )
  values (
    created_stimulus.organization_id,
    created_stimulus.id,
    1,
    requested_content,
    requested_content_sha256,
    subject
  )
  returning * into created_version;

  response_payload := pg_catalog.jsonb_build_object(
    'stimulus_id', created_stimulus.id,
    'organization_id', created_stimulus.organization_id,
    'project_id', created_stimulus.project_id,
    'name', created_stimulus.name,
    'status', created_stimulus.status,
    'stimulus_created_at', created_stimulus.created_at,
    'version_id', created_version.id,
    'version', created_version.version,
    'content', created_version.content,
    'content_sha256', created_version.content_sha256,
    'version_created_at', created_version.created_at
  );

  update private.idempotency_keys
    set resource_id = created_stimulus.id,
        response = response_payload
    where id = idempotency_id;

  insert into private.audit_events (
    organization_id,
    actor_type,
    actor_user_id,
    action,
    object_type,
    object_id,
    correlation_id,
    metadata
  )
  values (
    created_stimulus.organization_id,
    'user',
    subject,
    'stimulus.created',
    'stimulus',
    created_stimulus.id,
    requested_correlation_id,
    pg_catalog.jsonb_build_object(
      'idempotency_scope', 'stimulus.create',
      'version', 1,
      'content_sha256', created_version.content_sha256
    )
  );

  return query
  select
    created_stimulus.id,
    created_stimulus.organization_id,
    created_stimulus.project_id,
    created_stimulus.name,
    created_stimulus.status,
    created_stimulus.created_at,
    created_version.id,
    created_version.version,
    created_version.content,
    created_version.content_sha256,
    created_version.created_at,
    false;
end
$function$;

create function private.append_stimulus_version_atomic(
  requested_stimulus_id uuid,
  requested_content text,
  requested_content_sha256 text,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns table (
  version_id uuid,
  organization_id uuid,
  stimulus_id uuid,
  stimulus_version integer,
  content text,
  content_sha256 text,
  created_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  subject uuid;
  parent_stimulus api.stimuli%rowtype;
  idempotency_id uuid;
  existing_sha256 text;
  existing_response jsonb;
  next_version integer;
  created_version api.stimulus_versions%rowtype;
  response_payload jsonb;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  select stimuli.* into parent_stimulus
  from api.stimuli as stimuli
  where stimuli.id = requested_stimulus_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if not private.has_org_role(
    parent_stimulus.organization_id,
    subject,
    array['owner', 'editor']::api.organization_role[]
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if requested_content is null
    or pg_catalog.char_length(requested_content) not between 1 and 5000
    or pg_catalog.octet_length(requested_content) > 16384 then
    raise exception using errcode = '22023', message = 'invalid_stimulus_content';
  end if;
  if requested_content_sha256 is null
    or requested_content_sha256 !~ '^[0-9a-f]{64}$'
    or requested_content_sha256 <> pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(requested_content, 'UTF8')),
      'hex'
    ) then
    raise exception using errcode = '22023', message = 'invalid_content_hash';
  end if;
  if requested_idempotency_key is null
    or requested_idempotency_key !~ '^[ -~]{16,128}$' then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;
  if requested_sha256 is null or requested_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_request_hash';
  end if;
  if requested_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid_correlation_id';
  end if;

  insert into private.idempotency_keys (
    actor_user_id,
    scope,
    idempotency_key,
    request_sha256,
    organization_id,
    scope_organization_id,
    scope_resource_id
  )
  values (
    subject,
    'stimulus.version.append',
    requested_idempotency_key,
    requested_sha256,
    parent_stimulus.organization_id,
    parent_stimulus.organization_id,
    parent_stimulus.id
  )
  on conflict do nothing
  returning id into idempotency_id;

  if idempotency_id is null then
    select keys.request_sha256, keys.response
      into existing_sha256, existing_response
      from private.idempotency_keys as keys
      where keys.actor_user_id = subject
        and keys.scope_organization_id = parent_stimulus.organization_id
        and keys.scope_resource_id = parent_stimulus.id
        and keys.scope = 'stimulus.version.append'
        and keys.idempotency_key = requested_idempotency_key
      for update;
    if not found or existing_response is null then
      raise exception using errcode = '55000', message = 'idempotency_state_incomplete';
    end if;
    if existing_sha256 <> requested_sha256 then
      raise exception using errcode = '22000', message = 'idempotency_key_reused';
    end if;

    return query
    select
      (existing_response ->> 'version_id')::uuid,
      (existing_response ->> 'organization_id')::uuid,
      (existing_response ->> 'stimulus_id')::uuid,
      (existing_response ->> 'version')::integer,
      existing_response ->> 'content',
      existing_response ->> 'content_sha256',
      (existing_response ->> 'created_at')::timestamptz,
      true;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stimulus-versions:' || parent_stimulus.id::text, 0)
  );

  select coalesce(pg_catalog.max(versions.version), 0) + 1
    into next_version
    from api.stimulus_versions as versions
    where versions.organization_id = parent_stimulus.organization_id
      and versions.stimulus_id = parent_stimulus.id;
  if next_version > 20 then
    raise exception using errcode = '54000', message = 'quota_exceeded';
  end if;

  insert into api.stimulus_versions (
    organization_id,
    stimulus_id,
    version,
    content,
    content_sha256,
    created_by
  )
  values (
    parent_stimulus.organization_id,
    parent_stimulus.id,
    next_version,
    requested_content,
    requested_content_sha256,
    subject
  )
  returning * into created_version;

  response_payload := pg_catalog.jsonb_build_object(
    'version_id', created_version.id,
    'organization_id', created_version.organization_id,
    'stimulus_id', created_version.stimulus_id,
    'version', created_version.version,
    'content', created_version.content,
    'content_sha256', created_version.content_sha256,
    'created_at', created_version.created_at
  );

  update private.idempotency_keys
    set resource_id = created_version.id,
        response = response_payload
    where id = idempotency_id;

  insert into private.audit_events (
    organization_id,
    actor_type,
    actor_user_id,
    action,
    object_type,
    object_id,
    correlation_id,
    metadata
  )
  values (
    created_version.organization_id,
    'user',
    subject,
    'stimulus.version_appended',
    'stimulus_version',
    created_version.id,
    requested_correlation_id,
    pg_catalog.jsonb_build_object(
      'idempotency_scope', 'stimulus.version.append',
      'stimulus_id', created_version.stimulus_id,
      'version', created_version.version,
      'content_sha256', created_version.content_sha256
    )
  );

  return query
  select
    created_version.id,
    created_version.organization_id,
    created_version.stimulus_id,
    created_version.version,
    created_version.content,
    created_version.content_sha256,
    created_version.created_at,
    false;
end
$function$;

comment on function private.create_project_atomic(
  uuid, text, text, text, text, text, text, text, uuid
) is 'Complete idempotent project + audit transaction';
comment on function private.update_project_atomic(
  uuid, integer, text, text, text, text, text, uuid
) is 'Optimistic project update + audit transaction';
comment on function private.create_stimulus_atomic(
  uuid, text, text, text, text, text, uuid
) is 'Complete idempotent stimulus + immutable v1 + audit transaction';
comment on function private.append_stimulus_version_atomic(
  uuid, text, text, text, text, uuid
) is 'Complete idempotent immutable stimulus-version + audit transaction';

alter function private.create_project_atomic(
  uuid, text, text, text, text, text, text, text, uuid
) owner to simula_command_owner;
alter function private.update_project_atomic(
  uuid, integer, text, text, text, text, text, uuid
) owner to simula_command_owner;
alter function private.create_stimulus_atomic(
  uuid, text, text, text, text, text, uuid
) owner to simula_command_owner;
alter function private.append_stimulus_version_atomic(
  uuid, text, text, text, text, uuid
) owner to simula_command_owner;

revoke create on schema private from simula_command_owner;

create function api.create_project(
  requested_organization_id uuid,
  requested_name text,
  requested_objective text,
  requested_market text,
  requested_language text,
  requested_category text,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns table (
  project_id uuid,
  organization_id uuid,
  project_name text,
  objective text,
  market text,
  language text,
  category text,
  project_status api.project_status,
  project_version integer,
  created_at timestamptz,
  updated_at timestamptz,
  replayed boolean
)
language sql
security invoker
set search_path = ''
as $function$
  select *
  from private.create_project_atomic(
    requested_organization_id,
    requested_name,
    requested_objective,
    requested_market,
    requested_language,
    requested_category,
    requested_idempotency_key,
    requested_sha256,
    requested_correlation_id
  )
$function$;

create function api.update_project(
  requested_project_id uuid,
  requested_expected_version integer,
  requested_name text,
  requested_objective text,
  requested_market text,
  requested_language text,
  requested_category text,
  requested_correlation_id uuid
)
returns table (
  project_id uuid,
  organization_id uuid,
  project_name text,
  objective text,
  market text,
  language text,
  category text,
  project_status api.project_status,
  project_version integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security invoker
set search_path = ''
as $function$
  select *
  from private.update_project_atomic(
    requested_project_id,
    requested_expected_version,
    requested_name,
    requested_objective,
    requested_market,
    requested_language,
    requested_category,
    requested_correlation_id
  )
$function$;

create function api.create_stimulus(
  requested_project_id uuid,
  requested_name text,
  requested_content text,
  requested_content_sha256 text,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns table (
  stimulus_id uuid,
  organization_id uuid,
  project_id uuid,
  stimulus_name text,
  stimulus_status api.stimulus_status,
  stimulus_created_at timestamptz,
  stimulus_version_id uuid,
  stimulus_version integer,
  content text,
  content_sha256 text,
  version_created_at timestamptz,
  replayed boolean
)
language sql
security invoker
set search_path = ''
as $function$
  select *
  from private.create_stimulus_atomic(
    requested_project_id,
    requested_name,
    requested_content,
    requested_content_sha256,
    requested_idempotency_key,
    requested_sha256,
    requested_correlation_id
  )
$function$;

create function api.append_stimulus_version(
  requested_stimulus_id uuid,
  requested_content text,
  requested_content_sha256 text,
  requested_idempotency_key text,
  requested_sha256 text,
  requested_correlation_id uuid
)
returns table (
  version_id uuid,
  organization_id uuid,
  stimulus_id uuid,
  stimulus_version integer,
  content text,
  content_sha256 text,
  created_at timestamptz,
  replayed boolean
)
language sql
security invoker
set search_path = ''
as $function$
  select *
  from private.append_stimulus_version_atomic(
    requested_stimulus_id,
    requested_content,
    requested_content_sha256,
    requested_idempotency_key,
    requested_sha256,
    requested_correlation_id
  )
$function$;

revoke all on function api.create_project(
  uuid, text, text, text, text, text, text, text, uuid
) from public, anon, authenticated, simula_worker;
revoke all on function api.update_project(
  uuid, integer, text, text, text, text, text, uuid
) from public, anon, authenticated, simula_worker;
revoke all on function api.create_stimulus(
  uuid, text, text, text, text, text, uuid
) from public, anon, authenticated, simula_worker;
revoke all on function api.append_stimulus_version(
  uuid, text, text, text, text, uuid
) from public, anon, authenticated, simula_worker;

grant execute on function api.create_project(
  uuid, text, text, text, text, text, text, text, uuid
) to simula_api;
grant execute on function api.update_project(
  uuid, integer, text, text, text, text, text, uuid
) to simula_api;
grant execute on function api.create_stimulus(
  uuid, text, text, text, text, text, uuid
) to simula_api;
grant execute on function api.append_stimulus_version(
  uuid, text, text, text, text, uuid
) to simula_api;

set role simula_command_owner;
revoke all on function private.create_project_atomic(
  uuid, text, text, text, text, text, text, text, uuid
) from public, anon, authenticated, simula_worker;
revoke all on function private.update_project_atomic(
  uuid, integer, text, text, text, text, text, uuid
) from public, anon, authenticated, simula_worker;
revoke all on function private.create_stimulus_atomic(
  uuid, text, text, text, text, text, uuid
) from public, anon, authenticated, simula_worker;
revoke all on function private.append_stimulus_version_atomic(
  uuid, text, text, text, text, uuid
) from public, anon, authenticated, simula_worker;

grant execute on function private.create_project_atomic(
  uuid, text, text, text, text, text, text, text, uuid
) to simula_api;
grant execute on function private.update_project_atomic(
  uuid, integer, text, text, text, text, text, uuid
) to simula_api;
grant execute on function private.create_stimulus_atomic(
  uuid, text, text, text, text, text, uuid
) to simula_api;
grant execute on function private.append_stimulus_version_atomic(
  uuid, text, text, text, text, uuid
) to simula_api;
reset role;

revoke all on all sequences in schema api, private
  from public, anon, authenticated, simula_api, simula_worker;
