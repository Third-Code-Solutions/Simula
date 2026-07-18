-- PRIV-DEL-001: let privileged organization deletion remove the complete
-- Phase 2 graph. Runtime roles retain no direct DELETE authority.

alter table api.simulation_runs
  drop constraint simulation_runs_project_foreign_key;

alter table api.simulation_runs
  add constraint simulation_runs_project_foreign_key
  foreign key (organization_id, project_id)
  references api.projects (organization_id, id)
  on delete cascade;

alter table api.simulation_runs
  drop constraint simulation_runs_stimulus_version_foreign_key;

alter table api.simulation_runs
  add constraint simulation_runs_stimulus_version_foreign_key
  foreign key (organization_id, stimulus_version_id)
  references api.stimulus_versions (organization_id, id)
  on delete cascade;
