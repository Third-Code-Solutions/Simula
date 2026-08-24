begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(16);

grant usage on schema extensions to simula_api;
grant execute on all functions in schema extensions to simula_api;

select extensions.has_function(
  'private',
  'create_report_artifact_atomic',
  array['uuid', 'jsonb', 'text', 'text', 'uuid'],
  'the report artifact command remains present for server-authored reports'
);

select extensions.is_definer(
  'private',
  'create_report_artifact_atomic',
  array['uuid', 'jsonb', 'text', 'text', 'uuid'],
  'the report command retains its controlled security-definer boundary'
);

select extensions.ok(
  position(
    'private.has_org_role' in pg_catalog.pg_get_functiondef(
      'private.create_report_artifact_atomic(uuid,jsonb,text,text,uuid)'::regprocedure
    )
  ) > 0
  and position(
    'array[''owner'', ''editor'']::api.organization_role[]' in pg_catalog.pg_get_functiondef(
      'private.create_report_artifact_atomic(uuid,jsonb,text,text,uuid)'::regprocedure
    )
  ) > 0,
  'report creation requires the owner/editor organization-role capability'
);

select extensions.ok(
  position(
    'private.is_org_member' in pg_catalog.pg_get_functiondef(
      'private.create_report_artifact_atomic(uuid,jsonb,text,text,uuid)'::regprocedure
    )
  ) = 0,
  'generic viewer membership is not sufficient to create a report artifact'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.create_campaign_evidence_run_atomic(uuid,uuid,text,jsonb,jsonb,uuid,uuid,text,text,uuid)'
      ::pg_catalog.regprocedure
  ) like '%campaign_evidence_binding_unavailable%'
  and pg_catalog.pg_get_functiondef(
    'private.create_campaign_evidence_run_atomic(uuid,uuid,text,jsonb,jsonb,uuid,uuid,text,text,uuid)'
      ::pg_catalog.regprocedure
  ) not like '%insert into api.campaign_evidence_runs%',
  'v2 evidence creation fails closed until exact admitted payload binding exists'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.create_campaign_lab_run_atomic_v4(uuid,uuid,text,jsonb,jsonb,text,text,uuid)'
      ::pg_catalog.regprocedure
  ) like '%8388608%'
  and pg_catalog.pg_get_functiondef(
    'private.create_campaign_lab_run_atomic_v4(uuid,uuid,text,jsonb,jsonb,text,text,uuid)'
      ::pg_catalog.regprocedure
  ) not like '%4194304%',
  'the routed Campaign Lab queue function retains the bounded eight-mebibyte durable envelope'
);

insert into api.organizations (id, name, created_by)
values (
  '91000000-0000-4000-8000-000000000001',
  'Report authorization tenant',
  '00000000-0000-4000-8000-000000000001'
);

insert into api.organization_memberships (
  organization_id,
  user_id,
  role,
  created_by
)
values
  (
    '91000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'editor',
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    '91000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    'viewer',
    '00000000-0000-4000-8000-000000000001'
  );

insert into api.projects (
  id,
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
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  'Report authorization project',
  'Exercise the report artifact authorization boundary.',
  'Local test',
  'English',
  'Test',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001'
);

select extensions.has_table(
  'private',
  'legacy_campaign_lab_report_quarantine',
  'legacy Campaign Lab reports have a recoverable private quarantine'
);

select extensions.ok(
  not pg_catalog.has_table_privilege(
    'simula_api',
    'private.legacy_campaign_lab_report_quarantine',
    'select'
  )
  and not pg_catalog.has_table_privilege(
    'simula_worker',
    'private.legacy_campaign_lab_report_quarantine',
    'select'
  )
  and not pg_catalog.has_table_privilege(
    'authenticated',
    'private.legacy_campaign_lab_report_quarantine',
    'select'
  ),
  'the legacy report quarantine is not readable by API, worker, or browser roles'
);

insert into api.campaign_lab_campaigns (
  id, organization_id, project_id, name, objective, purpose,
  status, current_stage, compliance_status,
  idempotency_key, request_sha256, created_by
)
values (
  '92500000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  'Legacy report quarantine',
  'Prove unsafe report results are recoverably scrubbed.',
  'aggregate_political_research',
  'completed', 'reported', 'approved_experimental',
  'legacy-report-campaign-0001',
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  '00000000-0000-4000-8000-000000000001'
);

