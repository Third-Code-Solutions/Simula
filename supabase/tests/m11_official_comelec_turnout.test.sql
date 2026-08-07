begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(12);

create temporary view target_dataset as
select id
from api.aggregate_forecast_datasets
where source_key = 'comelec_national_turnout'
  and source_version = 'retrieved_2026_08_07';

select extensions.is(
  (
    select pg_catalog.count(*)
    from api.aggregate_forecast_datasets
    where id = (select id from target_dataset)
      and status = 'admitted'
      and authorized_for_forecasting
      and admitted_at is not null
  ),
  1::bigint,
  'official COMELEC turnout dataset is admitted exactly once'
);

select extensions.is(
  (
    select pg_catalog.count(*)
    from api.aggregate_forecast_observations
    where dataset_id = (select id from target_dataset)
  ),
  24::bigint,
  'dataset contains two aggregate options for twelve elections'
);

select extensions.is(
  (
    select pg_catalog.count(distinct election_date)
    from api.aggregate_forecast_observations
    where dataset_id = (select id from target_dataset)
  ),
  12::bigint,
  'dataset contains twelve distinct historical election dates'
);

select extensions.ok(
  not exists (
    select 1
    from api.aggregate_forecast_observations
    where dataset_id = (select id from target_dataset)
    group by election_key, election_date, contest_key, geography_key
    having pg_catalog.count(*) <> 2
      or pg_catalog.count(distinct valid_votes) <> 1
      or pg_catalog.sum(votes) <> pg_catalog.max(valid_votes)
  ),
  'each turnout cell has one denominator and exhaustive voted/not-voted options'
);

select extensions.is(
  private.aggregate_forecast_dataset_checksum(
    (select id from target_dataset)
  ),
  'bec5d068c5380262077abe60edcfadd8ff0f5a95443927f45e580efd15a55486',
  'database normalization matches the checked-in checksum'
);

select extensions.is(
  (
    select source_checksum_sha256
    from api.aggregate_forecast_datasets
    where id = (select id from target_dataset)
  ),
  '8e590cfa9e29c6beb721ca0293b5be472e0eaccaa95d582dcf27df0c8172a7cb',
  'dataset binds both raw official artifacts into one source checksum'
);

select extensions.ok(
  (
    select manifest ->> 'respondent_data_used' = 'false'
      and pg_catalog.jsonb_array_length(manifest -> 'default_targets') = 2
      and manifest -> 'release_gate' ->> 'evidence_status' = 'experimental'
      and manifest -> 'release_gate' ->> 'sealed_out_of_time_holdout' = 'false'
      and manifest -> 'release_gate' ->> 'retrospective_quality_gate_passed' = 'true'
      and manifest -> 'release_gate' ->> 'selected_method' = 'last_result'
    from api.aggregate_forecast_datasets
    where id = (select id from target_dataset)
  ),
  'manifest declares no respondents, runnable defaults, and transparent validation status'
);

select extensions.ok(
  (
    select pg_catalog.min(election_date) = '1992-05-11'::date
      and pg_catalog.max(election_date) = '2025-05-12'::date
    from api.aggregate_forecast_observations
    where dataset_id = (select id from target_dataset)
  ),
  'dataset chronology spans 1992 through 2025'
);

select extensions.ok(
  not pg_catalog.has_table_privilege(
    'authenticated', 'api.aggregate_forecast_datasets', 'SELECT'
  )
  and not pg_catalog.has_table_privilege(
    'anon', 'api.aggregate_forecast_observations', 'SELECT'
  ),
  'official forecast evidence remains server-only'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.runtime_schema_readiness_v3()'::pg_catalog.regprocedure
  ) like '%20260807104033::bigint%'
  and pg_catalog.pg_get_functiondef(
    'private.runtime_observability_snapshot_v3()'::pg_catalog.regprocedure
  ) like '%20260807104033::bigint%',
  'runtime readiness and observability report the admitted-data schema head'
);

select extensions.throws_ok(
  $$
    update api.aggregate_forecast_datasets
    set manifest = manifest || '{"tampered":true}'::jsonb
    where id = (select id from target_dataset)
  $$,
  '55000',
  'admitted_aggregate_forecast_dataset_is_immutable',
  'admitted dataset metadata cannot drift after checksum admission'
);

select extensions.throws_ok(
  $$
    update api.aggregate_forecast_observations
    set votes = votes - 1
    where dataset_id = (select id from target_dataset)
      and option_key = 'voted'
      and election_key = 'nle_2025'
  $$,
  '55000',
  'admitted_aggregate_forecast_observations_are_immutable',
  'admitted normalized observations cannot change after admission'
);

select * from extensions.finish();
rollback;
