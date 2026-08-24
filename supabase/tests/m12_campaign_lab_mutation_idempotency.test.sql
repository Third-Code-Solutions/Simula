begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(25);

grant usage on schema extensions to simula_api;
grant execute on all functions in schema extensions to simula_api;

select extensions.ok(
  (
    select pg_catalog.pg_get_indexdef(indexes.indexrelid) ~* 'unique.*coalesce.*scope_organization_id'
    from pg_catalog.pg_index as indexes
    where indexes.indexrelid = 'private.idempotency_keys_tenant_scope_key_unique'::regclass
  ),
  'idempotency uniqueness remains tenant and resource scoped'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.cancel_campaign_lab_run_atomic(uuid,text,text,uuid)'::pg_catalog.regprocedure
  ) ~* 'scope_organization_id'
  and pg_catalog.pg_get_functiondef(
    'private.cancel_campaign_lab_run_atomic(uuid,text,text,uuid)'::pg_catalog.regprocedure
  ) ~* 'scope_resource_id',
  'cancellation idempotency binds organization and run'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.cancel_campaign_lab_run_atomic(uuid,text,text,uuid)'::pg_catalog.regprocedure
  ) ~* 'on conflict\s+do nothing',
  'cancellation uses the tenant-scoped conflict arbiter'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.update_campaign_lab_campaign_atomic(uuid,integer,text,text,jsonb,text,text,uuid)'::pg_catalog.regprocedure
  ) ~* 'scope_organization_id'
  and pg_catalog.pg_get_functiondef(
    'private.update_campaign_lab_campaign_atomic(uuid,integer,text,text,jsonb,text,text,uuid)'::pg_catalog.regprocedure
  ) ~* 'scope_resource_id',
  'campaign update idempotency binds organization and campaign'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.update_campaign_lab_campaign_atomic(uuid,integer,text,text,jsonb,text,text,uuid)'::pg_catalog.regprocedure
  ) ~* 'on conflict\s+do nothing',
  'campaign update uses the tenant-scoped conflict arbiter'
);

select extensions.ok(
  exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'api'
      and tablename = 'campaign_lab_runs'
      and policyname = 'campaign_lab_runs_command_update'
  ),
  'campaign cancellation can lock runs through a command-owner update policy'
);

create temporary table mutation_results (
  label text primary key,
  payload jsonb not null
) on commit drop;

grant insert, select on mutation_results to simula_api;

insert into api.organizations (id, name, created_by)
values (
  '60000000-0000-4000-8000-000000000001',
  'Campaign mutation fixture',
  '00000000-0000-4000-8000-000000000001'
);

insert into api.organization_memberships (
  organization_id, user_id, role, created_by
)
values (
  '60000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'owner',
  '00000000-0000-4000-8000-000000000001'
);

insert into api.projects (
  id, organization_id, name, objective, market, language, category, created_by, updated_by
)
values (
  '60000000-0000-4000-8000-000000000002',
  '60000000-0000-4000-8000-000000000001',
  'Mutation fixture project',
  'Exercise scoped command idempotency.',
  'local',
  'en',
  'campaign_message',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001'
);

insert into api.campaign_lab_campaigns (
  id, organization_id, project_id, name, objective, purpose,
  decision_definition, idempotency_key, request_sha256, created_by
)
values
  (
    '60000000-0000-4000-8000-000000000003',
    '60000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000002',
    'Campaign One',
    'Exercise update replay.',
    'commercial_marketing',
    '{}'::jsonb,
    'fixture-campaign-one',
    repeat('a', 64),
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    '60000000-0000-4000-8000-000000000004',
    '60000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000002',
    'Campaign Two',
    'Exercise resource-scoped keys.',
    'commercial_marketing',
    '{}'::jsonb,
    'fixture-campaign-two',
    repeat('b', 64),
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    '60000000-0000-4000-8000-000000000028',
    '60000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000002',
    'Large V4 admission fixture',
    'Exercise the routed durable request and secret boundary.',
    'commercial_marketing',
    '{}'::jsonb,
    'fixture-campaign-v4-large',
    repeat('8', 64),
    '00000000-0000-4000-8000-000000000001'
  );

