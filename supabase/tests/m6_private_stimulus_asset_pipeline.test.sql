begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(21);

select extensions.is(
  (
    select pg_catalog.array_agg(
      columns.column_name || '|' || columns.data_type || '|'
        || columns.is_nullable
      order by columns.ordinal_position
    )
    from information_schema.columns as columns
    where columns.table_schema = 'api'
      and columns.table_name = 'stimulus_assets'
      and columns.column_name in (
        'expected_byte_size',
        'expected_content_sha256'
      )
  ),
  array[
    'expected_byte_size|integer|NO',
    'expected_content_sha256|text|NO'
  ]::text[],
  'asset reservations persist an immutable expected size and digest'
);

select extensions.ok(
  (
    select pg_catalog.pg_get_constraintdef(constraints.oid)
      like '%expected_byte_size >= 1%'
      and pg_catalog.pg_get_constraintdef(constraints.oid)
        like '%expected_byte_size <= 16777216%'
      and pg_catalog.pg_get_constraintdef(constraints.oid)
        like '%expected_content_sha256 ~ ''^[0-9a-f]{64}$''%'
    from pg_catalog.pg_constraint as constraints
    where constraints.conrelid = 'api.stimulus_assets'::pg_catalog.regclass
      and constraints.conname =
        'stimulus_assets_expected_content_valid'
  ),
  'reserved content is bounded and requires a lowercase SHA-256'
);

select extensions.ok(
  (
    select pg_catalog.pg_get_constraintdef(constraints.oid)
      like '%byte_size = expected_byte_size%'
      and pg_catalog.pg_get_constraintdef(constraints.oid)
        like '%content_sha256 = expected_content_sha256%'
    from pg_catalog.pg_constraint as constraints
    where constraints.conrelid = 'api.stimulus_assets'::pg_catalog.regclass
      and constraints.conname =
        'stimulus_assets_available_matches_expected'
  ),
  'available objects must match their immutable reservation'
);

select extensions.ok(
  (
    select pg_catalog.pg_get_constraintdef(constraints.oid)
      like '%stimulus_asset.reserve%'
      and pg_catalog.pg_get_constraintdef(constraints.oid)
        like '%stimulus_asset.delete%'
    from pg_catalog.pg_constraint as constraints
    where constraints.conrelid =
      'private.phase4_command_receipts'::pg_catalog.regclass
      and constraints.conname = 'phase4_command_receipts_scope_valid'
  ),
  'reservation and deletion share the durable command-receipt boundary'
);

select extensions.is(
  (
    select pg_catalog.array_agg(
      functions.oid::pg_catalog.regprocedure::text
      order by functions.oid::pg_catalog.regprocedure::text
    )
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = functions.pronamespace
    where namespaces.nspname in ('api', 'private')
      and functions.proname in (
        'confirm_stimulus_asset_deletion',
        'confirm_stimulus_asset_deletion_atomic',
        'confirm_stimulus_asset_upload',
        'confirm_stimulus_asset_upload_atomic',
        'create_stimulus_asset',
        'create_stimulus_asset_atomic',
        'request_stimulus_asset_deletion',
        'request_stimulus_asset_deletion_atomic'
      )
  ),
  array[
    'api.confirm_stimulus_asset_deletion(uuid,uuid)',
    'api.confirm_stimulus_asset_upload(uuid,integer,text,uuid)',
    'api.create_stimulus_asset(uuid,text,text,integer,text,timestamp with time zone,text,text,uuid)',
    'api.request_stimulus_asset_deletion(uuid,text,text,uuid)',
    'private.confirm_stimulus_asset_deletion_atomic(uuid,uuid)',
    'private.confirm_stimulus_asset_upload_atomic(uuid,integer,text,uuid)',
    'private.create_stimulus_asset_atomic(uuid,text,text,integer,text,timestamp with time zone,text,text,uuid)',
    'private.request_stimulus_asset_deletion_atomic(uuid,text,text,uuid)'
  ]::text[],
  'the private asset command surface is exact'
);

select extensions.ok(
  (
    select pg_catalog.bool_and(
      owners.rolname = 'simula_command_owner'
      and functions.prosecdef
      and functions.proconfig @> array[
        'search_path=""',
        'row_security=on'
      ]::text[]
    )
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = functions.pronamespace
    join pg_catalog.pg_roles as owners on owners.oid = functions.proowner
    where namespaces.nspname = 'private'
      and functions.proname in (
        'confirm_stimulus_asset_deletion_atomic',
        'confirm_stimulus_asset_upload_atomic',
        'create_stimulus_asset_atomic',
        'request_stimulus_asset_deletion_atomic'
      )
  ),
  'private asset commands have the exact definer and fixed execution context'
);

