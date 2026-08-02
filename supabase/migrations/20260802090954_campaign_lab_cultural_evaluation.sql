-- Persist human-reviewed English, Filipino, and Taglish evaluation artifacts.

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
      'survey_import',
      'calibration',
      'historical_backtest',
      'cultural_evaluation',
      'compliance_review',
      'report'
    )
  );
