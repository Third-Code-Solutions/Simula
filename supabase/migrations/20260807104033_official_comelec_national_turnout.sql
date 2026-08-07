-- Admit a checksum-locked, aggregate-only COMELEC national turnout series.
-- No respondent, person-level, precinct-return, or candidate data are stored.

set role postgres;

insert into api.aggregate_forecast_datasets (
  source_key, source_version, owner_name, license_name, allowed_uses,
  geography, observation_period, status, authorized_for_forecasting,
  source_checksum_sha256, normalized_checksum_sha256, manifest
) values (
  'comelec_national_turnout',
  'retrieved_2026_08_07',
  'Commission on Elections',
  'Public domain unless otherwise stated on the COMELEC website',
  array[
    'Aggregate turnout forecasting, historical backtesting, and reproducibility auditing with attribution and stated limitations.'
  ]::text[],
  'Philippines national',
  '1992 through 2025 National and Local Elections',
  'draft',
  false,
  '8e590cfa9e29c6beb721ca0293b5be472e0eaccaa95d582dcf27df0c8172a7cb',
  'bec5d068c5380262077abe60edcfadd8ff0f5a95443927f45e580efd15a55486',
  $manifest$
  {
    "schema_version": 1,
    "dataset_key": "comelec_national_turnout",
    "source_bundle_sha256": "8e590cfa9e29c6beb721ca0293b5be472e0eaccaa95d582dcf27df0c8172a7cb",
    "normalized_sha256": "bec5d068c5380262077abe60edcfadd8ff0f5a95443927f45e580efd15a55486",
    "retrieved_at_utc": "2026-08-07T00:00:00Z",
    "respondent_data_used": false,
    "artifacts": [
      {
        "artifact_key": "comelec_comparative_turnout_1992_2022",
        "canonical_url": "https://www.comelec.gov.ph/php-tpls-attachments/2022NLE/Statistics/Comperative_Stats_1992_2002_NLE.pdf",
        "final_url": "https://www.comelec.gov.ph/php-tpls-attachments/2022NLE/Statistics/Comperative_Stats_1992_2002_NLE.pdf",
        "http_status": 200,
        "content_type": "application/pdf",
        "http_last_modified": "2022-11-07T05:51:57Z",
        "bytes": 139254,
        "sha256": "c4421379e76f1cb9ff52fd6fc3d334ad262aada55b6d49360d2732685c573dce",
        "artifact_status": "final_statistics"
      },
      {
        "artifact_key": "comelec_2025_local_aes_turnout",
        "canonical_url": "https://www.comelec.gov.ph/php-tpls-attachments/2025NLE/Statistics/2025_NLE_VotersTurnoutbyCityMun_OFOV_112525.xlsx",
        "final_url": "https://www.comelec.gov.ph/php-tpls-attachments/2025NLE/Statistics/2025_NLE_VotersTurnoutbyCityMun_OFOV_112525.xlsx",
        "http_status": 200,
        "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "http_last_modified": "2025-12-02T06:42:52Z",
        "bytes": 225209,
        "sha256": "316647c5b417fedc2fa27a400fee4f705a48f9235cefa5127949cc58dbaa5d9d",
        "artifact_status": "final_statistics"
      }
    ],
    "default_targets": [
      {
        "election_key": "nle_2028",
        "election_date": "2028-05-08",
        "contest_key": "voter_turnout",
        "geography_key": "philippines",
        "option_key": "did_not_vote",
        "option_group_key": "did_not_vote"
      },
      {
        "election_key": "nle_2028",
        "election_date": "2028-05-08",
        "contest_key": "voter_turnout",
        "geography_key": "philippines",
        "option_key": "voted",
        "option_group_key": "voted"
      }
    ],
    "release_gate": {
      "protocol": "strict_walk_forward",
      "minimum_training_elections": 3,
      "minimum_holdout_elections": 2,
      "maximum_mae_percentage_points": 5.0,
      "minimum_improvement_vs_last_result_percentage_points": 0.0,
      "minimum_interval_coverage": 0.8,
      "interval_confidence": 0.8,
      "observed_holdout_elections": 9,
      "observed_mae_percentage_points": 4.299509180109767,
      "observed_improvement_vs_last_result_percentage_points": 0.0,
      "observed_interval_coverage": 0.8888888888888888,
      "selected_method": "last_result",
      "validation_design": "retrospective_walk_forward",
      "sealed_out_of_time_holdout": false,
      "retrospective_quality_gate_passed": true,
      "evidence_status": "experimental"
    },
    "scope_limitations": [
      "2022 includes local absentee voting and 63 BARMM barangays; 2025 is the Local AES row.",
      "Supports aggregate national turnout only, not candidate, party, individual, persuasion, or causal-effect prediction.",
      "The 2025 outcome was not pre-registered as a sealed holdout before model development; walk-forward evidence remains retrospective and experimental.",
      "Raw hashes identify retrieved bytes but are not agency digital signatures."
    ],
    "attribution": "Derived from official aggregate statistics published by the Philippine Commission on Elections. SIMULA transformation is not an official COMELEC product or endorsement.",
    "reproduction": {
      "manifest_path": "docs/data/comelec-national-turnout-1992-2025.json",
      "raw_directory": "docs/data/raw/comelec-national-turnout-1992-2025",
      "verification_command": "uv run --frozen python scripts/acquire_comelec_turnout.py"
    }
  }
  $manifest$::jsonb
);