select extensions.ok(
  (
    select pg_catalog.bool_and(
      owners.rolname = 'simula_command_owner'
      and not functions.prosecdef
      and functions.proconfig @> array['search_path=""']::text[]
    )
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = functions.pronamespace
    join pg_catalog.pg_roles as owners on owners.oid = functions.proowner
    where namespaces.nspname = 'api'
      and functions.proname in (
        'confirm_stimulus_asset_deletion',
        'confirm_stimulus_asset_upload',
        'create_stimulus_asset',
        'request_stimulus_asset_deletion'
      )
  ),
  'asset API wrappers remain security invokers'
);

select extensions.ok(
  (
    select pg_catalog.bool_and(
      pg_catalog.has_function_privilege(
        'simula_api',
        functions.oid,
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'simula_worker',
        functions.oid,
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'anon',
        functions.oid,
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'authenticated',
        functions.oid,
        'EXECUTE'
      )
    )
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = functions.pronamespace
    where namespaces.nspname in ('api', 'private')
      and functions.proname in (
        'confirm_stimulus_asset_deletion',
        'confirm_stimulus_asset_deletion_atomic',
        'confirm_stimulus_asset_upload',
        'confirm_stimulus_asset_upload_atomic',
        'create_stimulus_asset',
        'create_stimulus_asset_atomic',
        'request_stimulus_asset_deletion',
        'request_stimulus_asset_deletion_atomic'
      )
  ),
  'only the API runtime can execute asset commands'
);

select extensions.ok(
  pg_catalog.has_table_privilege(
    'simula_api',
    'api.stimulus_assets',
    'SELECT'
  )
  and not pg_catalog.has_table_privilege(
    'simula_api',
    'api.stimulus_assets',
    'INSERT,UPDATE,DELETE'
  ),
  'the API cannot bypass asset command functions'
);

select extensions.ok(
  pg_catalog.has_table_privilege(
    'simula_command_owner',
    'api.stimulus_assets',
    'UPDATE'
  )
  and not exists (
    select 1
    from pg_catalog.pg_roles as roles
    where roles.rolname = 'simula_command_owner'
      and roles.rolcanlogin
  ),
  'the non-login command owner has the FK lock privilege'
);

select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_attribute as attributes
    where attributes.attrelid = 'api.stimulus_assets'::pg_catalog.regclass
      and not attributes.attisdropped
      and attributes.atttypid = 'bytea'::pg_catalog.regtype
  ),
  'application tables never store asset bytes'
);

select extensions.ok(
  (
    select not buckets.public
      and buckets.file_size_limit = 16777216
      and buckets.allowed_mime_types = array[
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'video/mp4'
      ]::text[]
    from storage.buckets as buckets
    where buckets.id = 'simula-private-assets'
  ),
  'the storage bucket remains private with the exact media envelope'
);

select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_policies as policies
    where policies.schemaname = 'storage'
      and policies.tablename = 'objects'
      and (
        coalesce(policies.qual, '') like '%simula-private-assets%'
        or coalesce(policies.with_check, '')
          like '%simula-private-assets%'
      )
  ),
  'browser roles receive no direct private-bucket policy'
);

