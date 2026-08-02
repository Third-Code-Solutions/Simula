begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(21);

select extensions.is(
  (
    select pg_catalog.array_agg(
      pg_catalog.format('%I.%I', namespaces.nspname, relations.relname)
      order by namespaces.nspname, relations.relname
    )
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = relations.relnamespace
    where (
      namespaces.nspname,
      relations.relname
    ) in (
      ('private', 'context_node_embeddings'),
      ('private', 'embedding_model_versions')
    )
      and relations.relkind = 'r'
  ),
  array[
    'private.context_node_embeddings',
    'private.embedding_model_versions'
  ]::text[],
  'M7 installs the private model registry and context embedding store'
);

select extensions.ok(
  exists (
    select 1
    from pg_catalog.pg_extension as extensions_catalog
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = extensions_catalog.extnamespace
    where extensions_catalog.extname = 'vector'
      and namespaces.nspname = 'extensions'
  ),
  'pgvector is installed in the governed extensions schema'
);

select extensions.ok(
  (
    select pg_catalog.bool_and(
      relations.relrowsecurity and relations.relforcerowsecurity
    )
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = relations.relnamespace
    where namespaces.nspname = 'private'
      and relations.relname in (
        'context_node_embeddings',
        'embedding_model_versions'
      )
  ),
  'every embedding table has forced RLS'
);

select extensions.ok(
  not exists (
    select 1
    from (
      values ('public'), ('anon'), ('authenticated'), ('simula_api'),
        ('simula_worker')
    ) as roles(role_name)
    cross join (
      values
        ('private.context_node_embeddings'),
        ('private.embedding_model_versions')
    ) as tables(table_name)
    where pg_catalog.has_table_privilege(
      roles.role_name,
      tables.table_name,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'
    )
  ),
  'public and runtime roles have no direct embedding table authority'
);

select extensions.ok(
  pg_catalog.has_table_privilege(
    'simula_worker_owner',
    'private.context_node_embeddings'::pg_catalog.regclass,
    'SELECT,INSERT'
  )
  and not pg_catalog.has_table_privilege(
    'simula_worker_owner',
    'private.context_node_embeddings'::pg_catalog.regclass,
    'UPDATE,DELETE,TRUNCATE'
  ),
  'worker authority is append-only and idempotent'
);

select extensions.has_function(
  'private',
  'upsert_context_node_embedding',
  array['uuid', 'text', 'text', 'text', 'extensions.vector']::text[],
  'worker embedding ingestion boundary exists'
);

select extensions.has_function(
  'private',
  'search_context_nodes',
  array[
    'uuid',
    'text',
    'text',
    'extensions.vector',
    'integer',
    'double precision'
  ]::text[],
  'private exact-search authority exists'
);

select extensions.has_function(
  'api',
  'search_context_nodes',
  array[
    'uuid',
    'text',
    'text',
    'extensions.vector',
    'integer',
    'double precision'
  ]::text[],
  'API exact-search wrapper exists'
);

select extensions.ok(
  (
    select owners.rolname = 'simula_worker_owner'
      and routines.prosecdef
      and routines.proconfig @> array[
        'search_path=""',
        'row_security=on'
      ]::text[]
    from pg_catalog.pg_proc as routines
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = routines.pronamespace
    join pg_catalog.pg_roles as owners on owners.oid = routines.proowner
    where namespaces.nspname = 'private'
      and routines.proname = 'upsert_context_node_embedding'
  ),
  'ingestion is a worker-owned RLS-on empty-path definer'
);

select extensions.ok(
  (
    select owners.rolname = 'simula_command_owner'
      and routines.prosecdef
      and routines.provolatile = 's'
      and routines.proconfig @> array[
        'search_path=""',
        'row_security=on'
      ]::text[]
    from pg_catalog.pg_proc as routines
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = routines.pronamespace
    join pg_catalog.pg_roles as owners on owners.oid = routines.proowner
    where namespaces.nspname = 'private'
      and routines.proname = 'search_context_nodes'
  ),
  'search is a command-owned stable RLS-on empty-path definer'
);

