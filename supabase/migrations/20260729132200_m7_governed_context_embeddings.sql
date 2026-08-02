-- M7: governed, model-versioned context embeddings.
--
-- Retrieval is exact within one immutable context graph (maximum 500 nodes).
-- No model is admitted by this migration. Production ingestion and retrieval
-- therefore fail closed until rights and benchmark evidence are registered.

set role postgres;

create extension if not exists vector with schema extensions;

grant references (organization_id, id)
on table api.context_graph_versions
to postgres;

create table private.embedding_model_versions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  model_key text not null,
  model_version text not null,
  provider text not null,
  model_name text not null,
  dimensions integer not null,
  normalization text not null,
  artifact_sha256 text not null,
  rights_owner text,
  rights_license text,
  allowed_use text,
  prohibited_uses text[],
  license_reviewed_at timestamptz,
  benchmark_id text,
  benchmark_sha256 text,
  benchmark_query_count integer,
  semantic_relevance_at_10 numeric(6, 5),
  exact_recall_at_10 numeric(6, 5),
  benchmark_evaluated_at timestamptz,
  admission_status text not null default 'proposed',
  admitted_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint embedding_model_versions_key_version_unique
    unique (model_key, model_version),
  constraint embedding_model_versions_model_key_valid
    check (model_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  constraint embedding_model_versions_model_version_valid
    check (
      model_version ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$'
    ),
  constraint embedding_model_versions_provider_valid
    check (pg_catalog.length(provider) between 1 and 120),
  constraint embedding_model_versions_model_name_valid
    check (pg_catalog.length(model_name) between 1 and 200),
  constraint embedding_model_versions_dimensions_valid
    check (dimensions between 1 and 2000),
  constraint embedding_model_versions_normalization_valid
    check (normalization in ('none', 'l2')),
  constraint embedding_model_versions_artifact_sha256_valid
    check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  constraint embedding_model_versions_admission_status_valid
    check (admission_status in ('proposed', 'admitted', 'retired')),
  constraint embedding_model_versions_benchmark_values_valid
    check (
      (benchmark_query_count is null or benchmark_query_count >= 1)
      and (
        semantic_relevance_at_10 is null
        or semantic_relevance_at_10 between 0 and 1
      )
      and (
        exact_recall_at_10 is null
        or exact_recall_at_10 between 0 and 1
      )
    ),
  constraint embedding_model_versions_admission_evidence_required
    check (
      admission_status <> 'admitted'
      or (
        rights_owner is not null
        and pg_catalog.length(rights_owner) between 1 and 200
        and rights_license is not null
        and pg_catalog.length(rights_license) between 1 and 200
        and allowed_use is not null
        and pg_catalog.length(allowed_use) between 1 and 1000
        and prohibited_uses is not null
        and pg_catalog.cardinality(prohibited_uses) between 1 and 50
        and license_reviewed_at is not null
        and benchmark_id is not null
        and pg_catalog.length(benchmark_id) between 1 and 120
        and benchmark_sha256 ~ '^[0-9a-f]{64}$'
        and benchmark_query_count >= 100
        and semantic_relevance_at_10 >= 0.8
        and exact_recall_at_10 = 1
        and benchmark_evaluated_at is not null
        and admitted_at is not null
        and retired_at is null
      )
    ),
  constraint embedding_model_versions_lifecycle_valid
    check (
      (admission_status = 'proposed'
        and admitted_at is null
        and retired_at is null)
      or (admission_status = 'admitted'
        and admitted_at is not null
        and retired_at is null)
      or (admission_status = 'retired'
        and admitted_at is not null
        and retired_at is not null
        and retired_at >= admitted_at)
    )
);

