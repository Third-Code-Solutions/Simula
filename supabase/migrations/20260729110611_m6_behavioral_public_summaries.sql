-- Public campaign-lab projections derived atomically from the canonical
-- behavioral artifact. No rationale, traits, dimensions, or memory is exposed.

set role postgres;

set role simula_worker_owner;
grant references (organization_id, run_id)
on table api.behavioral_run_results
to postgres;
set role postgres;

create table api.behavioral_fleet_summaries (
  organization_id uuid not null,
  run_id uuid primary key,
  agent_count integer not null,
  llm_agent_count integer not null,
  rule_agent_count integer not null,
  cohort_count integer not null,
  relationship_count integer not null,
  synthetic_identity boolean not null default true,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint behavioral_fleet_summaries_run_foreign_key
    foreign key (organization_id, run_id)
    references api.behavioral_run_results (organization_id, run_id)
    on delete cascade,
  constraint behavioral_fleet_summaries_counts_valid check (
    agent_count between 10 and 2000
    and llm_agent_count between 0 and 100
    and rule_agent_count between 0 and 2000
    and llm_agent_count + rule_agent_count = agent_count
    and cohort_count between 1 and agent_count
    and relationship_count between 0 and agent_count * agent_count
  ),
  constraint behavioral_fleet_summaries_synthetic_valid
    check (synthetic_identity)
);

create index behavioral_fleet_summaries_organization_created_idx
  on api.behavioral_fleet_summaries (
    organization_id, created_at desc, run_id
  );

create table api.behavioral_round_summaries (
  organization_id uuid not null,
  run_id uuid not null,
  round_index smallint not null,
  event_count integer not null,
  action_shares jsonb not null,
  mean_valence double precision not null,
  mean_attention double precision not null,
  mean_resonance double precision not null,
  mean_trust double precision not null,
  evidence_node_ids text[] not null,
  checksum_sha256 text not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  primary key (run_id, round_index),
  constraint behavioral_round_summaries_run_foreign_key
    foreign key (organization_id, run_id)
    references api.behavioral_run_results (organization_id, run_id)
    on delete cascade,
  constraint behavioral_round_summaries_round_valid
    check (round_index between 1 and 5 and event_count between 10 and 2000),
  constraint behavioral_round_summaries_actions_valid check (
    pg_catalog.jsonb_typeof(action_shares) = 'array'
    and pg_catalog.jsonb_array_length(action_shares) = 8
    and pg_catalog.octet_length(action_shares::text) <= 2048
  ),
  constraint behavioral_round_summaries_metrics_valid check (
    mean_valence between -1.0 and 1.0
    and mean_attention between 0.0 and 100.0
    and mean_resonance between 0.0 and 100.0
    and mean_trust between 0.0 and 100.0
  ),
  constraint behavioral_round_summaries_evidence_valid
    check (pg_catalog.cardinality(evidence_node_ids) between 1 and 500),
  constraint behavioral_round_summaries_checksum_valid
    check (checksum_sha256 ~ '^[0-9a-f]{64}$')
);

create index behavioral_round_summaries_organization_run_idx
  on api.behavioral_round_summaries (
    organization_id, run_id, round_index
  );

create table api.behavioral_agent_public_summaries (
  organization_id uuid not null,
  run_id uuid not null,
  agent_id uuid not null,
  tier text not null,
  round_count smallint not null,
  latest_action text not null,
  evidence_event_ids uuid[] not null,
  synthetic_identity boolean not null default true,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  primary key (run_id, agent_id),
  constraint behavioral_agent_public_summaries_run_foreign_key
    foreign key (organization_id, run_id)
    references api.behavioral_run_results (organization_id, run_id)
    on delete cascade,
  constraint behavioral_agent_public_summaries_tier_valid
    check (tier in ('llm', 'rule')),
  constraint behavioral_agent_public_summaries_rounds_valid check (
    round_count between 1 and 5
    and pg_catalog.cardinality(evidence_event_ids) = round_count
  ),
  constraint behavioral_agent_public_summaries_action_valid check (
    latest_action in (
      'attend', 'resonate', 'question', 'reject', 'share', 'discuss',
      'reconsider', 'ignore'
    )
  ),
  constraint behavioral_agent_public_summaries_synthetic_valid
    check (synthetic_identity)
);