select extensions.ok(
  (
    select pg_catalog.pg_get_constraintdef(constraints.oid)
      like '%organization_id%::text || ''/''::text%'
      and pg_catalog.pg_get_constraintdef(constraints.oid)
        like '%stimulus_id%::text) || ''/%''::text%'
      and pg_catalog.pg_get_constraintdef(constraints.oid)
        like '%storage_object_name !~%'
      and pg_catalog.strpos(
        pg_catalog.pg_get_constraintdef(constraints.oid),
        '(^|/)\.\.?(/|$)'
      ) > 0
    from pg_catalog.pg_constraint as constraints
    where constraints.conrelid = 'api.stimulus_assets'::pg_catalog.regclass
      and constraints.conname = 'stimulus_assets_object_name_valid'
  ),
  'object paths remain tenant scoped and traversal resistant'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.create_stimulus_asset_atomic(uuid,text,text,integer,text,timestamp with time zone,text,text,uuid)'::pg_catalog.regprocedure
  ) like '%selected_stimulus.organization_id::text%'
  and pg_catalog.pg_get_functiondef(
    'private.create_stimulus_asset_atomic(uuid,text,text,integer,text,timestamp with time zone,text,text,uuid)'::pg_catalog.regprocedure
  ) like '%created_asset_id::text%'
  and pg_catalog.pg_get_functiondef(
    'private.create_stimulus_asset_atomic(uuid,text,text,integer,text,timestamp with time zone,text,text,uuid)'::pg_catalog.regprocedure
  ) like '%requested_expected_content_sha256%',
  'reservation derives an immutable tenant/stimulus/asset/digest object path'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.confirm_stimulus_asset_upload_atomic(uuid,integer,text,uuid)'::pg_catalog.regprocedure
  ) like '%requested_byte_size <> selected_asset.expected_byte_size%'
  and pg_catalog.pg_get_functiondef(
    'private.confirm_stimulus_asset_upload_atomic(uuid,integer,text,uuid)'::pg_catalog.regprocedure
  ) like '%requested_content_sha256 <> selected_asset.expected_content_sha256%'
  and pg_catalog.pg_get_functiondef(
    'private.confirm_stimulus_asset_upload_atomic(uuid,integer,text,uuid)'::pg_catalog.regprocedure
  ) like '%selected_asset.retention_until <=%'
  and pg_catalog.pg_get_functiondef(
    'private.confirm_stimulus_asset_upload_atomic(uuid,integer,text,uuid)'::pg_catalog.regprocedure
  ) like '%statement_timestamp()%',
  'upload confirmation rechecks the immutable reservation'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.request_stimulus_asset_deletion_atomic(uuid,text,text,uuid)'::pg_catalog.regprocedure
  ) like '%status = ''deletion_requested''%'
  and pg_catalog.pg_get_functiondef(
    'private.confirm_stimulus_asset_deletion_atomic(uuid,uuid)'::pg_catalog.regprocedure
  ) like '%status = ''deleted''%',
  'deletion uses durable request and confirmation phases'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.create_stimulus_asset_atomic(uuid,text,text,integer,text,timestamp with time zone,text,text,uuid)'::pg_catalog.regprocedure
  ) like '%private.begin_phase4_command(%'
  and pg_catalog.pg_get_functiondef(
    'private.create_stimulus_asset_atomic(uuid,text,text,integer,text,timestamp with time zone,text,text,uuid)'::pg_catalog.regprocedure
  ) like '%private.finish_phase4_command(%'
  and pg_catalog.pg_get_functiondef(
    'private.request_stimulus_asset_deletion_atomic(uuid,text,text,uuid)'::pg_catalog.regprocedure
  ) like '%private.begin_phase4_command(%'
  and pg_catalog.pg_get_functiondef(
    'private.request_stimulus_asset_deletion_atomic(uuid,text,text,uuid)'::pg_catalog.regprocedure
  ) like '%private.finish_phase4_command(%',
  'reservation and deletion are replay-safe database commands'
);

select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'private.create_stimulus_asset_atomic(uuid,text,text,integer,text,timestamp with time zone,text,text,uuid)'::pg_catalog.regprocedure
  ) like '%stimulus_asset.reserved%'
  and pg_catalog.pg_get_functiondef(
    'private.confirm_stimulus_asset_upload_atomic(uuid,integer,text,uuid)'::pg_catalog.regprocedure
  ) like '%stimulus_asset.available%'
  and pg_catalog.pg_get_functiondef(
    'private.request_stimulus_asset_deletion_atomic(uuid,text,text,uuid)'::pg_catalog.regprocedure
  ) like '%stimulus_asset.deletion_requested%'
  and pg_catalog.pg_get_functiondef(
    'private.confirm_stimulus_asset_deletion_atomic(uuid,uuid)'::pg_catalog.regprocedure
  ) like '%stimulus_asset.deleted%',
  'every asset lifecycle transition emits an audit action'
);

select extensions.has_index(
  'api',
  'stimulus_assets',
  'stimulus_assets_retention_idx',
  'retention cleanup remains indexed'
);

select extensions.is(
  (select pg_catalog.count(*) from api.stimulus_assets),
  0::bigint,
  'database fixtures contain no implied campaign asset'
);

select * from extensions.finish();
rollback;