insert into api.aggregate_forecast_observations (
  dataset_id, election_key, election_date, contest_key, geography_key,
  option_key, option_group_key, votes, valid_votes
) select
  datasets.id,
  observations.election_key,
  observations.election_date::date,
  observations.contest_key,
  observations.geography_key,
  observations.option_key,
  observations.option_group_key,
  observations.votes,
  observations.valid_votes
from api.aggregate_forecast_datasets as datasets
cross join (values
  ('nle_1992', '1992-05-11', 'voter_turnout', 'philippines', 'did_not_vote', 'did_not_vote', 7886125, 32141079),
  ('nle_1992', '1992-05-11', 'voter_turnout', 'philippines', 'voted', 'voted', 24254954, 32141079),
  ('nle_1995', '1995-05-08', 'voter_turnout', 'philippines', 'did_not_vote', 'did_not_vote', 10678649, 36415154),
  ('nle_1995', '1995-05-08', 'voter_turnout', 'philippines', 'voted', 'voted', 25736505, 36415154),
  ('nle_1998', '1998-05-11', 'voter_turnout', 'philippines', 'did_not_vote', 'did_not_vote', 4642747, 34117056),
  ('nle_1998', '1998-05-11', 'voter_turnout', 'philippines', 'voted', 'voted', 29474309, 34117056),
  ('nle_2001', '2001-05-14', 'voter_turnout', 'philippines', 'did_not_vote', 'did_not_vote', 8617630, 36354898),
  ('nle_2001', '2001-05-14', 'voter_turnout', 'philippines', 'voted', 'voted', 27737268, 36354898),
  ('nle_2004', '2004-05-10', 'voter_turnout', 'philippines', 'did_not_vote', 'did_not_vote', 10012542, 43522634),
  ('nle_2004', '2004-05-10', 'voter_turnout', 'philippines', 'voted', 'voted', 33510092, 43522634),
  ('nle_2007', '2007-05-14', 'voter_turnout', 'philippines', 'did_not_vote', 'did_not_vote', 12072192, 44881129),
  ('nle_2007', '2007-05-14', 'voter_turnout', 'philippines', 'voted', 'voted', 32808937, 44881129),
  ('nle_2010', '2010-05-10', 'voter_turnout', 'philippines', 'did_not_vote', 'did_not_vote', 12797643, 50977118),
  ('nle_2010', '2010-05-10', 'voter_turnout', 'philippines', 'voted', 'voted', 38179475, 50977118),
  ('nle_2013', '2013-05-13', 'voter_turnout', 'philippines', 'did_not_vote', 'did_not_vote', 11800324, 52014648),
  ('nle_2013', '2013-05-13', 'voter_turnout', 'philippines', 'voted', 'voted', 40214324, 52014648),
  ('nle_2016', '2016-05-09', 'voter_turnout', 'philippines', 'did_not_vote', 'did_not_vote', 9813996, 54363844),
  ('nle_2016', '2016-05-09', 'voter_turnout', 'philippines', 'voted', 'voted', 44549848, 54363844),
  ('nle_2019', '2019-05-13', 'voter_turnout', 'philippines', 'did_not_vote', 'did_not_vote', 14906632, 61843771),
  ('nle_2019', '2019-05-13', 'voter_turnout', 'philippines', 'voted', 'voted', 46937139, 61843771),
  ('nle_2022', '2022-05-09', 'voter_turnout', 'philippines', 'did_not_vote', 'did_not_vote', 10399867, 65831806),
  ('nle_2022', '2022-05-09', 'voter_turnout', 'philippines', 'voted', 'voted', 55431939, 65831806),
  ('nle_2025', '2025-05-12', 'voter_turnout', 'philippines', 'did_not_vote', 'did_not_vote', 11361554, 68431965),
  ('nle_2025', '2025-05-12', 'voter_turnout', 'philippines', 'voted', 'voted', 57070411, 68431965)
) as observations(
  election_key, election_date, contest_key, geography_key,
  option_key, option_group_key, votes, valid_votes
)
where datasets.source_key = 'comelec_national_turnout'
  and datasets.source_version = 'retrieved_2026_08_07';

