-- Campaign Simulation Lab evidence metadata.
-- The existing report artifact is the durable, tenant-scoped boundary for
-- methodology output. Repeated synthetic runs stay aggregate/cohort-only and
-- are indexed here without introducing a second mutable result store.

set role postgres;

alter table api.report_artifacts
  add column if not exists evidence_status text not null default 'synthetic_only',
  add column if not exists repetition_count integer not null default 1,
  add column if not exists stability_label text not null default 'not_run';

alter table api.report_artifacts
  add constraint report_artifacts_evidence_status_valid
    check (
      evidence_status in (
        'synthetic_only',
        'partially_calibrated',
        'survey_calibrated',
        'historically_backtested',
        'insufficient_evidence'
      )
    ),
  add constraint report_artifacts_repetition_count_valid
    check (repetition_count between 1 and 10),
  add constraint report_artifacts_stability_label_valid
    check (stability_label in ('stable', 'unstable', 'insufficient_repetitions', 'not_run'));

create index if not exists report_artifacts_evidence_status_idx
  on api.report_artifacts (organization_id, evidence_status, created_at desc, id);

grant create on schema private to simula_command_owner;
set role simula_command_owner;

create or replace function private.derive_campaign_evidence_metadata()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  repeated jsonb;
  requested_repetition_count integer;
  requested_stability_label text;
begin
  new.evidence_status := 'synthetic_only';
  new.repetition_count := 1;
  new.stability_label := 'not_run';
  repeated := new.artifact -> 'repeated_simulation';
  if pg_catalog.jsonb_typeof(repeated) <> 'object' then
    return new;
  end if;

  begin
    requested_repetition_count := (repeated ->> 'repetition_count')::integer;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'invalid_repeated_simulation';
  end;
  requested_stability_label := repeated ->> 'stability_label';
  if requested_repetition_count is null
    or requested_repetition_count not between 1 and 10
    or requested_stability_label not in ('stable', 'unstable', 'insufficient_repetitions')
    or repeated ->> 'evidence_status' <> 'Synthetic-only' then
    raise exception using errcode = '22023', message = 'invalid_repeated_simulation';
  end if;
  new.repetition_count := requested_repetition_count;
  new.stability_label := requested_stability_label;
  return new;
end
$function$;

revoke all on function private.derive_campaign_evidence_metadata()
  from public, anon, authenticated, simula_api, simula_worker,
    simula_worker_owner;

reset role;

set role postgres;
grant trigger on table api.report_artifacts to simula_command_owner;
set role simula_command_owner;

create trigger report_artifacts_campaign_evidence_guard
before insert or update of artifact
on api.report_artifacts
for each row
execute function private.derive_campaign_evidence_metadata();

reset role;

set role postgres;

comment on column api.report_artifacts.evidence_status is
  'Evidence admission label derived from the aggregate report artifact; synthetic_only is the default.';
comment on column api.report_artifacts.repetition_count is
  'Bounded count of seeded synthetic repetitions attached to this artifact.';
comment on column api.report_artifacts.stability_label is
  'Repeated-run stability diagnostic; not a population uncertainty interval.';

set role postgres;