create index behavioral_agent_public_summaries_organization_run_idx
  on api.behavioral_agent_public_summaries (
    organization_id, run_id, agent_id
  );

alter table api.behavioral_fleet_summaries enable row level security;
alter table api.behavioral_fleet_summaries force row level security;
alter table api.behavioral_round_summaries enable row level security;
alter table api.behavioral_round_summaries force row level security;
alter table api.behavioral_agent_public_summaries enable row level security;
alter table api.behavioral_agent_public_summaries force row level security;

create policy behavioral_fleet_summaries_api_select
on api.behavioral_fleet_summaries
for select
to simula_api
using (
  private.is_org_member(
    behavioral_fleet_summaries.organization_id,
    private.verified_subject()
  )
);

create policy behavioral_fleet_summaries_worker_owner_select
on api.behavioral_fleet_summaries
for select
to simula_worker_owner
using (true);

create policy behavioral_fleet_summaries_worker_owner_insert
on api.behavioral_fleet_summaries
for insert
to simula_worker_owner
with check (true);

create policy behavioral_round_summaries_api_select
on api.behavioral_round_summaries
for select
to simula_api
using (
  private.is_org_member(
    behavioral_round_summaries.organization_id,
    private.verified_subject()
  )
);

create policy behavioral_round_summaries_worker_owner_select
on api.behavioral_round_summaries
for select
to simula_worker_owner
using (true);

create policy behavioral_round_summaries_worker_owner_insert
on api.behavioral_round_summaries
for insert
to simula_worker_owner
with check (true);

create policy behavioral_agent_public_summaries_api_select
on api.behavioral_agent_public_summaries
for select
to simula_api
using (
  private.is_org_member(
    behavioral_agent_public_summaries.organization_id,
    private.verified_subject()
  )
);

create policy behavioral_agent_public_summaries_worker_owner_select
on api.behavioral_agent_public_summaries
for select
to simula_worker_owner
using (true);

create policy behavioral_agent_public_summaries_worker_owner_insert
on api.behavioral_agent_public_summaries
for insert
to simula_worker_owner
with check (true);

revoke all on table
  api.behavioral_fleet_summaries,
  api.behavioral_round_summaries,
  api.behavioral_agent_public_summaries
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner, postgres;

grant select on table
  api.behavioral_fleet_summaries,
  api.behavioral_round_summaries,
  api.behavioral_agent_public_summaries
to simula_api;

grant select, insert on table
  api.behavioral_fleet_summaries,
  api.behavioral_round_summaries,
  api.behavioral_agent_public_summaries
to simula_worker_owner;

grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create function private.normalize_behavioral_public_summaries(
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
  inserted_agents integer;
  inserted_fleet integer;
  inserted_rounds integer;
  expected_agents integer;
  expected_rounds integer;
begin
  artifact := pg_catalog.convert_from(requested_artifact, 'UTF8')::jsonb;
  perform 1
  from api.behavioral_run_results as results
  where results.organization_id = requested_organization_id
    and results.run_id = requested_run_id;
  if not found then
    raise no_data_found;
  end if;

  with agents as (
    select agent
    from pg_catalog.jsonb_array_elements(
      artifact #> '{fleet,agents}'
    ) as agent_items(agent)
  )
  insert into api.behavioral_fleet_summaries (
    organization_id, run_id, agent_count, llm_agent_count,
    rule_agent_count, cohort_count, relationship_count, synthetic_identity
  )
  select
    requested_organization_id,
    requested_run_id,
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (
      where agent ->> 'tier' = 'llm'
    )::integer,
    pg_catalog.count(*) filter (
      where agent ->> 'tier' = 'rule'
    )::integer,
    pg_catalog.count(distinct agent ->> 'cohort_key')::integer,
    pg_catalog.jsonb_array_length(
      artifact #> '{fleet,relationships}'
    ),
    pg_catalog.bool_and((agent ->> 'synthetic_identity')::boolean)
  from agents;

  get diagnostics inserted_fleet = row_count;

  insert into api.behavioral_round_summaries (
    organization_id, run_id, round_index, event_count, action_shares,
    mean_valence, mean_attention, mean_resonance, mean_trust,
    evidence_node_ids, checksum_sha256
  )
  select
    requested_organization_id,
    requested_run_id,
    (round_item ->> 'round_index')::smallint,
    pg_catalog.jsonb_array_length(round_item -> 'actions'),
    round_item #> '{pulse,action_shares}',
    (round_item #>> '{pulse,mean_valence}')::double precision,
    (round_item #>> '{pulse,mean_attention}')::double precision,
    (round_item #>> '{pulse,mean_resonance}')::double precision,
    (round_item #>> '{pulse,mean_trust}')::double precision,
    array(
      select item
      from pg_catalog.jsonb_array_elements_text(
        round_item #> '{pulse,evidence_node_ids}'
      ) as item
      order by item
    ),
    round_item #>> '{pulse,checksum_sha256}'
  from pg_catalog.jsonb_array_elements(
    artifact -> 'rounds'
  ) as round_items(round_item);

  get diagnostics inserted_rounds = row_count;

  with action_source as (
    select
      (action_item ->> 'agent_id')::uuid as agent_id,
      action_item ->> 'tier' as tier,
      (action_item ->> 'sequence')::integer as sequence,
      action_item ->> 'action' as action,
      (action_item ->> 'event_id')::uuid as event_id
    from pg_catalog.jsonb_array_elements(
      artifact -> 'rounds'
    ) as round_items(round_item)
    cross join lateral pg_catalog.jsonb_array_elements(
      round_item -> 'actions'
    ) as action_items(action_item)
  ),
  agent_aggregate as (
    select
      agent_id,
      pg_catalog.min(tier) as tier,
      pg_catalog.count(*)::smallint as round_count,
      pg_catalog.array_agg(event_id order by sequence) as evidence_event_ids
    from action_source
    group by agent_id
    having pg_catalog.min(tier) = pg_catalog.max(tier)
  ),
  latest_action as (
    select distinct on (agent_id)
      agent_id,
      action
    from action_source
    order by agent_id, sequence desc
  )
  insert into api.behavioral_agent_public_summaries (
    organization_id, run_id, agent_id, tier, round_count, latest_action,
    evidence_event_ids, synthetic_identity
  )
  select
    requested_organization_id,
    requested_run_id,
    aggregate.agent_id,
    aggregate.tier,
    aggregate.round_count,
    latest.action,
    aggregate.evidence_event_ids,
    true
  from agent_aggregate as aggregate
  inner join latest_action as latest
    on latest.agent_id = aggregate.agent_id
  order by aggregate.agent_id;

  get diagnostics inserted_agents = row_count;
  expected_agents := pg_catalog.jsonb_array_length(
    artifact #> '{fleet,agents}'
  );
  expected_rounds := pg_catalog.jsonb_array_length(artifact -> 'rounds');

  if inserted_fleet <> 1
    or inserted_agents <> expected_agents
    or inserted_rounds <> expected_rounds
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_behavioral_public_summary_normalization';
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
      message = 'invalid_behavioral_public_summary_normalization';
end
$function$;

create function private.normalize_behavioral_public_summaries_trigger()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  perform private.normalize_behavioral_public_summaries(
    new.organization_id,
    new.run_id,
    new.canonical_artifact
  );
  return new;
end
$function$;

select private.normalize_behavioral_public_summaries(
  payloads.organization_id,
  payloads.run_id,
  payloads.canonical_artifact
)
from private.behavioral_result_payloads as payloads;

create trigger behavioral_result_payload_public_summary
after insert
on private.behavioral_result_payloads
for each row
execute function private.normalize_behavioral_public_summaries_trigger();

revoke all on function private.normalize_behavioral_public_summaries(
  uuid, uuid, bytea
)
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner, postgres;

revoke all on function private.normalize_behavioral_public_summaries_trigger()
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner, postgres;

set role postgres;
revoke create on schema private from simula_worker_owner;
revoke all on all sequences in schema api, private
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner, postgres;

set role simula_worker_owner;
revoke references (organization_id, run_id)
on table api.behavioral_run_results
from postgres;
set role postgres;