select extensions.ok(
  not (
    select routines.prosecdef
    from pg_catalog.pg_proc as routines
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = routines.pronamespace
    where namespaces.nspname = 'api'
      and routines.proname = 'search_context_nodes'
  ),
  'API search wrapper remains a security invoker'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'simula_worker',
    'private.upsert_context_node_embedding(uuid,text,text,text,extensions.vector)'
      ::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'simula_api',
    'private.upsert_context_node_embedding(uuid,text,text,text,extensions.vector)'
      ::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'only worker runtime can ingest embeddings'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'simula_api',
    'api.search_context_nodes(uuid,text,text,extensions.vector,integer,double precision)'
      ::pg_catalog.regprocedure,
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'simula_api',
    'private.search_context_nodes(uuid,text,text,extensions.vector,integer,double precision)'
      ::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  'only the control plane can traverse context search'
);

select extensions.ok(
  not exists (
    select 1
    from (
      values ('public'), ('anon'), ('authenticated'), ('simula_worker')
    ) as roles(role_name)
    cross join (
      values
        (
          'api.search_context_nodes(uuid,text,text,extensions.vector,integer,double precision)'
            ::pg_catalog.regprocedure
        ),
        (
          'private.search_context_nodes(uuid,text,text,extensions.vector,integer,double precision)'
            ::pg_catalog.regprocedure
        )
    ) as routines(routine_id)
    where pg_catalog.has_function_privilege(
      roles.role_name,
      routines.routine_id,
      'EXECUTE'
    )
  ),
  'browser, public, and worker roles cannot search'
);

select extensions.ok(
  pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.upsert_context_node_embedding(uuid,text,text,text,extensions.vector)'
      ::pg_catalog.regprocedure
  )) like '%admission_status = ''admitted''%'
  and pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.search_context_nodes(uuid,text,text,extensions.vector,integer,double precision)'
      ::pg_catalog.regprocedure
  )) like '%admission_status = ''admitted''%',
  'ingestion and search both fail closed on unadmitted models'
);

select extensions.ok(
  pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.upsert_context_node_embedding(uuid,text,text,text,extensions.vector)'
      ::pg_catalog.regprocedure
  )) like '%content_sha256%'
  and pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.upsert_context_node_embedding(uuid,text,text,text,extensions.vector)'
      ::pg_catalog.regprocedure
  )) like '%embedding_conflict%',
  'ingestion binds immutable node content and rejects conflicting retries'
);

select extensions.ok(
  pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.search_context_nodes(uuid,text,text,extensions.vector,integer,double precision)'
      ::pg_catalog.regprocedure
  )) like '%private.is_org_member%'
  and pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.search_context_nodes(uuid,text,text,extensions.vector,integer,double precision)'
      ::pg_catalog.regprocedure
  )) like '%session_user <> ''simula_api''%',
  'search verifies control-plane identity and tenant membership'
);

select extensions.ok(
  pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.search_context_nodes(uuid,text,text,extensions.vector,integer,double precision)'
      ::pg_catalog.regprocedure
  )) like '%operator(extensions.<=>)%'
  and pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.search_context_nodes(uuid,text,text,extensions.vector,integer,double precision)'
      ::pg_catalog.regprocedure
  )) like '%limit requested_limit%',
  'search uses bounded exact cosine distance'
);

select extensions.ok(
  pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.search_context_nodes(uuid,text,text,extensions.vector,integer,double precision)'
      ::pg_catalog.regprocedure
  )) like '%requested_limit not between 1 and 50%'
  and pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'private.search_context_nodes(uuid,text,text,extensions.vector,integer,double precision)'
      ::pg_catalog.regprocedure
  )) like '%requested_max_distance > 2%',
  'search enforces result-count and cosine-distance budgets'
);

select extensions.has_index(
  'private',
  'context_node_embeddings',
  'context_node_embeddings_exact_scope_idx',
  'exact retrieval has a tenant, graph, model, and node scope index'
);

select extensions.ok(
  (
    select pg_catalog.count(*) = 0
    from private.embedding_model_versions
  ),
  'migration admits no embedding provider without rights and benchmark evidence'
);

select * from extensions.finish();
rollback;
