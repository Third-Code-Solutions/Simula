begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(15);

select extensions.ok(
  pg_catalog.to_regclass('api.aggregate_forecast_datasets') is not null
  and pg_catalog.to_regclass('api.aggregate_forecast_observations') is not null,
  'aggregate forecast registry tables exist'
);

select extensions.ok(
  (
    select datasets.relrowsecurity and datasets.relforcerowsecurity
    from pg_catalog.pg_class as datasets
    join pg_catalog.pg_namespace as schemas on schemas.oid = datasets.relnamespace
    where schemas.nspname = 'api'
      and datasets.relname = 'aggregate_forecast_datasets'
  )
  and (
    select observations.relrowsecurity and observations.relforcerowsecurity
    from pg_catalog.pg_class as observations
    join pg_catalog.pg_namespace as schemas on schemas.oid = observations.relnamespace
    where schemas.nspname = 'api'
      and observations.relname = 'aggregate_forecast_observations'
  ),
  'aggregate forecast tables force RLS'
);

select extensions.ok(
  pg_catalog.has_table_privilege(
    'simula_api', 'api.aggregate_forecast_datasets', 'SELECT'
  )
  and pg_catalog.has_table_privilege(
    'simula_api', 'api.aggregate_forecast_observations', 'SELECT'
  )
  and not pg_catalog.has_table_privilege(
    'authenticated', 'api.aggregate_forecast_datasets', 'SELECT'
  )
  and not pg_catalog.has_table_privilege(
    'anon', 'api.aggregate_forecast_observations', 'SELECT'
  ),
  'only the API service receives registry table privileges'
);

select extensions.ok(
  exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'api'
      and tablename = 'aggregate_forecast_datasets'
      and policyname = 'aggregate_forecast_datasets_api_select'
      and 'simula_api' = any(roles)
  )
  and exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'api'
      and tablename = 'aggregate_forecast_observations'
      and policyname = 'aggregate_forecast_observations_api_select'
      and 'simula_api' = any(roles)
  ),
  'registry reads require explicit API policies'
);

select extensions.ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'private.aggregate_forecast_dataset_checksum(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'simula_api',
    'private.aggregate_forecast_dataset_checksum(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'checksum implementation is not callable by application or browser roles'
);

select extensions.ok(
  exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'aggregate_forecast_dataset_admission_guard'
      and not tgisinternal
  ),
  'dataset admission is guarded by a database trigger'
);

select extensions.ok(
  exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'aggregate_forecast_dataset_immutability_guard'
      and not tgisinternal
  )
  and exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'aggregate_forecast_observation_immutability_guard'
      and not tgisinternal
  ),
  'admitted datasets and observations are guarded against mutation'
);

select extensions.ok(
  (
    select pg_catalog.pg_get_constraintdef(constraints.oid)
      like '%aggregate_forecast%'
    from pg_catalog.pg_constraint as constraints
    join pg_catalog.pg_class as relations on relations.oid = constraints.conrelid
    join pg_catalog.pg_namespace as schemas on schemas.oid = relations.relnamespace
    where schemas.nspname = 'api'
      and relations.relname = 'campaign_lab_runs'
      and constraints.conname = 'campaign_lab_runs_type_valid'
  ),
  'durable run constraint admits aggregate forecasts'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.create_campaign_lab_run_atomic_v3(uuid,uuid,text,jsonb,jsonb,text,text,uuid)'::pg_catalog.regprocedure
  ) like '%aggregate_forecast_requires_admitted_history_and_targets%'
  and pg_catalog.pg_get_functiondef(
    'private.complete_campaign_lab_run_v3(uuid,uuid,jsonb)'::pg_catalog.regprocedure
  ) like '%forecasted%',
  'durable creation and completion enforce the forecast workflow'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.runtime_schema_readiness_v3()'::pg_catalog.regprocedure
  ) like '%20260807104033::bigint%'
  and pg_catalog.pg_get_functiondef(
    'private.runtime_observability_snapshot_v3()'::pg_catalog.regprocedure
  ) like '%20260807104033::bigint%',
  'runtime readiness and observability report the forecast schema head'
);

insert into api.aggregate_forecast_datasets (
  id, source_key, source_version, owner_name, license_name, allowed_uses,
  geography, observation_period, status, authorized_for_forecasting,
  source_checksum_sha256, normalized_checksum_sha256, manifest
) values (
  '10000000-0000-4000-8000-000000000010'::uuid,
  'incomplete_official_fixture', 'v1', 'Fixture owner', 'Fixture license',
  array['Aggregate forecasting tests.'], 'Fixture geography',
  'Fixture observation period', 'draft', false, repeat('a', 64), repeat('b', 64),
  '{}'::jsonb
);

select extensions.throws_ok(
  $$
    update api.aggregate_forecast_datasets
    set status = 'admitted', admitted_at = pg_catalog.statement_timestamp()
    where id = '10000000-0000-4000-8000-000000000010'::uuid
  $$,
  '23514',
  'aggregate_forecast_dataset_admission_failed',
  'incomplete or checksum-mismatched datasets fail closed'
);

select extensions.throws_ok(
  $$
    insert into api.aggregate_forecast_datasets (
      id, source_key, source_version, owner_name, license_name, allowed_uses,
      geography, observation_period, status, authorized_for_forecasting,
      source_checksum_sha256, normalized_checksum_sha256, manifest, admitted_at
    ) values (
      '10000000-0000-4000-8000-000000000011'::uuid,
      'direct_admitted_fixture', 'v1', 'Fixture owner', 'Fixture license',
      array['Aggregate forecasting tests.'], 'Fixture geography',
      'Fixture observation period', 'admitted', true, repeat('a', 64),
      repeat('b', 64), '{}'::jsonb, pg_catalog.statement_timestamp()
    )
  $$,
  '23514',
  'aggregate_forecast_dataset_admission_failed',
  'direct admitted inserts cannot bypass observation and checksum validation'
);

select extensions.lives_ok(
  $$
    update api.aggregate_forecast_datasets
    set status = 'retired', authorized_for_forecasting = false
    where source_key = 'comelec_national_turnout'
      and source_version = 'retrieved_2026_08_07'
  $$,
  'an admitted dataset can be retired without mutating its evidence'
);

select extensions.is(
  (
    select status
    from api.aggregate_forecast_datasets
    where source_key = 'comelec_national_turnout'
      and source_version = 'retrieved_2026_08_07'
  ),
  'retired',
  'retirement persists inside the transaction'
);

select extensions.throws_ok(
  $$
    update api.aggregate_forecast_datasets
    set status = 'admitted', authorized_for_forecasting = true
    where source_key = 'comelec_national_turnout'
      and source_version = 'retrieved_2026_08_07'
  $$,
  '55000',
  'admitted_aggregate_forecast_dataset_is_immutable',
  'a retired dataset cannot be reactivated or mutated'
);

select * from extensions.finish();
rollback;