update api.aggregate_forecast_datasets
set status = 'admitted',
    authorized_for_forecasting = true,
    admitted_at = pg_catalog.statement_timestamp()
where source_key = 'comelec_national_turnout'
  and source_version = 'retrieved_2026_08_07';

grant execute on function private.runtime_schema_readiness_v3() to postgres;
grant execute on function private.runtime_observability_snapshot_v3() to postgres;

create or replace function private.runtime_schema_readiness_v3()
returns table (migration_version bigint, rls_force_enabled boolean)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  if session_user not in ('simula_api', 'simula_worker') then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  return query
  select
    20260807104033::bigint,
    not exists (
      select 1
      from pg_catalog.pg_class as relations
      join pg_catalog.pg_namespace as schemas on schemas.oid = relations.relnamespace
      where schemas.nspname in ('api', 'private')
        and relations.relkind in ('r', 'p')
        and (not relations.relrowsecurity or not relations.relforcerowsecurity)
    );
end
$function$;

revoke all on function private.runtime_schema_readiness_v3()
  from public, anon, authenticated, simula_api, simula_worker,
    simula_worker_owner, postgres;
grant execute on function private.runtime_schema_readiness_v3()
  to simula_api, simula_worker;

create or replace function private.runtime_observability_snapshot_v3()
returns table (
  migration_version bigint,
  rls_force_enabled boolean,
  queued_count bigint,
  running_count bigint,
  retrying_count bigint,
  cancel_requested_count bigint,
  succeeded_count bigint,
  failed_count bigint,
  canceled_count bigint,
  stuck_lease_count bigint,
  oldest_cancel_requested_age_seconds numeric
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  if session_user not in ('simula_api', 'simula_worker') then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  return query
  select
    20260807104033::bigint,
    not exists (
      select 1
      from pg_catalog.pg_class as relations
      join pg_catalog.pg_namespace as schemas on schemas.oid = relations.relnamespace
      where schemas.nspname in ('api', 'private')
        and relations.relkind in ('r', 'p')
        and (not relations.relrowsecurity or not relations.relforcerowsecurity)
    ),
    pg_catalog.count(*) filter (where runs.state = 'queued'),
    pg_catalog.count(*) filter (where runs.state = 'running'),
    pg_catalog.count(*) filter (where runs.state = 'retrying'),
    pg_catalog.count(*) filter (where runs.state = 'cancel_requested'),
    pg_catalog.count(*) filter (where runs.state = 'succeeded'),
    pg_catalog.count(*) filter (where runs.state = 'failed'),
    pg_catalog.count(*) filter (where runs.state = 'canceled'),
    pg_catalog.count(*) filter (
      where runs.state in ('running', 'retrying')
        and runs.worker_lease_expires_at < pg_catalog.statement_timestamp()
    ),
    coalesce(
      extract(
        epoch from pg_catalog.statement_timestamp()
          - pg_catalog.min(
            case when runs.state = 'cancel_requested' then runs.updated_at end
          )
      ),
      0::numeric
    )
  from api.simulation_runs as runs;
end
$function$;

revoke all on function private.runtime_observability_snapshot_v3()
  from public, anon, authenticated, simula_api, simula_worker,
    simula_worker_owner, postgres;
grant execute on function private.runtime_observability_snapshot_v3()
  to simula_api, simula_worker;

revoke execute on function private.runtime_schema_readiness_v3() from postgres;
revoke execute on function private.runtime_observability_snapshot_v3() from postgres;

set role postgres;