insert into api.campaign_lab_runs (
  id, organization_id, campaign_id, run_type, status, stage, progress,
  request, result, idempotency_key, request_sha256, created_by
)
values (
  '92600000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '92500000-0000-4000-8000-000000000001',
  'report', 'succeeded', 'reported', 100,
  '{"human_reviewer":"caller","compliance_review_run_id":"92700000-0000-4000-8000-000000000001"}'::jsonb,
  '{"approval_status":"needs_human_review","evidence_status":"calibrated"}'::jsonb,
  'legacy-report-run-000001',
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  '00000000-0000-4000-8000-000000000001'
);

select extensions.is(
  private.quarantine_legacy_campaign_lab_reports(),
  1::bigint,
  'the quarantine command captures one newly discovered legacy report'
);

select extensions.ok(
  exists (
    select 1 from api.campaign_lab_runs
    where id = '92600000-0000-4000-8000-000000000001'
      and status = 'failed'
      and stage = 'failed'
      and last_error_code = 'legacy_unbound_report'
  ),
  'the public legacy report is explicitly marked failed'
);

select extensions.ok(
  exists (
    select 1 from api.campaign_lab_runs
    where id = '92600000-0000-4000-8000-000000000001'
      and result is null
      and request = '{"quarantined":true,"reason":"legacy_unbound_report"}'::jsonb
      and request_sha256 = pg_catalog.encode(
        extensions.digest(pg_catalog.convert_to(request::text, 'UTF8'), 'sha256'),
        'hex'
      )
  ),
  'the public legacy request/result are scrubbed and the visible hash remains truthful'
);

select extensions.ok(
  exists (
    select 1 from private.legacy_campaign_lab_report_quarantine
    where run_id = '92600000-0000-4000-8000-000000000001'
      and previous_status = 'succeeded'
      and previous_request ->> 'human_reviewer' = 'caller'
      and previous_request_sha256 =
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
      and previous_result ->> 'evidence_status' = 'calibrated'
      and source_retention_until > quarantined_at
  ),
  'the original report/hash remain recoverable only until source retention expires'
);

select extensions.ok(
  exists (
    select 1 from api.campaign_lab_campaigns
    where id = '92500000-0000-4000-8000-000000000001'
      and status = 'blocked'
      and current_stage = 'compliance_reviewed'
      and compliance_status = 'needs_human_review'
  ),
  'a campaign no longer claims completion from its quarantined legacy report'
);

delete from api.campaign_lab_runs
where id = '92600000-0000-4000-8000-000000000001';

select extensions.is(
  (
    select pg_catalog.count(*)
    from private.legacy_campaign_lab_report_quarantine
    where run_id = '92600000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'normal Campaign Lab retention deletion cascades to the private quarantine'
);

insert into api.stimuli (
  id,
  organization_id,
  project_id,
  name,
  created_by
)
values (
  '93000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  'Report authorization stimulus',
  '00000000-0000-4000-8000-000000000001'
);

insert into api.stimulus_versions (
  id,
  organization_id,
  stimulus_id,
  version,
  content,
  content_sha256,
  created_by
)
values (
  '94000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  1,
  'Synthetic report authorization fixture.',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '00000000-0000-4000-8000-000000000001'
);

insert into api.simulation_runs (
  id,
  organization_id,
  project_id,
  stimulus_version_id,
  audience_version_id,
  state,
  frozen_manifest,
  frozen_manifest_sha256,
  schema_version,
  deterministic_seed,
  created_by,
  correlation_id
)
values (
  '95000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000d2',
  'queued',
  '{}'::jsonb,
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  1,
  1,
  '00000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000001'
);

select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000002',
    'role', 'authenticated',
    'iss', 'simula-pgtap',
    'aud', 'authenticated',
    'exp', 4102444800
  )::text,
  true
);
reset role;
set session authorization simula_api;

select extensions.throws_ok(
  $sql$
    select api.create_report_artifact(
      '95000000-0000-4000-8000-000000000001',
      '{}'::jsonb,
      'viewer-report-attempt',
      'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      '97000000-0000-4000-8000-000000000001'
    )
  $sql$,
  'P0002',
  'not_found',
  'a viewer cannot invoke the report persistence command'
);

reset session authorization;
set role postgres;
select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'iss', 'simula-pgtap',
    'aud', 'authenticated',
    'exp', 4102444800
  )::text,
  true
);
reset role;
set session authorization simula_api;

select extensions.throws_ok(
  $sql$
    select api.create_report_artifact(
      '95000000-0000-4000-8000-000000000001',
      '{}'::jsonb,
      'editor-report-attempt',
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      '98000000-0000-4000-8000-000000000001'
    )
  $sql$,
  '55000',
  'run_result_unavailable',
  'an editor reaches the post-authorization run-result boundary'
);

reset session authorization;

select * from extensions.finish();

rollback;
