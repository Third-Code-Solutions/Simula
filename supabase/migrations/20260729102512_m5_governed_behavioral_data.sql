-- Normalize the immutable behavioral artifact into queryable, tenant-bound
-- execution evidence. The canonical payload remains the replay authority.

set role postgres;

set role simula_worker_owner;
grant references (organization_id, run_id)
on table api.behavioral_run_results
to postgres;
set role postgres;

do $migration$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraints
    where constraints.conname =
      'behavioral_run_results_organization_run_unique'
      and constraints.conrelid =
        'api.behavioral_run_results'::pg_catalog.regclass
  ) then
    alter table api.behavioral_run_results
      add constraint behavioral_run_results_organization_run_unique
      unique (organization_id, run_id);
  end if;
end
$migration$;

create table api.context_graph_versions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  run_id uuid not null,
  graph_id uuid not null,
  graph_version integer not null,
  checksum_sha256 text not null,
  node_count integer not null,
  edge_count integer not null,
  manifest jsonb not null,
  limitations text[] not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint context_graph_versions_organization_id_id_unique
    unique (organization_id, id),
  constraint context_graph_versions_run_unique unique (run_id),
  constraint context_graph_versions_run_foreign_key
    foreign key (organization_id, run_id)
    references api.behavioral_run_results (organization_id, run_id)
    on delete cascade,
  constraint context_graph_versions_version_valid
    check (graph_version between 1 and 1000000),
  constraint context_graph_versions_checksum_valid
    check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  constraint context_graph_versions_counts_valid
    check (node_count between 1 and 500 and edge_count between 0 and 2000),
  constraint context_graph_versions_manifest_valid check (
    pg_catalog.jsonb_typeof(manifest) = 'object'
    and pg_catalog.octet_length(manifest::text) <= 2097152
  ),
  constraint context_graph_versions_limitations_valid
    check (pg_catalog.cardinality(limitations) between 1 and 20)
);

create index context_graph_versions_organization_created_idx
  on api.context_graph_versions (organization_id, created_at desc, id);
create index context_graph_versions_graph_id_idx
  on api.context_graph_versions (organization_id, graph_id, graph_version desc);

create table private.behavioral_agent_fleets (
  organization_id uuid not null,
  run_id uuid primary key,
  study_id uuid not null,
  checksum_sha256 text not null,
  agent_count integer not null,
  llm_agent_count integer not null,
  manifest jsonb not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint behavioral_agent_fleets_run_foreign_key
    foreign key (organization_id, run_id)
    references api.behavioral_run_results (organization_id, run_id)
    on delete cascade,
  constraint behavioral_agent_fleets_checksum_valid
    check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  constraint behavioral_agent_fleets_counts_valid check (
    agent_count between 10 and 2000
    and llm_agent_count between 0 and 100
    and llm_agent_count <= agent_count
  ),
  constraint behavioral_agent_fleets_manifest_valid check (
    pg_catalog.jsonb_typeof(manifest) = 'object'
    and pg_catalog.octet_length(manifest::text) <= 8388608
  )
);