create table private.context_node_embeddings (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  context_graph_version_id uuid not null,
  embedding_model_version_id uuid not null,
  node_id text not null,
  content_sha256 text not null,
  embedding_sha256 text not null,
  embedding extensions.vector not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint context_node_embeddings_scope_unique
    unique (
      organization_id,
      context_graph_version_id,
      embedding_model_version_id,
      node_id
    ),
  constraint context_node_embeddings_graph_foreign_key
    foreign key (organization_id, context_graph_version_id)
    references api.context_graph_versions (organization_id, id)
    on delete cascade,
  constraint context_node_embeddings_model_foreign_key
    foreign key (embedding_model_version_id)
    references private.embedding_model_versions (id),
  constraint context_node_embeddings_node_id_valid
    check (node_id ~ '^[a-z][a-z0-9_]{0,63}$'),
  constraint context_node_embeddings_content_sha256_valid
    check (content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint context_node_embeddings_embedding_sha256_valid
    check (embedding_sha256 ~ '^[0-9a-f]{64}$'),
  constraint context_node_embeddings_dimensions_valid
    check (extensions.vector_dims(embedding) between 1 and 2000),
  constraint context_node_embeddings_finite_valid
    check (embedding::text !~* '(nan|inf)'),
  constraint context_node_embeddings_nonzero_valid
    check (extensions.vector_norm(embedding) > 0)
);

create index context_node_embeddings_exact_scope_idx
  on private.context_node_embeddings (
    organization_id,
    context_graph_version_id,
    embedding_model_version_id,
    node_id
  );

alter table private.embedding_model_versions enable row level security;
alter table private.embedding_model_versions force row level security;
alter table private.context_node_embeddings enable row level security;
alter table private.context_node_embeddings force row level security;

create policy embedding_model_versions_worker_owner_select
on private.embedding_model_versions
for select
to simula_worker_owner
using (true);

create policy embedding_model_versions_command_owner_select
on private.embedding_model_versions
for select
to simula_command_owner
using (true);

create policy context_node_embeddings_worker_owner_select
on private.context_node_embeddings
for select
to simula_worker_owner
using (true);

create policy context_node_embeddings_worker_owner_insert
on private.context_node_embeddings
for insert
to simula_worker_owner
with check (true);

create policy context_node_embeddings_command_owner_select
on private.context_node_embeddings
for select
to simula_command_owner
using (true);

create policy context_graph_versions_command_owner_select
on api.context_graph_versions
for select
to simula_command_owner
using (true);

revoke all on table
  private.embedding_model_versions,
  private.context_node_embeddings
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner, postgres;

grant select on table private.embedding_model_versions
  to simula_command_owner, simula_worker_owner;
grant select on table api.context_graph_versions
  to simula_command_owner;
grant select on table private.context_node_embeddings
  to simula_command_owner;
grant select, insert on table private.context_node_embeddings
  to simula_worker_owner;

grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

create function private.upsert_context_node_embedding(
  requested_context_graph_version_id uuid,
  requested_node_id text,
  requested_model_key text,
  requested_model_version text,
  requested_embedding extensions.vector
)
returns table (
  created boolean,
  embedding_sha256 text
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
declare
  selected_graph api.context_graph_versions%rowtype;
  selected_model private.embedding_model_versions%rowtype;
  selected_node jsonb;
  computed_embedding_sha256 text;
  stored_content_sha256 text;
  stored_embedding_sha256 text;
  inserted_count integer;
begin
  if session_user <> 'simula_worker' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_context_graph_version_id is null
    or requested_node_id !~ '^[a-z][a-z0-9_]{0,63}$'
    or requested_model_key !~ '^[a-z][a-z0-9_]{0,63}$'
    or requested_model_version is null
    or requested_embedding is null
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_embedding_request';
  end if;

  select graphs.* into selected_graph
  from api.context_graph_versions as graphs
  where graphs.id = requested_context_graph_version_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;

  select models.* into selected_model
  from private.embedding_model_versions as models
  where models.model_key = requested_model_key
    and models.model_version = requested_model_version
    and models.admission_status = 'admitted';
  if not found then
    raise exception using
      errcode = '55000',
      message = 'embedding_model_not_admitted';
  end if;

  if extensions.vector_dims(requested_embedding) <> selected_model.dimensions
    or requested_embedding::text ~* '(nan|inf)'
    or extensions.vector_norm(requested_embedding) <= 0
    or (
      selected_model.normalization = 'l2'
      and pg_catalog.abs(
        extensions.vector_norm(requested_embedding) - 1
      ) > 0.001
    )
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_embedding_vector';
  end if;

  select nodes.value into selected_node
  from pg_catalog.jsonb_array_elements(
    selected_graph.manifest -> 'nodes'
  ) as nodes(value)
  where nodes.value ->> 'node_id' = requested_node_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;

  computed_embedding_sha256 := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(requested_embedding::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  insert into private.context_node_embeddings (
    organization_id,
    context_graph_version_id,
    embedding_model_version_id,
    node_id,
    content_sha256,
    embedding_sha256,
    embedding
  ) values (
    selected_graph.organization_id,
    selected_graph.id,
    selected_model.id,
    requested_node_id,
    selected_node ->> 'content_sha256',
    computed_embedding_sha256,
    requested_embedding
  )
  on conflict (
    organization_id,
    context_graph_version_id,
    embedding_model_version_id,
    node_id
  ) do nothing;

  get diagnostics inserted_count = row_count;

  select
    embeddings.content_sha256,
    embeddings.embedding_sha256
  into strict
    stored_content_sha256,
    stored_embedding_sha256
  from private.context_node_embeddings as embeddings
  where embeddings.organization_id = selected_graph.organization_id
    and embeddings.context_graph_version_id = selected_graph.id
    and embeddings.embedding_model_version_id = selected_model.id
    and embeddings.node_id = requested_node_id;

  if stored_content_sha256 <> selected_node ->> 'content_sha256'
    or stored_embedding_sha256 <> computed_embedding_sha256
  then
    raise exception using
      errcode = '23505',
      message = 'embedding_conflict';
  end if;

  created := inserted_count = 1;
  embedding_sha256 := computed_embedding_sha256;
  return next;
end
$function$;

revoke all on function private.upsert_context_node_embedding(
  uuid, text, text, text, extensions.vector
)
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner, postgres;
grant execute on function private.upsert_context_node_embedding(
  uuid, text, text, text, extensions.vector
)
to simula_worker;

set role postgres;
revoke create on schema private from simula_worker_owner;

grant create on schema api, private to simula_command_owner;
set role simula_command_owner;

create function private.search_context_nodes(
  requested_context_graph_version_id uuid,
  requested_model_key text,
  requested_model_version text,
  requested_embedding extensions.vector,
  requested_limit integer default 10,
  requested_max_distance double precision default 0.75
)
returns table (
  rank integer,
  node_id text,
  node_kind text,
  title text,
  content_sha256 text,
  cosine_distance double precision
)
language plpgsql
security definer
stable
set search_path = ''
set row_security = 'on'
as $function$
declare
  subject uuid;
  selected_graph api.context_graph_versions%rowtype;
  selected_model private.embedding_model_versions%rowtype;
begin
  subject := private.verified_subject();
  if subject is null or session_user <> 'simula_api' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if requested_context_graph_version_id is null
    or requested_model_key !~ '^[a-z][a-z0-9_]{0,63}$'
    or requested_model_version is null
    or requested_embedding is null
    or requested_limit not between 1 and 50
    or requested_max_distance < 0
    or requested_max_distance > 2
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_embedding_search';
  end if;

  select graphs.* into selected_graph
  from api.context_graph_versions as graphs
  where graphs.id = requested_context_graph_version_id;
  if not found
    or not private.is_org_member(selected_graph.organization_id, subject)
  then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;

  select models.* into selected_model
  from private.embedding_model_versions as models
  where models.model_key = requested_model_key
    and models.model_version = requested_model_version
    and models.admission_status = 'admitted';
  if not found then
    raise exception using
      errcode = '55000',
      message = 'embedding_model_not_admitted';
  end if;

  if extensions.vector_dims(requested_embedding) <> selected_model.dimensions
    or requested_embedding::text ~* '(nan|inf)'
    or extensions.vector_norm(requested_embedding) <= 0
    or (
      selected_model.normalization = 'l2'
      and pg_catalog.abs(
        extensions.vector_norm(requested_embedding) - 1
      ) > 0.001
    )
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_embedding_vector';
  end if;

  return query
  with distances as (
    select
      embeddings.node_id,
      embeddings.content_sha256,
      (
        embeddings.embedding
          operator(extensions.<=>)
        requested_embedding
      )::double precision as cosine_distance
    from private.context_node_embeddings as embeddings
    where embeddings.organization_id = selected_graph.organization_id
      and embeddings.context_graph_version_id = selected_graph.id
      and embeddings.embedding_model_version_id = selected_model.id
  ),
  bounded as (
    select distances.*
    from distances
    where distances.cosine_distance <= requested_max_distance
    order by distances.cosine_distance, distances.node_id
    limit requested_limit
  )
  select
    pg_catalog.row_number() over (
      order by bounded.cosine_distance, bounded.node_id
    )::integer,
    bounded.node_id,
    nodes.value ->> 'kind',
    nodes.value ->> 'title',
    bounded.content_sha256,
    bounded.cosine_distance
  from bounded
  cross join lateral pg_catalog.jsonb_array_elements(
    selected_graph.manifest -> 'nodes'
  ) as nodes(value)
  where nodes.value ->> 'node_id' = bounded.node_id
  order by bounded.cosine_distance, bounded.node_id;
end
$function$;

create function api.search_context_nodes(
  requested_context_graph_version_id uuid,
  requested_model_key text,
  requested_model_version text,
  requested_embedding extensions.vector,
  requested_limit integer default 10,
  requested_max_distance double precision default 0.75
)
returns table (
  rank integer,
  node_id text,
  node_kind text,
  title text,
  content_sha256 text,
  cosine_distance double precision
)
language sql
security invoker
stable
set search_path = ''
as $function$
  select *
  from private.search_context_nodes(
    requested_context_graph_version_id,
    requested_model_key,
    requested_model_version,
    requested_embedding,
    requested_limit,
    requested_max_distance
  )
$function$;

revoke all on function private.search_context_nodes(
  uuid, text, text, extensions.vector, integer, double precision
)
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner, postgres;
revoke all on function api.search_context_nodes(
  uuid, text, text, extensions.vector, integer, double precision
)
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner, postgres;
grant execute on function private.search_context_nodes(
  uuid, text, text, extensions.vector, integer, double precision
)
to simula_api;
grant execute on function api.search_context_nodes(
  uuid, text, text, extensions.vector, integer, double precision
)
to simula_api;

set role postgres;

comment on table private.embedding_model_versions is
  'Rights- and benchmark-gated embedding model version registry';
comment on table private.context_node_embeddings is
  'Immutable content-bound vectors for exact graph-scoped retrieval';

set role simula_command_owner;
comment on function api.search_context_nodes(
  uuid, text, text, extensions.vector, integer, double precision
) is
  'Exact member-scoped cosine search over at most 500 immutable graph nodes';
set role postgres;

revoke create on schema api, private from simula_command_owner;
revoke all on all sequences in schema api, private
from public, anon, authenticated, simula_api, simula_worker,
  simula_command_owner, simula_worker_owner;

reset role;

-- Supabase records migration history in the same session after this script.
set role postgres;
revoke references (organization_id, id)
on table api.context_graph_versions
from postgres;
set role postgres;