insert into api.campaign_lab_runs (
  id, organization_id, campaign_id, request, idempotency_key, request_sha256, created_by
)
values (
  '60000000-0000-4000-8000-000000000005',
  '60000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000003',
  '{}'::jsonb,
  'fixture-cancel-run',
  repeat('c', 64),
  '00000000-0000-4000-8000-000000000001'
);

select extensions.lives_ok(
  $sql$
    insert into api.campaign_lab_runs (
      id, organization_id, campaign_id, request, idempotency_key,
      request_sha256, created_by
    ) values (
      '60000000-0000-4000-8000-000000000020',
      '60000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000028',
      pg_catalog.jsonb_build_object('document', pg_catalog.repeat('x', 5600000)),
      'fixture-large-campaign-run',
      pg_catalog.repeat('f', 64),
      '00000000-0000-4000-8000-000000000001'
    );
    insert into private.campaign_lab_secrets (organization_id, run_id, payload)
    values (
      '60000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000020',
      pg_catalog.jsonb_build_object('document', pg_catalog.repeat('x', 5600000))
    );
  $sql$,
  'Campaign Lab request and secret rows admit a realistic base64 document envelope'
);

select extensions.lives_ok(
  $sql$
    do $dense_jsonb$
    declare
      dense_request jsonb;
    begin
      select pg_catalog.jsonb_build_object(
        'items',
        pg_catalog.jsonb_agg('{}'::jsonb)
      )
      into dense_request
      from pg_catalog.generate_series(1, 1600000);
      if pg_catalog.octet_length(
        pg_catalog.replace(dense_request::text, ', ', ',')
      ) > 6291456
        or pg_catalog.octet_length(dense_request::text) <= 6291456 then
        raise exception using errcode = '22023', message = 'dense_fixture_invalid';
      end if;
      insert into api.campaign_lab_runs (
        id, organization_id, campaign_id, request, idempotency_key,
        request_sha256, created_by
      ) values (
        '60000000-0000-4000-8000-000000000026',
        '60000000-0000-4000-8000-000000000001',
        '60000000-0000-4000-8000-000000000003',
        dense_request,
        'fixture-dense-campaign-run',
        pg_catalog.repeat('0', 64),
        '00000000-0000-4000-8000-000000000001'
      );
    end
    $dense_jsonb$
  $sql$,
  'dense JSON accepted by HTTP still persists after JSONB rendering expansion'
);

select extensions.lives_ok(
  $sql$
    insert into api.campaign_evidence_runs (
      id, organization_id, project_id, kind, request, created_by
    ) values (
      '60000000-0000-4000-8000-000000000021',
      '60000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000002',
      'survey_calibration',
      pg_catalog.jsonb_build_object('document', pg_catalog.repeat('x', 5600000)),
      '00000000-0000-4000-8000-000000000001'
    );
    insert into private.campaign_evidence_secrets (run_id, organization_id, payload)
    values (
      '60000000-0000-4000-8000-000000000021',
      '60000000-0000-4000-8000-000000000001',
      pg_catalog.jsonb_build_object('document', pg_catalog.repeat('x', 5600000))
    );
  $sql$,
  'campaign evidence request and secret rows share the realistic envelope boundary'
);

select extensions.throws_ok(
  $sql$
    do $oversized_campaign_request$
    begin
      begin
        insert into api.campaign_lab_runs (
          id, organization_id, campaign_id, request, idempotency_key,
          request_sha256, created_by
        ) values (
          '60000000-0000-4000-8000-000000000022',
          '60000000-0000-4000-8000-000000000001',
          '60000000-0000-4000-8000-000000000003',
          pg_catalog.jsonb_build_object('document', pg_catalog.repeat('x', 8400000)),
          'fixture-oversized-campaign-run',
          pg_catalog.repeat('1', 64),
          '00000000-0000-4000-8000-000000000001'
        );
      exception when check_violation then
        raise exception using errcode = '22023', message = 'oversized_campaign_request';
      end;
    end
    $oversized_campaign_request$
  $sql$,
  '22023',
  'oversized_campaign_request',
  'Campaign Lab requests above six mebibytes remain rejected'
);