create table private.behavioral_action_events (
  event_id uuid primary key,
  organization_id uuid not null,
  run_id uuid not null,
  sequence integer not null,
  round_index smallint not null,
  agent_id uuid not null,
  cohort_key text not null,
  segment_key text not null,
  tier text not null,
  weight double precision not null,
  action text not null,
  target_agent_id uuid,
  valence double precision not null,
  attention double precision not null,
  resonance double precision not null,
  trust double precision not null,
  confidence double precision not null,
  evidence_node_ids text[] not null,
  synthetic_rationale text not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint behavioral_action_events_organization_run_event_unique
    unique (organization_id, run_id, event_id),
  constraint behavioral_action_events_run_sequence_unique
    unique (run_id, sequence),
  constraint behavioral_action_events_run_round_agent_unique
    unique (run_id, round_index, agent_id),
  constraint behavioral_action_events_run_foreign_key
    foreign key (organization_id, run_id)
    references api.behavioral_run_results (organization_id, run_id)
    on delete cascade,
  constraint behavioral_action_events_sequence_valid
    check (sequence between 1 and 20000),
  constraint behavioral_action_events_round_valid
    check (round_index between 1 and 10),
  constraint behavioral_action_events_keys_valid check (
    cohort_key ~ '^[a-z][a-z0-9_]{0,63}$'
    and segment_key ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint behavioral_action_events_tier_valid
    check (tier in ('llm', 'rule')),
  constraint behavioral_action_events_weight_valid
    check (weight > 0.0 and weight <= 1.0),
  constraint behavioral_action_events_action_valid check (
    action in (
      'attend', 'resonate', 'question', 'reject', 'share', 'discuss',
      'reconsider', 'ignore'
    )
  ),
  constraint behavioral_action_events_values_valid check (
    valence between -1.0 and 1.0
    and attention between 0.0 and 100.0
    and resonance between 0.0 and 100.0
    and trust between 0.0 and 100.0
    and confidence between 0.0 and 1.0
  ),
  constraint behavioral_action_events_evidence_valid check (
    pg_catalog.cardinality(evidence_node_ids) between 1 and 20
    and pg_catalog.array_position(evidence_node_ids, null) is null
  ),
  constraint behavioral_action_events_rationale_valid check (
    pg_catalog.char_length(synthetic_rationale) between 1 and 1000
    and pg_catalog.octet_length(synthetic_rationale) <= 4096
  )
);

create index behavioral_action_events_run_round_sequence_idx
  on private.behavioral_action_events (run_id, round_index, sequence);
create index behavioral_action_events_run_agent_sequence_idx
  on private.behavioral_action_events (run_id, agent_id, sequence);
create index behavioral_action_events_run_segment_idx
  on private.behavioral_action_events (run_id, segment_key, sequence);

create table private.behavioral_agent_memories (
  organization_id uuid not null,
  run_id uuid not null,
  agent_id uuid not null,
  entry_count smallint not null,
  entries jsonb not null,
  run_scoped boolean not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  primary key (run_id, agent_id),
  constraint behavioral_agent_memories_run_foreign_key
    foreign key (organization_id, run_id)
    references api.behavioral_run_results (organization_id, run_id)
    on delete cascade,
  constraint behavioral_agent_memories_entry_count_valid
    check (entry_count between 0 and 32),
  constraint behavioral_agent_memories_entries_valid check (
    pg_catalog.jsonb_typeof(entries) = 'array'
    and pg_catalog.jsonb_array_length(entries) = entry_count
    and pg_catalog.octet_length(entries::text) <= 65536
  ),
  constraint behavioral_agent_memories_scope_valid check (run_scoped)
);

create index behavioral_agent_memories_organization_run_idx
  on private.behavioral_agent_memories (organization_id, run_id, agent_id);

create table api.behavioral_report_evidence (
  organization_id uuid not null,
  run_id uuid not null,
  evidence_kind text not null,
  evidence_key text not null,
  output_type text not null,
  action_event_id uuid not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  primary key (run_id, evidence_kind, evidence_key, action_event_id),
  constraint behavioral_report_evidence_run_foreign_key
    foreign key (organization_id, run_id)
    references api.behavioral_run_results (organization_id, run_id)
    on delete cascade,
  constraint behavioral_report_evidence_action_foreign_key
    foreign key (organization_id, run_id, action_event_id)
    references private.behavioral_action_events (
      organization_id, run_id, event_id
    )
    on delete cascade,
  constraint behavioral_report_evidence_kind_valid
    check (evidence_kind in ('finding', 'score')),
  constraint behavioral_report_evidence_key_valid
    check (evidence_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  constraint behavioral_report_evidence_output_type_valid check (
    output_type in ('heuristic', 'qualitative', 'recommendation')
    and (evidence_kind <> 'score' or output_type = 'heuristic')
  )
);

create index behavioral_report_evidence_action_event_idx
  on api.behavioral_report_evidence (action_event_id);
create index behavioral_report_evidence_run_key_idx
  on api.behavioral_report_evidence (
    organization_id, run_id, evidence_kind, evidence_key
  );

alter table api.context_graph_versions enable row level security;
alter table api.context_graph_versions force row level security;
alter table private.behavioral_agent_fleets enable row level security;
alter table private.behavioral_agent_fleets force row level security;
alter table private.behavioral_action_events enable row level security;
alter table private.behavioral_action_events force row level security;
alter table private.behavioral_agent_memories enable row level security;
alter table private.behavioral_agent_memories force row level security;
alter table api.behavioral_report_evidence enable row level security;
alter table api.behavioral_report_evidence force row level security;

create policy context_graph_versions_api_select
on api.context_graph_versions
for select
to simula_api
using (
  private.is_org_member(
    context_graph_versions.organization_id,
    private.verified_subject()
  )
);

create policy context_graph_versions_worker_owner_select
on api.context_graph_versions
for select
to simula_worker_owner
using (true);

create policy context_graph_versions_worker_owner_insert
on api.context_graph_versions
for insert
to simula_worker_owner
with check (true);

create policy behavioral_agent_fleets_worker_owner_select
on private.behavioral_agent_fleets
for select
to simula_worker_owner
using (true);

create policy behavioral_agent_fleets_worker_owner_insert
on private.behavioral_agent_fleets
for insert
to simula_worker_owner
with check (true);

create policy behavioral_action_events_worker_owner_select
on private.behavioral_action_events
for select
to simula_worker_owner
using (true);

create policy behavioral_action_events_worker_owner_insert
on private.behavioral_action_events
for insert
to simula_worker_owner
with check (true);

create policy behavioral_agent_memories_worker_owner_select
on private.behavioral_agent_memories
for select
to simula_worker_owner
using (true);

create policy behavioral_agent_memories_worker_owner_insert
on private.behavioral_agent_memories
for insert
to simula_worker_owner
with check (true);

create policy behavioral_report_evidence_api_select
on api.behavioral_report_evidence
for select
to simula_api
using (
  private.is_org_member(
    behavioral_report_evidence.organization_id,
    private.verified_subject()
  )
);

create policy behavioral_report_evidence_worker_owner_select
on api.behavioral_report_evidence
for select
to simula_worker_owner
using (true);

create policy behavioral_report_evidence_worker_owner_insert
on api.behavioral_report_evidence
for insert
to simula_worker_owner
with check (true);

revoke all on table
  api.context_graph_versions,
  api.behavioral_report_evidence,
  private.behavioral_agent_fleets,
  private.behavioral_action_events,
  private.behavioral_agent_memories
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner, postgres;

grant select on table
  api.context_graph_versions,
  api.behavioral_report_evidence
to simula_api;

grant select, insert on table
  api.context_graph_versions,
  api.behavioral_report_evidence,
  private.behavioral_agent_fleets,
  private.behavioral_action_events,
  private.behavioral_agent_memories
to simula_worker_owner;

grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create function private.normalize_behavioral_result_payload(
  requested_organization_id uuid,
  requested_run_id uuid,
  requested_artifact bytea
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  artifact jsonb;
  selected_result api.behavioral_run_results%rowtype;
  inserted_agents integer;
  inserted_actions integer;
  inserted_memories integer;
  expected_actions integer;
begin
  artifact := pg_catalog.convert_from(requested_artifact, 'UTF8')::jsonb;
  select results.* into strict selected_result
  from api.behavioral_run_results as results
  where results.organization_id = requested_organization_id
    and results.run_id = requested_run_id;

  insert into api.context_graph_versions (
    organization_id, run_id, graph_id, graph_version, checksum_sha256,
    node_count, edge_count, manifest, limitations
  ) values (
    requested_organization_id,
    requested_run_id,
    (artifact #>> '{context_graph,graph_id}')::uuid,
    (artifact #>> '{context_graph,version}')::integer,
    artifact #>> '{context_graph,checksum_sha256}',
    pg_catalog.jsonb_array_length(artifact #> '{context_graph,nodes}'),
    pg_catalog.jsonb_array_length(artifact #> '{context_graph,edges}'),
    artifact -> 'context_graph',
    array(
      select item
      from pg_catalog.jsonb_array_elements_text(
        artifact #> '{context_graph,limitations}'
      ) as item
    )
  );

  insert into private.behavioral_agent_fleets (
    organization_id, run_id, study_id, checksum_sha256, agent_count,
    llm_agent_count, manifest
  ) values (
    requested_organization_id,
    requested_run_id,
    (artifact ->> 'study_id')::uuid,
    artifact #>> '{fleet,checksum_sha256}',
    pg_catalog.jsonb_array_length(artifact #> '{fleet,agents}'),
    (artifact #>> '{fleet,configuration,llm_agent_count}')::integer,
    artifact -> 'fleet'
  );

  get diagnostics inserted_agents = row_count;

  insert into private.behavioral_action_events (
    event_id, organization_id, run_id, sequence, round_index, agent_id,
    cohort_key, segment_key, tier, weight, action, target_agent_id, valence,
    attention, resonance, trust, confidence, evidence_node_ids,
    synthetic_rationale
  )
  select
    (action_item ->> 'event_id')::uuid,
    requested_organization_id,
    requested_run_id,
    (action_item ->> 'sequence')::integer,
    (action_item ->> 'round_index')::smallint,
    (action_item ->> 'agent_id')::uuid,
    action_item ->> 'cohort_key',
    action_item ->> 'segment_key',
    action_item ->> 'tier',
    (action_item ->> 'weight')::double precision,
    action_item ->> 'action',
    case
      when action_item -> 'target_agent_id' = 'null'::jsonb then null
      else (action_item ->> 'target_agent_id')::uuid
    end,
    (action_item ->> 'valence')::double precision,
    (action_item ->> 'attention')::double precision,
    (action_item ->> 'resonance')::double precision,
    (action_item ->> 'trust')::double precision,
    (action_item ->> 'confidence')::double precision,
    array(
      select item
      from pg_catalog.jsonb_array_elements_text(
        action_item -> 'evidence_node_ids'
      ) as item
      order by item
    ),
    action_item ->> 'synthetic_rationale'
  from pg_catalog.jsonb_array_elements(artifact -> 'rounds') as round_item
  cross join lateral pg_catalog.jsonb_array_elements(
    round_item -> 'actions'
  ) as action_item;

  get diagnostics inserted_actions = row_count;

  insert into private.behavioral_agent_memories (
    organization_id, run_id, agent_id, entry_count, entries, run_scoped
  )
  select
    requested_organization_id,
    requested_run_id,
    (memory_item ->> 'agent_id')::uuid,
    pg_catalog.jsonb_array_length(memory_item -> 'entries'),
    memory_item -> 'entries',
    (memory_item ->> 'run_scoped')::boolean
  from pg_catalog.jsonb_array_elements(artifact -> 'memory') as memory_item;

  get diagnostics inserted_memories = row_count;

  insert into api.behavioral_report_evidence (
    organization_id, run_id, evidence_kind, evidence_key, output_type,
    action_event_id
  )
  select
    requested_organization_id,
    requested_run_id,
    'finding',
    finding_item ->> 'finding_id',
    finding_item ->> 'output_type',
    (event_id #>> '{}')::uuid
  from pg_catalog.jsonb_array_elements(
    artifact #> '{report,findings}'
  ) as finding_item
  cross join lateral pg_catalog.jsonb_array_elements(
    finding_item -> 'evidence_event_ids'
  ) as event_id
  union all
  select
    requested_organization_id,
    requested_run_id,
    'score',
    score_item ->> 'key',
    score_item ->> 'score_type',
    (event_id #>> '{}')::uuid
  from pg_catalog.jsonb_array_elements(
    artifact #> '{report,scores}'
  ) as score_item
  cross join lateral pg_catalog.jsonb_array_elements(
    score_item -> 'evidence_event_ids'
  ) as event_id;

  expected_actions := selected_result.provider_calls;
  if inserted_agents <> 1
    or inserted_actions <> expected_actions
    or inserted_memories
      <> pg_catalog.jsonb_array_length(artifact #> '{fleet,agents}')
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_behavioral_normalization';
  end if;
  return;
exception
  when no_data_found
    or invalid_text_representation
    or numeric_value_out_of_range
    or null_value_not_allowed
    or check_violation
    or foreign_key_violation
    or unique_violation
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_behavioral_normalization';
end
$function$;

create function private.normalize_behavioral_result_payload_trigger()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  perform private.normalize_behavioral_result_payload(
    new.organization_id,
    new.run_id,
    new.canonical_artifact
  );
  return new;
end
$function$;

select private.normalize_behavioral_result_payload(
  payloads.organization_id,
  payloads.run_id,
  payloads.canonical_artifact
)
from private.behavioral_result_payloads as payloads;

create trigger behavioral_result_payload_normalize
after insert
on private.behavioral_result_payloads
for each row
execute function private.normalize_behavioral_result_payload_trigger();

revoke all on function private.normalize_behavioral_result_payload(
  uuid, uuid, bytea
)
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner, postgres;

revoke all on function private.normalize_behavioral_result_payload_trigger()
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner, postgres;

set role postgres;
revoke create on schema private from simula_worker_owner;

revoke all on all sequences in schema api, private
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner;

reset role;

-- Supabase records migration history in the same session after this script.
set role simula_worker_owner;
revoke references (organization_id, run_id)
on table api.behavioral_run_results
from postgres;
set role postgres;
