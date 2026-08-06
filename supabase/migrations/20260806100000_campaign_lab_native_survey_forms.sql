-- Native SIMULA survey definitions are tenant-scoped Campaign Lab artifacts.
-- Respondent submissions continue through the existing worker-only
-- survey_import envelope; this migration adds no public response table.

set role postgres;

alter table api.campaign_lab_artifacts
  drop constraint if exists campaign_lab_artifacts_kind_valid;

alter table api.campaign_lab_artifacts
  add constraint campaign_lab_artifacts_kind_valid check (
    kind in (
      'research_source',
      'cohort',
      'variant',
      'interview',
      'survey_form',
      'survey_import',
      'calibration',
      'historical_backtest',
      'cultural_evaluation',
      'compliance_review',
      'report'
    )
  );

set role postgres;