insert into api.campaign_lab_runs (
  id, organization_id, campaign_id, request, idempotency_key,
  request_sha256, created_by
) values (
  '60000000-0000-4000-8000-000000000023',
  '60000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000003',
  '{}'::jsonb,
  'fixture-oversized-campaign-secret',
  pg_catalog.repeat('2', 64),
  '00000000-0000-4000-8000-000000000001'
);

select extensions.throws_ok(
  $sql$
    do $oversized_campaign_secret$
    begin
      begin
        insert into private.campaign_lab_secrets (organization_id, run_id, payload)
        values (
          '60000000-0000-4000-8000-000000000001',
          '60000000-0000-4000-8000-000000000023',
          pg_catalog.jsonb_build_object('document', pg_catalog.repeat('x', 8400000))
        );
      exception when check_violation then
        raise exception using errcode = '22023', message = 'oversized_campaign_secret';
      end;
    end
    $oversized_campaign_secret$
  $sql$,
  '22023',
  'oversized_campaign_secret',
  'Campaign Lab secrets above six mebibytes remain rejected'
);

select extensions.throws_ok(
  $sql$
    do $oversized_evidence_request$
    begin
      begin
        insert into api.campaign_evidence_runs (
          id, organization_id, project_id, kind, request, created_by
        ) values (
          '60000000-0000-4000-8000-000000000024',
          '60000000-0000-4000-8000-000000000001',
          '60000000-0000-4000-8000-000000000002',
          'survey_calibration',
          pg_catalog.jsonb_build_object('document', pg_catalog.repeat('x', 8400000)),
          '00000000-0000-4000-8000-000000000001'
        );
      exception when check_violation then
        raise exception using errcode = '22023', message = 'oversized_evidence_request';
      end;
    end
    $oversized_evidence_request$
  $sql$,
  '22023',
  'oversized_evidence_request',
  'campaign evidence requests above six mebibytes remain rejected'
);

insert into api.campaign_evidence_runs (
  id, organization_id, project_id, kind, request, created_by
) values (
  '60000000-0000-4000-8000-000000000025',
  '60000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000002',
  'survey_calibration',
  '{}'::jsonb,
  '00000000-0000-4000-8000-000000000001'
);

select extensions.throws_ok(
  $sql$
    do $oversized_evidence_secret$
    begin
      begin
        insert into private.campaign_evidence_secrets (run_id, organization_id, payload)
        values (
          '60000000-0000-4000-8000-000000000025',
          '60000000-0000-4000-8000-000000000001',
          pg_catalog.jsonb_build_object('document', pg_catalog.repeat('x', 8400000))
        );
      exception when check_violation then
        raise exception using errcode = '22023', message = 'oversized_evidence_secret';
      end;
    end
    $oversized_evidence_secret$
  $sql$,
  '22023',
  'oversized_evidence_secret',
  'campaign evidence secrets above six mebibytes remain rejected'
);

-- Supabase CLI connects as supabase_admin and begins tests under SET ROLE
-- postgres. Reset to the login superuser before changing session identity.
reset role;
set session authorization simula_api;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","iss":"simula-pgtap","aud":"authenticated","exp":4102444800}',
  true
);

select extensions.lives_ok(
  $sql$
    select api.create_campaign_lab_run_v4(
      '60000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000028',
      'research_ingestion',
      pg_catalog.jsonb_build_object('document', pg_catalog.repeat('x', 5600000)),
      pg_catalog.jsonb_build_object('document', pg_catalog.repeat('x', 5600000)),
      'fixture-v4-large-research-run',
      pg_catalog.repeat('9', 64),
      '60000000-0000-4000-8000-000000000027'
    );
  $sql$,
  'the simula_api V4 route persists a realistic large research request and secret'
);

insert into mutation_results (label, payload)
select 'update-first', api.update_campaign_lab_campaign(
  '60000000-0000-4000-8000-000000000003',
  1,
  'Campaign One Revised',
  'Exercise update replay after repair.',
  '{}'::jsonb,
  'shared-update-key',
  repeat('d', 64),
  '60000000-0000-4000-8000-000000000011'
);

insert into mutation_results (label, payload)
select 'update-replay', api.update_campaign_lab_campaign(
  '60000000-0000-4000-8000-000000000003',
  1,
  'Campaign One Revised',
  'Exercise update replay after repair.',
  '{}'::jsonb,
  'shared-update-key',
  repeat('d', 64),
  '60000000-0000-4000-8000-000000000012'
);

insert into mutation_results (label, payload)
select 'update-second-resource', api.update_campaign_lab_campaign(
  '60000000-0000-4000-8000-000000000004',
  1,
  'Campaign Two Revised',
  'The same actor key is isolated by resource.',
  '{}'::jsonb,
  'shared-update-key',
  repeat('d', 64),
  '60000000-0000-4000-8000-000000000013'
);

insert into mutation_results (label, payload)
select 'cancel-first', api.cancel_campaign_lab_run(
  '60000000-0000-4000-8000-000000000005',
  'shared-cancel-key',
  repeat('e', 64),
  '60000000-0000-4000-8000-000000000014'
);

insert into mutation_results (label, payload)
select 'cancel-replay', api.cancel_campaign_lab_run(
  '60000000-0000-4000-8000-000000000005',
  'shared-cancel-key',
  repeat('e', 64),
  '60000000-0000-4000-8000-000000000015'
);

reset session authorization;

select extensions.is(
  (select (payload ->> 'version')::integer from mutation_results where label = 'update-first'),
  2,
  'campaign update commits through the API wrapper'
);

select extensions.is(
  (select payload ->> 'status' from mutation_results where label = 'update-first'),
  'active',
  'campaign update transitions a draft campaign to active'
);

select extensions.is(
  (select payload ->> 'replayed' from mutation_results where label = 'update-replay'),
  'true',
  'campaign update replay returns the stored response'
);

select extensions.is(
  (select payload ->> 'campaign_id' from mutation_results where label = 'update-replay'),
  '60000000-0000-4000-8000-000000000003',
  'campaign update replay stays bound to the original campaign'
);

select extensions.is(
  (select (payload ->> 'version')::integer from mutation_results where label = 'update-second-resource'),
  2,
  'the same actor key can update a distinct resource in the same tenant'
);

select extensions.is(
  (select payload ->> 'status' from mutation_results where label = 'cancel-first'),
  'canceled',
  'run cancellation commits through the API wrapper'
);

select extensions.is(
  (select payload ->> 'replayed' from mutation_results where label = 'cancel-replay'),
  'true',
  'run cancellation replay returns the stored response'
);

select extensions.is(
  (select payload ->> 'status' from mutation_results where label = 'cancel-replay'),
  'canceled',
  'run cancellation replay preserves the terminal status'
);

select extensions.is(
  (
    select count(*)::integer
    from private.idempotency_keys
    where actor_user_id = '00000000-0000-4000-8000-000000000001'
      and response is not null
      and scope in ('campaign_lab.campaign.update', 'campaign_lab.run.cancel')
  ),
  3,
  'each mutation owns one complete idempotency response'
);

select extensions.is(
  (
    select count(*)::integer
    from private.idempotency_keys
    where actor_user_id = '00000000-0000-4000-8000-000000000001'
      and scope = 'campaign_lab.campaign.update'
      and idempotency_key = 'shared-update-key'
  ),
  2,
  'resource scope prevents sibling campaign key collisions'
);

select extensions.is(
  (
    select count(*)::integer
    from private.idempotency_keys
    where actor_user_id = '00000000-0000-4000-8000-000000000001'
      and (
        (scope = 'campaign_lab.campaign.update'
          and scope_organization_id = '60000000-0000-4000-8000-000000000001'
          and scope_resource_id in (
            '60000000-0000-4000-8000-000000000003',
            '60000000-0000-4000-8000-000000000004'
          ))
        or (scope = 'campaign_lab.run.cancel'
          and scope_organization_id = '60000000-0000-4000-8000-000000000001'
          and scope_resource_id = '60000000-0000-4000-8000-000000000005')
      )
  ),
  3,
  'all mutation idempotency rows retain tenant and resource scope'
);

select * from extensions.finish();
rollback;
